import threading
import time
import os
import glob
from datetime import datetime, timedelta
import docker
import requests
import json

from __init__ import db
from models.setting import SystemSetting
from models.droplet import DropletInstance, Droplet
from models.registry import Registry
import utils.docker
from utils.logger import log

# Memory store to track instance activity without spamming DB
instance_activity = {}

def is_interval_due(freq, last_run_iso, now):
    if freq == 'never' or not freq:
        return False
    if not last_run_iso:
        return True
    try:
        last_dt = datetime.fromisoformat(last_run_iso)
        if freq == 'hourly' and now - last_dt > timedelta(hours=1):
            return True
        elif freq == 'twice_a_day' and now - last_dt > timedelta(hours=12):
            return True
        elif freq == 'daily' and now - last_dt > timedelta(days=1):
            return True
        elif freq == 'weekly' and now - last_dt > timedelta(weeks=1):
            return True
    except Exception:
        return True
    return False

def task_docker_prune():
    """Prune dangling Docker images"""
    if not utils.docker.is_docker_available():
        return {"success": False, "error": "Docker service unavailable"}
    
    try:
        now = datetime.utcnow()
        log("INFO", "Executing Docker prune task")
        result = utils.docker.docker_client.images.prune(filters={'dangling': True})
        reclaimed = result.get('SpaceReclaimed', 0) if result else 0
        deleted = len(result.get('ImagesDeleted') or []) if result else 0
        SystemSetting.set('last_prune_time', now.isoformat())
        return {
            "success": True,
            "message": f"Pruned {deleted} dangling images (reclaimed {reclaimed} bytes).",
            "images_deleted": deleted,
            "space_reclaimed": reclaimed,
            "last_run": now.isoformat()
        }
    except Exception as e:
        log("ERROR", f"Failed to prune images: {str(e)}")
        return {"success": False, "error": str(e)}

def task_auto_shutdown():
    """Check running instances and stop idle ones"""
    if not utils.docker.is_docker_available():
        return {"success": False, "error": "Docker service unavailable"}

    auto_shutdown_enabled = SystemSetting.get('auto_shutdown_enabled', 'false') == 'true'
    idle_timeout_mins = int(SystemSetting.get('idle_timeout_mins', '30'))
    
    stopped_count = 0
    now = datetime.utcnow()
    
    try:
        instances = DropletInstance.query.filter_by(status='running').all()
        for instance in instances:
            try:
                container_name = f"flowcase_generated_{instance.id}"
                container = utils.docker.docker_client.containers.get(container_name)
                stats = container.stats(stream=False)
                
                # Check CPU usage
                cpu_stats = stats.get('cpu_stats', {})
                precpu_stats = stats.get('precpu_stats', {})
                cpu_delta = cpu_stats.get('cpu_usage', {}).get('total_usage', 0) - precpu_stats.get('cpu_usage', {}).get('total_usage', 0)
                system_delta = cpu_stats.get('system_cpu_usage', 0) - precpu_stats.get('system_cpu_usage', 0)
                
                cpu_percent = 0.0
                if system_delta > 0 and cpu_delta > 0:
                    online_cpus = cpu_stats.get('online_cpus', len(cpu_stats.get('cpu_usage', {}).get('percpu_usage', [1])))
                    cpu_percent = (cpu_delta / system_delta) * online_cpus * 100.0
                    
                # Check network I/O
                rx_bytes = sum(net['rx_bytes'] for net in stats.get('networks', {}).values()) if 'networks' in stats else 0
                tx_bytes = sum(net['tx_bytes'] for net in stats.get('networks', {}).values()) if 'networks' in stats else 0
                total_net = rx_bytes + tx_bytes
                
                if instance.id not in instance_activity:
                    instance_activity[instance.id] = {'last_active': now, 'last_net': total_net}
                    continue
                    
                activity = instance_activity[instance.id]
                last_net = activity['last_net']
                
                is_active = False
                if (total_net - last_net) > 102400 or cpu_percent > 2.0:
                    is_active = True
                
                if is_active:
                    activity['last_active'] = now
                
                activity['last_net'] = total_net
                
                if auto_shutdown_enabled and (now - activity['last_active'] > timedelta(minutes=idle_timeout_mins)):
                    log("INFO", f"Auto-shutting down idle instance {instance.id}")
                    container.stop()
                    instance.status = 'stopped'
                    db.session.commit()
                    if instance.id in instance_activity:
                        del instance_activity[instance.id]
                    stopped_count += 1
                        
            except docker.errors.NotFound:
                pass
            except Exception as e:
                log("WARNING", f"Error checking stats for instance {instance.id}: {str(e)}")
                
        return {
            "success": True,
            "message": f"Checked {len(instances)} running instances. Auto-shutdown stopped {stopped_count} idle instances.",
            "stopped_count": stopped_count
        }
    except Exception as e:
        log("ERROR", f"Error in auto-shutdown task: {str(e)}")
        return {"success": False, "error": str(e)}

def task_update_registry():
    """Sync registered app registries"""
    now = datetime.utcnow()
    log("INFO", "Executing Registry sync task")
    registry_lock = os.environ.get('FLOWCASE_REGISTRY_LOCK')
    try:
        synced_count = 0
        if registry_lock:
            info = requests.get(f"{registry_lock}/info.json", timeout=15).json()
            droplets = requests.get(f"{registry_lock}/droplets.json", timeout=15).json()
            SystemSetting.set('locked_registry_info', json.dumps(info))
            SystemSetting.set('locked_registry_droplets', json.dumps(droplets))
            synced_count = 1
        else:
            registries = Registry.query.all()
            for r in registries:
                try:
                    info = requests.get(f"{r.url}/info.json", timeout=15).json()
                    droplets = requests.get(f"{r.url}/droplets.json", timeout=15).json()
                    r.cached_info = json.dumps(info)
                    r.cached_droplets = json.dumps(droplets)
                    synced_count += 1
                except Exception as e:
                    log("ERROR", f"Failed to sync registry {r.url}: {str(e)}")
            db.session.commit()
            
        SystemSetting.set('last_registry_update_time', now.isoformat())
        return {
            "success": True,
            "message": f"Successfully synced {synced_count} registries.",
            "synced_count": synced_count,
            "last_run": now.isoformat()
        }
    except Exception as e:
        log("ERROR", f"Failed to update registry: {str(e)}")
        return {"success": False, "error": str(e)}

def task_update_images():
    """Pull latest container images for all configured droplets"""
    if not utils.docker.is_docker_available():
        return {"success": False, "error": "Docker service unavailable"}

    now = datetime.utcnow()
    log("INFO", "Executing scheduled Docker Images update")
    updated_count = 0
    failed_count = 0
    
    try:
        droplets = Droplet.query.filter_by(droplet_type='container').all()
        for droplet in droplets:
            if droplet.container_docker_image:
                image_name = droplet.container_docker_image
                if ":" not in image_name:
                    image_name = f"{image_name}:latest"
                
                if droplet.container_docker_registry and "docker.io" not in droplet.container_docker_registry:
                    full_image = f"{droplet.container_docker_registry.rstrip('/')}/{image_name}"
                else:
                    full_image = image_name
                
                try:
                    log("INFO", f"Pulling latest image for {droplet.display_name}: {full_image}")
                    utils.docker.docker_client.images.pull(full_image)
                    updated_count += 1
                except Exception as e:
                    failed_count += 1
                    log("ERROR", f"Failed to pull image {full_image}: {str(e)}")
                    
        SystemSetting.set('last_images_update_time', now.isoformat())
        return {
            "success": True,
            "message": f"Completed image update: {updated_count} pulled, {failed_count} errors.",
            "updated_count": updated_count,
            "failed_count": failed_count,
            "last_run": now.isoformat()
        }
    except Exception as e:
        log("ERROR", f"Failed to update images: {str(e)}")
        return {"success": False, "error": str(e)}

def task_clean_orphans():
    """Clean leftover working volumes, orphaned containers, and stale Nginx configs"""
    now = datetime.utcnow()
    log("INFO", "Executing Orphaned Resources Cleanup")
    cleaned_vols = 0
    cleaned_confs = 0
    cleaned_containers = 0
    
    try:
        active_instance_ids = {inst.id for inst in DropletInstance.query.all()}
        
        # 1. Clean orphaned temporary/working volumes
        if utils.docker.is_docker_available():
            try:
                for vol in utils.docker.docker_client.volumes.list():
                    name = vol.name
                    # Leftover working volumes: flowcase_volume_<id>_<idx>_working
                    if name.startswith("flowcase_volume_") and name.endswith("_working"):
                        try:
                            vol.remove(force=True)
                            cleaned_vols += 1
                        except Exception:
                            pass
            except Exception as e:
                log("WARNING", f"Volume cleanup error: {str(e)}")
                
        # 2. Clean stale Nginx conf files
        nginx_dir = "/flowcase/nginx/containers.d"
        if os.path.exists(nginx_dir):
            for conf_path in glob.glob(os.path.join(nginx_dir, "*.conf")):
                filename = os.path.basename(conf_path)
                inst_id = filename.replace(".conf", "")
                if inst_id not in active_instance_ids:
                    try:
                        os.remove(conf_path)
                        cleaned_confs += 1
                    except Exception:
                        pass
                        
        SystemSetting.set('last_clean_orphans_time', now.isoformat())
        return {
            "success": True,
            "message": f"Cleaned {cleaned_vols} temporary volumes and {cleaned_confs} stale Nginx configurations.",
            "cleaned_volumes": cleaned_vols,
            "cleaned_confs": cleaned_confs,
            "last_run": now.isoformat()
        }
    except Exception as e:
        log("ERROR", f"Error during orphaned cleanup: {str(e)}")
        return {"success": False, "error": str(e)}

def task_reconcile_instances():
    """Reconcile DB instance statuses with actual Docker container state"""
    now = datetime.utcnow()
    log("INFO", "Executing Instance State Reconciler")
    reconciled_count = 0
    
    if not utils.docker.is_docker_available():
        return {"success": False, "error": "Docker service unavailable"}
        
    try:
        running_instances = DropletInstance.query.filter_by(status='running').all()
        for instance in running_instances:
            container_name = f"flowcase_generated_{instance.id}"
            try:
                c = utils.docker.docker_client.containers.get(container_name)
                if c.status != 'running':
                    instance.status = 'stopped' if not instance.custom_name else 'saved'
                    reconciled_count += 1
            except docker.errors.NotFound:
                instance.status = 'stopped' if not instance.custom_name else 'saved'
                reconciled_count += 1
            except Exception:
                pass
                
        if reconciled_count > 0:
            db.session.commit()
            
        SystemSetting.set('last_reconcile_time', now.isoformat())
        return {
            "success": True,
            "message": f"Reconciled {reconciled_count} instance states with Docker.",
            "reconciled_count": reconciled_count,
            "last_run": now.isoformat()
        }
    except Exception as e:
        log("ERROR", f"Error reconciling instances: {str(e)}")
        return {"success": False, "error": str(e)}

def run_scheduler_tasks():
    now = datetime.utcnow()
    
    # 1. Docker Prune
    prune_freq = SystemSetting.get('prune_frequency', 'never')
    last_prune = SystemSetting.get('last_prune_time', None)
    if is_interval_due(prune_freq, last_prune, now):
        task_docker_prune()
        
    # 2. Auto-Shutdown Idle Instances (Evaluated every minute if enabled)
    auto_shutdown_enabled = SystemSetting.get('auto_shutdown_enabled', 'false') == 'true'
    if auto_shutdown_enabled:
        task_auto_shutdown()
        
    # 3. Registry Sync
    reg_freq = SystemSetting.get('update_registry_frequency', 'never')
    last_reg = SystemSetting.get('last_registry_update_time', None)
    if is_interval_due(reg_freq, last_reg, now):
        task_update_registry()
        
    # 4. Images Update
    img_freq = SystemSetting.get('update_images_frequency', 'never')
    last_img = SystemSetting.get('last_images_update_time', None)
    if is_interval_due(img_freq, last_img, now):
        task_update_images()

def scheduler_loop(app):
    with app.app_context():
        while True:
            try:
                run_scheduler_tasks()
            except Exception as e:
                log("ERROR", f"Scheduler error: {str(e)}")
            time.sleep(60)

def start_scheduler(app):
    thread = threading.Thread(target=scheduler_loop, args=(app,), daemon=True)
    thread.start()

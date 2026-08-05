import threading
import time
from datetime import datetime, timedelta
import docker

from __init__ import db
from models.setting import SystemSetting
from models.droplet import DropletInstance
from utils.docker import docker_client

# Memory store to track instance activity without spamming DB
instance_activity = {}

def scheduler_loop(app):
    with app.app_context():
        while True:
            try:
                run_scheduler_tasks()
            except Exception as e:
                from utils.logger import log
                log("ERROR", f"Scheduler error: {str(e)}")
            time.sleep(60)

def run_scheduler_tasks():
    # Docker Prune Task
    prune_freq = SystemSetting.get('prune_frequency', 'never')
    last_prune = SystemSetting.get('last_prune_time', None)
    
    now = datetime.utcnow()
    should_prune = False
    
    if prune_freq != 'never':
        if not last_prune:
            should_prune = True
        else:
            try:
                last_prune_dt = datetime.fromisoformat(last_prune)
                if prune_freq == 'daily' and now - last_prune_dt > timedelta(days=1):
                    should_prune = True
                elif prune_freq == 'twice_a_day' and now - last_prune_dt > timedelta(hours=12):
                    should_prune = True
                elif prune_freq == 'weekly' and now - last_prune_dt > timedelta(weeks=1):
                    should_prune = True
            except:
                should_prune = True
                
    if should_prune and docker_client:
        try:
            from utils.logger import log
            log("INFO", "Running scheduled Docker prune")
            docker_client.images.prune(filters={'dangling': True})
            SystemSetting.set('last_prune_time', now.isoformat())
        except Exception as e:
            from utils.logger import log
            log("ERROR", f"Failed to prune images: {str(e)}")
            
    # Auto-shutdown task
    auto_shutdown_enabled = SystemSetting.get('auto_shutdown_enabled', 'false') == 'true'
    idle_timeout_mins = int(SystemSetting.get('idle_timeout_mins', '30'))
    
    if auto_shutdown_enabled and docker_client:
        instances = DropletInstance.query.filter_by(status='running').all()
        for instance in instances:
            try:
                container = docker_client.containers.get(f"flowcase_{instance.id}")
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
                
                # Initialize activity tracking
                if instance.id not in instance_activity:
                    instance_activity[instance.id] = {'last_active': now, 'last_net': total_net}
                    continue
                    
                activity = instance_activity[instance.id]
                last_net = activity['last_net']
                
                # If network traffic increased by >100KB or CPU > 2% in the last minute
                is_active = False
                if (total_net - last_net) > 102400 or cpu_percent > 2.0:
                    is_active = True
                
                if is_active:
                    activity['last_active'] = now
                
                activity['last_net'] = total_net
                
                # Check if idle time exceeds timeout
                if now - activity['last_active'] > timedelta(minutes=idle_timeout_mins):
                    from utils.logger import log
                    log("INFO", f"Auto-shutting down idle instance {instance.id}")
                    container.stop()
                    instance.status = 'stopped'
                    db.session.commit()
                    del instance_activity[instance.id]
                        
            except docker.errors.NotFound:
                pass
            except Exception as e:
                pass

def start_scheduler(app):
    thread = threading.Thread(target=scheduler_loop, args=(app,), daemon=True)
    thread.start()

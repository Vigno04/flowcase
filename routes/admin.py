import platform
import sys
import os
from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user
from sqlalchemy.sql import func
from __init__ import db, bcrypt, __version__
from models.user import User, Group
from models.droplet import Droplet, DropletInstance
from models.registry import Registry
from models.log import Log
from utils.permissions import Permissions
import utils.docker
import subprocess

admin_bp = Blueprint('admin', __name__)

def get_container_ip(container, droplet):
	"""Get the IP address of a container, prioritizing the default network for nginx connectivity"""
	networks = container.attrs['NetworkSettings']['Networks']
	
	# First check the default network for nginx connectivity
	if 'flowcase_default_network' in networks and networks['flowcase_default_network']['IPAddress']:
		return networks['flowcase_default_network']['IPAddress']
	
	# If not found, check the droplet's specified network
	if droplet.container_network and droplet.container_network in networks:
		return networks[droplet.container_network]['IPAddress']
	
	# Fall back to other networks
	for network_name in ['default_network', 'bridge']:
		if network_name in networks and networks[network_name]['IPAddress']:
			return networks[network_name]['IPAddress']
	
	return "N/A"

@admin_bp.route('/system_info', methods=['GET'])
@login_required
def api_admin_system():
	if not Permissions.check_permission(current_user.id, Permissions.ADMIN_PANEL):
		return jsonify({"success": False, "error": "Unauthorized"}), 403

	#Get Nginx version
	nginx_version = None
	try:
		#get docker container
		nginx_name = os.environ.get("NGINX_CONTAINER_NAME", "flowcase-nginx")
		nginx_container = utils.docker.docker_client.containers.get(nginx_name)
		result = nginx_container.exec_run("nginx -v")
		nginx_version = result.output.decode('utf-8').split("\n")[0].replace("nginx version: nginx/", "")
	except:
		nginx_version = "Unable to get version"

	response = {
		"success": True,
		"system": {
			"hostname": os.popen("hostname").read().strip(),
			"os": f"{platform.system()} {platform.release()}"
		},
		"version": {
			"flowcase": __version__,
			"python": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
			"docker": utils.docker.get_docker_version(),
			"nginx": nginx_version,
		},
	}
 
	return jsonify(response)

@admin_bp.route('/users', methods=['GET'])
@login_required
def api_admin_users():
	if not Permissions.check_permission(current_user.id, Permissions.VIEW_USERS):
		return jsonify({"success": False, "error": "Unauthorized"}), 403
	
	users = User.query.all()
 
	response = {
		"success": True,
		"users": []
	}
 
	for user in users:
		response["users"].append({
			"id": user.id,
			"username": user.username,
			"created_at": user.created_at,
			"usertype": user.usertype,
			"protected": user.protected,
			"groups": []
		})
		
		user_groups = user.groups.split(",")
		groups = Group.query.all()
		for group in groups:
			if group.id in user_groups:
				response["users"][-1]["groups"].append({
					"id": group.id,
					"display_name": group.display_name
				})
 
	return jsonify(response)

@admin_bp.route('/instances', methods=['GET'])
@login_required
def api_admin_instances():
	if not Permissions.check_permission(current_user.id, Permissions.VIEW_INSTANCES):
		return jsonify({"success": False, "error": "Unauthorized"}), 403

	if not utils.docker.is_docker_available():
		return jsonify({
			"success": False, 
			"error": "Docker service is not available, can't retrieve instances"
		}), 503

	instances = DropletInstance.query.all()
 
	response = {
		"success": True,
		"instances": []
	}
 
	for instance in instances:
		try:
			droplet = Droplet.query.filter_by(id=instance.droplet_id).first()
			user = User.query.filter_by(id=instance.user_id).first()
			container = utils.docker.docker_client.containers.get(f"flowcase_generated_{instance.id}")
			response["instances"].append({
				"id": instance.id,
				"created_at": instance.created_at,
				"updated_at": instance.updated_at,
				"status": instance.status,
				"ip": get_container_ip(container, droplet),
				"droplet": {
					"id": droplet.id,
					"display_name": droplet.display_name,
					"description": droplet.description,
					"container_docker_image": droplet.container_docker_image,
					"container_docker_registry": droplet.container_docker_registry,
					"container_cores": droplet.container_cores,
					"container_memory": droplet.container_memory,
					"container_network": droplet.container_network,
					"image_path": droplet.image_path
				},
				"user": {
					"id": user.id,
					"username": user.username
				}
			})
		except Exception as e:
			# Skip this instance if we can't get container info
			continue
 
	return jsonify(response)

@admin_bp.route('/droplets', methods=['GET'])
@login_required
def api_admin_droplets():
	if not Permissions.check_permission(current_user.id, Permissions.VIEW_DROPLETS):
		return jsonify({"success": False, "error": "Unauthorized"}), 403

	droplets = Droplet.query.all()
	droplets = sorted(droplets, key=lambda x: x.display_name)
 
	response = {
		"success": True,
		"droplets": []
	}
 
	for droplet in droplets:
		response["droplets"].append({
			"id": droplet.id,
			"display_name": droplet.display_name,
			"description": droplet.description,
			"image_path": droplet.image_path,
			"droplet_type": droplet.droplet_type,
			"container_docker_image": droplet.container_docker_image,
			"container_docker_registry": droplet.container_docker_registry,
			"container_cores": droplet.container_cores,
			"container_memory": droplet.container_memory,
			"container_network": droplet.container_network,
			"server_ip": droplet.server_ip,
			"server_port": droplet.server_port,
			"server_username": droplet.server_username,
			"server_password": "********************************" if droplet.server_password else None,
			"restricted_groups": droplet.restricted_groups,
			"save_mode": droplet.save_mode,
			"save_paths": __import__('json').loads(droplet.save_paths) if droplet.save_paths else []
		})
 
	return jsonify(response)

@admin_bp.route('/droplet', methods=['POST'])
@login_required
def api_admin_edit_droplet():
	if not Permissions.check_permission(current_user.id, Permissions.EDIT_DROPLETS):
		return jsonify({"success": False, "error": "Unauthorized"}), 403

	droplet_id = request.json.get('id')
	droplet = Droplet.query.filter_by(id=droplet_id).first()
 
	create_new = False
	if not droplet or droplet_id == "null":
		create_new = True
		droplet = Droplet()
		
	old_image = droplet.container_docker_image if not create_new and droplet.droplet_type == "container" else None
  
	# Validate input
	droplet.description = request.json.get('description', None)
	if droplet.description == "":
		droplet.description = None
	droplet.image_path = request.json.get('image_path', None)
	if droplet.image_path == "":
		droplet.image_path = None
		
	# Handle restricted groups
	restricted_groups = request.json.get('restricted_groups', [])
	if restricted_groups:
		droplet.restricted_groups = ','.join(restricted_groups)
	else:
		droplet.restricted_groups = None

	droplet.display_name = request.json.get('display_name')
	if not droplet.display_name:
		return jsonify({"success": False, "error": "Display Name is required"}), 400

	droplet.droplet_type = request.json.get('droplet_type')
	if not droplet.droplet_type:
		return jsonify({"success": False, "error": "Droplet Type is required"}), 400
 
	if droplet.droplet_type == "container":
		droplet.container_docker_registry = request.json.get('container_docker_registry')
		if not droplet.container_docker_registry:
			return jsonify({"success": False, "error": "Docker Registry is required"}), 400

		droplet.container_docker_image = request.json.get('container_docker_image')
		if not droplet.container_docker_image:
			return jsonify({"success": False, "error": "Docker Image is required"}), 400
	
		# Ensure cores and memory are integers
		if not request.json.get('container_cores'):
			return jsonify({"success": False, "error": "Cores is required"}), 400
		if not request.json.get('container_memory'):
			return jsonify({"success": False, "error": "Memory is required"}), 400

		try:
			droplet.container_cores = float(request.json.get('container_cores'))
		except:
			return jsonify({"success": False, "error": "Cores must be a number"}), 400
		try:
			droplet.container_memory = float(request.json.get('container_memory'))
		except:
			return jsonify({"success": False, "error": "Memory must be a number"}), 400

		# Check if cores or memory are negative
		if droplet.container_cores < 0:
			return jsonify({"success": False, "error": "Cores cannot be negative"}), 400
		if droplet.container_memory < 0:
			return jsonify({"success": False, "error": "Memory cannot be negative"}), 400
		droplet.container_memory = request.json.get('container_memory')
		droplet.container_network = request.json.get('container_network')
		if not droplet.container_network:
			droplet.container_network = None
			
		droplet.save_mode = request.json.get('save_mode', 'commit')
		save_paths = request.json.get('save_paths', [])
		import json
		if save_paths:
			droplet.save_paths = json.dumps(save_paths)
		else:
			droplet.save_paths = None
  
	elif droplet.droplet_type == "vnc" or droplet.droplet_type == "rdp" or droplet.droplet_type == "ssh":
		droplet.server_ip = request.json.get('server_ip')
		if not droplet.server_ip:
			return jsonify({"success": False, "error": "Server IP is required"}), 400

		droplet.server_port = request.json.get('server_port')
		if not droplet.server_port:
			return jsonify({"success": False, "error": "Server Port is required"}), 400
  
		droplet.server_username = request.json.get('server_username', None)
		if droplet.server_username == "":
			droplet.server_username = None
   
		new_server_password = request.json.get('server_password', None)
		if new_server_password != "********************************":
			droplet.server_password = new_server_password
  
		droplet.container_cores = 1
		droplet.container_memory = 1024
  
	if create_new:
		db.session.add(droplet)
 
	db.session.commit()
 
	# Delete old image if it was changed
	if not create_new and old_image and old_image != droplet.container_docker_image:
		if utils.docker.is_docker_available():
			try:
				utils.docker.docker_client.images.remove(old_image, force=False)
			except Exception:
				pass

	return jsonify({
		"success": True,
		"droplet_id": droplet.id
	})

@admin_bp.route('/droplet', methods=['DELETE'])
@login_required
def api_admin_delete_droplet():
	if not Permissions.check_permission(current_user.id, Permissions.EDIT_DROPLETS):
		return jsonify({"success": False, "error": "Unauthorized"}), 403
	
	droplet_id = request.json.get('id')
	droplet = Droplet.query.filter_by(id=droplet_id).first()
	if not droplet:
		return jsonify({"success": False, "error": "Droplet not found"}), 404
 
	old_image = droplet.container_docker_image if droplet.droplet_type == "container" else None

	db.session.delete(droplet)
	db.session.commit()
 
	# Delete any instances of this droplet
	instances = DropletInstance.query.filter_by(droplet_id=droplet_id).all()
	
	if utils.docker.is_docker_available():
		for instance in instances:
			try:
				container = utils.docker.docker_client.containers.get(f"flowcase_generated_{instance.id}")
				container.remove(force=True)
			except Exception as e:
				pass  # Container might not exist
			
			if instance.snapshot_image_name:
				try:
					utils.docker.docker_client.images.remove(instance.snapshot_image_name, force=True)
				except Exception:
					pass
					
			db.session.delete(instance)
			db.session.commit()
			
		if old_image:
			try:
				utils.docker.docker_client.images.remove(old_image, force=False)
			except Exception:
				pass
	else:
		# Even if Docker is not available, we should still delete the DB records
		for instance in instances:
			db.session.delete(instance)
		db.session.commit()
 
	return jsonify({"success": True})

@admin_bp.route('/instance', methods=['DELETE'])
@login_required
def api_admin_delete_instance():
	if not Permissions.check_permission(current_user.id, Permissions.EDIT_INSTANCES):
		return jsonify({"success": False, "error": "Unauthorized"}), 403

	instance_id = request.json.get('id')
	instance = DropletInstance.query.filter_by(id=instance_id).first()
	if not instance:
		return jsonify({"success": False, "error": "Instance not found"}), 404
 
	if utils.docker.is_docker_available():
		try:
			container = utils.docker.docker_client.containers.get(f"flowcase_generated_{instance.id}")
			container.remove(force=True)
		except Exception as e:
			pass  # Container might not exist
			
		if instance.snapshot_image_name:
			try:
				utils.docker.docker_client.images.remove(instance.snapshot_image_name, force=True)
			except Exception:
				pass
	
	db.session.delete(instance)
	db.session.commit()
 
	return jsonify({"success": True})

@admin_bp.route('/user', methods=['POST'])
@login_required
def api_admin_edit_user():
	if not Permissions.check_permission(current_user.id, Permissions.EDIT_USERS):
		return jsonify({"success": False, "error": "Unauthorized"}), 403

	user_id = request.json.get('id')
	user = User.query.filter_by(id=user_id).first()
 
	create_new = False
	if not user or user_id == "null":
		create_new = True
		user = User()
  
	# Validate input
	username = request.json.get('username')
	if not username:
		return jsonify({"success": False, "error": "Username is required"}), 400
	if " " in username:
		return jsonify({"success": False, "error": "Username cannot contain spaces"}), 400
	
	# Convert username to lowercase for case-insensitive handling
	user.username = username.lower()

	# Special handling for protected users
	if not create_new and user.protected:
		# Protected user's username cannot be changed
		error_msg = "Cannot change username of protected user"
		return jsonify({"success": False, "error": error_msg}), 400
		
		# Get requested groups
		requested_groups = request.json.get('groups', [])
		
		# Special handling for admin user - ensure they remain in Admin group
		if user.username == "admin":
			admin_group = Group.query.filter_by(display_name="Admin").first()
			if admin_group and admin_group.id not in requested_groups:
				# Add admin group back if it was removed
				requested_groups.append(admin_group.id)
	else:
		# For non-protected users, just use the requested groups
		requested_groups = request.json.get('groups', [])
	
	# Build groups string
	groups_string = ""
	for group in requested_groups:
		groups_string += f'{group},'
	user.groups = groups_string[:-1] if groups_string else ""
	
	if not user.groups or user.groups == "" or user.groups == "]":
		return jsonify({"success": False, "error": "Groups are required"}), 400

	# Passwords can only be set, not changed
	if create_new:
		if not request.json.get('password'):
			return jsonify({"success": False, "error": "Password is required"}), 400
		from routes.auth import generate_auth_token
		user.password = bcrypt.generate_password_hash(request.json.get('password')).decode('utf-8')
		user.auth_token = generate_auth_token()
 
	if create_new:
		db.session.add(user)
 
	db.session.commit()
 
	return jsonify({"success": True})

@admin_bp.route('/user', methods=['DELETE'])
@login_required
def api_admin_delete_user():
	if not Permissions.check_permission(current_user.id, Permissions.EDIT_USERS):
		return jsonify({"success": False, "error": "Unauthorized"}), 403

	user_id = request.json.get('id')
	user = User.query.filter_by(id=user_id).first()
	if not user:
		return jsonify({"success": False, "error": "User not found"}), 404
	
	if user.protected:
		return jsonify({"success": False, "error": "This user is protected. Protected users cannot be deleted."}), 400
	
	db.session.delete(user)
	db.session.commit()
 
	# Delete any instances of this user
	instances = DropletInstance.query.filter_by(user_id=user_id).all()
	
	if utils.docker.is_docker_available():
		for instance in instances:
			try:
				container = utils.docker.docker_client.containers.get(f"flowcase_generated_{instance.id}")
				container.remove(force=True)
			except Exception as e:
				pass  # Container might not exist
				
			if instance.snapshot_image_name:
				try:
					utils.docker.docker_client.images.remove(instance.snapshot_image_name, force=True)
				except Exception:
					pass
					
			db.session.delete(instance)
			db.session.commit()
	else:
		# Even if Docker is not available, we should still delete the DB records
		for instance in instances:
			db.session.delete(instance)
		db.session.commit()
 
	return jsonify({"success": True})

@admin_bp.route('/groups', methods=['GET'])
@login_required
def api_admin_groups():
	if not Permissions.check_permission(current_user.id, Permissions.VIEW_GROUPS):
		return jsonify({"success": False, "error": "Unauthorized"}), 403

	groups = Group.query.all()
 
	response = {
		"success": True,
		"groups": []
	}
 
	for group in groups:
		response["groups"].append({
			"id": group.id,
			"display_name": group.display_name,
			"protected": group.protected,
			"permissions": {
				"admin_panel": group.perm_admin_panel,
				"view_instances": group.perm_view_instances,
				"edit_instances": group.perm_edit_instances,
				"view_users": group.perm_view_users,
				"edit_users": group.perm_edit_users,
				"view_droplets": group.perm_view_droplets,
				"edit_droplets": group.perm_edit_droplets,
				"view_registry": group.perm_view_registry,
				"edit_registry": group.perm_edit_registry,
				"view_groups": group.perm_view_groups,
				"edit_groups": group.perm_edit_groups
			}
		})
 
	return jsonify(response)

@admin_bp.route('/group', methods=['POST'])
@login_required
def api_admin_edit_group():
	if not Permissions.check_permission(current_user.id, Permissions.EDIT_GROUPS):
		return jsonify({"success": False, "error": "Unauthorized"}), 403

	group_id = request.json.get('id')
	group = Group.query.filter_by(id=group_id).first()
 
	create_new = False
	if not group or group_id == "null":
		create_new = True
		group = Group()
		group.protected = False
	
	# Validate input
	new_display_name = request.json.get('display_name')
	if not new_display_name:
		return jsonify({"success": False, "error": "Display Name is required"}), 400
	
	# Check if this is a protected group and the display name is being changed
	if not create_new and group.protected and group.display_name != new_display_name:
		return jsonify({"success": False, "error": "Cannot change display name of protected group"}), 400
		
	group.display_name = new_display_name
 
	group.perm_admin_panel = request.json.get('perm_admin_panel')
	if not group.perm_admin_panel:
		group.perm_admin_panel = False
 
	group.perm_view_instances = request.json.get('perm_view_instances')
	if not group.perm_view_instances:
		group.perm_view_instances = False
 
	group.perm_edit_instances = request.json.get('perm_edit_instances')
	if not group.perm_edit_instances:
		group.perm_edit_instances = False
 
	group.perm_view_users = request.json.get('perm_view_users')
	if not group.perm_view_users:
		group.perm_view_users = False
 
	group.perm_edit_users = request.json.get('perm_edit_users')
	if not group.perm_edit_users:
		group.perm_edit_users = False
 
	group.perm_view_droplets = request.json.get('perm_view_droplets')
	if not group.perm_view_droplets:
		group.perm_view_droplets = False
 
	group.perm_edit_droplets = request.json.get('perm_edit_droplets')
	if not group.perm_edit_droplets:
		group.perm_edit_droplets = False
  
	group.perm_view_registry = request.json.get('perm_view_registry')
	if not group.perm_view_registry:
		group.perm_view_registry = False
  
	group.perm_edit_registry = request.json.get('perm_edit_registry')
	if not group.perm_edit_registry:
		group.perm_edit_registry = False
 
	group.perm_view_groups = request.json.get('perm_view_groups')
	if not group.perm_view_groups:
		group.perm_view_groups = False
 
	group.perm_edit_groups = request.json.get('perm_edit_groups')
	if not group.perm_edit_groups:
		group.perm_edit_groups = False
 
	if create_new:
		db.session.add(group)
 
	db.session.commit()
 
	return jsonify({"success": True})

@admin_bp.route('/group', methods=['DELETE'])
@login_required
def api_admin_delete_group():
	if not Permissions.check_permission(current_user.id, Permissions.EDIT_GROUPS):
		return jsonify({"success": False, "error": "Unauthorized"}), 403

	group_id = request.json.get('id')
	group = Group.query.filter_by(id=group_id).first()
	if not group:
		return jsonify({"success": False, "error": "Group not found."}), 404
 
	if group.protected:
		return jsonify({"success": False, "error": "This group is protected. Protected groups cannot be deleted."}), 400
 
	db.session.delete(group)
	db.session.commit()
 
	return jsonify({"success": True})

@admin_bp.route('/registry')
@login_required
def api_admin_registry():
	if not Permissions.check_permission(current_user.id, Permissions.VIEW_REGISTRY):
		return jsonify({"success": False, "error": "Unauthorized"}), 403

	import os
	registry_lock = os.environ.get('FLOWCASE_REGISTRY_LOCK')
	import platform
	arch = platform.machine().lower()
	if arch == "x86_64":
		arch = "amd64"
	elif arch == "aarch64":
		arch = "arm64"

	response = {
		"success": True,
		"flowcase_version": __version__,
		"registry": [],
		"registry_locked": bool(registry_lock),
		"host_architecture": arch
	}

	if registry_lock:
		# Return the locked registry from environment variable
		from models.setting import SystemSetting
		import json
		
		info_cache = SystemSetting.get('locked_registry_info')
		droplets_cache = SystemSetting.get('locked_registry_droplets')
		
		info = json.loads(info_cache) if info_cache else {"name": "Locked Registry (Not Synced)"}
		droplets = json.loads(droplets_cache) if droplets_cache else []

		response["registry"].append({
			"id": "locked",
			"url": registry_lock,
			"info": info,
			"droplets": droplets
		})
	else:
		# Return registries from database
		import json
		registry = Registry.query.all()
		for r in registry:
			info = json.loads(r.cached_info) if r.cached_info else {"name": "Registry (Not Synced)"}
			droplets = json.loads(r.cached_droplets) if r.cached_droplets else []

			response["registry"].append({
				"id": r.id,
				"url": r.url,
				"info": info,
				"droplets": droplets
			})

	return jsonify(response)

@admin_bp.route('/registry/sync', methods=['POST'])
@login_required
def api_admin_sync_registry():
	if not Permissions.check_permission(current_user.id, Permissions.EDIT_REGISTRY):
		return jsonify({"success": False, "error": "Unauthorized"}), 403

	import os
	import requests
	import json
	from utils.logger import log
	registry_lock = os.environ.get('FLOWCASE_REGISTRY_LOCK')
	
	try:
		if registry_lock:
			from models.setting import SystemSetting
			info = requests.get(f"{registry_lock}/info.json").json()
			droplets = requests.get(f"{registry_lock}/droplets.json").json()
			SystemSetting.set('locked_registry_info', json.dumps(info))
			SystemSetting.set('locked_registry_droplets', json.dumps(droplets))
		else:
			registry = Registry.query.all()
			for r in registry:
				try:
					info = requests.get(f"{r.url}/info.json").json()
					droplets = requests.get(f"{r.url}/droplets.json").json()
					r.cached_info = json.dumps(info)
					r.cached_droplets = json.dumps(droplets)
				except Exception as e:
					log("ERROR", f"Failed to sync registry {r.url}: {str(e)}")
			db.session.commit()
		return jsonify({"success": True})
	except Exception as e:
		log("ERROR", f"Failed to sync registry: {str(e)}")
		return jsonify({"success": False, "error": str(e)}), 500

@admin_bp.route('/registry', methods=['POST', 'DELETE'])
@login_required
def api_admin_edit_registry():
	import os
	registry_lock = os.environ.get('FLOWCASE_REGISTRY_LOCK')
	
	# Block all registry editing when locked
	if registry_lock:
		return jsonify({"success": False, "error": "Registry is locked and cannot be modified"}), 403
	
	if request.method == 'POST':
		if not Permissions.check_permission(current_user.id, Permissions.EDIT_REGISTRY):
			return jsonify({"success": False, "error": "Unauthorized"}), 403

		url = request.json.get('url')
		if not url:
			return jsonify({"success": False, "error": "URL is required"}), 400

		# Check if registry already exists
		registry = Registry.query.filter_by(url=url).first()
		if registry:
			return jsonify({"success": False, "error": "Registry with this URL already exists"}), 400
	
		registry = Registry(url=url)
		db.session.add(registry)
		db.session.commit()
	
		return jsonify({"success": True})

	elif request.method == 'DELETE':
		if not Permissions.check_permission(current_user.id, Permissions.EDIT_REGISTRY):
			return jsonify({"success": False, "error": "Unauthorized"}), 403

		registry_id = request.json.get('id')
		registry = Registry.query.filter_by(id=registry_id).first()
		if not registry:
			return jsonify({"success": False, "error": "Registry not found"}), 404
	
		db.session.delete(registry)
		db.session.commit()
 
		return jsonify({"success": True})

@admin_bp.route('/logs', methods=['GET'])
@login_required
def api_admin_logs():
	if not current_user.has_permission(Permissions.ADMIN_PANEL):
		return jsonify({"success": False, "error": "You do not have permission to view logs"})
	
	page = request.args.get('page', 1, type=int)
	per_page = request.args.get('per_page', 50, type=int)
	log_type = request.args.get('type', None)
	
	query = Log.query
	
	if log_type and log_type.upper() in ['DEBUG', 'INFO', 'WARNING', 'ERROR']:
		query = query.filter(Log.level == log_type.upper())
	
	logs_pagination = query.order_by(Log.created_at.desc()).paginate(page=page, per_page=per_page, error_out=False)
	logs = logs_pagination.items
	
	return jsonify({
		"success": True,
		"logs": [
			{
				"id": log.id,
				"created_at": log.created_at.strftime('%Y-%m-%d %H:%M:%S'),
				"level": log.level,
				"message": log.message
			} for log in logs
		],
		"pagination": {
			"page": page,
			"per_page": per_page,
			"total": logs_pagination.total,
			"pages": logs_pagination.pages
		}
	}) 

@admin_bp.route('/images/status', methods=['GET'])
@login_required
def api_admin_images_status():
	"""Get the download status of all droplet images"""
	if not Permissions.check_permission(current_user.id, Permissions.VIEW_DROPLETS):
		return jsonify({"success": False, "error": "Unauthorized"}), 403

	if not utils.docker.is_docker_available():
		return jsonify({
			"success": False, 
			"error": "Docker service is not available"
		}), 503

	status = utils.docker.get_images_status()
	
	return jsonify({
		"success": True,
		"images": status
	})

@admin_bp.route('/images/pull', methods=['POST'])
@login_required
def api_admin_pull_image():
	"""Pull a specific droplet image"""
	if not Permissions.check_permission(current_user.id, Permissions.EDIT_DROPLETS):
		return jsonify({"success": False, "error": "Unauthorized"}), 403

	if not utils.docker.is_docker_available():
		return jsonify({
			"success": False, 
			"error": "Docker service is not available"
		}), 503

	droplet_id = request.json.get('droplet_id')
	registry = request.json.get('registry')
	image = request.json.get('image')
	
	# Handle auto-download case where registry and image are provided directly
	if registry and image:
		success, message = utils.docker.pull_single_image(registry, image)
		if success:
			return jsonify({
				"success": True,
				"message": message
			})
		else:
			return jsonify({
				"success": False,
				"error": message
			}), 500
	
	# Handle droplet_id case (existing functionality)
	if not droplet_id:
		return jsonify({"success": False, "error": "Droplet ID is required"}), 400

	# Handle special guac droplet
	if droplet_id == "guac":
		from __init__ import __version__
		registry = "https://index.docker.io/v1/"
		image_name = f"ghcr.io/vigno04/flowcase-guac:{__version__}"
	else:
		# Get droplet info
		droplet = Droplet.query.filter_by(id=droplet_id).first()
		if not droplet:
			return jsonify({"success": False, "error": "Droplet not found"}), 404

		if not droplet.container_docker_image:
			return jsonify({"success": False, "error": "Droplet has no Docker image configured"}), 400

		registry = droplet.container_docker_registry
		image_name = droplet.container_docker_image

	# Pull the image
	success, message = utils.docker.pull_single_image(registry, image_name)
	
	if success:
		return jsonify({
			"success": True,
			"message": message
		})
	else:
		return jsonify({
			"success": False,
			"error": message
		}), 500

@admin_bp.route('/images/pull-all', methods=['POST'])
@login_required
def api_admin_pull_all_images():
	"""Pull all droplet images"""
	if not Permissions.check_permission(current_user.id, Permissions.EDIT_DROPLETS):
		return jsonify({"success": False, "error": "Unauthorized"}), 403

	if not utils.docker.is_docker_available():
		return jsonify({
			"success": False, 
			"error": "Docker service is not available"
		}), 503

	try:
		# Use existing pull_images function
		utils.docker.pull_images()
		
		return jsonify({
			"success": True,
			"message": "Started downloading all images. Check logs for progress."
		})
	except Exception as e:
		return jsonify({
			"success": False,
			"error": f"Failed to start image downloads: {str(e)}"
		}), 500 

@admin_bp.route('/images/logs', methods=['GET'])
@login_required
def api_admin_image_logs():
	"""Get recent image download logs and errors"""
	if not Permissions.check_permission(current_user.id, Permissions.VIEW_DROPLETS):
		return jsonify({"success": False, "error": "Unauthorized"}), 403

	try:
		page = request.args.get('page', 1, type=int)
		per_page = request.args.get('per_page', 50, type=int)
		log_type = request.args.get('type', None)
		
		# Build query for logs related to Docker image operations
		query = Log.query.filter(Log.message.like('%Docker image%'))
		
		# Apply log level filter if specified
		if log_type and log_type.upper() in ['DEBUG', 'INFO', 'WARNING', 'ERROR']:
			query = query.filter(Log.level == log_type.upper())
		
		# Get paginated results
		logs_pagination = query.order_by(Log.created_at.desc()).paginate(
			page=page, per_page=per_page, error_out=False
		)
		logs = logs_pagination.items
		
		# Format logs for response
		formatted_logs = []
		for log in logs:
			formatted_logs.append({
				"id": log.id,
				"created_at": log.created_at.strftime('%Y-%m-%d %H:%M:%S'),
				"level": log.level,
				"message": log.message
			})
		
		return jsonify({
			"success": True,
			"logs": formatted_logs,
			"pagination": {
				"page": page,
				"per_page": per_page,
				"total": logs_pagination.total,
				"pages": logs_pagination.pages
			}
		})
		
	except Exception as e:
		return jsonify({
			"success": False,
			"error": f"Failed to fetch image logs: {str(e)}"
		}), 500

@admin_bp.route('/networks', methods=['GET'])
def api_admin_networks():
	"""Get list of available Docker networks"""
	if not Permissions.check_permission(current_user.id, Permissions.VIEW_DROPLETS):
		return jsonify({"success": False, "error": "Unauthorized"}), 403

	if not utils.docker.is_docker_available():
		return jsonify({
			"success": False,
			"error": "Docker service is not available"
		}), 503
	
	try:
		all_networks = utils.docker.list_available_networks()
		filtered_networks = []
		for network in all_networks:
			network_name = network["name"]
			default_network_name = os.environ.get("FLOWCASE_NETWORK", "flowcase_default_network")
			if (network_name == default_network_name or
				network_name.startswith("lan_") or
				network_name.startswith("vlan_")):
				filtered_networks.append(network)
		return jsonify({"success": True, "networks": filtered_networks})
	except Exception as e:
		from utils.logger import log
		log("ERROR", f"Error listing networks: {str(e)}")
		return jsonify({"success": False, "error": str(e)}), 500

@admin_bp.route('/sso', methods=['GET'])
@login_required
def api_admin_sso_get():
	"""Get SSO configuration"""
	if not Permissions.check_permission(current_user.id, Permissions.ADMIN_PANEL):
		return jsonify({"success": False, "error": "Unauthorized"}), 403
	from models.sso import SsoConfig
	from models.user import Group
	config = SsoConfig.query.first()
	groups = [{"id": g.id, "display_name": g.display_name} for g in Group.query.all()]
	
	if not config:
		return jsonify({"success": True, "sso": {
			"enabled": False, "disable_classic_login": False,
			"provider_name": "", "client_id": "", "client_secret": "",
			"issuer_url": "", "authorization_endpoint": "",
			"token_endpoint": "", "userinfo_endpoint": "",
			"redirect_uri": "", "scopes": "openid profile email",
			"auto_create_accounts": False, "default_group_id": ""},
			"groups": groups})
	return jsonify({"success": True, "sso": {
		"enabled": config.enabled,
		"disable_classic_login": config.disable_classic_login,
		"auto_create_accounts": config.auto_create_accounts,
		"default_group_id": config.default_group_id or "",
		"provider_name": config.provider_name or "",
		"client_id": config.client_id or "",
		"client_secret": "****" if config.client_secret else "",
		"issuer_url": config.issuer_url or "",
		"authorization_endpoint": config.authorization_endpoint or "",
		"token_endpoint": config.token_endpoint or "",
		"userinfo_endpoint": config.userinfo_endpoint or "",
		"redirect_uri": config.redirect_uri or "",
		"scopes": config.scopes or "openid profile email"},
		"groups": groups})

@admin_bp.route('/sso', methods=['POST'])
@login_required
def api_admin_sso_save():
	"""Save SSO configuration"""
	if not Permissions.check_permission(current_user.id, Permissions.ADMIN_PANEL):
		return jsonify({"success": False, "error": "Unauthorized"}), 403
	from models.sso import SsoConfig
	config = SsoConfig.query.first()
	if not config:
		config = SsoConfig()
		db.session.add(config)
	data = request.json
	config.enabled = bool(data.get("enabled", False))
	config.disable_classic_login = bool(data.get("disable_classic_login", False))
	config.auto_create_accounts = bool(data.get("auto_create_accounts", False))
	config.default_group_id = data.get("default_group_id") or None
	config.provider_name = data.get("provider_name") or None
	config.client_id = data.get("client_id") or None
	config.issuer_url = data.get("issuer_url") or None
	config.authorization_endpoint = data.get("authorization_endpoint") or None
	config.token_endpoint = data.get("token_endpoint") or None
	config.userinfo_endpoint = data.get("userinfo_endpoint") or None
	config.redirect_uri = data.get("redirect_uri") or None
	config.scopes = data.get("scopes") or "openid profile email"
	new_secret = data.get("client_secret", "")
	if new_secret and new_secret != "****":
		config.client_secret = new_secret
	db.session.commit()
	return jsonify({"success": True, "message": "SSO configuration saved."})

from models.setting import SystemSetting
import psutil

@admin_bp.route('/settings', methods=['GET', 'POST'])
@login_required
def api_admin_settings():
	if not Permissions.check_permission(current_user.id, Permissions.ADMIN_PANEL):
		return jsonify({"success": False, "error": "Unauthorized"}), 403
	
	if request.method == 'GET':
		settings = {
			"prune_frequency": SystemSetting.get('prune_frequency', 'never'),
			"auto_shutdown_enabled": SystemSetting.get('auto_shutdown_enabled', 'false') == 'true',
			"idle_timeout_mins": int(SystemSetting.get('idle_timeout_mins', '30'))
		}
		return jsonify({"success": True, "settings": settings})
	elif request.method == 'POST':
		data = request.json
		SystemSetting.set('prune_frequency', data.get('prune_frequency', 'never'))
		SystemSetting.set('auto_shutdown_enabled', 'true' if data.get('auto_shutdown_enabled') else 'false')
		SystemSetting.set('idle_timeout_mins', data.get('idle_timeout_mins', 30))
		return jsonify({"success": True, "message": "Settings saved."})

# Cache for stats endpoint to avoid repeated slow Docker API calls
_STATS_CACHE_FILE = '/tmp/flowcase_stats_cache.json'
_stats_update_lock = None

def get_stats_cache():
    try:
        import json
        import os
        if os.path.exists(_STATS_CACHE_FILE):
            with open(_STATS_CACHE_FILE, 'r') as f:
                return json.load(f)
    except Exception:
        pass
    return {"data": None, "timestamp": 0}

def set_stats_cache(data):
    try:
        import json
        import time
        with open(_STATS_CACHE_FILE, 'w') as f:
            json.dump({"data": data, "timestamp": time.time()}, f)
    except Exception:
        pass

def _parse_size(size_str):
    """Parse a size string like '1.5GB' or '500MB' or '100kB' into bytes"""
    size_str = size_str.strip().upper()
    if not size_str or size_str == '0':
        return 0
    multipliers = {'KB': 1024, 'MB': 1024**2, 'GB': 1024**3, 'TB': 1024**4, 'B': 1}
    for unit, mult in multipliers.items():
        if size_str.endswith(unit):
            try:
                return int(float(size_str[:-len(unit)]) * mult)
            except:
                return 0
    try:
        return int(size_str)
    except:
        return 0

def _update_stats_cache_background():
    """Background function to update stats cache without blocking the API"""
    global _stats_update_lock
    
    import time
    import concurrent.futures
    import threading
    import logging
    
    logger = logging.getLogger(__name__)

    # Use a lock to prevent multiple concurrent updates
    if _stats_update_lock is None:
        _stats_update_lock = threading.Lock()

    if not _stats_update_lock.acquire(blocking=False):
        return  # Another update is in progress

    try:
        # Non-blocking CPU percent (interval=None returns immediately)
        cpu_usage = psutil.cpu_percent(interval=0.1)
        mem = psutil.virtual_memory()
        disk = psutil.disk_usage('/')

        try:
            containers = utils.docker.docker_client.containers.list(all=True)
            flowcase_containers = [c for c in containers if c.name.startswith('flowcase_generated_')]
            running_flowcase_containers = [c for c in flowcase_containers if c.status == 'running']
            docker_stats = {
                "total_containers": len(flowcase_containers),
                "running_containers": len(running_flowcase_containers)
            }

            # Get disk usage from docker system df - with timeout
            flowcase_disk_used = 0
            try:
                df = utils.docker.docker_client.api.df()
                
                # Get image IDs used by droplet containers
                used_image_ids = {c.image.id for c in flowcase_containers}
                
                for c in df.get('Containers', []):
                    if any(name.strip('/').startswith('flowcase_generated_') for name in c.get('Names', [])):
                        flowcase_disk_used += c.get('SizeRw', 0)
                        
                for img in df.get('Images', []):
                    tags = img.get('RepoTags') or []
                    is_flowcase_related = (
                        img.get('Id') in used_image_ids or 
                        any('flowcase' in tag.lower() or 'vigno04' in tag.lower() for tag in tags)
                    )
                    if is_flowcase_related:
                        unique_size = img.get('Size', 0) - img.get('SharedSize', 0)
                        flowcase_disk_used += max(0, unique_size)
                        
                for vol in df.get('Volumes', []):
                    if vol.get('Name', '').startswith('flowcase_shared_'):
                        flowcase_disk_used += vol.get('UsageData', {}).get('Size', 0)
                logger.info(f"Stats background update: flowcase_disk_used={flowcase_disk_used}")
            except Exception as e:
                logger.warning(f"Stats background update: docker df error: {e}")

            # Get container stats in parallel with a timeout
            flowcase_memory_used = 0
            flowcase_cpu_percent = 0.0

            def get_container_stats(c):
                try:
                    return c.stats(stream=False)
                except:
                    return None

            with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
                future_to_container = {executor.submit(get_container_stats, c): c for c in running_flowcase_containers}
                results = []
                for future in concurrent.futures.as_completed(future_to_container, timeout=10):
                    try:
                        result = future.result()
                        if result:
                            results.append(result)
                    except:
                        pass

            for stats in results:
                if not stats: continue
                mem_usage = stats.get('memory_stats', {}).get('usage', 0)
                mem_cache = stats.get('memory_stats', {}).get('stats', {}).get('cache', 0)
                flowcase_memory_used += max(0, mem_usage - mem_cache)

                cpu_stats = stats.get('cpu_stats', {})
                precpu_stats = stats.get('precpu_stats', {})
                cpu_delta = cpu_stats.get('cpu_usage', {}).get('total_usage', 0) - precpu_stats.get('cpu_usage', {}).get('total_usage', 0)
                system_delta = cpu_stats.get('system_cpu_usage', 0) - precpu_stats.get('system_cpu_usage', 0)
                if system_delta > 0 and cpu_delta > 0:
                    import psutil
                    online_cpus = cpu_stats.get('online_cpus', len(cpu_stats.get('cpu_usage', {}).get('percpu_usage', [1])))
                    flowcase_cpu_percent += ((cpu_delta / system_delta) * online_cpus * 100.0) / (psutil.cpu_count() or 1)

        except Exception as e:
            logger.error(f"Stats background update error: {e}")
            docker_stats = {"total_containers": 0, "running_containers": 0}
            flowcase_disk_used = 0
            flowcase_memory_used = 0
            flowcase_cpu_percent = 0.0

        response = {
            "success": True,
            "cpu": cpu_usage,
            "memory": {
                "total": mem.total,
                "used": mem.used,
                "percent": mem.percent
            },
            "disk": {
                "total": disk.total,
                "used": disk.used,
                "percent": disk.percent
            },
            "flowcase": {
                "disk_used": flowcase_disk_used,
                "memory_used": flowcase_memory_used,
                "cpu_percent": round(flowcase_cpu_percent, 1)
            },
            "docker": docker_stats,
            "last_updated": time.time()
        }
        
        # Cache the response using file
        set_stats_cache(response)
        
    finally:
        _stats_update_lock.release()

@admin_bp.route('/stats', methods=['GET'])
@login_required
def api_admin_stats():
    if not Permissions.check_permission(current_user.id, Permissions.ADMIN_PANEL):
        return jsonify({"success": False, "error": "Unauthorized"}), 403

    import time
    import threading
    
    # Check cache first
    current_time = time.time()
    cache_obj = get_stats_cache()
    _STATS_CACHE_TTL = 10
    
    if cache_obj["data"] and (current_time - cache_obj["timestamp"]) < _STATS_CACHE_TTL:
        return jsonify(cache_obj["data"])

    # If cache is stale or empty, trigger background update and return stale data immediately
    # (or return basic system stats if no cache exists)
    if cache_obj["data"]:
        # Return stale data immediately, trigger background update
        # Set timestamp NOW so that other workers don't spawn multiple threads in this TTL cycle
        set_stats_cache(cache_obj["data"])
        threading.Thread(target=_update_stats_cache_background, daemon=True).start()
        return jsonify(cache_obj["data"])
    else:
        # No cache at all - return basic system stats immediately, trigger full update
        import psutil
        cpu_usage = psutil.cpu_percent(interval=0.1)
        mem = psutil.virtual_memory()
        disk = psutil.disk_usage('/')
        
        basic_response = {
            "success": True,
            "cpu": cpu_usage,
            "memory": {
                "total": mem.total,
                "used": mem.used,
                "percent": mem.percent
            },
            "disk": {
                "total": disk.total,
                "used": disk.used,
                "percent": disk.percent
            },
            "flowcase": {
                "disk_used": 0,
                "memory_used": 0,
                "cpu_percent": 0.0
            },
            "docker": {
                "total_containers": 0,
                "running_containers": 0
            },
            "last_updated": current_time,
            "is_basic": True
        }
        
        # Cache basic response immediately
        set_stats_cache(basic_response)
        
        # Trigger full background update
        threading.Thread(target=_update_stats_cache_background, daemon=True).start()
        
        return jsonify(basic_response)

@admin_bp.route('/bulk_delete', methods=['POST'])
@login_required
def api_admin_bulk_delete():
	if not Permissions.check_permission(current_user.id, Permissions.ADMIN_PANEL):
		return jsonify({"success": False, "error": "Unauthorized"}), 403
		
	data = request.json
	item_type = data.get('type')
	ids = data.get('ids', [])
	
	if not ids:
		return jsonify({"success": False, "error": "No items selected."})
		
	count = 0
	if item_type == 'users':
		for uid in ids:
			user = User.query.get(uid)
			if user and not user.protected:
				db.session.delete(user)
				count += 1
		db.session.commit()
	elif item_type == 'droplets':
		for did in ids:
			droplet = Droplet.query.get(did)
			if droplet:
				db.session.delete(droplet)
				count += 1
		db.session.commit()
	elif item_type == 'instances':
		for iid in ids:
			instance = DropletInstance.query.get(iid)
			if instance:
				try:
					if utils.docker.docker_client:
						container = utils.docker.docker_client.containers.get(f"flowcase_{instance.id}")
						container.remove(force=True)
				except:
					pass
				db.session.delete(instance)
				count += 1
		db.session.commit()
	else:
		return jsonify({"success": False, "error": "Invalid item type."})
		
	return jsonify({"success": True, "message": f"Successfully deleted {count} items."})

import uuid
from sqlalchemy.sql import func
from __init__ import db

class Droplet(db.Model):
	id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
	display_name = db.Column(db.String(80), nullable=False)
	description = db.Column(db.String(255), nullable=True)
	image_path = db.Column(db.String(255), nullable=True)
	droplet_type = db.Column(db.String(80), nullable=False)
	container_docker_image = db.Column(db.String(255), nullable=True)
	container_docker_registry = db.Column(db.String(255), nullable=True)
	container_cores = db.Column(db.Integer, nullable=True)
	container_memory = db.Column(db.Integer, nullable=True)
	container_network = db.Column(db.String(255), nullable=True)  # Docker network to use for this droplet
	server_ip = db.Column(db.String(255), nullable=True)
	server_port = db.Column(db.Integer, nullable=True)
	server_username = db.Column(db.String(255), nullable=True)
	server_password = db.Column(db.String(255), nullable=True)
	restricted_groups = db.Column(db.String(255), nullable=True)
	save_mode = db.Column(db.String(20), default="commit")
	save_paths = db.Column(db.String(1000), nullable=True)
	custom_timezone = db.Column(db.String(50), nullable=True)
	custom_language = db.Column(db.String(50), nullable=True)
 
class DropletInstance(db.Model):
	id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
	droplet_id = db.Column(db.String(36), db.ForeignKey('droplet.id'), nullable=False)
	user_id = db.Column(db.String(36), db.ForeignKey('user.id'), nullable=False)
	created_at = db.Column(db.DateTime, server_default=func.now())
	updated_at = db.Column(db.DateTime, server_default=func.now(), onupdate=func.now())
	status = db.Column(db.String(20), default="running")
	custom_name = db.Column(db.String(255), nullable=True)
	snapshot_image_name = db.Column(db.String(255), nullable=True) 
	run_as_root = db.Column(db.Boolean, default=False)

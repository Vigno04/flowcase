from sqlalchemy.sql import func
from __init__ import db

class Registry(db.Model):
	id = db.Column(db.Integer, primary_key=True)
	created_at = db.Column(db.DateTime, server_default=func.now())
	url = db.Column(db.String(255), nullable=False)
	cached_info = db.Column(db.Text, nullable=True)
	cached_droplets = db.Column(db.Text, nullable=True)

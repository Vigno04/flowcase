import time
import datetime
from flask import has_app_context

def log(level: str, message: str):
	"""Log a message to the database and console"""
	log_entry = None
	
	if has_app_context():
		from __init__ import db
		from models.log import Log
		try:
			log_entry = Log(level=level, message=message)
			db.session.add(log_entry)
			db.session.commit()
			timestamp = log_entry.created_at.strftime('%Y-%m-%d %H:%M:%S')
		except Exception as e:
			print(f"[ERROR] Failed to save log to DB: {e}", flush=True)
			timestamp = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
	else:
		timestamp = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
	
	# Only print DEBUG logs if in debug mode
	try:
		from config.config import parse_args
		args = parse_args()
		debug_mode = args.debug
	except Exception:
		debug_mode = False
	
	if level != "DEBUG" or debug_mode:
		print(f"[{level}] | {timestamp} | {message}", flush=True)
		
	return log_entry 

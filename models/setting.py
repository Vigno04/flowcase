import uuid
from __init__ import db

class SystemSetting(db.Model):
	key = db.Column(db.String(80), primary_key=True)
	value = db.Column(db.String(255), nullable=True)

	@classmethod
	def get(cls, key, default=None):
		setting = cls.query.filter_by(key=key).first()
		return setting.value if setting else default

	@classmethod
	def set(cls, key, value):
		setting = cls.query.filter_by(key=key).first()
		if setting:
			setting.value = str(value)
		else:
			setting = cls(key=key, value=str(value))
			db.session.add(setting)
		db.session.commit()

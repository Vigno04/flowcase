import uuid
from __init__ import db

class SsoConfig(db.Model):
    __tablename__ = 'sso_config'

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    enabled = db.Column(db.Boolean, nullable=False, default=False)

    # Disable classic username/password login entirely when SSO is enabled
    disable_classic_login = db.Column(db.Boolean, nullable=False, default=False)
    
    # Auto account creation and default group
    auto_create_accounts = db.Column(db.Boolean, nullable=False, default=False)
    default_group_id = db.Column(db.String(36), nullable=True)

    # OIDC provider settings
    provider_name = db.Column(db.String(100), nullable=True)           # Display name shown to users (e.g. "Authentik")
    client_id = db.Column(db.String(255), nullable=True)
    client_secret = db.Column(db.String(512), nullable=True)
    issuer_url = db.Column(db.String(512), nullable=True)              # Base OIDC issuer URL
    authorization_endpoint = db.Column(db.String(512), nullable=True) # Manual override: /authorize
    token_endpoint = db.Column(db.String(512), nullable=True)          # Manual override: /token
    userinfo_endpoint = db.Column(db.String(512), nullable=True)       # Manual override: /userinfo
    redirect_uri = db.Column(db.String(512), nullable=True)            # Where the IdP redirects after login
    scopes = db.Column(db.String(255), nullable=True, default='openid profile email')

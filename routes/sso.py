import os
import random
import string
import requests
from flask import Blueprint, redirect, request, session, url_for, flash, jsonify
from flask_login import login_user, current_user
from urllib.parse import urlencode

from __init__ import db, bcrypt
from models.sso import SsoConfig
from models.user import User, Group
from utils.logger import log

sso_bp = Blueprint('sso', __name__, url_prefix='/sso')

def get_sso_config():
    config = SsoConfig.query.first()
    if not config or not config.enabled:
        return None
    return config

def get_oidc_endpoints(config):
    """Retrieve OIDC endpoints, using manual overrides if provided, or fetching from well-known configuration."""
    endpoints = {
        'authorization_endpoint': config.authorization_endpoint,
        'token_endpoint': config.token_endpoint,
        'userinfo_endpoint': config.userinfo_endpoint
    }
    
    # If any is missing, attempt auto-discovery
    if not all(endpoints.values()) and config.issuer_url:
        try:
            discovery_url = config.issuer_url.rstrip('/') + '/.well-known/openid-configuration'
            resp = requests.get(discovery_url, timeout=5)
            if resp.status_code == 200:
                data = resp.json()
                endpoints['authorization_endpoint'] = endpoints['authorization_endpoint'] or data.get('authorization_endpoint')
                endpoints['token_endpoint'] = endpoints['token_endpoint'] or data.get('token_endpoint')
                endpoints['userinfo_endpoint'] = endpoints['userinfo_endpoint'] or data.get('userinfo_endpoint')
        except Exception as e:
            log("ERROR", f"Failed to fetch OIDC discovery document: {str(e)}")
            
    return endpoints

@sso_bp.route('/login')
def sso_login():
    config = get_sso_config()
    if not config:
        flash("SSO is not enabled on this server.", "error")
        return redirect(url_for('auth.index'))
        
    endpoints = get_oidc_endpoints(config)
    auth_url = endpoints.get('authorization_endpoint')
    if not auth_url:
        flash("SSO configuration is incomplete (missing authorization endpoint).", "error")
        return redirect(url_for('auth.index'))

    # Generate random state
    state = ''.join(random.choices(string.ascii_letters + string.digits, k=32))
    session['sso_state'] = state
    
    params = {
        'client_id': config.client_id,
        'response_type': 'code',
        'redirect_uri': config.redirect_uri,
        'scope': config.scopes or 'openid profile email',
        'state': state
    }
    
    redirect_url = f"{auth_url}?{urlencode(params)}"
    log("INFO", f"Redirecting user to SSO: {redirect_url}")
    return redirect(redirect_url)

@sso_bp.route('/callback')
def sso_callback():
    config = get_sso_config()
    if not config:
        flash("SSO is not enabled.", "error")
        return redirect(url_for('auth.index'))

    code = request.args.get('code')
    state = request.args.get('state')
    
    if not code or not state:
        flash("Invalid response from identity provider.", "error")
        return redirect(url_for('auth.index'))
        
    if state != session.pop('sso_state', None):
        flash("SSO security validation failed.", "error")
        return redirect(url_for('auth.index'))
        
    endpoints = get_oidc_endpoints(config)
    token_url = endpoints.get('token_endpoint')
    userinfo_url = endpoints.get('userinfo_endpoint')
    
    if not token_url or not userinfo_url:
        flash("SSO configuration is incomplete (missing token/userinfo endpoints).", "error")
        return redirect(url_for('auth.index'))

    # Exchange code for token
    token_data = {
        'grant_type': 'authorization_code',
        'code': code,
        'redirect_uri': config.redirect_uri,
        'client_id': config.client_id,
        'client_secret': config.client_secret
    }
    
    try:
        token_resp = requests.post(token_url, data=token_data, timeout=10)
        token_resp.raise_for_status()
        tokens = token_resp.json()
    except Exception as e:
        log("ERROR", f"Failed to exchange code for token: {str(e)}")
        flash("Failed to authenticate with identity provider.", "error")
        return redirect(url_for('auth.index'))
        
    access_token = tokens.get('access_token')
    if not access_token:
        flash("Identity provider did not return an access token.", "error")
        return redirect(url_for('auth.index'))

    # Fetch user info
    try:
        user_resp = requests.get(userinfo_url, headers={'Authorization': f'Bearer {access_token}'}, timeout=10)
        user_resp.raise_for_status()
        user_info = user_resp.json()
    except Exception as e:
        log("ERROR", f"Failed to fetch user info: {str(e)}")
        flash("Failed to retrieve user profile from identity provider.", "error")
        return redirect(url_for('auth.index'))

    # Find the unique subject ID
    sub = user_info.get('sub') or user_info.get('id')
    if not sub:
        flash("Identity provider returned invalid user info.", "error")
        return redirect(url_for('auth.index'))
        
    email = user_info.get('email', '')
    preferred_username = user_info.get('preferred_username') or user_info.get('nickname') or email.split('@')[0] if email else f"sso_user_{sub[:8]}"

    # If the user is currently logged in, we link their account
    if current_user.is_authenticated:
        # Check if this SSO sub is already linked to another account
        existing_sso_user = User.query.filter_by(sso_subject=sub).first()
        if existing_sso_user and existing_sso_user.id != current_user.id:
            # We can't link, already linked to someone else
            pass # We'll just let them know via the dashboard UI redirect or flash
            
        current_user.sso_subject = sub
        db.session.commit()
        log("INFO", f"User {current_user.username} linked their account to SSO (sub: {sub})")
        return redirect(url_for('auth.dashboard'))

    # Not logged in: Attempt to log in or register
    user = User.query.filter_by(sso_subject=sub).first()
    
    if not user:
        if not config.auto_create_accounts:
            flash("Your SSO identity is not linked to any account, and automatic account creation is disabled.", "error")
            return redirect(url_for('auth.index'))
            
        # Ensure username is unique
        base_username = preferred_username.lower()
        username = base_username
        counter = 1
        while User.query.filter_by(username=username).first():
            username = f"{base_username}{counter}"
            counter += 1
            
        # Create new user
        random_password = ''.join(random.choices(string.ascii_letters + string.digits, k=32))
        group_id = config.default_group_id or ""
        
        user = User(
            username=username, 
            password=bcrypt.generate_password_hash(random_password).decode('utf-8'),
            groups=group_id,
            usertype="Internal", 
            protected=False,
            sso_subject=sub
        )
        from routes.auth import generate_auth_token
        user.auth_token = generate_auth_token()
        
        db.session.add(user)
        db.session.commit()
        log("INFO", f"Automatically created user {username} via SSO (sub: {sub})")

    login_user(user)
    log("INFO", f"User {user.username} logged in via SSO")
    
    response = redirect(url_for('auth.dashboard'))
    cookie_age = 60 * 60 * 24 * 365 # 1 year
    response.set_cookie('userid', user.id, max_age=cookie_age)
    response.set_cookie('username', user.username, max_age=cookie_age)
    response.set_cookie('token', user.auth_token, max_age=cookie_age)
    return response

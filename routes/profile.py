from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user
from __init__ import db, bcrypt
from models.user import User

profile_bp = Blueprint('profile', __name__)


@profile_bp.route('/profile', methods=['GET'])
@login_required
def api_profile_get():
    """Return current user's profile info."""
    from models.sso import SsoConfig
    sso_config = SsoConfig.query.first()

    return jsonify({
        "success": True,
        "profile": {
            "id": current_user.id,
            "username": current_user.username,
            "usertype": current_user.usertype,
            "sso_linked": current_user.sso_subject is not None,
            "sso_enabled": sso_config.enabled if sso_config else False,
        }
    })


@profile_bp.route('/profile/change_password', methods=['POST'])
@login_required
def api_profile_change_password():
    """Change current user's password."""
    if current_user.usertype != "Internal":
        return jsonify({"success": False, "error": "Password cannot be changed for external/SSO accounts."}), 400

    data = request.json
    current_password = data.get('current_password', '')
    new_password = data.get('new_password', '')
    confirm_password = data.get('confirm_password', '')

    if not current_password or not new_password or not confirm_password:
        return jsonify({"success": False, "error": "All password fields are required."}), 400

    if not bcrypt.check_password_hash(current_user.password, current_password):
        return jsonify({"success": False, "error": "Current password is incorrect."}), 400

    if new_password != confirm_password:
        return jsonify({"success": False, "error": "New passwords do not match."}), 400

    if len(new_password) < 6:
        return jsonify({"success": False, "error": "New password must be at least 6 characters."}), 400

    current_user.password = bcrypt.generate_password_hash(new_password).decode('utf-8')
    db.session.commit()

    from utils.logger import log
    log("INFO", f"User {current_user.username} changed their password.")

    return jsonify({"success": True, "message": "Password changed successfully."})


@profile_bp.route('/profile/change_username', methods=['POST'])
@login_required
def api_profile_change_username():
    """Change current user's username."""
    if current_user.protected:
        return jsonify({"success": False, "error": "Protected users cannot change their username."}), 400

    data = request.json
    new_username = data.get('new_username', '').strip().lower()

    if not new_username:
        return jsonify({"success": False, "error": "Username cannot be empty."}), 400

    if ' ' in new_username:
        return jsonify({"success": False, "error": "Username cannot contain spaces."}), 400

    if len(new_username) < 2:
        return jsonify({"success": False, "error": "Username must be at least 2 characters."}), 400

    # Check if username is already taken
    existing = User.query.filter(User.username == new_username, User.id != current_user.id).first()
    if existing:
        return jsonify({"success": False, "error": "This username is already taken."}), 400

    old_username = current_user.username
    current_user.username = new_username
    db.session.commit()

    from utils.logger import log
    log("INFO", f"User {old_username} changed their username to {new_username}.")

    return jsonify({"success": True, "message": "Username changed successfully.", "new_username": new_username})


@profile_bp.route('/profile/unlink_sso', methods=['POST'])
@login_required
def api_profile_unlink_sso():
    """Unlink SSO from current user account."""
    if current_user.sso_subject is None:
        return jsonify({"success": False, "error": "No SSO account is linked."}), 400

    current_user.sso_subject = None
    db.session.commit()

    from utils.logger import log
    log("INFO", f"User {current_user.username} unlinked their SSO account.")

    return jsonify({"success": True, "message": "SSO account unlinked."})

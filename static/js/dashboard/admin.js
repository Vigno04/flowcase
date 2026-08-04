var admin_droplets = [];
var admin_users = [];
var admin_groups = [];

window.addEventListener('load', () => {
	AdminChangeTab('system', document.querySelector('.admin-modal-sidebar-button'));
});

/**
 * Formats and displays groups for a droplet
 * @param {String} restrictedGroups - Comma-separated string of group IDs
 * @returns {String} - Formatted HTML for displaying group names
 */
function displayRestrictedGroups(restrictedGroups) {
	if (!restrictedGroups) {
		return '';
	}
	
	const groupIds = restrictedGroups.split(',');
	let groupsHtml = '';
	
	// If admin_groups is available, use it to get group names
	if (typeof admin_groups !== 'undefined' && admin_groups.length > 0) {
		groupsHtml = groupIds.map(groupId => {
			const group = admin_groups.find(g => g.id === groupId);
			return group ?
				`<span class="restricted-group-item">${group.display_name}</span>` :
				`<span class="restricted-group-item">Unknown</span>`;
		}).join(' ');
	} else {
		// Fallback if admin_groups is not available
		groupsHtml = groupIds.map(groupId =>
			`<span class="restricted-group-item">${groupId}</span>`
		).join(' ');
	}
	
	return groupsHtml;
}

// Toggle admin sidebar on mobile
function toggleAdminSidebar() {
	const modalContent = document.querySelector('.admin-modal-content');
	modalContent.classList.toggle('sidebar-active');
}

// Open admin panel
function OpenAdminPanel() {
	const adminModal = document.getElementById('admin-modal');
	adminModal.classList.add('active');
	
	// Pre-fetch droplets data for user edit dialog
	if (userInfo.permissions.perm_view_droplets) {
		FetchAdminDroplets(function(json) {
			// Data is stored in admin_droplets global variable
		});
	}
}

// Close admin panel
function CloseAdminPanel() {
	const adminModal = document.getElementById('admin-modal');
	adminModal.classList.remove('active');
	// Also close sidebar if it's open
	document.querySelector('.admin-modal-content').classList.remove('sidebar-active');
}

// Handle clicks outside modal
document.addEventListener('click', (e) => {
	// Close entire modal when clicking outside
	if (e.target.classList.contains('admin-modal')) {
		CloseAdminPanel();
	}
	
	// Handle sidebar on mobile
	if (window.innerWidth <= 768) {
		const modalContent = document.querySelector('.admin-modal-content');
		const sidebar = document.querySelector('.admin-modal-sidebar');
		const toggle = document.querySelector('.admin-modal-sidebar-toggle');
		
		// Close sidebar when clicking outside on mobile
		if (!sidebar.contains(e.target) && 
			!toggle.contains(e.target) && 
			modalContent.classList.contains('sidebar-active')) {
			modalContent.classList.remove('sidebar-active');
		}
	}
});

// Close sidebar when selecting a menu item on mobile
document.querySelectorAll('.admin-modal-sidebar-button').forEach(button => {
	button.addEventListener('click', () => {
		if (window.innerWidth <= 768) {
			document.querySelector('.admin-modal-content').classList.remove('sidebar-active');
		}
	});
});

// Handle window resize
window.addEventListener('resize', () => {
	const modalContent = document.querySelector('.admin-modal-content');
	// If window is resized larger than mobile breakpoint, ensure sidebar is visible
	if (window.innerWidth > 768) {
		modalContent.classList.remove('sidebar-active');
	}
});

// Prevent clicks inside modal content from closing the modal
document.querySelector('.admin-modal-content').addEventListener('click', (e) => {
	e.stopPropagation();
});

var currentTab;
function AdminChangeTab(tab, element = null)
{
	var header = document.getElementById('admin-modal-header');
	var subtext = document.getElementById('admin-modal-subtext');

	//Remove active class from all buttons
	var buttons = document.querySelectorAll('.admin-modal-sidebar-button');
	buttons.forEach(button => {
		button.classList.remove('active');
	});

	if (element != null) {
		//Add active class to the clicked button
		element.classList.add('active');
	} else {
		//Find the button that corresponds to the tab and add active class
		buttons.forEach(button => {
			if (button.getAttribute('onclick') && button.getAttribute('onclick').includes("'" + tab + "'")) {
				button.classList.add('active');
			}
		});
	}

	var content = document.querySelector('.admin-modal-main-content');
	if (currentTab != tab) {
		content.innerHTML = "";
		currentTab = tab;
	}

	switch (tab) {
		case 'users':
			header.innerText = "Users";
			subtext.innerText = "View and manage the users of the system.";

			//fetch groups as well
			if (userInfo.permissions.perm_view_groups) {
				FetchAdminGroups(function(json) {
				});
			}

			FetchAdminUsers(function(json) {
				content.innerHTML = ''

				if (userInfo.permissions.perm_edit_users) {	
					content.innerHTML += `
						<button class="button-1-full" onclick="ShowEditUser()">Create User</button>
						<hr>
					`;
				}

				content.innerHTML += `
					<table class="admin-modal-table">
						<tr>
							<th>Username</th>
							<th>User Type</th>
							<th>Groups</th>
							${userInfo.permissions.perm_edit_users ? `<th>Actions</th>` : ''}
						</tr>
					${json["users"].map(user => `
						<tr>
							<td>${user.username}</td>
							<td>${user.usertype}</td>
							<td>${user.groups.map(group => {return group.display_name}).join(', ')}</td>
							${userInfo.permissions.perm_edit_users ? `<td class="admin-modal-table-actions">
								<i class="fas fa-edit" onclick="ShowEditUser('${user.id}')"></i>
								${user.protected ?
									`<i class="fas fa-lock" title="Protected user cannot be deleted"></i>` :
									`<i class="fas fa-trash" onclick="AdminDeleteUser('${user.id}')"></i>`
								}
							</td>` : ''}
						</tr>
					`).join('')}
				</table>
				`;
			});
			break;
		case 'droplets':
			header.innerText = "Droplets";
			subtext.innerText = "View and manage droplets.";

			// First fetch groups to ensure they're available for displaying group names
			FetchAdminGroups(function() {
				// Then fetch droplets
				FetchAdminDroplets(function(json) {
				content.innerHTML = `
					${userInfo.permissions.perm_edit_droplets ? `
						<button class="button-1-full" onclick="ShowEditDroplet()">Create Droplet</button>
						<hr>
					` : ''}

				<table class="admin-modal-table">
					<tr>
						<th>Name</th>
						<th>Image / IP</th>
						<th>Groups</th>
						<th>Network</th>
						${userInfo.permissions.perm_edit_droplets ? `<th>Actions</th>` : ''}
					</tr>
					${json["droplets"].map(droplet => `
						<tr>
							<td><div><img src="${droplet.image_path ? droplet.image_path : '/static/img/droplet_default.jpg'}"><p>${droplet.display_name}</p></div></td>
							<td>${droplet.droplet_type == "container" ? droplet.container_docker_image : droplet.server_ip}</td>
							<td>${displayRestrictedGroups(droplet.restricted_groups)}</td>
							<td>${droplet.container_network ? droplet.container_network : 'default'}</td>
							${userInfo.permissions.perm_edit_droplets ? `<td class="admin-modal-table-actions">
								<i class="fas fa-edit" onclick="ShowEditDroplet('${droplet.id}')"></i>
								<i class="fas fa-trash" onclick="AdminDeleteDroplet('${droplet.id}')"></i>
							</td>` : ''}
						</tr>
					`).join('')}
				</table>
				`;
				});
			});
			break;
		case 'registry':
			header.innerText = "Registry";

			FetchAdminRegistry(function(json) {

			// Update subtitle based on lock status
			if (json["registry_locked"]) {
				subtext.innerText = "View locked registry.";
			} else {
				subtext.innerText = "View and manage registries.";
			}

			var droplets = [];
			//combine all droplets from all registries into one array and order by display name
			json["registry"].forEach(registry => {
				droplets = droplets.concat(registry.droplets);

				droplets.sort((a, b) => {
					if (a.display_name < b.display_name) {
						return -1;
					}
					if (a.display_name > b.display_name) {
						return 1;
					}
					return 0;
				});
			});

			window.adminRegistryDroplets = droplets;
			window.adminHostArch = json["host_architecture"];
			flowcase_version = json["flowcase_version"];

			//set droplet registry name
			droplets.forEach(droplet => {
				try {
					droplet.registry_name = json["registry"].find(registry => registry.droplets.find(d => d.id == droplet.id)).info.name;

					//if tag of the flowcase version is found, set the intial tag to that, otherwise set to the first tag
					droplet.tagdefaultindex = droplet.container_docker_tags.findIndex(tag => tag == flowcase_version);
					if (droplet.tagdefaultindex == -1) {
						droplet.tagdefaultindex = 0;
					}
				} catch (e) {
					droplet.has_json_error = true;
					droplet.json_error_message = "JSON schema error";
				}
			});

			content.innerHTML = `
				${json["registry_locked"] ? '' : 
					`<div class="admin-registry-add" style="display: flex; gap: 10px; align-items: center;">
						<input type="text" placeholder="URL" id="admin-registry-url">
						<button class="button-1-full" onclick="AdminAddRegistry()">Add Registry</button>
						<label style="display: flex; align-items: center; cursor: pointer; white-space: nowrap;">
							<input type="checkbox" id="registry-compat-filter" checked onchange="window.RenderRegistryDroplets()" style="margin-right: 5px;">
							Show only compatible ones
						</label>
					</div>
					<hr>`
				}

				<table class="admin-modal-table">
					<tr>
						<th>Name</th>
						<th>URL</th>
						<th>Actions</th>
					</tr>
					${json["registry"].map(registry => `
						<tr>
							<td>${registry.info.name}</td>
							<td>${registry.url}</td>
							<td class="admin-modal-table-actions">
								${json["registry_locked"] ? 
									'<i class="fas fa-lock" title="Registry is locked"></i>' :
									`<i class="fas fa-trash" onclick="AdminDeleteRegistry('${registry.id}')"></i>`
								}
							</td>
						</tr>
					`).join('')}
				</table>
				
				<hr>

				<div style="margin-bottom: 10px;">
					<h3 style="margin: 0;">Available Droplets</h3>
				</div>

				<table class="admin-modal-table">
					<thead>
						<tr>
							<th>Name</th>
							<th>Image</th>
							<th>Registry</th>
							<th>Actions</th>
						</tr>
					</thead>
					<tbody id="registry-droplets-body">
					</tbody>
				</table>
			`;
			// Initial render
			RenderRegistryDroplets();
			});
			break;
		case 'instances':
			header.innerText = "Instances";
			subtext.innerText = "View and manage the instances currently running.";

			FetchAdminInstances(function(json) {
				content.innerHTML = `
				<table class="admin-modal-table">
					<tr>
						<th>Name</th>
						<th>Username</th>
						<th>Creation Time</th>
						<th>Internal IP</th>
						${userInfo.permissions.perm_edit_instances ? `<th>Actions</th>` : ''}
					</tr>
					${json["instances"].map(instance => `
						<tr>
							<td><div><img src="${instance.droplet.image_path ? instance.droplet.image_path : '/static/img/droplet_default.jpg'}"><p>${instance.droplet.display_name}</p></div></td>
							<td>${instance.user.username}</td>
							<td>${instance.created_at}</td>
							<td>${instance.ip}</td>
							${userInfo.permissions.perm_edit_instances ? `<td class="admin-modal-table-actions">
								<i class="fas fa-trash" onclick="AdminDeleteInstance('${instance.id}')"></i>
							</td>` : ''}
						</tr>
					`).join('')}
				</table>
				`;
			});
			break;
		case 'system':
			header.innerText = "System";
			subtext.innerText = "View system information.";

			FetchAdminSystemInfo(function(json) {
				content.innerHTML = `
				<h3>System Information</h3>

				<div class="admin-modal-card">
					<p>Hostname</p>
					<textarea readonly disabled style="resize: none;">${json["system"]["hostname"]}</textarea>
				</div>

				<div class="admin-modal-card">
					<p>Operating System</p>
					<textarea readonly disabled style="resize: none;">${json["system"]["os"]}</textarea>
				</div>

				<h3>Versions</h3>

				<div class="admin-modal-card">
					<p>Flowcase</p>
					<textarea readonly disabled style="resize: none;">${json["version"]["flowcase"]}</textarea>
				</div>

				<div class="admin-modal-card">
					<p>Python</p>
					<textarea readonly disabled style="resize: none;">${json["version"]["python"]}</textarea>
				</div>

				<div class="admin-modal-card">
					<p>Docker</p>
					<textarea readonly disabled style="resize: none;">${json["version"]["docker"]}</textarea>
				</div>

				<div class="admin-modal-card">
					<p>nginx</p>
					<textarea readonly disabled style="resize: none;">${json["version"]["nginx"]}</textarea>
				</div>
				`;
				});
			break;
		case 'groups':
			header.innerText = "Groups";
			subtext.innerText = "View and manage the groups of the system.";

			FetchAdminGroups(function(json) {
				content.innerHTML = `
					${userInfo.permissions.perm_edit_groups ? `
						<button class="button-1-full" onclick="ShowEditGroup()">Create Group</button>
						<hr>
					` : ''}

				<table class="admin-modal-table">
					<tr>
						<th>Name</th>
						${userInfo.permissions.perm_edit_groups ? `<th>Actions</th>` : ''}
					</tr>
					${json["groups"].map(group => `
						<tr>
							<td>${group.display_name}</td>
							${userInfo.permissions.perm_edit_groups ? `<td class="admin-modal-table-actions">
								<i class="fas fa-edit" onclick="ShowEditGroup('${group.id}')"></i>
								${group.protected ?
									`<i class="fas fa-lock" title="Protected group - cannot be deleted"></i>` :
									`<i class="fas fa-trash" onclick="AdminDeleteGroup('${group.id}')"></i>`
								}
							</td>` : ''}
						</tr>
					`).join('')}
				</table>
				`;
			});

			break;
		case 'logs':
			header.innerText = "System Logs";
			subtext.innerText = "View system logs and activity.";
			
			content.innerHTML = `
			<div class="logs-filter">
				<select id="log-type-filter">
					<option value="">All Types</option>
					<option value="DEBUG">Debug</option>
					<option value="INFO">Info</option>
					<option value="WARNING">Warning</option>
					<option value="ERROR">Error</option>
				</select>
				<button class="button-1" onclick="FetchAdminLogs(1)">Apply Filter</button>
			</div>
			<div id="logs-content" style="width: inherit;">
				<table class="admin-modal-table">
					<tr>
						<th>Time</th>
						<th>Level</th>
						<th>Message</th>
					</tr>
					<tr>
						<td colspan="3" style="text-align: center;">Loading logs...</td>
					</tr>
				</table>
			</div>
			<div class="pagination" id="logs-pagination">
			</div>
			`;
			
			FetchAdminLogs(1);
			break;
		case 'images':
			header.innerText = "Docker Images";
			subtext.innerText = "Manage Docker image downloads for droplets.";
			
			content.innerHTML = `
			<div style="margin-bottom: 20px;">
				<button class="button-1-full" onclick="PullAllImages()">Download All Images</button>
				<button class="button-1" onclick="RefreshImageStatus()" style="margin-left: 10px;">Refresh Status</button>
				<button class="button-1" onclick="ShowImageLogs()" style="margin-left: 10px;">View Logs</button>
			</div>
			<div id="images-content" style="width: inherit;">
				<table class="admin-modal-table">
					<tr>
						<th>Droplet</th>
						<th>Image</th>
						<th>Status</th>
						<th>Actions</th>
					</tr>
					<tr>
						<td colspan="4" style="text-align: center;">Loading images...</td>
					</tr>
				</table>
			</div>
			<div id="image-logs-section" style="display: none; margin-top: 30px; width: inherit;">
				<h3>Recent Image Download Logs</h3>
				<div class="logs-filter" style="margin-bottom: 15px;">
					<select id="image-log-type-filter">
						<option value="">All Types</option>
						<option value="DEBUG">Debug</option>
						<option value="INFO">Info</option>
						<option value="WARNING">Warning</option>
						<option value="ERROR">Error</option>
					</select>
					<button class="button-1" onclick="FetchImageLogs(1)">Apply Filter</button>
				</div>
				<div id="image-logs-content" style="width: inherit;">
					<table class="admin-modal-table">
						<tr>
							<th>Time</th>
							<th>Level</th>
							<th>Message</th>
						</tr>
						<tr>
							<td colspan="3" style="text-align: center;">Loading logs...</td>
						</tr>
					</table>
				</div>
				<div id="image-logs-pagination"></div>
			</div>
			`;
			
			FetchImageStatus();
		break;
	case 'sso':
		header.innerText = "Single Sign-On (SSO)";
		subtext.innerText = "Configure OIDC/OAuth2 Single Sign-On so users can authenticate via an external identity provider.";

		FetchAdminSsoConfig(function(json) {
			var sso = json["sso"];
			var groups = json["groups"] || [];
			
			var groupOptions = '<option value="">No Default Group</option>';
			groups.forEach(function(g) {
				var selected = sso.default_group_id === g.id ? 'selected' : '';
				groupOptions += `<option value="${g.id}" ${selected}>${g.display_name}</option>`;
			});

			content.innerHTML = `
				<div style="max-width: 538px; width: 100%;">

					<!-- Master enable toggle -->
					<div class="admin-modal-card" style="flex-direction: row; align-items: center; justify-content: space-between; padding: 16px 0;">
						<div style="flex: 1; padding-right: 24px;">
							<p style="margin:0; font-weight:600; font-size:15px;">Enable SSO</p>
							<p class="admin-modal-help-text" style="margin-top: 6px;">
								When enabled, a "Sign in with SSO" button appears on the login page.
								Users can also link their account to SSO from their profile.
							</p>
						</div>
						<label class="sso-toggle">
							<input type="checkbox" id="sso-enabled" ${sso.enabled ? 'checked' : ''}>
							<span class="sso-toggle-slider"></span>
						</label>
					</div>

					<!-- Disable classic login toggle -->
					<div class="admin-modal-card" style="flex-direction: row; align-items: center; justify-content: space-between; padding: 16px 0; border: 1px solid rgba(239,68,68,0.25); border-radius: 10px; background: rgba(239,68,68,0.05);">
						<div style="flex: 1; padding-left: 20px; padding-right: 24px;">
							<p style="margin:0; font-weight:600; font-size:15px;">Disable Classic Login</p>
							<p class="admin-modal-help-text" style="margin-top: 6px;">
								<strong style="color:#ef4444;">⚠ Danger:</strong> Username/password login will be completely disabled.
								Make sure SSO is fully configured before enabling this, or you will be locked out.
							</p>
						</div>
						<label class="sso-toggle" style="margin-right: 20px;">
							<input type="checkbox" id="sso-disable-classic" ${sso.disable_classic_login ? 'checked' : ''}>
							<span class="sso-toggle-slider" style="${sso.disable_classic_login ? 'background:#ef4444;' : ''}"></span>
						</label>
					</div>

					<!-- Auto Account Creation toggle -->
					<div class="admin-modal-card" style="flex-direction: row; align-items: center; justify-content: space-between; padding: 16px 0;">
						<div style="flex: 1; padding-right: 24px;">
							<p style="margin:0; font-weight:600; font-size:15px;">Auto Create Accounts</p>
							<p class="admin-modal-help-text" style="margin-top: 6px;">
								If enabled, users logging in via SSO for the first time will have a Flowcase account created automatically.
							</p>
						</div>
						<label class="sso-toggle" style="margin-right: 20px;">
							<input type="checkbox" id="sso-auto-create" ${sso.auto_create_accounts ? 'checked' : ''}>
							<span class="sso-toggle-slider"></span>
						</label>
					</div>

					<!-- Default Group -->
					<div class="admin-modal-card" style="padding: 12px 0;">
						<p>Default Group</p>
						<p class="admin-modal-help-text">
							New users created via SSO will be automatically added to this group.
						</p>
						<select id="sso-default-group" style="width:100%; padding: 8px 12px; background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.05); color: white; border-radius: 8px;">
							${groupOptions}
						</select>
					</div>

					<hr style="margin:16px 0; border: none; border-top: 1px solid rgba(255,255,255,0.08);">

					<!-- OIDC provider config -->
					<div style="margin-bottom: 24px;">
						<h3 style="margin:0 0 8px; font-size:14px; text-transform:uppercase; letter-spacing:1px; color:var(--text-color-gray);">OIDC / OAuth2 Provider</h3>
						<p class="admin-modal-help-text" style="margin:0;">
							Connect to any OpenID Connect provider — Authentik, Keycloak, Okta, Google, etc.
						</p>
					</div>

					<div class="admin-modal-card" style="padding: 12px 0;">
						<p>Provider Name</p>
						<p class="admin-modal-help-text">
							A friendly label shown to users on the login button (e.g. <code>Authentik</code>).
						</p>
						<input type="text" id="sso-provider-name" placeholder="My Identity Provider" value="${sso.provider_name || ''}">
					</div>

					<div class="admin-modal-card" style="padding: 12px 0;">
						<p>Issuer URL</p>
						<p class="admin-modal-help-text">
							The base URL of your OIDC provider (e.g. <code>https://auth.example.com/application/o/flowcase/</code>). Do not include <code>/.well-known/openid-configuration</code>.
						</p>
						<input type="text" id="sso-issuer-url" placeholder="https://auth.example.com/application/o/app-slug" value="${sso.issuer_url || ''}">
					</div>

					<div class="admin-modal-card" style="padding: 12px 0;">
						<p>Client ID</p>
						<p class="admin-modal-help-text">
							The OAuth2 Client ID registered for Flowcase in your identity provider.
						</p>
						<input type="text" id="sso-client-id" placeholder="flowcase-client-id" value="${sso.client_id || ''}">
					</div>

					<div class="admin-modal-card" style="padding: 12px 0;">
						<p>Client Secret</p>
						<p class="admin-modal-help-text">
							The OAuth2 Client Secret. Leave showing <code>****</code> to keep the existing saved value.
						</p>
						<input type="password" id="sso-client-secret" placeholder="••••••••" value="${sso.client_secret || ''}">
					</div>

					<div class="admin-modal-card" style="padding: 12px 0;">
						<p>App Domain</p>
						<p class="admin-modal-help-text">
							The base URL of this Flowcase instance. Used to generate the redirect URI below.
						</p>
						<input type="text" id="sso-app-domain" placeholder="https://flowcase.example.com" value="${(sso.redirect_uri || '').replace('/sso/callback', '')}" oninput="UpdateSsoRedirectUri()">
						
						<div style="margin-top:12px; padding:12px 16px; background:rgba(0,0,0,0.25); border-radius:8px; border:1px solid rgba(255,255,255,0.05); width: 512px; box-sizing: border-box;">
							<p style="margin:0 0 6px; font-size:12px; font-weight:600; color:var(--text-color-gray);">Redirect URI (Copy this to Authentik)</p>
							<code id="sso-redirect-uri-display" style="font-size:13px; color:#4f8ef7; word-break:break-all;"></code>
						</div>
					</div>

					<hr style="margin:24px 0 16px; border: none; border-top: 1px solid rgba(255,255,255,0.08);">

					<!-- Collapsible manual override section -->
					<div style="display:flex; justify-content:space-between; align-items:center; cursor:pointer; padding: 16px 20px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; width: 512px; box-sizing: border-box; transition: all 0.2s ease;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='rgba(255,255,255,0.03)'" onclick="var el = document.getElementById('sso-manual-override'); var icon = document.getElementById('sso-override-icon'); if (el.style.display === 'none') { el.style.display = 'block'; icon.style.transform = 'rotate(180deg)'; } else { el.style.display = 'none'; icon.style.transform = 'rotate(0deg)'; }">
						<div>
							<h3 style="margin:0 0 4px; font-size:14px; text-transform:uppercase; letter-spacing:1px; color:var(--text-color);">Manual Endpoints & Scopes</h3>
							<p style="margin:0; font-size:12px; color:var(--text-color-gray);">Optional settings to manually override auto-discovery</p>
						</div>
						<i id="sso-override-icon" class="fas fa-chevron-down" style="color:var(--text-color-gray); transition: transform 0.3s ease;"></i>
					</div>

					<div id="sso-manual-override" style="display:none; padding-top: 8px;">
						<div class="admin-modal-card" style="padding: 12px 0;">
							<p>Scopes</p>
							<p class="admin-modal-help-text">
								Space-separated OAuth2 scopes. <code>openid</code> is required.
							</p>
							<input type="text" id="sso-scopes" placeholder="openid profile email" value="${sso.scopes || 'openid profile email'}">
						</div>

						<div class="admin-modal-card" style="padding: 12px 0;">
							<p>Authorization Endpoint</p>
							<p class="admin-modal-help-text">
								Where users are redirected to authenticate. Found as <code>authorization_endpoint</code>.
							</p>
							<input type="text" id="sso-auth-endpoint" placeholder="https://auth.example.com/oauth/authorize" value="${sso.authorization_endpoint || ''}">
						</div>

						<div class="admin-modal-card" style="padding: 12px 0;">
							<p>Token Endpoint</p>
							<p class="admin-modal-help-text">
								Used to exchange the authorization code for an access token. Found as <code>token_endpoint</code>.
							</p>
							<input type="text" id="sso-token-endpoint" placeholder="https://auth.example.com/oauth/token" value="${sso.token_endpoint || ''}">
						</div>

						<div class="admin-modal-card" style="padding: 12px 0;">
							<p>Userinfo Endpoint</p>
							<p class="admin-modal-help-text">
								Called to retrieve user attributes. Found as <code>userinfo_endpoint</code>.
							</p>
							<input type="text" id="sso-userinfo-endpoint" placeholder="https://auth.example.com/oauth/userinfo" value="${sso.userinfo_endpoint || ''}">
						</div>
					</div>

					<div style="margin-top:32px; display:flex;">
						<button class="button-1-full" onclick="SaveSsoConfig()">Save Configuration</button>
					</div>
				</div>

				<style>
					.sso-toggle { position:relative; display:inline-block; width:46px; height:26px; flex-shrink:0; }
					.sso-toggle input { opacity:0; width:0; height:0; }
					.sso-toggle-slider {
						position:absolute; cursor:pointer; inset:0;
						background:rgba(255,255,255,0.1); border-radius:26px;
						transition: background 0.3s;
					}
					.sso-toggle-slider:before {
						content:''; position:absolute; height:18px; width:18px;
						left:4px; bottom:4px; background:white; border-radius:50%;
						transition: transform 0.3s;
					}
					.sso-toggle input:checked + .sso-toggle-slider { background: #4f8ef7; }
					#sso-disable-classic:checked + .sso-toggle-slider { background: #e05454 !important; }
					.sso-toggle input:checked + .sso-toggle-slider:before { transform: translateX(20px); }
				</style>
			`;

			// Initialize the display logic for Redirect URI directly
			window.UpdateSsoRedirectUri = function() {
				var domainInput = document.getElementById('sso-app-domain');
				var displayEl = document.getElementById('sso-redirect-uri-display');
				if (domainInput && displayEl) {
					var domain = domainInput.value.trim();
					if (!domain) {
						// Prefill with current origin if empty
						domain = window.location.origin;
						domainInput.value = domain;
					}
					domain = domain.replace(/\/+$/, ''); // remove trailing slash
					displayEl.innerText = domain + '/sso/callback';
				}
			};
			setTimeout(window.UpdateSsoRedirectUri, 50);
		});
		break;
	}
}

function FetchAdminSsoConfig(callback) {
	var url = "/api/admin/sso";
	var xhr = new XMLHttpRequest();
	xhr.open("GET", url, true);
	xhr.setRequestHeader("Content-Type", "application/json");
	xhr.onreadystatechange = function () {
		if (xhr.readyState === 4) {
			var json = JSON.parse(xhr.responseText);
			if (json["success"] == true) {
				callback(json);
			} else {
				CreateNotification(json["error"] || "Failed to load SSO configuration.", "error");
			}
		}
	};
	xhr.send();
}

function SaveSsoConfig() {
	var data = {
		enabled: document.getElementById('sso-enabled').checked,
		disable_classic_login: document.getElementById('sso-disable-classic').checked,
		auto_create_accounts: document.getElementById('sso-auto-create').checked,
		default_group_id: document.getElementById('sso-default-group').value,
		provider_name: document.getElementById('sso-provider-name').value,
		client_id: document.getElementById('sso-client-id').value,
		client_secret: document.getElementById('sso-client-secret').value,
		issuer_url: document.getElementById('sso-issuer-url').value,
		authorization_endpoint: document.getElementById('sso-auth-endpoint').value,
		token_endpoint: document.getElementById('sso-token-endpoint').value,
		userinfo_endpoint: document.getElementById('sso-userinfo-endpoint').value,
		redirect_uri: document.getElementById('sso-redirect-uri-display') ? document.getElementById('sso-redirect-uri-display').innerText : "",
		scopes: document.getElementById('sso-scopes').value,
	};

	var url = "/api/admin/sso";
	var xhr = new XMLHttpRequest();
	xhr.open("POST", url, true);
	xhr.setRequestHeader("Content-Type", "application/json");
	xhr.onreadystatechange = function () {
		if (xhr.readyState === 4) {
			var json = JSON.parse(xhr.responseText);
			if (json["success"] == true) {
				CreateNotification("SSO configuration saved successfully!", "success");
			} else {
				CreateNotification(json["error"] || "Failed to save SSO configuration.", "error");
			}
		}
	};
	xhr.send(JSON.stringify(data));
}

function FetchAdminSystemInfo(callback)
{
	var url = "/api/admin/system_info";
	var xhr = new XMLHttpRequest();
	xhr.open("GET", url, true);
	xhr.setRequestHeader("Content-Type", "application/json");
	xhr.onreadystatechange = function () {
		if (xhr.readyState === 4) {
			var json = JSON.parse(xhr.responseText);
			if (json["success"] == true) {
				callback(json);
			}
			else
			{
				if (json["error"] != null) {
					CreateNotification(json["error"], "error");
				}
				else {
					CreateNotification("An error occurred while retrieving the system information. Please try again later.", "error");
				}
			}
		}
	};
	xhr.send();

	console.log("Retrieving system information...");
}

function FetchAdminLogs(page)
{
	var logTypeFilter = document.getElementById('log-type-filter').value;
	var url = "/api/admin/logs?page=" + page;
	
	if (logTypeFilter) {
		url += "&type=" + logTypeFilter;
	}
	
	var xhr = new XMLHttpRequest();
	xhr.open("GET", url, true);
	xhr.setRequestHeader("Content-Type", "application/json");
	xhr.onreadystatechange = function () {
		if (xhr.readyState === 4) {
			var json = JSON.parse(xhr.responseText);
			if (json["success"] == true) {
				// Update the logs table
				var logsContent = document.getElementById('logs-content');
				var logsHtml = `
				<table class="admin-modal-table">
					<tr>
						<th>Time</th>
						<th>Level</th>
						<th>Message</th>
					</tr>`;
					
				if (json.logs.length === 0) {
					logsHtml += `
					<tr>
						<td colspan="3" style="text-align: center;">No logs found</td>
					</tr>`;
				} else {
					json.logs.forEach(log => {
						var levelClass = '';
						
						switch(log.level) {
							case 'ERROR':
								levelClass = 'log-error';
								break;
							case 'WARNING':
								levelClass = 'log-warning';
								break;
							case 'INFO':
								levelClass = 'log-info';
								break;
							case 'DEBUG':
								levelClass = 'log-debug';
								break;
						}
						
						logsHtml += `
						<tr>
							<td>${log.created_at}</td>
							<td class="${levelClass}">${log.level}</td>
							<td>${log.message}</td>
						</tr>`;
					});
				}
				
				logsHtml += `</table>`;
				logsContent.innerHTML = logsHtml;
				
				// Update pagination
				renderPagination('logs-pagination', json.pagination.page, json.pagination.pages, 'FetchAdminLogs');
			}
			else
			{
				if (json["error"] != null) {
					CreateNotification(json["error"], "error");
				}
				else {
					CreateNotification("An error occurred while retrieving logs. Please try again later.", "error");
				}
			}
		}
	};
	xhr.send();
	
	console.log("Retrieving logs...");
}

function FetchAdminUsers(callback)
{
	var url = "/api/admin/users";
	var xhr = new XMLHttpRequest();
	xhr.open("GET", url, true);
	xhr.setRequestHeader("Content-Type", "application/json");
	xhr.onreadystatechange = function () {
		if (xhr.readyState === 4) {
			var json = JSON.parse(xhr.responseText);
			if (json["success"] == true) {
				admin_users = json["users"];
				callback(json);
			}
			else
			{
				if (json["error"] != null) {
					CreateNotification(json["error"], "error");
				}
				else {
					CreateNotification("An error occurred while retrieving the users. Please try again later.", "error");
				}
			}
		}
	};
	xhr.send();

	console.log("Retrieving users...");
}

function FetchAdminDroplets(callback)
{
	var url = "/api/admin/droplets";
	var xhr = new XMLHttpRequest();
	xhr.open("GET", url, true);
	xhr.setRequestHeader("Content-Type", "application/json");
	xhr.onreadystatechange = function () {
		if (xhr.readyState === 4) {
			var json = JSON.parse(xhr.responseText);
			if (json["success"] == true) {
				admin_droplets = json["droplets"];
				callback(json);
				
				// If there's a droplet access container visible, update it
				if (document.getElementById('droplet-access-container')) {
					updateDropletAccess();
				}
			}
			else
			{
				if (json["error"] != null) {
					CreateNotification(json["error"], "error");
				}
				else {
					CreateNotification("An error occurred while retrieving the droplets. Please try again later.", "error");
				}
			}
		}
	};
	xhr.send();

	console.log("Retrieving droplets...");
}

function FetchAdminInstances(callback)
{
	var url = "/api/admin/instances";
	var xhr = new XMLHttpRequest();
	xhr.open("GET", url, true);
	xhr.setRequestHeader("Content-Type", "application/json");
	xhr.onreadystatechange = function () {
		if (xhr.readyState === 4) {
			var json = JSON.parse(xhr.responseText);
			if (json["success"] == true) {
				callback(json);
			}
			else
			{
				if (json["error"] != null) {
					CreateNotification(json["error"], "error");
				}
				else {
					CreateNotification("An error occurred while retrieving the instances. Please try again later.", "error");
				}
			}
		}
	};
	xhr.send();

	console.log("Retrieving instances...");
}

function FetchAdminNetworks(callback)
{
	var url = "/api/admin/networks";
	var xhr = new XMLHttpRequest();
	xhr.open("GET", url, true);
	xhr.setRequestHeader("Content-Type", "application/json");
	xhr.onreadystatechange = function () {
		if (xhr.readyState === 4) {
			var json = JSON.parse(xhr.responseText);
			if (json["success"] == true) {
				callback(json);
			}
			else
			{
				if (json["error"] != null) {
					CreateNotification(json["error"], "error");
				}
				else {
					CreateNotification("An error occurred while retrieving the networks. Please try again later.", "error");
				}
			}
		}
	};
	xhr.send();

	console.log("Retrieving networks...");
}

function FetchAdminGroups(callback)
{
	var url = "/api/admin/groups";
	var xhr = new XMLHttpRequest();
	xhr.open("GET", url, true);
	xhr.setRequestHeader("Content-Type", "application/json");
	xhr.onreadystatechange = function () {
		if (xhr.readyState === 4) {
			var json = JSON.parse(xhr.responseText);
			if (json["success"] == true) {
				admin_groups = json["groups"];
				callback(json);
			}
			else
			{
				if (json["error"] != null) {
					CreateNotification(json["error"], "error");
				}
				else {
					CreateNotification("An error occurred while retrieving the groups. Please try again later.", "error");
				}
			}
		}
	};
	xhr.send();

	console.log("Retrieving groups...");
}

function FetchAdminRegistry(callback)
{
	var url = "/api/admin/registry";
	var xhr = new XMLHttpRequest();
	xhr.open("GET", url, true);
	xhr.setRequestHeader("Content-Type", "application/json");
	xhr.onreadystatechange = function () {
		if (xhr.readyState === 4) {
			var json = JSON.parse(xhr.responseText);
			if (json["success"] == true) {
				callback(json);
			}
			else
			{
				if (json["error"] != null) {
					CreateNotification(json["error"], "error");
				}
				else {
					CreateNotification("An error occurred while retrieving the registry. Please try again later.", "error");
				}
			}
		}
	};
	xhr.send();

	console.log("Retrieving registry...");
}

function AdminAddRegistry()
{
	var url = "/api/admin/registry";
	var xhr = new XMLHttpRequest();
	xhr.open("POST", url, true);
	xhr.setRequestHeader("Content-Type", "application/json");
	xhr.onreadystatechange = function () {
		if (xhr.readyState === 4) {
			var json = JSON.parse(xhr.responseText);
			if (json["success"] == true) {
				CreateNotification("Registry added successfully.", "success");

				//Update registry
				FetchAdminRegistry(function(json) {
					AdminChangeTab('registry');
				});
			}
			else
			{
				if (json["error"] != null) {
					CreateNotification(json["error"], "error");
				}
				else {
					CreateNotification("An error occurred while adding the registry. Please try again later.", "error");
				}
			}
		}
	};
	var data = JSON.stringify({"url": document.getElementById('admin-registry-url').value});
	xhr.send(data);

	console.log("Adding registry...");
}

function AdminDeleteRegistry(registry_id)
{
	if (!confirm("Are you sure you want to delete this registry?")) {
		return;
	}

	var url = "/api/admin/registry";
	var xhr = new XMLHttpRequest();
	xhr.open("DELETE", url, true);
	xhr.setRequestHeader("Content-Type", "application/json");
	xhr.onreadystatechange = function () {
		if (xhr.readyState === 4) {
			var json = JSON.parse(xhr.responseText);
			if (json["success"] == true) {
				CreateNotification("Registry deleted successfully.", "success");

				//Update registry
				FetchAdminRegistry(function(json) {
					AdminChangeTab('registry');
				});
			}
			else
			{
				if (json["error"] != null) {
					CreateNotification(json["error"], "error");
				}
				else {
					CreateNotification("An error occurred while deleting the registry. Please try again later.", "error");
				}
			}
		}
	};
	var data = JSON.stringify({"id": registry_id});
	xhr.send(data);

	console.log("Deleting registry...");
}

/**
 * Determines which droplets a user can access based on their group memberships
 * @param {Array} selectedGroups - Array of group IDs the user belongs to
 * @returns {Array} - Array of accessible droplet objects with access info
 */
function getAccessibleDroplets(selectedGroups) {
	// If no groups are selected, return empty array
	if (!selectedGroups || selectedGroups.length === 0) {
		return [];
	}

	const accessibleDroplets = [];
	const isAdminSelected = selectedGroups.some(groupId => {
		const group = admin_groups.find(g => g.id === groupId);
		return group && group.display_name === "Admin";
	});
	
	const isUserSelected = selectedGroups.some(groupId => {
		const group = admin_groups.find(g => g.id === groupId);
		return group && group.display_name === "User";
	});

	// Process each droplet
	admin_droplets.forEach(droplet => {
		const dropletGroups = droplet.restricted_groups ? droplet.restricted_groups.split(',') : [];
		let hasAccess = false;
		const accessGroups = [];

		// Admin users can access all droplets
		if (isAdminSelected) {
			hasAccess = true;
			accessGroups.push({
				id: admin_groups.find(g => g.display_name === "Admin").id,
				name: "Admin",
				reason: "Admin access"
			});
		}
		
		// Check if user shares at least one group with the droplet
		if (!hasAccess && dropletGroups.length > 0) {
			for (const groupId of selectedGroups) {
				if (dropletGroups.includes(groupId)) {
					hasAccess = true;
					const group = admin_groups.find(g => g.id === groupId);
					accessGroups.push({
						id: groupId,
						name: group ? group.display_name : "Unknown",
						reason: "Group restriction"
					});
				}
			}
		}

		if (hasAccess) {
			accessibleDroplets.push({
				...droplet,
				accessGroups: accessGroups
			});
		}
	});

	// Sort droplets by display name
	return accessibleDroplets.sort((a, b) => {
		return a.display_name.localeCompare(b.display_name);
	});
}

/**
 * Updates the droplet access display based on currently selected groups
 */
function updateDropletAccess() {
	// Get all selected group checkboxes
	const selectedGroups = Array.from(
		document.querySelectorAll('input[name="admin-edit-user-groups"]:checked')
	).map(checkbox => checkbox.value);
	
	// Get the container element
	const container = document.getElementById('droplet-access-container');
	
	// If no droplets data is available yet, show loading message
	if (!admin_droplets || admin_droplets.length === 0) {
		container.innerHTML = `<p class="droplet-access-notice">Loading droplet information...</p>`;
		
		// Fetch droplets if not already loaded
		FetchAdminDroplets(function(json) {
			updateDropletAccess();
		});
		return;
	}
	
	// Get accessible droplets based on selected groups
	const accessibleDroplets = getAccessibleDroplets(selectedGroups);
	
	if (accessibleDroplets.length === 0) {
		container.innerHTML = `<p class="droplet-access-notice">No droplets accessible with selected groups.</p>`;
		return;
	}
	
	// Build the HTML for the droplet access list
	let html = `
		<table class="droplet-access-table">
			<thead>
				<tr>
					<th>Droplet</th>
					<th>Access Via</th>
				</tr>
			</thead>
			<tbody>
	`;
	
	accessibleDroplets.forEach(droplet => {
		html += `
			<tr>
				<td>
					<div class="droplet-access-item">
						<img src="${droplet.image_path || '/static/img/droplet_default.jpg'}" alt="${droplet.display_name}">
						<span>${droplet.display_name}</span>
					</div>
				</td>
				<td>
					<div class="droplet-access-groups">
						${droplet.accessGroups.map(group => `
							<span class="droplet-access-group" data-group-id="${group.id}">
								${group.name}
								<span class="droplet-access-reason">${group.reason}</span>
							</span>
						`).join('')}
					</div>
				</td>
			</tr>
		`;
	});
	
	html += `
			</tbody>
		</table>
	`;
	
	container.innerHTML = html;
}

function ShowEditUser(user_id = null)
{
	var header = document.getElementById('admin-modal-header');
	var subtext = document.getElementById('admin-modal-subtext');

	var user = admin_users.find(user => user.id == user_id);
	if (user_id == null) {
		header.innerText = "Create User";
		subtext.innerText = "Create a new user.";
	} else {
		header.innerText = "Edit User";
		subtext.innerText = "Edit an existing user.";
	}

	var content = document.querySelector('.admin-modal-main-content');
	content.innerHTML = `
	<div class="admin-modal-card">
		<p>Username <span class="required">*</span> ${user_id != null && (admin_users.find(user => user.id == user_id).username === "admin" || admin_users.find(user => user.id == user_id).protected) ? '<i class="fas fa-lock" title="Protected - Cannot be changed"></i>' : ''}</p>
		<input type="text" id="admin-edit-user-username" value="${ user_id != null ? admin_users.find(user => user.id == user_id).username : "" }" autocomplete="off" ${user_id != null && (admin_users.find(user => user.id == user_id).username === "admin" || admin_users.find(user => user.id == user_id).protected) ? "disabled" : ""}>
	</div>

	${user_id == null ? `
	<div class="admin-modal-card">
		<p>Password <span class="required">*</span></p>
		<input type="password" id="admin-edit-user-password" autocomplete="new-password">
	</div>
	` : ""}

	<div class="admin-modal-card">
		<p>Groups <span class="required">*</span></p>
		<div class="admin-user-groups-container">
			${admin_groups.map(group => {
				const isUserInGroup = user_id != null && user.groups.find(user_group => user_group.id == group.id);
				const isAdminUser = user_id != null && admin_users.find(user => user.id == user_id).username === "admin";
				const isAdminGroup = group.display_name === "Admin";
				
				return `
					<div class="admin-user-group-item">
						<input
							type="checkbox"
							id="group-${group.id}"
							name="admin-edit-user-groups"
							value="${group.id}"
							${isUserInGroup ? "checked" : ""}
							${isAdminUser && isAdminGroup ? "disabled" : ""}
							onchange="updateDropletAccess()"
						>
						<label for="group-${group.id}">
							${group.display_name}
						</label>
					</div>
				`;
			}).join('')}
		</div>
	</div>

	<div class="admin-modal-card">
		<p>Droplet Access</p>
		<div id="droplet-access-container" class="droplet-access-container">
			<p class="droplet-access-loading">Loading droplet access information...</p>
		</div>
	</div>

	<button class="button-1-full" onclick="SaveUser('${user_id}')">Save</button>
	`;

	// Initialize droplet access display
	updateDropletAccess();
}

function SaveUser(user_id = null)
{
	var url = "/api/admin/user";
	var xhr = new XMLHttpRequest();
	xhr.open("POST", url, true);
	xhr.setRequestHeader("Content-Type", "application/json");
	xhr.onreadystatechange = function () {
		if (xhr.readyState === 4) {
			var json = JSON.parse(xhr.responseText);
			if (json["success"] == true) {
				CreateNotification("User saved successfully.", "success");

				//Logout if the current user is edited
				if (user_id == userInfo.id) {
					window.location.href = "/logout";
				}
				
				//Update users
				FetchAdminUsers(function(json) {
					AdminChangeTab('users');
				});
			}
			else
			{
				if (json["error"] != null) {
					CreateNotification(json["error"], "error");
				}
				else {
					CreateNotification("An error occurred while saving the user. Please try again later.", "error");
				}
			}
		}
	};
	var data = JSON.stringify({
		"id": user_id,
		"username": document.getElementById('admin-edit-user-username').value,
		"password": user_id == "null" ? document.getElementById('admin-edit-user-password').value : "",
		"groups": Array.from(document.querySelectorAll('input[name="admin-edit-user-groups"]:checked')).map(checkbox => checkbox.value)
	});
	xhr.send(data);

	console.log("Saving user...");
}

function AdminDeleteUser(user_id)
{
	if (!confirm("Are you sure you want to delete this user?")) {
		return;
	}

	var url = "/api/admin/user";
	var xhr = new XMLHttpRequest();
	xhr.open("DELETE", url, true);
	xhr.setRequestHeader("Content-Type", "application/json");
	xhr.onreadystatechange = function () {
		if (xhr.readyState === 4) {
			var json = JSON.parse(xhr.responseText);
			if (json["success"] == true) {
				CreateNotification("User deleted successfully.", "success");

				//Logout if the current user is deleted
				if (user_id == userInfo.id) {
					window.location.href = "/logout";
				}

				//Update users
				FetchAdminUsers(function(json) {
					AdminChangeTab('users');
				});
			}
			else
			{
				if (json["error"] != null) {
					CreateNotification(json["error"], "error");
				}
				else {
					CreateNotification("An error occurred while deleting the user. Please try again later.", "error");
				}
			}
		}
	};
	var data = JSON.stringify({"id": user_id});
	xhr.send(data);

	console.log("Deleting user...");
}

function ShowEditGroup(group_id = null)
{
	var header = document.getElementById('admin-modal-header');
	var subtext = document.getElementById('admin-modal-subtext');

	var group = admin_groups.find(group => group.id == group_id);
	if (group_id == null) {
		header.innerText = "Create Group";
		subtext.innerText = "Create a new group.";
	} else {
		header.innerText = "Edit Group";
		subtext.innerText = "Edit an existing group.";
	}

	// Check if this is the Admin Group
	const isAdminGroup = group_id != null && group.display_name === "Admin";

	var content = document.querySelector('.admin-modal-main-content');
	content.innerHTML = `
	${isAdminGroup ? `
	<div class="admin-modal-warning">
		<i class="fas fa-exclamation-triangle"></i>
		<p><strong>Warning:</strong> Admin Group permissions cannot be modified for system security. All permissions are permanently enabled to prevent accidental lockout.</p>
	</div>
	` : ''}

	<div class="admin-modal-card">
		<p>Display Name <span class="required">*</span> ${group_id != null && group.protected ? '<i class="fas fa-lock" title="Protected - Cannot be changed"></i>' : ''}</p>
		<input type="text" id="admin-edit-group-display-name" value="${ group_id != null ? group.display_name : "" }" ${group_id != null && group.protected ? "disabled" : ""}>
	</div>

	<div class="admin-modal-card">
		<p>Can View Admin Panel ${isAdminGroup ? '<i class="fas fa-lock" title="Admin Group permission - Cannot be modified for system security"></i>' : ''}</p>
		<input type="checkbox" id="admin-edit-group-can-view-admin-panel" ${ group_id != null && group.permissions.admin_panel ? "checked" : "" } ${isAdminGroup ? "disabled" : ""}>
	</div>

	<div class="admin-modal-card">
		<p>Can View Users ${isAdminGroup ? '<i class="fas fa-lock" title="Admin Group permission - Cannot be modified for system security"></i>' : ''}</p>
		<input type="checkbox" id="admin-edit-group-can-view-users" ${ group_id != null && group.permissions.view_users ? "checked" : "" } ${isAdminGroup ? "disabled" : ""}>
	</div>

	<div class="admin-modal-card">
		<p>Can Edit Users ${isAdminGroup ? '<i class="fas fa-lock" title="Admin Group permission - Cannot be modified for system security"></i>' : ''}</p>
		<input type="checkbox" id="admin-edit-group-can-edit-users" ${ group_id != null && group.permissions.edit_users ? "checked" : "" } ${isAdminGroup ? "disabled" : ""}>
	</div>

	<div class="admin-modal-card">
		<p>Can View Groups ${isAdminGroup ? '<i class="fas fa-lock" title="Admin Group permission - Cannot be modified for system security"></i>' : ''}</p>
		<input type="checkbox" id="admin-edit-group-can-view-groups" ${ group_id != null && group.permissions.view_groups ? "checked" : "" } ${isAdminGroup ? "disabled" : ""}>
	</div>

	<div class="admin-modal-card">
		<p>Can Edit Groups ${isAdminGroup ? '<i class="fas fa-lock" title="Admin Group permission - Cannot be modified for system security"></i>' : ''}</p>
		<input type="checkbox" id="admin-edit-group-can-edit-groups" ${ group_id != null && group.permissions.edit_groups ? "checked" : "" } ${isAdminGroup ? "disabled" : ""}>
	</div>

	<div class="admin-modal-card">
		<p>Can View Droplets ${isAdminGroup ? '<i class="fas fa-lock" title="Admin Group permission - Cannot be modified for system security"></i>' : ''}</p>
		<input type="checkbox" id="admin-edit-group-can-view-droplets" ${ group_id != null && group.permissions.view_droplets ? "checked" : "" } ${isAdminGroup ? "disabled" : ""}>
	</div>

	<div class="admin-modal-card">
		<p>Can Edit Droplets ${isAdminGroup ? '<i class="fas fa-lock" title="Admin Group permission - Cannot be modified for system security"></i>' : ''}</p>
		<input type="checkbox" id="admin-edit-group-can-edit-droplets" ${ group_id != null && group.permissions.edit_droplets ? "checked" : "" } ${isAdminGroup ? "disabled" : ""}>
	</div>

	<div class="admin-modal-card">
		<p>Can View Instances ${isAdminGroup ? '<i class="fas fa-lock" title="Admin Group permission - Cannot be modified for system security"></i>' : ''}</p>
		<input type="checkbox" id="admin-edit-group-can-view-instances" ${ group_id != null && group.permissions.view_instances ? "checked" : "" } ${isAdminGroup ? "disabled" : ""}>
	</div>

	<div class="admin-modal-card">
		<p>Can Edit Instances ${isAdminGroup ? '<i class="fas fa-lock" title="Admin Group permission - Cannot be modified for system security"></i>' : ''}</p>
		<input type="checkbox" id="admin-edit-group-can-edit-instances" ${ group_id != null && group.permissions.edit_instances ? "checked" : "" } ${isAdminGroup ? "disabled" : ""}>
	</div>

	<button class="button-1-full" onclick="SaveGroup('${group_id}')">Save</button>
	`;
}

function SaveGroup(group_id = null)
{
	var url = "/api/admin/group";
	var xhr = new XMLHttpRequest();
	xhr.open("POST", url, true);
	xhr.setRequestHeader("Content-Type", "application/json");
	xhr.onreadystatechange = function () {
		if (xhr.readyState === 4) {
			var json = JSON.parse(xhr.responseText);
			if (json["success"] == true) {
				CreateNotification("Group saved successfully.", "success");

				//Update groups
				FetchAdminGroups(function(json) {
					AdminChangeTab('groups');
				});
			}
			else
			{
				if (json["error"] != null) {
					CreateNotification(json["error"], "error");
				}
				else {
					CreateNotification("An error occurred while saving the group. Please try again later.", "error");
				}
			}
		}
	};
	
	// Check if this is the Admin Group
	var group = admin_groups.find(group => group.id == group_id);
	const isAdminGroup = group_id != null && group && group.display_name === "Admin";
	
	// For Admin Group, ensure all permissions are enabled regardless of checkbox state
	var data = JSON.stringify({
		"id": group_id,
		"display_name": document.getElementById('admin-edit-group-display-name').value,
		"perm_admin_panel": isAdminGroup ? true : document.getElementById('admin-edit-group-can-view-admin-panel').checked,
		"perm_view_users": isAdminGroup ? true : document.getElementById('admin-edit-group-can-view-users').checked,
		"perm_edit_users": isAdminGroup ? true : document.getElementById('admin-edit-group-can-edit-users').checked,
		"perm_view_groups": isAdminGroup ? true : document.getElementById('admin-edit-group-can-view-groups').checked,
		"perm_edit_groups": isAdminGroup ? true : document.getElementById('admin-edit-group-can-edit-groups').checked,
		"perm_view_droplets": isAdminGroup ? true : document.getElementById('admin-edit-group-can-view-droplets').checked,
		"perm_edit_droplets": isAdminGroup ? true : document.getElementById('admin-edit-group-can-edit-droplets').checked,
		"perm_view_instances": isAdminGroup ? true : document.getElementById('admin-edit-group-can-view-instances').checked,
		"perm_edit_instances": isAdminGroup ? true : document.getElementById('admin-edit-group-can-edit-instances').checked
	});
	xhr.send(data);

	console.log("Saving group...");
}

function AdminDeleteGroup(group_id)
{
	if (!confirm("Are you sure you want to delete this group?")) {
		return;
	}

	var url = "/api/admin/group";
	var xhr = new XMLHttpRequest();
	xhr.open("DELETE", url, true);
	xhr.setRequestHeader("Content-Type", "application/json");
	xhr.onreadystatechange = function () {
		if (xhr.readyState === 4) {
			var json = JSON.parse(xhr.responseText);
			if (json["success"] == true) {
				CreateNotification("Group deleted successfully.", "success");

				//Update groups
				FetchAdminGroups(function(json) {
					AdminChangeTab('groups');
				});
			}
			else
			{
				if (json["error"] != null) {
					CreateNotification(json["error"], "error");
				}
				else {
					CreateNotification("An error occurred while deleting the group. Please try again later.", "error");
				}
			}
		}
	};
	var data = JSON.stringify({"id": group_id});
	xhr.send(data);

	console.log("Deleting group...");
}

function ShowEditDropletRegistry(display_name, description, image_path, container_docker_registry, container_docker_image, selected_tag)
{
	// First ensure groups are loaded
	FetchAdminGroups(function() {
		// Then show the edit droplet form
		ShowEditDroplet();
		
		var content = document.querySelector('.admin-modal-main-content');
		document.getElementById('admin-edit-droplet-display-name').value = display_name;
		document.getElementById('admin-edit-droplet-description').value = description;
		document.getElementById('admin-edit-droplet-image-path').value = image_path;
		document.getElementById('admin-edit-droplet-docker-registry').value = container_docker_registry;
		document.getElementById('admin-edit-droplet-docker-image').value = container_docker_image + ":" + selected_tag;
		document.getElementById('admin-edit-droplet-cores').value = "2";
		document.getElementById('admin-edit-droplet-memory').value = "2768";
		
		// Fix the restricted groups section to show checkboxes instead of an empty input field
		var groupsContainer = document.querySelector('.admin-user-groups-container');
		if (groupsContainer) {
			// Clear any existing content
			groupsContainer.innerHTML = '';
			
			// Add checkboxes for each group
			admin_groups.forEach(group => {
				groupsContainer.innerHTML += `
					<div class="admin-user-group-item">
						<input
							type="checkbox"
							id="group-${group.id}"
							name="admin-edit-droplet-groups"
							value="${group.id}"
						>
						<label for="group-${group.id}">
							${group.display_name}
						</label>
					</div>
				`;
			});
		}
	});
}

function ShowEditDroplet(instance_id = null)
{
	var header = document.getElementById('admin-modal-header');
	var subtext = document.getElementById('admin-modal-subtext');

	//get droplet by id
	var droplet = admin_droplets.find(droplet => droplet.id == instance_id);

	if (instance_id == null) {
		header.innerText = "Create Droplet";
		subtext.innerText = "Create a new droplet.";
	} else {
		header.innerText = "Edit " + droplet.display_name;
		subtext.innerText = "Edit an existing droplet.";
	}

	// Parse restricted groups if they exist
	var restrictedGroups = [];
	if (droplet && droplet.restricted_groups) {
		restrictedGroups = droplet.restricted_groups.split(',');
	}

	var content = document.querySelector('.admin-modal-main-content');
	content.innerHTML = `
	<div class="admin-modal-card">
		<p>Display Name <span class="required">*</span></p>
		<input type="text" id="admin-edit-droplet-display-name" value="${ droplet != null ? droplet.display_name : "" }">
	</div>

	<div class="admin-modal-card">
		<p>Description</p>
		<textarea style="resize: vertical; height: 84px;" id="admin-edit-droplet-description">${ droplet != null ? droplet.description ? droplet.description : "" : "" }</textarea>
	</div>

	<div class="admin-modal-card">
		<p>Image Path</p>
		<input type="text" id="admin-edit-droplet-image-path" value="${ droplet != null ? droplet.image_path ? droplet.image_path : "" : "" }">
	</div>

	<div class="admin-modal-card">
		<p>Type <span class="required">*</span></p>
		<select id="admin-edit-droplet-type" onchange="ChangeDropletType()">
			<option value="container" ${ droplet != null && droplet.droplet_type == "container" ? "selected" : "" }>Container</option>
			<option value="vnc" ${ droplet != null && droplet.droplet_type == "vnc" ? "selected" : "" }>VNC</option>
			<option value="rdp" ${ droplet != null && droplet.droplet_type == "rdp" ? "selected" : "" }>RDP</option>
			<option value="ssh" ${ droplet != null && droplet.droplet_type == "ssh" ? "selected" : "" }>SSH</option>
		</select>
	</div>

	<div class="admin-modal-card">
		<p>Restricted Groups</p>
		<p class="admin-modal-help-text">Users with membership in selected groups will have access to the droplet.</p>
		<div class="admin-user-groups-container">
			${admin_groups.map(group => {
				const isGroupSelected = restrictedGroups.includes(group.id);
				
				return `
					<div class="admin-user-group-item">
						<input
							type="checkbox"
							id="group-${group.id}"
							name="admin-edit-droplet-groups"
							value="${group.id}"
							${isGroupSelected ? "checked" : ""}
						>
						<label for="group-${group.id}">
							${group.display_name}
						</label>
					</div>
				`;
			}).join('')}
		</div>
	</div>

	<div id="admin-droplet-edit-container-only">
		<div class="admin-modal-card">
			<p>Docker Registry <span class="required">*</span></p>
			<input type="text" id="admin-edit-droplet-docker-registry" value="${ droplet != null ? droplet.container_docker_registry ? droplet.container_docker_registry : "" : "" }">
		</div>

		<div class="admin-modal-card">
			<p>Docker Image <span class="required">*</span></p>
			<input type="text" id="admin-edit-droplet-docker-image" value="${ droplet != null ? droplet.container_docker_image ? droplet.container_docker_image : "" : "" }">
		</div>

		<div class="admin-modal-card">
			<p>Cores <span class="required">*</span></p>
			<input type="number" id="admin-edit-droplet-cores" value="${ droplet != null ? (droplet.container_cores !== null ? droplet.container_cores : 1) : 1 }">
		</div>

		<div class="admin-modal-card">
			<p>Memory (MB) <span class="required">*</span></p>
			<input type="number" id="admin-edit-droplet-memory" value="${ droplet != null ? (droplet.container_memory !== null ? droplet.container_memory : 1024) : 1024 }">
		</div>

		<div class="admin-modal-card">
			<p>Docker Network</p>
			<select id="admin-edit-droplet-network">
				<option value="">Default Network (flowcase_default_network)</option>
				<!-- Network options will be populated dynamically -->
			</select>
			<small>Select a network for this droplet</small>
		</div>
	</div>

	<div id="admin-droplet-edit-server-only">
		<div class="admin-modal-card">
			<p>IP Address <span class="required">*</span></p>
			<input type="text" id="admin-edit-droplet-ip-address" value="${ droplet != null ? droplet.server_ip ? droplet.server_ip : "" : "" }">
		</div>

		<div class="admin-modal-card">
			<p>Port <span class="required">*</span></p>
			<input type="number" id="admin-edit-droplet-port" value="${ droplet != null ? (droplet.server_port !== null ? droplet.server_port : 22) : 22 }">
		</div>

		<div class="admin-modal-card">
			<p>Username</p>
			<input type="text" id="admin-edit-droplet-username" value="${ droplet != null ? droplet.server_username ? droplet.server_username : "" : "" }">
		</div>

		<div class="admin-modal-card">
			<p>Password</p>
			<input type="password" id="admin-edit-droplet-password" value="${ droplet != null ? droplet.server_password ? droplet.server_password : "" : "" }" autocomplete="new-password">
		</div>
	</div>

	<button class="button-1-full" onclick="SaveDroplet('${instance_id}')">Save</button>
	`;

	ChangeDropletType();
	
	// Populate network dropdown with available networks
	FetchAdminNetworks(function(json) {
		var networkDropdown = document.getElementById('admin-edit-droplet-network');
		
		// Add networks from the API response
		json.networks.forEach(network => {
			var option = document.createElement('option');
			option.value = network.name;
			option.text = network.name;
			
			// Select the current network if editing an existing droplet
			if (droplet != null && droplet.container_network === network.name) {
				option.selected = true;
			}
			
			networkDropdown.appendChild(option);
		});
	});
}

function ChangeDropletType()
{
	var type = document.getElementById('admin-edit-droplet-type').value;

	var containerOnly = document.getElementById('admin-droplet-edit-container-only');
	var serverOnly = document.getElementById('admin-droplet-edit-server-only');

	if (type == "container") {
		containerOnly.style.display = "block";
		serverOnly.style.display = "none";
	} else {
		containerOnly.style.display = "none";
		serverOnly.style.display = "block";
	}
}

function SaveDroplet(droplet_id = null)
{
	var url = "/api/admin/droplet";
	var xhr = new XMLHttpRequest();
	xhr.open("POST", url, true);
	xhr.setRequestHeader("Content-Type", "application/json");
	xhr.onreadystatechange = function () {
		if (xhr.readyState === 4) {
			var json = JSON.parse(xhr.responseText);
			if (json["success"] == true) {
				CreateNotification("Droplet saved successfully.", "success");
				
				// Auto-pull the image for the new/updated droplet
				var dockerImage = document.getElementById('admin-edit-droplet-docker-image').value;
				var dockerRegistry = document.getElementById('admin-edit-droplet-docker-registry').value;
				
				
				if (dockerImage && dockerRegistry) {					
					// Attempt to pull the image
					var pullUrl = "/api/admin/images/pull";
					var pullXhr = new XMLHttpRequest();
					pullXhr.open("POST", pullUrl, true);
					pullXhr.setRequestHeader("Content-Type", "application/json");
					pullXhr.onreadystatechange = function () {
						if (pullXhr.readyState === 4) {
							var pullJson = JSON.parse(pullXhr.responseText);
							if (pullJson["success"] == true) {
								CreateNotification("Docker image downloaded successfully.", "success");
							} else {
								var pullError = pullJson["error"] || pullJson["message"] || "Failed to download Docker image. You can download it manually from Admin → Images.";
								if (typeof pullError === 'object') { pullError = JSON.stringify(pullError); }
								CreateNotification(String(pullError), "warning");
							}
						}
					};
					
					var pullData = JSON.stringify({
						"droplet_id": json["droplet_id"] || droplet_id,
						"registry": dockerRegistry,
						"image": dockerImage
					});
					pullXhr.send(pullData);
				}
				
				//Update droplets
				FetchAdminDroplets(function(json) {
					AdminChangeTab('droplets');
				});

				GetDroplets();
			}
			else
			{
				if (json["error"] != null) {
					var saveError = json["error"];
					if (typeof saveError === 'object') { saveError = JSON.stringify(saveError); }
					CreateNotification(String(saveError), "error");
				}
				else {
					CreateNotification("An error occurred while saving the droplet. Please try again later.", "error");
				}
			}
		}
	};
	// Get selected groups
	var selectedGroups = [];
	document.querySelectorAll('input[name="admin-edit-droplet-groups"]:checked').forEach(checkbox => {
		selectedGroups.push(checkbox.value);
	});
	
	var data = JSON.stringify({
		"id": droplet_id,
		"display_name": document.getElementById('admin-edit-droplet-display-name').value,
		"description": document.getElementById('admin-edit-droplet-description').value,
		"image_path": document.getElementById('admin-edit-droplet-image-path').value,
		"droplet_type": document.getElementById('admin-edit-droplet-type').value,
		"container_docker_registry": document.getElementById('admin-edit-droplet-docker-registry').value,
		"container_docker_image": document.getElementById('admin-edit-droplet-docker-image').value,
		"container_cores": document.getElementById('admin-edit-droplet-cores').value,
		"container_memory": document.getElementById('admin-edit-droplet-memory').value,
		"container_network": document.getElementById('admin-edit-droplet-network').value,
		"server_ip": document.getElementById('admin-edit-droplet-ip-address').value,
		"server_port": document.getElementById('admin-edit-droplet-port').value,
		"server_username": document.getElementById('admin-edit-droplet-username').value,
		"server_password": document.getElementById('admin-edit-droplet-password').value,
		"restricted_groups": selectedGroups
	});
	xhr.send(data);

	console.log("Saving droplet...");
}

function AdminDeleteDroplet(droplet_id)
{
	if (!confirm("Are you sure you want to delete this droplet? All instances of this droplet will be destroyed.")) {
		return;
	}

	var url = "/api/admin/droplet";
	var xhr = new XMLHttpRequest();
	xhr.open("DELETE", url, true);
	xhr.setRequestHeader("Content-Type", "application/json");
	xhr.onreadystatechange = function () {
		if (xhr.readyState === 4) {
			var json = JSON.parse(xhr.responseText);
			if (json["success"] == true) {
				CreateNotification("Droplet deleted successfully.", "success");
				//Update droplets
				FetchAdminDroplets(function(json) {
					AdminChangeTab(currentTab || 'droplets');
				});

				GetDroplets();
			}
			else
			{
				if (json["error"] != null) {
					CreateNotification(json["error"], "error");
				}
				else {
					CreateNotification("An error occurred while deleting the droplet. Please try again later.", "error");
				}
			}
		}
	};
	var data = JSON.stringify({"id": droplet_id});
	xhr.send(data);

	console.log("Deleting droplet...");
}

function AdminDeleteInstance(instance_id)
{
	if (!confirm("Are you sure you want to delete this instance?")) {
		return;
	}

	var url = "/api/admin/instance";
	var xhr = new XMLHttpRequest();
	xhr.open("DELETE", url, true);
	xhr.setRequestHeader("Content-Type", "application/json");
	xhr.onreadystatechange = function () {
		if (xhr.readyState === 4) {
			var json = JSON.parse(xhr.responseText);
			if (json["success"] == true) {
				CreateNotification("Instance deleted successfully.", "success");
				//Update instances
				FetchAdminInstances(function(json) {
					AdminChangeTab('instances');
				});

				GetInstances();
			}
			else
			{
				if (json["error"] != null) {
					CreateNotification(json["error"], "error");
				}
				else {
					CreateNotification("An error occurred while deleting the instance. Please try again later.", "error");
				}
			}
		}
	};
	var data = JSON.stringify({"id": instance_id});
	xhr.send(data);

	console.log("Deleting instance...");
}

function FetchImageStatus()
{
	var url = "/api/admin/images/status";
	var xhr = new XMLHttpRequest();
	xhr.open("GET", url, true);
	xhr.setRequestHeader("Content-Type", "application/json");
	xhr.onreadystatechange = function () {
		if (xhr.readyState === 4) {
			var json = JSON.parse(xhr.responseText);
			if (json["success"] == true) {
				UpdateImageStatusDisplay(json["images"]);
			}
			else
			{
				var imagesContent = document.getElementById('images-content');
				imagesContent.innerHTML = `
				<table class="admin-modal-table">
					<tr>
						<th>Droplet</th>
						<th>Image</th>
						<th>Status</th>
						<th>Actions</th>
					</tr>
					<tr>
						<td colspan="4" style="text-align: center; color: red;">Error: ${json["error"] || "Failed to load image status"}</td>
					</tr>
				</table>
				`;
			}
		}
	};
	xhr.send();
	
	console.log("Fetching image status...");
}

let currentImagesStatus = {};

function UpdateImageStatusDisplay(images)
{
	currentImagesStatus = images;
	var imagesContent = document.getElementById('images-content');
	var tableHtml = `
	<table class="admin-modal-table">
		<tr>
			<th>Droplet</th>
			<th>Image</th>
			<th>Status</th>
			<th>Actions</th>
		</tr>`;
		
	if (Object.keys(images).length === 0) {
		tableHtml += `
		<tr>
			<td colspan="4" style="text-align: center; padding: 20px; color: var(--text-color-gray);">No droplets with Docker images found</td>
		</tr>`;
	} else {
		let isDownloading = false;
		Object.keys(images).forEach(dropletId => {
			var imageInfo = images[dropletId];
			
			// Fix race condition: if it just finished downloading, docker images list might have been cached or fetched right before completion.
			var isDoneAndWaiting = (imageInfo.download_status === 'done' && !imageInfo.exists);
			var effectivelyExists = imageInfo.exists || imageInfo.download_status === 'done';
			
			if (isDoneAndWaiting) {
				isDownloading = true; // Keep polling until exists is actually true
			}
			
			var statusHtml = '';
			var actionButton = '';
			
			if (imageInfo.download_status === 'downloading') {
				isDownloading = true;
				statusHtml = `
				<div style="display: flex; flex-direction: column; align-items: flex-start; gap: 4px;">
					<span style="background: rgba(0, 123, 255, 0.1); color: #007bff; padding: 4px 8px; border-radius: 12px; font-size: 12px; font-weight: bold;">
						<i class="fas fa-spinner fa-spin" style="margin-right: 4px;"></i> Downloading (${imageInfo.download_progress}%)
					</span>
					<div style="width: 120px; background: rgba(0,0,0,0.1); border-radius: 4px; overflow: hidden; height: 6px;">
						<div style="width: ${imageInfo.download_progress}%; height: 10px; background: #007bff; transition: width 0.3s ease;"></div>
					</div>
				</div>`;
				actionButton = `<button class="button-1" disabled style="opacity: 0.5; cursor: not-allowed;">Downloading...</button>`;
			} else if (imageInfo.download_status === 'error') {
				statusHtml = `
				<span style="background: rgba(220, 53, 69, 0.1); color: #dc3545; padding: 4px 8px; border-radius: 12px; font-size: 12px; font-weight: bold;" title="${imageInfo.download_error}">
					<i class="fas fa-exclamation-triangle" style="margin-right: 4px;"></i> Error
				</span>`;
				actionButton = `<button class="button-1" onclick="PullSingleImage('${dropletId}')"><i class="fas fa-redo"></i> Retry</button>`;
			} else if (effectivelyExists) {
				statusHtml = `
				<span style="background: rgba(40, 167, 69, 0.1); color: #28a745; padding: 4px 8px; border-radius: 12px; font-size: 12px; font-weight: bold;">
					<i class="fas fa-check-circle" style="margin-right: 4px;"></i> Ready
				</span>`;
				actionButton = `<span style="color: #28a745; font-weight: bold;"><i class="fas fa-check"></i></span>
								<i class="fas fa-info-circle" style="cursor:pointer; color:#17a2b8; margin-left: 15px; font-size: 16px; vertical-align: middle;" onclick="ShowDockerImageInfo('${dropletId}')" title="Info"></i>
								<i class="fas fa-sync-alt" style="cursor:pointer; color:#ffc107; margin-left: 15px; font-size: 16px; vertical-align: middle;" onclick="PullSingleImage('${dropletId}')" title="Repull Image"></i>`;
			} else {
				statusHtml = `
				<span style="background: rgba(108, 117, 125, 0.1); color: #6c757d; padding: 4px 8px; border-radius: 12px; font-size: 12px; font-weight: bold;">
					<i class="fas fa-box-open" style="margin-right: 4px;"></i> Missing
				</span>`;
				actionButton = `<button class="button-1" onclick="PullSingleImage('${dropletId}')"><i class="fas fa-download"></i> Pull</button>`;
			}
				
			if (dropletId !== 'guac') {
				actionButton += ` <i class="fas fa-trash" style="cursor:pointer; color:#dc3545; margin-left: 15px; font-size: 16px; vertical-align: middle;" onclick="AdminDeleteDroplet('${dropletId}')" title="Delete Droplet"></i>`;
			}
				
			tableHtml += `
			<tr style="transition: background 0.2s;">
				<td style="vertical-align: middle;"><strong>${imageInfo.droplet_name}</strong></td>
				<td style="vertical-align: middle;"><code style="background: rgba(0,0,0,0.05); padding: 2px 6px; border-radius: 4px;">${imageInfo.image}</code></td>
				<td style="vertical-align: middle;">${statusHtml}</td>
				<td style="vertical-align: middle; white-space: nowrap;">${actionButton}</td>
			</tr>`;
		});
		
		if (isDownloading && window.imagesStatusTimeout) {
			clearTimeout(window.imagesStatusTimeout);
		}
		if (isDownloading) {
			window.imagesStatusTimeout = setTimeout(FetchImageStatus, 1500);
		}
	}
	
	tableHtml += `</table>`;
	imagesContent.innerHTML = tableHtml;
}

function ShowDockerImageInfo(dropletId) {
	let info = currentImagesStatus[dropletId];
	if (!info) return;

	let size = formatBytes(info.size);
	let created = info.created ? new Date(info.created).toLocaleString() : "Unknown";

	var header = document.getElementById('admin-modal-header');
	var subtext = document.getElementById('admin-modal-subtext');
	var content = document.querySelector('.admin-modal-main-content');
	
	header.innerText = "Docker Image Info";
	subtext.innerText = "Information about the image " + info.image;

	content.innerHTML = `
	<div class="admin-modal-card">
		<p>Image Name</p>
		<input type="text" readonly disabled value="${info.image}">
	</div>
	<div class="admin-modal-card">
		<p>Registry</p>
		<input type="text" readonly disabled value="${info.registry}">
	</div>
	<div class="admin-modal-card">
		<p>Total Size</p>
		<input type="text" readonly disabled value="${size}">
	</div>
	<div class="admin-modal-card">
		<p>Date Pulled / Created</p>
		<input type="text" readonly disabled value="${created}">
	</div>
	<button class="button-1-full" onclick="AdminChangeTab('images')">Back to Images</button>
	`;
}

function PullSingleImage(dropletId)
{
	// Show loading state
	var element = event.target;
	
	// Find the actual button or action icon that was clicked
	if (element.tagName === 'I' && element.parentElement.tagName === 'BUTTON') {
		element = element.parentElement;
	}
	
	var originalContent = "";
	if (element.tagName === 'I') {
		originalContent = element.className;
		element.className = "fas fa-spinner fa-spin";
		element.style.color = "#007bff";
		element.style.cursor = "not-allowed";
		element.title = "Downloading...";
		element.onclick = null; // disable clicking again
	} else {
		originalContent = element.innerHTML;
		element.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Downloading...';
		element.disabled = true;
	}
	
	var url = "/api/admin/images/pull";
	var xhr = new XMLHttpRequest();
	xhr.open("POST", url, true);
	xhr.setRequestHeader("Content-Type", "application/json");
	xhr.onreadystatechange = function () {
		if (xhr.readyState === 4) {
			var json = JSON.parse(xhr.responseText);
			if (json["success"] == true) {
				CreateNotification(json["message"], "success");
				// Refresh the status after successful download
				setTimeout(function() {
					FetchImageStatus();
				}, 1000);
			}
			else
			{
				var errorMsg = json["error"] || json["message"] || "Failed to download image";
				if (typeof errorMsg === 'object') {
					errorMsg = JSON.stringify(errorMsg);
				}
				console.error("Image Pull Error:", json);
				CreateNotification(String(errorMsg), "error");
				// Reset button state on error
				if (element.tagName === 'I') {
					element.className = originalContent;
					element.style.color = "#ffc107";
					element.style.cursor = "pointer";
					element.title = "Repull Image";
					element.onclick = function() { PullSingleImage(dropletId); };
				} else {
					element.innerHTML = originalContent;
					element.disabled = false;
				}
			}
		}
	};
	var data = JSON.stringify({"droplet_id": dropletId});
	xhr.send(data);
	
	console.log("Pulling image for droplet:", dropletId);
}

function PullAllImages()
{
	if (!confirm("This will download all missing Docker images. This may take a long time and use significant bandwidth. Continue?")) {
		return;
	}
	
	var url = "/api/admin/images/pull-all";
	var xhr = new XMLHttpRequest();
	xhr.open("POST", url, true);
	xhr.setRequestHeader("Content-Type", "application/json");
	xhr.onreadystatechange = function () {
		if (xhr.readyState === 4) {
			var json = JSON.parse(xhr.responseText);
			if (json["success"] == true) {
				CreateNotification(json["message"], "success");
				// Refresh status after a short delay
				setTimeout(function() {
					FetchImageStatus();
				}, 2000);
			}
			else
			{
				CreateNotification(json["error"] || "Failed to start image downloads", "error");
			}
		}
	};
	xhr.send("{}");
	
	console.log("Starting download of all images...");
}

function RefreshImageStatus()
{
	FetchImageStatus();
	CreateNotification("Refreshing image status...", "info");
}

function ShowImageLogs() {
	var imageLogsSection = document.getElementById('image-logs-section');
	var imageLogsContent = document.getElementById('image-logs-content');

	if (imageLogsSection.style.display === 'none') {
		imageLogsSection.style.display = 'block';
		FetchImageLogs(1); // Fetch logs for the first page
	} else {
		imageLogsSection.style.display = 'none';
		imageLogsContent.innerHTML = `
			<table class="admin-modal-table">
				<tr>
					<th>Time</th>
					<th>Level</th>
					<th>Message</th>
				</tr>
				<tr>
					<td colspan="3" style="text-align: center;">No logs found</td>
				</tr>
			</table>
		`;
	}
}

function FetchImageLogs(page) {
	// Use the dedicated image log filter, fallback to main log filter if needed
	var imageLogTypeFilterElement = document.getElementById('image-log-type-filter');
	var mainLogTypeFilterElement = document.getElementById('log-type-filter');
	var logTypeFilter = '';
	
	if (imageLogTypeFilterElement) {
		logTypeFilter = imageLogTypeFilterElement.value;
	} else if (mainLogTypeFilterElement) {
		logTypeFilter = mainLogTypeFilterElement.value;
	}
	
	var url = "/api/admin/images/logs?page=" + page;
	
	if (logTypeFilter) {
		url += "&type=" + logTypeFilter;
	}

	var xhr = new XMLHttpRequest();
	xhr.open("GET", url, true);
	xhr.setRequestHeader("Content-Type", "application/json");
	xhr.onreadystatechange = function () {
		if (xhr.readyState === 4) {
			var json = JSON.parse(xhr.responseText);
			if (json["success"] == true) {
				var logsContent = document.getElementById('image-logs-content');
				var logsHtml = `
				<table class="admin-modal-table">
					<tr>
						<th>Time</th>
						<th>Level</th>
						<th>Message</th>
					</tr>`;
					
				if (json.logs.length === 0) {
					logsHtml += `
					<tr>
						<td colspan="3" style="text-align: center;">No logs found</td>
					</tr>`;
				} else {
					json.logs.forEach(log => {
						var levelClass = '';
						
						switch(log.level) {
							case 'ERROR':
								levelClass = 'log-error';
								break;
							case 'WARNING':
								levelClass = 'log-warning';
								break;
							case 'INFO':
								levelClass = 'log-info';
								break;
							case 'DEBUG':
								levelClass = 'log-debug';
								break;
						}
						
						logsHtml += `
						<tr>
							<td>${log.created_at}</td>
							<td class="${levelClass}">${log.level}</td>
							<td>${log.message}</td>
						</tr>`;
					});
				}
				
				logsHtml += `</table>`;
				logsContent.innerHTML = logsHtml;
				
				// Update pagination
				renderPagination('image-logs-pagination', json.pagination.page, json.pagination.pages, 'FetchImageLogs');
			}
			else
			{
				if (json["error"] != null) {
					CreateNotification(json["error"], "error");
				}
				else {
					CreateNotification("An error occurred while retrieving image logs. Please try again later.", "error");
				}
			}
		}
	};
	xhr.send();
	
	console.log("Retrieving image logs...");
}

// Reusable pagination rendering function
function renderPagination(elementId, currentPage, totalPages, callbackFunction) {
	var pagination = document.getElementById(elementId);
	var paginationHtml = '';
	
	if (totalPages > 1) {
		paginationHtml = `<div class="pagination-controls">`;
		
		// Previous button
		if (currentPage > 1) {
			paginationHtml += `<a href="#" onclick="${callbackFunction}(${currentPage - 1})">&laquo; Previous</a>`;
		} else {
			paginationHtml += `<span class="disabled">&laquo; Previous</span>`;
		}
		
		// Page numbers
		var startPage = Math.max(1, currentPage - 2);
		var endPage = Math.min(totalPages, currentPage + 2);
		
		if (startPage > 1) {
			paginationHtml += `<a href="#" onclick="${callbackFunction}(1)">1</a>`;
			if (startPage > 2) {
				paginationHtml += `<span>...</span>`;
			}
		}
		
		for (var i = startPage; i <= endPage; i++) {
			if (i === currentPage) {
				paginationHtml += `<span class="current">${i}</span>`;
			} else {
				paginationHtml += `<a href="#" onclick="${callbackFunction}(${i})">${i}</a>`;
			}
		}
		
		if (endPage < totalPages) {
			if (endPage < totalPages - 1) {
				paginationHtml += `<span>...</span>`;
			}
			paginationHtml += `<a href="#" onclick="${callbackFunction}(${totalPages})">${totalPages}</a>`;
		}
		
		// Next button
		if (currentPage < totalPages) {
			paginationHtml += `<a href="#" onclick="${callbackFunction}(${currentPage + 1})">Next &raquo;</a>`;
		} else {
			paginationHtml += `<span class="disabled">Next &raquo;</span>`;
		}
		
		paginationHtml += `</div>`;
	}
	
	pagination.innerHTML = paginationHtml;
}

window.RenderRegistryDroplets = function() {
	var tbody = document.getElementById("registry-droplets-body");
	if (!tbody) return;

	var filterElement = document.getElementById("registry-compat-filter");
	var filterCompat = filterElement ? filterElement.checked : false;
	var hostArch = window.adminHostArch;
	var droplets = window.adminRegistryDroplets || [];

	var html = "";
	droplets.forEach(droplet => {
		if (filterCompat) {
			if (droplet.architectures && Array.isArray(droplet.architectures) && !droplet.architectures.includes(hostArch)) {
				return;
			}
		}

		if (droplet.has_json_error) {
			html += `
				<tr>
					<td><div><p>${droplet.id || 'Unknown'}</p></div></td>
					<td colspan="2"><span style="color: #dc3545;"><i class="fas fa-exclamation-triangle"></i> Json error</span></td>
					<td></td>
				</tr>
			`;
			return;
		}

		html += `
			<tr>
				<td><div><img src="${droplet.image_path ? droplet.image_path : '/static/img/droplet_default.jpg'}"><p>${droplet.display_name}</p></div></td>
				<td>
					<select style="width: 100%">
						${droplet.container_docker_tags.map((tag, index) => `
							<option ${index === droplet.tagdefaultindex ? 'selected' : ''} value="${tag}">${droplet.container_docker_image}:${tag}</option>
						`).join('')}
					</select>
				</td>
				<td>${droplet.registry_name}</td>
				<td class="admin-modal-table-actions">
					<div style="display: flex; align-items: center; justify-content: flex-end; gap: 15px;">
						<i class="fas fa-edit" style="cursor: pointer;" onclick="ShowEditDropletRegistry('${droplet.display_name}', '${droplet.description}', '${droplet.image_path}', '${droplet.container_docker_registry}', '${droplet.container_docker_image}', this.parentElement.parentElement.parentElement.querySelector('select').value)" title="Modify"></i>
						<i class="fas fa-plus" style="cursor: pointer; color: #28a745;" onclick="QuickAddDropletRegistry('${droplet.display_name}', '${droplet.description}', '${droplet.image_path}', '${droplet.container_docker_registry}', '${droplet.container_docker_image}', this.parentElement.parentElement.parentElement.querySelector('select').value)" title="Quick Add"></i>
					</div>
				</td>
			</tr>
		`;
	});

	tbody.innerHTML = html;
};

window.QuickAddDropletRegistry = function(display_name, description, image_path, container_docker_registry, container_docker_image, selected_tag) {
	var url = "/api/admin/droplet";
	var xhr = new XMLHttpRequest();
	xhr.open("POST", url, true);
	xhr.setRequestHeader("Content-Type", "application/json");
	xhr.onreadystatechange = function () {
		if (xhr.readyState === 4) {
			var json = JSON.parse(xhr.responseText);
			if (json["success"] == true) {
				CreateNotification("Droplet added successfully.", "success");
				
				// Attempt to pull the image
				var pullUrl = "/api/admin/images/pull";
				var pullXhr = new XMLHttpRequest();
				pullXhr.open("POST", pullUrl, true);
				pullXhr.setRequestHeader("Content-Type", "application/json");
				pullXhr.onreadystatechange = function () {
					if (pullXhr.readyState === 4) {
						var pullJson = JSON.parse(pullXhr.responseText);
						if (pullJson["success"] == true) {
							CreateNotification("Docker image download started.", "success");
						} else {
							var pullError = pullJson["error"] || "Failed to download Docker image.";
							CreateNotification(String(pullError), "warning");
						}
					}
				};
				
				var pullData = JSON.stringify({
					"droplet_id": json["droplet_id"],
					"registry": container_docker_registry,
					"image": container_docker_image + ":" + selected_tag
				});
				pullXhr.send(pullData);
				
				FetchAdminDroplets(function(json) {
					AdminChangeTab('images');
				});
				GetDroplets();
			} else {
				CreateNotification(json["error"] || "Failed to add droplet.", "error");
			}
		}
	};
	
	var data = JSON.stringify({
		"id": null,
		"display_name": display_name,
		"description": description,
		"image_path": image_path,
		"droplet_type": "container",
		"container_docker_registry": container_docker_registry,
		"container_docker_image": container_docker_image + ":" + selected_tag,
		"container_cores": 2,
		"container_memory": 2768,
		"container_network": "flowcase_default_network",
		"server_ip": "",
		"server_port": 22,
		"server_username": "",
		"server_password": "",
		"restricted_groups": []
	});
	xhr.send(data);
};
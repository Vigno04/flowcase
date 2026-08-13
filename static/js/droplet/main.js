var iframe = document.getElementById('iframe-id');

const isGuacamole = instanceInfo.droplet.droplet_type != 'container';

window.onload = function() {
	InitializeEventListeners();
	SideBarHandleInit();

	if (instanceInfo.status === 'saved') {
		// Instance needs to be resumed first — trigger it from here
		ShowLoadingScreen('Starting saved instance...');
		var xhr = new XMLHttpRequest();
		xhr.open('POST', '/api/instance/' + instanceInfo.id + '/resume', true);
		xhr.setRequestHeader('Content-Type', 'application/json');
		xhr.onreadystatechange = function() {
			if (xhr.readyState === 4) {
				var json = JSON.parse(xhr.responseText);
				if (json['success']) {
					instanceInfo.status = 'running';
					ReloadIFrame();
				} else {
					ShowLoadingScreen('Failed to start: ' + (json['error'] || 'Unknown error'));
				}
			}
		};
		xhr.send();
	} else {
		ReloadIFrame();
	}
}

function ReloadIFrame() {
	var url = `/desktop/${instanceInfo.id}/vnc/vnc.html?`;
	if (!isGuacamole) {
		url += `path=/desktop/${instanceInfo.id}/vnc/websockify&cursor=true&resize=remote&autoconnect=true&reconnect=true&clipboard_up=true&clipboard_down=true&clipboard_seamless=true&toggle_control_panel=null`;
	} 
	else {
		url += `instance_id=${instanceInfo.id}&guac_token=${instanceInfo.guac_token}`;
	}

	iframe.src = url;
}

function InitializeEventListeners() {
	console.log("Initializing event listeners...");
	if (window.addEventListener) {
		window.addEventListener("message", receiveMessage, false);
		window.addEventListener("connection_state", receiveMessage, false);
	} else if (window.attachEvent) {
		window.attachEvent("message", receiveMessage);
	}
}

var isExiting = false;

function receiveMessage(event) {
	console.log(event.data);

	if (event.data.action == 'connection_state') {
		if (isExiting) return; // Ignore connection state changes if we are saving/exiting
		
		if (event.data.value == 'connected') {
			OnVNCSuccess();
		}
		else if (event.data.value == 'connecting') {
			ShowLoadingScreen("Connecting...");
		}
		else if (event.data.value == 'reconnecting') {
			ShowLoadingScreen("Reconnecting...");
		}
		else {
			document.querySelector('.sidebar').style.display = 'none';
		}
	} else if (event.data.action == 'enable_audio') { //This triggers when the user clicks the canvas, so we are going to use it to hide the sidebar
		if (event.data.value === null) {
			toggleSidebar("hide");
		}
	} else if (event.data.action == 'togglenav') {
		toggleSidebar();
	}
}

iframe.onload = function() {
	setTimeout(function() {
		if (!IsVNCConnected()) {
			console.log("iframe not loaded, reloading...");
			iframe.src = iframe.src;
		}
	}, 4000);
}

function IsVNCConnected() {
	if (iframe == null) {
		return false;
	}
	var iframeTitle = iframe.contentDocument.title;
	return isGuacamole ? iframeTitle.includes("Guacamole") : iframeTitle.includes("KasmVNC");
}


function OnVNCSuccess() {
	HideLoadingScreen();

	//Show the sidebar
	document.querySelector('.sidebar').style.display = 'flex';

	iframeFocus();

	if (isGuacamole) return;

	//quality select
	var qualitySelect = document.getElementById('control-quality-select');
	qualitySelect.value = iframe.contentDocument.getElementById('noVNC_setting_video_quality').value;

	qualitySelect.addEventListener('change', function() {
		iframe.contentDocument.getElementById('noVNC_setting_video_quality').value = qualitySelect.value;
		iframe.contentDocument.getElementById('noVNC_setting_video_quality').dispatchEvent(new Event('change'));
	});

	//game mode checkbox
	var gameModeCheckbox = document.getElementById('control-game-mode');
	gameModeCheckbox.addEventListener('change', function() {
		iframe.contentDocument.getElementById('noVNC_game_mode_button').click();
		document.getElementById('control-game-mode-check').classList.toggle('fa-check');

		if (document.getElementById('control-game-mode-check').classList.contains('fa-check')) {
			toggleSidebar();
		}
	});

	//enable audio
	ToggleAudioButton();
}

//refocus iframe
var iframeFocus = function() {
	// Do not refocus if focus is on an input field
	var focused = document.activeElement;
	if (focused && focused !== document.body)
		return;

	// Ensure iframe is focused
	iframe.focus();
};

// Focus iframe when clicked
document.addEventListener('click', iframeFocus);
document.addEventListener('keydown', iframeFocus);

var audioPlayer;
function AudioInit() {
	var url = new URL(iframe.src);
	var protocol = url.protocol == 'https:' ? 'wss:' : 'ws:';
	
	//destroy previous audio player if it exists
	if (audioPlayer != null) {
		AudioStop();
	}

	audioPlayer = new JSMpeg.Player(protocol + '//' + url.host + `/desktop/${instanceInfo.id}/audio/`, {
		audio: true,
		video: false,
		maxAudioLag: 0.25,
	});
	console.log("Audio: Connected to audio websocket.");
}

function AudioStop() {
	try {
		audioPlayer.stop();
		audioPlayer.destroy();
		audioPlayer = null;
	} catch (error) {}
	console.log("Audio: Disconnected from audio websocket.");
}

function ToggleAudioButton() {
	var audioCheckbox = document.getElementById('control-audio');
	var audioIcon = document.getElementById('control-audio-check');
	audioCheckbox.checked = !audioCheckbox.checked;

	if (audioCheckbox.checked) {
		AudioInit();
		audioIcon.classList.add('fa-check');
	} else {
		AudioStop();
		audioIcon.classList.remove('fa-check');
	}
}

if (!isGuacamole)
{
	function BuildDownloadTree(container, path) {
		var url = `/desktop/${instanceInfo.id}/vnc/Downloads/Downloads/` + path;
		var xhr = new XMLHttpRequest();
		xhr.open("GET", url, true);
		xhr.setRequestHeader("Content-Type", "application/json");
		xhr.onreadystatechange = function () {
			if (xhr.readyState === 4) {
				var parser = new DOMParser();
				var html = parser.parseFromString(xhr.responseText, 'text/html');
				var aTags = html.getElementsByTagName('a');
				var ul = document.createElement('ul');
				ul.style.listStyle = 'none';
				ul.style.paddingLeft = path === '' ? '0' : '15px';

				for (var i = 0; i < aTags.length; i++) {
					var name = aTags[i].innerText;
					if (name === '../') continue;

					var li = document.createElement('li');
					li.style.marginBottom = '5px';
					var isDirectory = name.endsWith('/');
					
					var icon = document.createElement('i');
					icon.className = isDirectory ? 'fa fa-folder' : 'fa fa-file';
					icon.style.marginRight = '8px';

					var link = document.createElement('a');
					link.innerText = name;
					link.style.cursor = 'pointer';

					var actions = document.createElement('span');
					actions.style.float = 'right';

					var downloadBtn = document.createElement('a');
					downloadBtn.innerHTML = '<i class="fa fa-download"></i>';
					downloadBtn.style.marginLeft = '10px';
					downloadBtn.title = "Download";
					
					if (isDirectory) {
						downloadBtn.href = `/desktop/${instanceInfo.id}/uploads/download?path=${encodeURIComponent(path + name)}`;
					} else {
						downloadBtn.href = url + name;
						downloadBtn.download = name;
					}

					li.appendChild(icon);
					li.appendChild(link);
					li.appendChild(actions);
					actions.appendChild(downloadBtn);

					if (isDirectory) {
						var subContainer = document.createElement('div');
						subContainer.style.display = 'none';
						li.appendChild(subContainer);
						
						link.onclick = (function(sub, p, ico) {
							return function() {
								if (sub.style.display === 'none') {
									sub.style.display = 'block';
									ico.className = 'fa fa-folder-open';
									if (sub.innerHTML === '') {
										sub.innerHTML = '<i>Loading...</i>';
										BuildDownloadTree(sub, p);
									}
								} else {
									sub.style.display = 'none';
									ico.className = 'fa fa-folder';
								}
							}
						})(subContainer, path + name, icon);
					} else {
						link.href = url + name;
						link.download = name;
					}

					ul.appendChild(li);
				}
				container.innerHTML = '';
				if (path === '') {
					if (ul.childNodes.length === 0) {
						container.innerHTML = '<p>No files found.</p>';
					} else {
						container.appendChild(ul);
					}
				} else {
					container.appendChild(ul);
				}
			}
		};
		xhr.send();
	}

	function FetchDownloads() {
		var downloadSection = document.getElementById('download-section');
		downloadSection.innerHTML = '<i>Loading...</i>';
		BuildDownloadTree(downloadSection, '');
	}

	//Uploads
	Dropzone.autoDiscover = false;
	let myDropzone = new Dropzone("#upload-section-main", {
		url: `/desktop/${instanceInfo.id}/uploads/upload`,
		forceChunking: true,
		chunking: true,
		chunkSize: 10000000, //10MB
		parallelUploads: 20,
		maxFilesize: 16000000, //16GB
		autoProcessQueue: true,
		createImageThumbnails: false,
		clickable: true,
		previewTemplate: `
		<div class="dz-preview dz-file-preview">
			<div class="dz-details">
				<div class="dz-filename"><span data-dz-name></span></div>
				<div class="dz-size" data-dz-size></div>
			</div>
			<div class="dz-progress"><span class="dz-upload" data-dz-uploadprogress></span></div>
			<div class="dz-error-message"><span data-dz-errormessage></span></div>
		</div>
		`,
		init: function() {
			this.on("success", function(file, response) {
				setTimeout(() => {
					if (file.previewElement) {
						file.previewElement.remove();
					}
				}, 3500);
			});
			this.on("error", function(file, message, xhr) {
				if (file.previewElement) {
					var errorElement = file.previewElement.querySelector('[data-dz-errormessage]');
					if (errorElement) {
						if (xhr && xhr.responseText) {
							errorElement.innerText = xhr.responseText;
						} else if (message) {
							errorElement.innerText = typeof message === 'string' ? message : "Upload failed";
						}
					}
				}
			});
			this.on("sending", function(file, xhr, formData) {
				if (file.fullPath) {
					formData.append("filepath", file.fullPath);
				} else if (file.webkitRelativePath) {
					formData.append("filepath", file.webkitRelativePath);
				}
			});
		}
	});
}

function SideBarHandleInit() {
	const handle = document.getElementById('sidebar-handle');
	let isDragging = false;
	let offsetY = 0;
	let dragStartY = 0;
	let dragMoved = false;

	handle.addEventListener('pointerdown', function(e) {
		isDragging = true;
		offsetY = e.clientY - handle.getBoundingClientRect().top;
		dragStartY = e.clientY;
		dragMoved = false;
		handle.setPointerCapture(e.pointerId);
		document.body.style.userSelect = 'none';
	});

	handle.addEventListener('pointermove', function(e) {
		if (!isDragging) return;
		const sidebarRect = sidebar.getBoundingClientRect();
		let newTop = e.clientY - sidebarRect.top - offsetY;
		const minTop = 0;
		const maxTop = sidebar.offsetHeight - handle.offsetHeight;
		if (newTop < minTop) newTop = minTop;
		if (newTop > maxTop) newTop = maxTop;
		handle.style.top = newTop + 'px';
		if (Math.abs(e.clientY - dragStartY) > 3) dragMoved = true;
	});

	handle.addEventListener('pointerup', function(e) {
		isDragging = false;
		handle.releasePointerCapture(e.pointerId);
		document.body.style.userSelect = '';
	});

	handle.addEventListener('click', function(e) {
		if (dragMoved) {
			e.preventDefault();
			e.stopPropagation();
			return;
		}
		toggleSidebar();
	});
}
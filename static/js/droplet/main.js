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

	// ─── Upload Section ────────────────────────────────────────────────────────

	// Tracks active upload counts for badge on Upload button
	var _uploadActive = 0;
	var _uploadErrored = 0;

	function _updateUploadBadge() {
		var badge = document.getElementById('upload-badge');
		if (!badge) return;
		var total = _uploadActive + _uploadErrored;
		if (total > 0) {
			badge.textContent = total;
			badge.style.display = 'inline-block';
			badge.style.background = _uploadErrored > 0 ? '#cc3333' : '#4a9eff';
		} else {
			badge.style.display = 'none';
		}
	}

	// Human-readable error mapping
	function _friendlyError(message, xhr) {
		if (xhr) {
			if (xhr.status === 400) {
				var text = (xhr.responseText || '').trim();
				return text || 'Bad request (file may already exist or no space)';
			}
			if (xhr.status === 403) return 'Access denied';
			if (xhr.status === 413) return 'File too large for a single chunk';
			if (xhr.status === 500) {
				var text = (xhr.responseText || '').trim();
				return text || 'Server error — check that the droplet upload service is running';
			}
			if (xhr.status === 0) return 'Connection lost — is the droplet still running?';
		}
		if (typeof message === 'string' && message) return message;
		return 'Upload failed';
	}

	// Recursively collect all File objects from a DataTransferItemList (handles folders)
	function _collectFilesFromEntry(entry, pathPrefix) {
		return new Promise(function(resolve) {
			if (entry.isFile) {
				entry.file(function(file) {
					// Attach the virtual path so the server preserves folder structure
					file._virtualPath = pathPrefix + file.name;
					resolve([file]);
				}, function() { resolve([]); });
			} else if (entry.isDirectory) {
				var reader = entry.createReader();
				var allFiles = [];
				function readBatch() {
					reader.readEntries(function(entries) {
						if (!entries.length) {
							resolve(allFiles);
							return;
						}
						var promises = entries.map(function(e) {
							return _collectFilesFromEntry(e, pathPrefix + entry.name + '/');
						});
						Promise.all(promises).then(function(results) {
							results.forEach(function(r) { allFiles = allFiles.concat(r); });
							readBatch(); // keep reading until empty batch
						});
					}, function() { resolve(allFiles); });
				}
				readBatch();
			} else {
				resolve([]);
			}
		});
	}

	Dropzone.autoDiscover = false;
	let myDropzone = new Dropzone("#upload-section-main", {
		url: `/desktop/${instanceInfo.id}/uploads/upload`,
		forceChunking: true,
		chunking: true,
		chunkSize: 10 * 1024 * 1024,    // 10 MB chunks
		parallelUploads: 3,
		maxFilesize: 16 * 1024,          // 16 GB in MB (Dropzone unit)
		autoProcessQueue: true,
		createImageThumbnails: false,
		clickable: '#upload-click-target',
		previewsContainer: '#upload-preview-list',
		previewTemplate: `
<div class="dz-preview dz-file-preview">
  <div class="dz-item-row">
    <i class="fa fa-file dz-file-icon"></i>
    <div class="dz-item-info">
      <div class="dz-filename"><span data-dz-name></span></div>
      <div class="dz-size" data-dz-size></div>
    </div>
    <div class="dz-item-actions">
      <span class="dz-pct-label">0%</span>
      <button class="dz-retry-btn" title="Retry" style="display:none"><i class="fa fa-redo"></i></button>
      <button class="dz-remove-btn" title="Remove"><i class="fa fa-times"></i></button>
    </div>
  </div>
  <div class="dz-progress-bar-wrap">
    <div class="dz-progress-bar-inner" data-dz-uploadprogress></div>
  </div>
  <div class="dz-error-row" style="display:none"><span data-dz-errormessage></span></div>
</div>
		`,
		init: function() {
			var dz = this;

			// ── Folder Drag-and-Drop via DataTransferItem API ──────────────────
			var dropZoneEl = document.getElementById('upload-section-main');

			dropZoneEl.addEventListener('dragover', function(e) {
				e.preventDefault();
				dropZoneEl.classList.add('dz-drag-hover');
			});
			dropZoneEl.addEventListener('dragleave', function(e) {
				dropZoneEl.classList.remove('dz-drag-hover');
			});
			dropZoneEl.addEventListener('drop', function(e) {
				e.preventDefault();
				e.stopPropagation();
				dropZoneEl.classList.remove('dz-drag-hover');

				var items = e.dataTransfer && e.dataTransfer.items;
				if (!items || !items.length) return;

				var promises = [];
				for (var i = 0; i < items.length; i++) {
					var item = items[i];
					if (item.webkitGetAsEntry) {
						var entry = item.webkitGetAsEntry();
						if (entry) {
							promises.push(_collectFilesFromEntry(entry, ''));
						}
					} else {
						var f = item.getAsFile();
						if (f) {
							f._virtualPath = f.name;
							promises.push(Promise.resolve([f]));
						}
					}
				}

				Promise.all(promises).then(function(results) {
					var allFiles = [];
					results.forEach(function(r) { allFiles = allFiles.concat(r); });
					allFiles.forEach(function(file) { dz.addFile(file); });
				});
			});

			// ── Wire up preview buttons ───────────────────────────────────────
			dz.on("addedfile", function(file) {
				_uploadActive++;
				_updateUploadBadge();
				_updateUploadCountLabel();
				if (!file.previewElement) return;

				var removeBtn = file.previewElement.querySelector('.dz-remove-btn');
				if (removeBtn) {
					removeBtn.addEventListener('click', function(e) {
						e.preventDefault(); e.stopPropagation();
						dz.removeFile(file);
					});
				}

				var retryBtn = file.previewElement.querySelector('.dz-retry-btn');
				if (retryBtn) {
					retryBtn.addEventListener('click', function(e) {
						e.preventDefault(); e.stopPropagation();
						file.status = Dropzone.QUEUED;
						file.accepted = true;
						if (file.previewElement) {
							file.previewElement.classList.remove('dz-error', 'dz-success');
							var errRow = file.previewElement.querySelector('.dz-error-row');
							if (errRow) errRow.style.display = 'none';
							var bar = file.previewElement.querySelector('.dz-progress-bar-inner');
							if (bar) bar.style.width = '0%';
							var pct = file.previewElement.querySelector('.dz-pct-label');
							if (pct) pct.textContent = '0%';
							retryBtn.style.display = 'none';
						}
						_uploadErrored = Math.max(0, _uploadErrored - 1);
						_uploadActive++;
						_updateUploadBadge();
						dz.processFile(file);
					});
				}
			});

			// ── Sending: attach virtual filepath for folder uploads ────────────
			dz.on("sending", function(file, xhr, formData) {
				var vp = file._virtualPath || file.fullPath || file.webkitRelativePath;
				if (vp) formData.append("filepath", vp);
			});

			// ── Progress: update bar & pct label ─────────────────────────────
			dz.on("uploadprogress", function(file, progress) {
				if (!file.previewElement) return;
				var bar = file.previewElement.querySelector('.dz-progress-bar-inner');
				var pct = file.previewElement.querySelector('.dz-pct-label');
				var p = Math.round(progress);
				if (bar) bar.style.width = p + '%';
				if (pct) pct.textContent = p + '%';
			});

			// ── Success: fade out after 2.5s ──────────────────────────────────
			dz.on("success", function(file) {
				_uploadActive = Math.max(0, _uploadActive - 1);
				_updateUploadBadge();
				if (file.previewElement) {
					var pct = file.previewElement.querySelector('.dz-pct-label');
					if (pct) pct.textContent = '✓';
					var bar = file.previewElement.querySelector('.dz-progress-bar-inner');
					if (bar) bar.style.width = '100%';
					setTimeout(function() {
						if (file.previewElement) {
							file.previewElement.classList.add('dz-fading');
							setTimeout(function() {
								if (file.previewElement) file.previewElement.remove();
								_updateUploadCountLabel();
							}, 400);
						}
					}, 2500);
				}
			});

			// ── Error: friendly message + retry button ────────────────────────
			dz.on("error", function(file, message, xhr) {
				_uploadActive = Math.max(0, _uploadActive - 1);
				_uploadErrored++;
				_updateUploadBadge();
				if (!file.previewElement) return;
				var errSpan  = file.previewElement.querySelector('[data-dz-errormessage]');
				var errRow   = file.previewElement.querySelector('.dz-error-row');
				var retryBtn = file.previewElement.querySelector('.dz-retry-btn');
				var pct      = file.previewElement.querySelector('.dz-pct-label');
				if (errSpan) errSpan.textContent = _friendlyError(message, xhr);
				if (errRow)  errRow.style.display = 'flex';
				if (retryBtn) retryBtn.style.display = 'inline-flex';
				if (pct) pct.textContent = '✕';
			});

			// ── Removed: clean up counters ────────────────────────────────────
			dz.on("removedfile", function(file) {
				if (file.status === Dropzone.ERROR) {
					_uploadErrored = Math.max(0, _uploadErrored - 1);
				} else if (file.status !== Dropzone.SUCCESS) {
					_uploadActive = Math.max(0, _uploadActive - 1);
				}
				_updateUploadBadge();
				_updateUploadCountLabel();
			});
		}
	});

	// Clear all completed or errored items
	function ClearUploads() {
		var previews = document.querySelectorAll('#upload-preview-list .dz-preview');
		previews.forEach(function(el) {
			if (el.classList.contains('dz-success') || el.classList.contains('dz-error')) {
				var file = myDropzone.files.find(function(f) { return f.previewElement === el; });
				if (file) myDropzone.removeFile(file);
				else el.remove();
			}
		});
		_uploadErrored = 0;
		_updateUploadBadge();
		_updateUploadCountLabel();
	}

	function _updateUploadCountLabel() {
		var label = document.getElementById('upload-count-label');
		var count = document.querySelectorAll('#upload-preview-list .dz-preview').length;
		if (!label) return;
		label.textContent = count > 0 ? count + ' item' + (count !== 1 ? 's' : '') : '';
	}
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
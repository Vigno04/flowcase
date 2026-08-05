var sidebar = document.querySelector('.sidebar');

function toggleSidebar(action = null) {
	if (action == 'show') {
		sidebar.classList.add('active');
	} else if (action == 'hide') {
		sidebar.classList.remove('active');
	}
	else {
		sidebar.classList.toggle('active');
	}

	if (sidebar.classList.contains('active')) {
		//Refresh downloads if download section is active
		if (!isGuacamole) {
			var downloadSection = document.getElementById('download-section');
			if (downloadSection.classList.contains('active')) {
				FetchDownloads(currentDownloadPath);
			}
		}
	}
}

//fullscreen checkbox
var fullscreenCheckbox = document.getElementById('control-fullscreen');
fullscreenCheckbox.addEventListener('change', function() {
	if (fullscreenCheckbox.checked) {
		document.documentElement.requestFullscreen();
	} else {
		document.exitFullscreen();
	}
});

document.addEventListener("fullscreenchange", () => {
	fullscreenCheckbox.checked = document.fullscreenElement;
	document.getElementById('control-fullscreen-check').classList.toggle('fa-check');
});

function FullscreenButton() {
	fullscreenCheckbox.click();
}

function DisplayButton() {
	iframe.contentWindow.postMessage({action: "open_displays_mode"}, "*");
	toggleSidebar();
}

function GameModeButton() {
	document.getElementById('control-game-mode').click();
}

function DashboardButton() {
	toggleSidebar();
	AudioStop();
	iframe.style.display = 'none';
	window.location.href = "/dashboard";
}

function ToggleUploadSection() {
	var uploadSection = document.getElementById('upload-section');
	uploadSection.classList.toggle('active');
}

function ToggleDownloadSection() {
	var downloadSection = document.getElementById('download-section');
	downloadSection.classList.toggle('active');

	if (downloadSection.classList.contains('active')) {
		FetchDownloads();
	}
}

function DestroyDropletButton() {
	if (!confirm("Are you sure you want to exit without saving? Any unsaved progress will be lost.")) {
		return;
	}

	isExiting = true;
	AudioStop();
	toggleSidebar();
	iframe.style.display = 'none';
	iframe.src = "about:blank";

	ShowLoadingScreen("Exiting instance...");

	var url = `/api/instance/${instanceInfo.id}/exit`;
	var xhr = new XMLHttpRequest();
	xhr.open("GET", url, true);
	xhr.setRequestHeader("Content-Type", "application/json");
	xhr.onreadystatechange = function () {
		if (xhr.readyState === 4) {
			window.location.href = "/dashboard";
		}
	};
	xhr.send();

	console.log("Requesting to exit instance " + instanceInfo.id + "...");
}

function SaveDropletButton() {
	// If this is the first save (no snapshot yet), ask for a name
	if (!instanceInfo.has_snapshot) {
		var customName = prompt("Name this save:", instanceInfo.droplet.display_name);
		if (customName === null) return; // User cancelled
		if (!customName.trim()) customName = instanceInfo.droplet.display_name;

		isExiting = true;
		AudioStop();
		toggleSidebar();
		iframe.style.display = 'none';
		window.location.href = `/dashboard?auto_save_as=${instanceInfo.id}&name=${encodeURIComponent(customName)}`;
	} else {
		// Subsequent save — just overwrite
		isExiting = true;
		AudioStop();
		toggleSidebar();
		iframe.style.display = 'none';
		window.location.href = `/dashboard?auto_save=${instanceInfo.id}`;
	}
}

function SaveAsDropletButton() {
	var customName = prompt("Enter a name for this save:", `Save - ${new Date().toLocaleString()}`);
	if (!customName) return; // User cancelled

	isExiting = true;
	AudioStop();
	toggleSidebar();
	iframe.style.display = 'none';
	window.location.href = `/dashboard?auto_save_as=${instanceInfo.id}&name=${encodeURIComponent(customName)}`;
}
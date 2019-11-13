/* global JSZip */
import saveFile from 'save-file';
import listContent from 'list-github-dir-content';

// Matches '/<re/po>/tree/<ref>/<dir>'
const urlParserRegex = /^[/]([^/]+)[/]([^/]+)[/]tree[/]([^/]+)[/](.*)/;

function updateStatus(status, ...extra) {
	const el = document.querySelector('.status');
	el.innerHTML = status || `
		<strong class="logo">download-directory • github • io</strong>
		<form>
			<input name="url" type="url" size="38" placeholder="Paste GitHub folder URL + press Enter">
		</form>
	`;
	console.log(el.textContent, ...extra);
}

async function waitForToken(domain) {
	const key = `token_${domain}`;

	// Portability
	if (localStorage.token) {
		localStorage[key] = localStorage.token;
		delete localStorage.token;
	}

	const input = document.querySelector('#token');
	input.addEventListener('input', () => {
		if (input.checkValidity()) {
			localStorage[key] = input.value;
		}
	});

	if (localStorage[key]) {
		input.value = localStorage[key];
		return input.value;
	}

	const toggle = document.querySelector('#token-toggle');
	toggle.checked = true;
	updateStatus(`Waiting for <strong>${domain}</strong> token…`);
	await new Promise(resolve => {
		input.addEventListener('input', function handler() {
			if (input.checkValidity()) {
				toggle.checked = false;
				resolve(input.value);
				input.removeEventListener('input', handler);
			}
		});
	});
}

async function fetchRepoInfo(api, token, repo) {
	const response = await fetch(`${api}/repos/${repo}`, {
		headers: {
			Authorization: `Bearer ${token}`
		}
	});

	switch (response.status) {
		case 401:
			updateStatus('⚠ The token provided is invalid or has been revoked.', {token});
			throw new Error('Invalid token');

		case 403:
			// See https://developer.github.com/v3/#rate-limiting
			if (response.headers.get('X-RateLimit-Remaining') === '0') {
				updateStatus('⚠ Your token rate limit has been exceeded.', {token});
				throw new Error('Rate limit exceeded');
			}

			break;

		case 404:
			updateStatus('⚠ Repository was not found.', {repo});
			throw new Error('Repository not found');

		default:
	}

	if (!response.ok) {
		updateStatus('⚠ Could not obtain repository data from the GitHub API.', {repo, response});
		throw new Error('Fetch error');
	}

	return response.json();
}

async function init() {
	let isGHE = false;
	let domain = 'github.com';
	let apiEndpoint = 'https://api.github.com';
	let user;
	let repository;
	let ref;
	let dir;

	try {
		const query = new URLSearchParams(location.search);
		const parsedUrl = new URL(query.get('url'));
		[, user, repository, ref, dir] = urlParserRegex.exec(parsedUrl.pathname);

		isGHE = parsedUrl.hostname !== 'github.com';
		if (isGHE) {
			domain = parsedUrl.hostname;
			apiEndpoint = `${parsedUrl.protocol}//${parsedUrl.host}/api/v3`;

			document.querySelector('#create-token').host = parsedUrl.host;
		}

		console.log('Source:', {domain, user, repository, ref, dir});
	} catch {
		return updateStatus();
	}

	const token = await waitForToken(domain);

	if (!navigator.onLine) {
		updateStatus('⚠ You are offline.');
		throw new Error('You are offline');
	}

	updateStatus('Retrieving directory info…');

	const willDownloadViaAPI = isGHE || (await fetchRepoInfo(apiEndpoint, token, `${user}/${repository}`)).private;

	const files = await listContent.viaTreesApi({
		resource: {
			api: apiEndpoint,
			user,
			repository,
			ref,
			directory: decodeURIComponent(dir),
		},
		token,
		getFullData: true
	});

	if (files.length === 0) {
		updateStatus('No files to download');
		return;
	}

	updateStatus(`Downloading (0/${files.length}) files…`, '\n• ' + files.map(file => file.path).join('\n• '));

	const controller = new AbortController();

	const fetchPublicFile = async file => {
		const response = await fetch(`https://raw.githubusercontent.com/${user}/${repository}/${ref}/${file.path}`, {
			signal: controller.signal
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.statusText} for ${file.path}`);
		}

		return response.blob();
	};

	const fetchPrivateFile = async file => {
		const response = await fetch(file.url, {
			headers: {
				Authorization: `Bearer ${token}`
			},
			signal: controller.signal
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.statusText} for ${file.path}`);
		}

		const {content} = await response.json();
		const decoder = await fetch(`data:application/octet-stream;base64,${content}`);
		return decoder.blob();
	};

	let downloaded = 0;
	const zip = new JSZip();

	const download = async file => {
		const blob = willDownloadViaAPI ?
			await fetchPrivateFile(file) :
			await fetchPublicFile(file);

		downloaded++;
		updateStatus(`Downloading (${downloaded}/${files.length}) files…`, file.path);

		zip.file(file.path.replace(dir + '/', ''), blob, {
			binary: true
		});
	};

	try {
		await Promise.all(files.map(download));
	} catch (error) {
		controller.abort();

		if (!navigator.onLine) {
			updateStatus('⚠ Could not download all files, network connection lost.');
		} else if (error.message.startsWith('HTTP ')) {
			updateStatus('⚠ Could not download all files.');
		} else {
			updateStatus('⚠ Some files were blocked from downloading, try to disable any ad blockers and refresh the page.');
		}

		throw error;
	}

	updateStatus(`Zipping ${downloaded} files…`);

	const zipBlob = await zip.generateAsync({
		type: 'blob'
	});

	await saveFile(zipBlob, `${user} ${repository} ${ref} ${dir}.zip`.replace(/\//, '-'));
	updateStatus(`Downloaded ${downloaded} files! Done!`);
}

init();

window.addEventListener('load', () => {
	navigator.serviceWorker.register('service-worker.js');
});

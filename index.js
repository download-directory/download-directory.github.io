import saveFile from 'save-file';
import listContent from 'list-github-dir-content';
import pMap from 'p-map';
import pRetry from 'p-retry';

// Matches '/<re/po>/tree/<ref>/<dir>'
const urlParserRegex = /^[/]([^/]+)[/]([^/]+)[/]tree[/]([^/]+)[/](.*)/;

function updateStatus(status, ...extra) {
	const element = document.querySelector('.status');
	element.innerHTML = status || '';
	console.log(element.textContent, ...extra);
}

async function waitForToken() {
	const input = document.querySelector('#token');

	if (localStorage.token) {
		input.value = localStorage.token;
	} else {
		const toggle = document.querySelector('#token-toggle');
		toggle.checked = true;
		updateStatus('Waiting for token...');
		await new Promise(resolve => {
			input.addEventListener('input', function handler() {
				if (input.checkValidity()) {
					toggle.checked = false;
					resolve();
					input.removeEventListener('input', handler);
				}
			});
		});
	}
}

async function fetchRepoInfo(repo) {
	const response = await fetch(`https://api.github.com/repos/${repo}`,
		localStorage.token ? {
			headers: {
				Authorization: `Bearer ${localStorage.token}`,
			},
		} : {},
	);

	switch (response.status) {
		case 401:
			updateStatus('⚠ The token provided is invalid or has been revoked.', {token: localStorage.token});
			throw new Error('Invalid token');

		case 403:
			// See https://developer.github.com/v3/#rate-limiting
			if (response.headers.get('X-RateLimit-Remaining') === '0') {
				updateStatus('⚠ Your token rate limit has been exceeded.', {token: localStorage.token});
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

async function getZIP() {
	const JSZip = await import('jszip');
	return new JSZip();
}

function escapeFilepath(path) {
	return path.replaceAll('#', '%23');
}

async function init() {
	const zipPromise = getZIP();
	let user;
	let repository;
	let ref;
	let dir;

	const input = document.querySelector('#token');
	if (localStorage.token) {
		input.value = localStorage.token;
	}

	input.addEventListener('input', () => {
		if (input.checkValidity()) {
			localStorage.token = input.value;
		}
	});

	try {
		const query = new URLSearchParams(location.search);
		const parsedUrl = new URL(query.get('url'));
		[, user, repository, ref, dir] = urlParserRegex.exec(parsedUrl.pathname);

		console.log('Source:', {user, repository, ref, dir});
	} catch {
		return updateStatus();
	}

	if (!navigator.onLine) {
		updateStatus('⚠ You are offline.');
		throw new Error('You are offline');
	}

	updateStatus('Retrieving directory info…');

	const {private: repoIsPrivate} = await fetchRepoInfo(`${user}/${repository}`);

	const files = await listContent.viaTreesApi({
		user,
		repository,
		ref,
		directory: decodeURIComponent(dir),
		token: localStorage.token,
		getFullData: true,
	});

	if (files.length === 0) {
		updateStatus('No files to download');
		return;
	}

	updateStatus(`Downloading (0/${files.length}) files…`, '\n• ' + files.map(file => file.path).join('\n• '));

	const controller = new AbortController();

	const fetchPublicFile = async file => {
		const response = await fetch(`https://raw.githubusercontent.com/${user}/${repository}/${ref}/${escapeFilepath(file.path)}`, {
			signal: controller.signal,
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.statusText} for ${file.path}`);
		}

		return response.blob();
	};

	const fetchPrivateFile = async file => {
		const response = await fetch(file.url, {
			headers: {
				Authorization: `Bearer ${localStorage.token}`,
			},
			signal: controller.signal,
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.statusText} for ${file.path}`);
		}

		const {content} = await response.json();
		const decoder = await fetch(`data:application/octet-stream;base64,${content}`);
		return decoder.blob();
	};

	let downloaded = 0;

	const downloadFile = async file => {
		const localDownload = () => repoIsPrivate ? fetchPrivateFile(file) : fetchPublicFile(file);
		const onFailedAttempt = error => {
			console.error(`Error downloading ${file.url}. Attempt ${error.attemptNumber}. ${error.retriesLeft} retries left.`);
		};

		const blob = await pRetry(localDownload, {onFailedAttempt});

		downloaded++;
		updateStatus(`Downloading (${downloaded}/${files.length}) files…`, file.path);

		const zip = await zipPromise;
		zip.file(file.path.replace(dir + '/', ''), blob, {
			binary: true,
		});
	};

	if (repoIsPrivate) {
		await waitForToken();
	}

	await pMap(files, downloadFile, {concurrency: 20}).catch(error => {
		controller.abort();

		if (!navigator.onLine) {
			updateStatus('⚠ Could not download all files, network connection lost.');
		} else if (error.message.startsWith('HTTP ')) {
			updateStatus('⚠ Could not download all files.');
		} else {
			updateStatus('⚠ Some files were blocked from downloading, try to disable any ad blockers and refresh the page.');
		}

		throw error;
	});

	updateStatus(`Zipping ${downloaded} files…`);

	const zip = await zipPromise;
	const zipBlob = await zip.generateAsync({
		type: 'blob',
	});

	await saveFile(zipBlob, `${user} ${repository} ${ref} ${dir}.zip`.replace(/\//, '-'));
	updateStatus(`Downloaded ${downloaded} files! Done!`);
}

init();

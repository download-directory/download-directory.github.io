/* global JSZip */
import saveFile from 'save-file';
import listContent from 'list-github-dir-content';

class FileDownloadError extends Error {
	constructor(path, response) {
		super(`Failed to download file "${path}" from GitHub`);
		this.name = 'FileDownloadError';
		this.path = path;
		this.response = response;
	}
}

// Matches '/<re/po>/tree/<ref>/<dir>'
const repoDirRegex = /^[/](.+[/].+)[/]tree[/]([^/]+)[/](.*)/;

function updateStatus(status, ...extra) {
	const el = document.querySelector('.status');
	el.innerHTML = status || `
		<strong>download-directory • github • io</strong>
		<form>
			<input name="url" type="url" size="38" placeholder="Paste GitHub.com folder URL + press Enter">
		</form>
	`;
	console.log(el.textContent, ...extra);
}

async function verifyToken() {
	const input = document.querySelector('#token');
	input.addEventListener('input', () => {
		if (input.checkValidity()) {
			localStorage.token = input.value;
		}
	});

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

async function ensureRepoIsAccessible(repo) {
	const response = await fetch(`https://api.github.com/repos/${repo}`, {
		headers: {
			Authorization: `Bearer ${localStorage.token}`
		}
	});

	switch (response.status) {
		case 401:
			updateStatus('⚠ The token provided is invalid or has been revoked.', {token: localStorage.token});
			throw new Error(`Invalid GitHub API token "${localStorage.token}"`);

		case 403:
			// See https://developer.github.com/v3/#rate-limiting
			if (response.headers.get('X-RateLimit-Remaining') === '0') {
				updateStatus('⚠ Your token rate limit has been exceeded.', {token: localStorage.token});
				throw new Error(`GitHub API rate limit exceeded for token "${localStorage.token}"`);
			}

			break;

		case 404:
			updateStatus('⚠ Repository was not found.', {repo});
			throw new Error(`Repository "${repo}" not found`);

		default:
	}

	if (!response.ok) {
		updateStatus('⚠ Could not obtain repository data from the GitHub API.', {repo, response});
		throw new Error(`GitHub API request for repo "${repo} failed`);
	}

	const repoMetadata = await response.json();

	if (repoMetadata.private) {
		updateStatus('⚠ Private repositories are <a href="https://github.com/download-directory/download-directory.github.io/issues/7">not supported yet</a>.');
		throw new Error(`Repository "${repo}" is private`);
	}
}

async function init() {
	await verifyToken();
	const query = new URLSearchParams(location.search);
	let match;
	try {
		const parsedUrl = new URL(query.get('url'));
		match = repoDirRegex.exec(parsedUrl.pathname);
		if (!match) {
			return updateStatus();
		}
	} catch (_) {
		return updateStatus();
	}

	const [, repo, ref, dir] = match;

	console.log('Source:', {repo, ref, dir});

	if (!navigator.onLine) {
		updateStatus('⚠ You are offline.');
		throw new Error('User agent is offline');
	}

	updateStatus('Retrieving directory info…');

	await ensureRepoIsAccessible(repo);

	const files = await listContent.viaTreesApi(`${repo}#${ref}`, decodeURIComponent(dir), localStorage.token);

	if (files.length > 0) {
		updateStatus(`Downloading (0/${files.length}) files…`, '\n• ' + files.join('\n• '));
	} else {
		updateStatus('No files to download');
		return;
	}

	let downloaded = 0;
	let requests;
	const controller = new AbortController();
	try {
		requests = await Promise.all(files.map(async path => {
			const response = await fetch(
				`https://raw.githubusercontent.com/${repo}/${ref}/${path}`,
				{signal: controller.signal}
			);

			if (!response.ok) {
				throw new FileDownloadError(path, response);
			}

			const blob = await response.blob();

			downloaded++;
			updateStatus(`Downloading (${downloaded}/${files.length}) files…`, path);

			return {path, blob};
		}));
	} catch (error) {
		controller.abort();

		if (!navigator.onLine) {
			updateStatus('⚠ Could not download all files, network connection lost.');
		} else if (error instanceof FileDownloadError) {
			updateStatus('⚠ Could not download all files.', {file: error.file});
		} else {
			updateStatus('⚠ Some files were blocked from downloading, try to disable any ad blockers and refresh the page.');
		}

		throw error;
	}

	updateStatus(`Zipping ${downloaded} files…`);

	const zip = new JSZip();
	for (const file of requests) {
		zip.file(file.path.replace(dir + '/', ''), file.blob, {
			binary: true
		});
	}

	const zipBlob = await zip.generateAsync({
		type: 'blob'
	});

	await saveFile(zipBlob, `${repo} ${ref} ${dir}.zip`.replace(/\//, '-'));
	updateStatus(`Downloaded ${downloaded} files! Done!`);
}

init();

window.addEventListener('load', () => {
	navigator.serviceWorker.register('service-worker.js');
});

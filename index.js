/* global JSZip */
import saveFile from 'save-file';
import listContent from 'list-github-dir-content';

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

async function waitForToken() {
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

async function validateInput(repo) {
	const response = await fetch(`https://api.github.com/repos/${repo}`, {
		headers: {
			Authorization: `Bearer ${localStorage.token}`
		}
	});

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

	const repoMetadata = await response.json();

	if (repoMetadata.private) {
		updateStatus('⚠ Private repositories are <a href="https://github.com/download-directory/download-directory.github.io/issues/7">not supported yet</a>.');
		throw new Error('Private repository');
	}
}

async function init() {
	await waitForToken();

	let repo;
	let ref;
	let dir;

	try {
		const query = new URLSearchParams(location.search);
		const parsedUrl = new URL(query.get('url'));
		[, repo, ref, dir] = repoDirRegex.exec(parsedUrl.pathname);

		console.log('Source:', {repo, ref, dir});
	} catch (_) {
		return updateStatus();
	}

	if (!navigator.onLine) {
		updateStatus('⚠ You are offline.');
		throw new Error('You are offline');
	}

	updateStatus('Retrieving directory info…');

	await validateInput(repo);

	const files = await listContent.viaTreesApi(`${repo}#${ref}`, decodeURIComponent(dir), localStorage.token);
	if (files.length === 0) {
		updateStatus('No files to download');
		return;
	}

	updateStatus(`Downloading (0/${files.length}) files…`, '\n• ' + files.join('\n• '));

	let downloaded = 0;
	const zip = new JSZip();
	const controller = new AbortController();
	const download = async path => {
		const response = await fetch(`https://raw.githubusercontent.com/${repo}/${ref}/${path}`, {
			signal: controller.signal
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.statusText} for ${path}`);
		}

		const blob = await response.blob();

		downloaded++;
		updateStatus(`Downloading (${downloaded}/${files.length}) files…`, path);

		zip.file(path.replace(dir + '/', ''), blob, {
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

	await saveFile(zipBlob, `${repo} ${ref} ${dir}.zip`.replace(/\//, '-'));
	updateStatus(`Downloaded ${downloaded} files! Done!`);
}

init();

window.addEventListener('load', () => {
	navigator.serviceWorker.register('service-worker.js');
});

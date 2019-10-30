/* global JSZip */
import saveFile from 'save-file';
import listContent from 'list-github-dir-content';

// Matches '/<re/po>/tree/<ref>/<dir>'
const repoDirRegex = /^[/](.+[/].+)[/]tree[/]([^/]+)[/](.*)/;

function updateStatus(status, ...extra) {
	const el = document.querySelector('.status');
	el.innerHTML = status || '<strong>download-directory • github • io</strong>';
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
	const headers = new Headers();
	headers.append('Authorization', `Bearer ${localStorage.token}`);

	const response = await fetch(`https://api.github.com/repos/${repo}`, {headers});

	if (response.status === 404) {
		document.querySelector('#error-repo-not-found').style.display = 'block';
		throw new Error(`Repository "${repo}" not found`);
	}

	const repoMetadata = await response.json();

	if (repoMetadata.private) {
		document.querySelector('#error-private-repo').style.display = 'block';
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
		document.querySelector('#error-network').style.display = 'block';
		throw new Error('User agent is offline');
	}

	updateStatus('Retrieving directory info…');

	await ensureRepoIsAccessible(repo);

	const files = await listContent.viaTreesApi(`${repo}#${ref}`, decodeURIComponent(dir), localStorage.token, ref);

	if (files.length > 0) {
		updateStatus(`Downloading (0/${files.length}) files…`, '\n• ' + files.join('\n• '));
	} else {
		updateStatus('No files to download');
		return;
	}

	let downloaded = 0;
	let requests;
	let abortReason;
	const controller = new AbortController();
	try {
		requests = await Promise.all(files.map(async path => {
			let response;
			try {
				response = await fetch(
					`https://raw.githubusercontent.com/${repo}/${ref}/${path}`,
					{signal: controller.signal}
				);
			} catch (error) {
				// DOMException errors are a result of a manually aborted request
				// Ignore them to avoid distoring error messages
				if (!(error instanceof DOMException)) {
					if (navigator.onLine === false) {
						abortReason = 'network';
					} else {
						abortReason = 'blocked';
					}

					controller.abort();
					throw error;
				}

				return;
			}

			if (response.status >= 400) {
				controller.abort();
				throw new Error(`Could not download file "${path}"`);
			}

			const blob = await response.blob();

			downloaded++;
			updateStatus(`Downloading (${downloaded}/${files.length}) files…`, path);

			return {path, blob};
		}));
	} catch (error) {
		// eslint-disable-next-line default-case
		switch (abortReason) {
			case 'network':
				document.querySelector('#error-network').style.display = 'block';
				break;

			case 'blocked':
				document.querySelector('#error-adblocker').style.display = 'block';
				break;
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

	await new Promise(resolve =>
		saveFile(zipBlob, `${repo} ${ref} ${dir}.zip`.replace(/\//, '-'), resolve)
	);
	updateStatus(`Downloaded ${downloaded} files! Done!`);
}

init().catch(error => {
	updateStatus('Could not download files');
	throw error;
});

window.addEventListener('load', () => {
	navigator.serviceWorker.register('service-worker.js');
});

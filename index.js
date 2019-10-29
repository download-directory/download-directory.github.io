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
	} catch (error) {
		return updateStatus();
	}

	const [, repo, ref, dir] = match;

	console.log('Source:', {repo, ref, dir});

	updateStatus('Retrieving directory info…');

	const files = await listContent.viaTreesApi(`${repo}#${ref}`, decodeURIComponent(dir), localStorage.token, ref);

	updateStatus(`Downloading (0/${files.length}) files…`, '\n• ' + files.join('\n• '));

	let downloaded = 0;
	const requests = await Promise.all(files.map(async path => {
		const response = await fetch(`https://raw.githubusercontent.com/${repo}/${ref}/${path}`);
		const blob = await response.blob();

		downloaded++;
		updateStatus(`Downloading (${downloaded}/${files.length}) files…`, path);

		return {path, blob};
	}));
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

init();

window.addEventListener('load', () => {
	navigator.serviceWorker.register('service-worker.js');
});

import JSZip from 'jszip';
import saveFile from 'save-file';
import listContent from 'list-github-dir-content';

// Matches '/sindresorhus/refined-github/tree/master/source/libs'
const repoDirRegex = /^[/](.+[/].+)[/]tree[/]([^/]+)[/](.*)/;

function updateStatus(count, downloaded = 0, done) {
	const status = document.querySelector('.status');
	if (typeof count === 'string') {
		status.innerHTML = count;
	} else if (!count) {
		status.innerHTML = `Downloading directory listing…`;
	} else if (downloaded < count) {
		status.innerHTML = `Downloading (${downloaded}/${count}) files…`;
	} else if (done) {
		status.innerHTML = `Downloaded ${downloaded} files! Done!`;
	} else {
		status.innerHTML = `Zipping ${downloaded} files…`;
	}
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
			throw new Error();
		}
	} catch (err) {
		return updateStatus('Provide a URL via <code>?url=</code> parameter. Example: <br /><a class="smaller" href="?url=https://github.com/bfred-it/github-issue-link-status/tree/master/source">?url=https://github.com/bfred-it/github-issue-link-status/tree/master/source</a>');
	}

	const [, repo, branch, dir] = match;

	console.log('Source:', {repo, branch, dir});

	updateStatus();

	const files = await listContent.viaTreesApi(repo, dir, localStorage.token);

	updateStatus(files.length);

	console.log('Will download:\n' + files.join('\n'));

	let downloaded = 0;
	const requests = await Promise.all(files.map(async path => {
		const response = await fetch(`https://raw.githubusercontent.com/${repo}/${branch}/${path}`);
		const blob = await response.blob();

		downloaded++;
		updateStatus(files.length, downloaded);
		console.log('Downloaded:', path);

		return {path, blob};
	}));
	console.log('Downloaded', files.length, 'files');

	const zip = new JSZip();
	for (const file of requests) {
		zip.file(file.path.replace(dir + '/', ''), file.blob, {
			binary: true
		});
	}
	const zipBlob = await zip.generateAsync({
		type: 'blob'
	});

	saveFile(zipBlob, `${repo} ${dir}.zip`.replace(/\//, '-'), () => {
		updateStatus(files.length, downloaded, true);
		console.log('Done!');
	});
}

init();

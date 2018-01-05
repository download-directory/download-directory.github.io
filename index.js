import JSZip from 'jszip';
import saveFile from 'save-file';
import listContent from 'list-github-dir-content';

function updateStatus(count, downloaded = 0, done) {
	const status = document.querySelector('.status');
	if (!count) {
		status.textContent = `Downloading directory listing…`;
	} else if (downloaded < count) {
		status.textContent = `Downloading (${downloaded}/${count}) files…`;
	} else if (!done) {
		status.textContent = `Zipping ${downloaded} files…`;
	} else {
		status.textContent = `Downloaded ${downloaded} files! Done!`;
	}
}

async function init() {
	const query = new URLSearchParams(location.search);
	const repo = query.get('repo');
	const dir = query.get('dir');

	document.querySelector('.source').textContent = `${repo.split('/').join('\n')}\n${dir}`;

	updateStatus();

	const files = await listContent.viaTreesApi(repo, dir, localStorage.token);

	updateStatus(files.length);

	console.log('Will download:\n' + files.join('\n'));

	let downloaded = 0;
	const requests = await Promise.all(files.map(async path => {
		const response = await fetch(`https://raw.githubusercontent.com/${repo}/master/${path}`);
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

// eslint-disable-next-line import/no-unassigned-import
import 'typed-query-selector';
import downloadDirectory, {type StatusEvent} from './directory-download.js';

function isError(error: unknown): error is Error {
	return error instanceof Error;
}

function saveFile(blob: Blob, filename: string) {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(url);
}

function updateStatus(status?: string, ...extra: unknown[]) {
	const element = document.querySelector('.status')!;
	if (status) {
		const wrapper = document.createElement('div');
		wrapper.textContent = status;
		element.prepend(wrapper);
	} else {
		element.textContent = status ?? '';
	}

	console.log(status, ...extra);
}

async function getZip() {
	// @ts-expect-error idk idc
	// eslint-disable-next-line @typescript-eslint/naming-convention, @typescript-eslint/consistent-type-imports
	const JSZip = await import('jszip') as typeof import('jszip');
	return new JSZip();
}

const googleDoesntLikeThis = /malware|virus|trojan/i;

async function init() {
	updateStatus();
	const zipPromise = getZip();

	const input = document.querySelector('input#token')!;
	const token = localStorage.getItem('token');
	if (token) {
		input.value = token;
	}

	input.addEventListener('input', () => {
		localStorage.setItem('token', input.value);
	}, {passive: true});

	const query = new URLSearchParams(location.search);
	const url = query.get('url');
	document.querySelector('input#url')!.value = url ?? '';
	if (!url) {
		return;
	}

	if (googleDoesntLikeThis.test(url)) {
		updateStatus('Virus, malware, trojans are not allowed');
		return;
	}

	if (!navigator.onLine) {
		updateStatus('⚠ You are offline.');
		throw new Error('You are offline');
	}

	const download = downloadDirectory(url);
	download.addEventListener('info', event => {
		updateStatus((event as StatusEvent).detail.message, (event as StatusEvent).detail);
	});
	download.addEventListener('warning', event => {
		updateStatus(`Warning: ${(event as StatusEvent).detail.message}`, (event as StatusEvent).detail);
	});
	download.addEventListener('download', event => {
		updateStatus((event as StatusEvent).detail.message, (event as StatusEvent).detail);
	});

	const source = await download.source;
	const {user, repository, directory} = source;
	updateStatus(`Repo: ${user}/${repository}\nDirectory: /${directory}`, {source});

	if ('downloadUrl' in source) {
		updateStatus('Downloading the entire repository directly from GitHub');
		window.location.href = source.downloadUrl;
		return;
	}

	const files = await download.files;
	if (files.length === 0) {
		updateStatus('No files to download');
		return;
	}

	if (files.some(file => googleDoesntLikeThis.test(file.path))) {
		updateStatus('Virus, malware, trojans are not allowed');
		return;
	}

	updateStatus(`Zipping ${files.length} files...`);

	const zip = await zipPromise;
	for (const file of files) {
		zip.file(file.path.replace(directory + '/', ''), file.blob, {binary: true});
	}

	const zipBlob = await zip.generateAsync({type: 'blob'});

	const filename
		= query.get('filename')
		?? `${user} ${repository} ${source.gitReference} ${directory}`.replace(/\//, '-');

	const zipFilename = filename.endsWith('.zip') ? filename : `${filename}.zip`;
	saveFile(zipBlob, zipFilename);
	updateStatus(`Downloaded ${files.length} files! Done!`);
}

// eslint-disable-next-line unicorn/prefer-top-level-await -- Not allowed
void init().catch(error => {
	if (error instanceof Error) {
		switch (error.message) {
			case 'Invalid token': {
				updateStatus('⚠ The token provided is invalid or has been revoked.', {
					token: localStorage.getItem('token'),
				});
				break;
			}

			case 'Rate limit exceeded': {
				updateStatus(
					'⚠ Your token rate limit has been exceeded. Please wait or add a token',
					{token: localStorage.getItem('token')},
				);
				break;
			}

			case 'NOT_A_REPOSITORY': {
				updateStatus('⚠ Not a repository');
				break;
			}

			case 'NOT_A_DIRECTORY': {
				updateStatus('⚠ Not a directory');
				break;
			}

			case 'REPOSITORY_NOT_FOUND': {
				updateStatus('⚠ Repository not found. If it’s private, you should enter a token that can access it.');
				break;
			}

			default: {
				if (!navigator.onLine) {
					updateStatus('⚠ Could not download all files, network connection lost.');
				} else if (isError(error) && error.message.startsWith('HTTP ')) {
					updateStatus('⚠ Could not download all files.');
				} else {
					updateStatus(
						'⚠ Some files were blocked from downloading, try to disable any ad blockers and refresh the page.',
						error,
					);
				}

				break;
			}
		}
	}
});

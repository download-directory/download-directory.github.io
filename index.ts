// eslint-disable-next-line import/no-unassigned-import
import 'typed-query-selector';
import {
	getDirectoryContentViaContentsApi,
	getDirectoryContentViaTreesApi,
	type ListGithubDirectoryOptions,
	type TreeResponseObject,
	type ContentsReponseObject,
} from 'list-github-dir-content';
import pMap from 'p-map';
import {downloadFile} from './download.js';
import getRepositoryInfo from './repository-info.js';

type ApiOptions = ListGithubDirectoryOptions & {getFullData: true};

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

async function listFiles(
	repoListingConfig: ApiOptions,
): Promise<Array<TreeResponseObject | ContentsReponseObject>> {
	const files = await getDirectoryContentViaTreesApi(repoListingConfig);

	if (!files.truncated) {
		return files;
	}

	updateStatus('Warning: It’s a large repo and this it take a long while just to download the list of files. You might want to use "git sparse checkout" instead.');
	return getDirectoryContentViaContentsApi(repoListingConfig);
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

	const parsedPath = await getRepositoryInfo(url);

	if ('error' in parsedPath) {
		// eslint-disable-next-line unicorn/prefer-switch -- I hate how it looks
		if (parsedPath.error === 'NOT_A_REPOSITORY') {
			updateStatus('⚠ Not a repository');
		} else if (parsedPath.error === 'NOT_A_DIRECTORY') {
			updateStatus('⚠ Not a directory');
		} else if (parsedPath.error === 'REPOSITORY_NOT_FOUND') {
			updateStatus('⚠ Repository not found. If it’s private, you should enter a token that can access it.');
		} else {
			updateStatus('⚠ Unknown error');
		}

		return;
	}

	const {user, repository, gitReference, directory, isPrivate} = parsedPath;
	updateStatus(`Repo: ${user}/${repository}\nDirectory: /${directory}`, {
		source: {
			user,
			repository,
			gitReference,
			directory,
			isPrivate,
		},
	});

	if ('downloadUrl' in parsedPath) {
		updateStatus('Downloading the entire repository directly from GitHub');
		window.location.href = parsedPath.downloadUrl;
		return;
	}

	updateStatus('Retrieving directory info');

	const files = await listFiles({
		user,
		repository,
		ref: gitReference,
		directory,
		token: localStorage.getItem('token') ?? undefined,
		getFullData: true,
	});

	if (files.length === 0) {
		updateStatus('No files to download');
		return;
	}

	if (files.some(file => googleDoesntLikeThis.test(file.path))) {
		updateStatus('Virus, malware, trojans are not allowed');
		return;
	}

	updateStatus(`Will download ${files.length} files`);

	const controller = new AbortController();
	const signal = controller.signal;

	let downloaded = 0;

	try {
		await pMap(files, async file => {
			const blob = downloadFile({
				user,
				repository,
				reference: gitReference!,
				file,
				isPrivate,
				signal,
			});

			downloaded++;
			updateStatus(file.path);

			const zip = await zipPromise;
			zip.file(file.path.replace(directory + '/', ''), blob, {
				binary: true,
			});
		}, {concurrency: 20});
	} catch (error) {
		controller.abort();

		if (!navigator.onLine) {
			updateStatus('⚠ Could not download all files, network connection lost.');
		} else if (isError(error) && error.message.startsWith('HTTP ')) {
			updateStatus('⚠ Could not download all files.');
		} else {
			updateStatus(
				'⚠ Some files were blocked from downloading, try to disable any ad blockers and refresh the page.',
			);
		}

		throw error;
	}

	updateStatus(`Zipping ${downloaded} files...`);

	const zip = await zipPromise;
	const zipBlob = await zip.generateAsync({
		type: 'blob',
	});

	const filename
		= query.get('filename')
		?? `${user} ${repository} ${gitReference} ${directory}`.replace(/\//, '-');

	const zipFilename = filename.endsWith('.zip') ? filename : `${filename}.zip`;
	saveFile(zipBlob, zipFilename);
	updateStatus(`Downloaded ${downloaded} files! Done!`);
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

			default: {
				updateStatus(`⚠ ${error.message}`, error);
				break;
			}
		}
	}
});

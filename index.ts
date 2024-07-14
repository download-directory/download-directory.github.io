// eslint-disable-next-line import/no-unassigned-import
import 'typed-query-selector';
import saveFile from 'save-file';
import {
	getDirectoryContentViaContentsApi,
	getDirectoryContentViaTreesApi,
	type ListGithubDirectoryOptions,
	type TreeResponseObject,
	type ContentsReponseObject,
} from 'list-github-dir-content';
import pMap from 'p-map';
import {downloadFile} from './download.js';
import parseUrl from './parse-url.js';
import authorizedFetch from './authorized-fetch.js';

type ApiOptions = ListGithubDirectoryOptions & {getFullData: true};

function isError(error: unknown): error is Error {
	return error instanceof Error;
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

async function waitForToken() {
	const input = document.querySelector('input#token')!;

	const token = localStorage.getItem('token');
	if (token) {
		input.value = token!;
	} else {
		const toggle = document.querySelector('input#token-toggle')!;
		toggle.checked = true;
		updateStatus('Waiting for token…');
		await new Promise<void>(resolve => {
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

async function fetchRepoInfo(repo: string): Promise<{private: boolean}> {
	const response = await authorizedFetch(
		`https://api.github.com/repos/${repo}`,
	);

	switch (response.status) {
		case 401: {
			updateStatus('⚠ The token provided is invalid or has been revoked.', {
				token: localStorage.getItem('token'),
			});
			throw new Error('Invalid token');
		}

		case 403: {
			// See https://developer.github.com/v3/#rate-limiting
			if (response.headers.get('X-RateLimit-Remaining') === '0') {
				updateStatus(
					'⚠ Your token rate limit has been exceeded. Please wait or add a token',
					{token: localStorage.getItem('token')},
				);
				throw new Error('Rate limit exceeded');
			}

			break;
		}

		case 404: {
			updateStatus('⚠ Repository was not found.', {repo});
			throw new Error('Repository not found');
		}

		default:
	}

	if (!response.ok) {
		updateStatus('⚠ Could not obtain repository data from the GitHub API.', {repo, response});
		throw new Error('Fetch error');
	}

	return response.json() as Promise<{private: boolean}>;
}

async function getZip() {
	// @ts-expect-error idk idc
	// eslint-disable-next-line @typescript-eslint/naming-convention, @typescript-eslint/consistent-type-imports
	const JSZip = await import('jszip') as typeof import('jszip');
	return new JSZip();
}

const googleDoesntLikeThis = /malware|virus|trojan/i;

async function init() {
	const zipPromise = getZip();

	const input = document.querySelector('input#token')!;
	const token = localStorage.getItem('token');
	if (token) {
		input.value = token;
	}

	input.addEventListener('input', () => {
		if (input.checkValidity()) {
			localStorage.setItem('token', input.value);
		}
	});

	const query = new URLSearchParams(location.search);
	const url = query.get('url');
	if (!url) {
		updateStatus();
		return;
	}

	if (googleDoesntLikeThis.test(url)) {
		updateStatus();
		updateStatus('Virus, malware, trojans are not allowed');
		return;
	}

	if (!navigator.onLine) {
		updateStatus('⚠ You are offline.');
		throw new Error('You are offline');
	}

	const parsedPath = await parseUrl(url);

	if ('error' in parsedPath) {
		if (parsedPath.error === 'NOT_A_REPOSITORY') {
			updateStatus('⚠ Not a repository');
		} else if (parsedPath.error === 'NOT_A_DIRECTORY') {
			updateStatus('⚠ Not a directory');
		} else {
			updateStatus('⚠ Unknown error');
		}

		return;
	}

	const {user, repository, gitReference, directory} = parsedPath;
	updateStatus(`Repo: ${user}/${repository}\nDirectory: /${directory}`);
	console.log('Source:', {
		user,
		repository,
		gitReference,
		directory,
	});

	if ('downloadUrl' in parsedPath) {
		updateStatus('Downloading the entire repository directly from GitHub');
		window.location.href = parsedPath.downloadUrl;
		return;
	}

	updateStatus('Retrieving directory info');

	const {private: repoIsPrivate} = await fetchRepoInfo(`${user}/${repository}`);

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

	if (repoIsPrivate) {
		await waitForToken();
	}

	try {
		await pMap(files, async file => {
			const blob = downloadFile({
				user,
				repository,
				reference: gitReference!,
				file,
				repoIsPrivate,
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

	updateStatus(`Zipping ${downloaded} files`);

	const zip = await zipPromise;
	const zipBlob = await zip.generateAsync({
		type: 'blob',
	});

	const filename = query.get('filename');
	const zipFilename = filename
		? (filename.toLowerCase().endsWith('.zip')
			? filename
			: filename + '.zip')
		: `${user} ${repository} ${gitReference} ${directory}.zip`.replace(/\//, '-');
	await saveFile(zipBlob, zipFilename);
	updateStatus(`Downloaded ${downloaded} files! Done!`);
}

// eslint-disable-next-line unicorn/prefer-top-level-await -- Not allowed
void init();

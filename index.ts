// eslint-disable-next-line import/no-unassigned-import
import 'typed-query-selector';
import saveFile from 'save-file';
import {
	getDirectoryContentViaContentsApi,
	getDirectoryContentViaTreesApi,
	type ListGithubDirectoryOptions,
	type GitObject,
} from 'list-github-dir-content';
import pMap from 'p-map';
import pRetry, {type FailedAttemptError} from 'p-retry';

async function maybeResponseLfs(response: Response): Promise<boolean> {
	const length = Number(response.headers.get('content-length'));
	if (length > 128 && length < 140) {
		const contents = await response.clone().text();
		return contents.startsWith('version https://git-lfs.github.com/spec/v1');
	}

	return false;
}

type ApiOptions = ListGithubDirectoryOptions & {getFullData: true};

type TreeResult<T> = {
	truncated?: boolean;
} & T[];

function isError(error: unknown): error is Error {
	return error instanceof Error;
}

function getAuthorizationHeader() {
	const token = localStorage.getItem('token');

	return token ? {
		headers: {
		// eslint-disable-next-line @typescript-eslint/naming-convention
			Authorization: `Bearer ${token}`,
		},
	} : {};
}

async function repoListingSlashblanchSupport(
	reference: string,
	directory: string,
	repoListingConfig: ApiOptions,
): Promise<[TreeResult<GitObject>, string]> {
	let files: TreeResult<GitObject> = [];
	const directoryParts = decodeURIComponent(directory).split('/');
	while (directoryParts.length >= 0) {
		try {
			files = await getDirectoryContentViaTreesApi(repoListingConfig); // eslint-disable-line no-await-in-loop
			break;
		} catch (error) {
			if (isError(error) && error.message === 'Not Found') {
				if (directoryParts.length === 0) {
					throw error;
				}

				reference += '/' + directoryParts.shift();
				repoListingConfig.directory = directoryParts.join('/');
				repoListingConfig.ref = reference;
			} else {
				throw error;
			}
		}
	}

	if (files.length === 0 && files.truncated) {
		updateStatus('Warning: It’s a large repo and this it take a long while just to download the list of files. You might want to use "git sparse checkout" instead.');
		files = await getDirectoryContentViaContentsApi(repoListingConfig);
	}

	return [files, reference];
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
	const response = await fetch(
		`https://api.github.com/repos/${repo}`,
		getAuthorizationHeader(),
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

function escapeFilepath(path: string) {
	return path.replaceAll('#', '%23');
}

const googleDoesntLikeThis = /malware|virus|trojan/i;

// eslint-disable-next-line complexity
async function init() {
	const zipPromise = getZip();
	let user: string | undefined;
	let repository: string | undefined;
	let reference: string | undefined;
	let directory: string | string[];
	let type: string | undefined;
	// eslint-disable-next-line @typescript-eslint/ban-types
	let filename: string | null;

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

	try {
		const query = new URLSearchParams(location.search);
		const url = query.get('url');
		if (!url) {
			updateStatus();
			return;
		}

		filename = query.get('filename');
		const parsedUrl = new URL(url);
		[, user, repository, type, reference, ...directory] = parsedUrl.pathname
			.replace(/[/]$/, '') // https://github.com/download-directory/download-directory.github.io/issues/98
			.split('/');
		directory = directory.join('/');

		if (!user || !repository) {
			updateStatus();
			return;
		}

		if (googleDoesntLikeThis.test(url)) {
			updateStatus();
			updateStatus('Virus, malware, trojans are not allowed');
			return;
		}

		if (type && type !== 'tree') {
			updateStatus(`⚠ ${parsedUrl.pathname} is not a directory.`);
			return;
		}

		updateStatus(`Repo: ${user}/${repository}\nDirectory: /${directory}`);
		console.log('Source:', {
			user,
			repository,
			reference,
			directory,
		});

		if (!reference) {
			updateStatus('Downloading the entire repository directly from GitHub');
			window.location.href = `https://api.github.com/repos/${user}/${repository}/zipball`;
			return;
		}

		if (!directory) {
			updateStatus('Downloading the entire repository directly from GitHub');
			window.location.href = `https://api.github.com/repos/${user}/${repository}/zipball/${reference}`;
			return;
		}
	} catch (error) {
		console.error(error);
		updateStatus();
		return;
	}

	if (!navigator.onLine) {
		updateStatus('⚠ You are offline.');
		throw new Error('You are offline');
	}

	updateStatus('Retrieving directory info');

	const {private: repoIsPrivate} = await fetchRepoInfo(`${user}/${repository}`);

	const repoListingConfig = {
		user,
		repository,
		ref: reference,
		directory: decodeURIComponent(directory),
		token: localStorage.getItem('token') ?? undefined,
		getFullData: true,
	} as const satisfies ApiOptions;
	let files: TreeResult<GitObject>;
	[files, reference] = await repoListingSlashblanchSupport(
		reference,
		directory,
		repoListingConfig,
	);

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

	const fetchPublicFile = async (file: {path: string}) => {
		const response = await fetch(
			`https://raw.githubusercontent.com/${user}/${repository}/${reference}/${escapeFilepath(file.path)}`,
			{signal},
		);

		if (!response.ok) {
			throw new Error(`HTTP ${response.statusText} for ${file.path}`);
		}

		const lfsCompatibleResponse = (await maybeResponseLfs(response))
			? await fetch(
				`https://media.githubusercontent.com/media/${user}/${repository}/${reference}/${escapeFilepath(file.path)}`,
				{signal},
			)
			: response;

		if (!response.ok) {
			throw new Error(`HTTP ${response.statusText} for ${file.path}`);
		}

		return lfsCompatibleResponse.blob();
	};

	const fetchPrivateFile = async (file: {url: string; path: string}) => {
		const response = await fetch(file.url, {
			...getAuthorizationHeader(),
			signal,
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.statusText} for ${file.path}`);
		}

		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const {content} = await response.json();
		const decoder = await fetch(`data:application/octet-stream;base64,${content}`);
		return decoder.blob();
	};

	let downloaded = 0;

	const downloadFile = async (file: {url: string; path: string}) => {
		const localDownload = async () =>
			repoIsPrivate ? fetchPrivateFile(file) : fetchPublicFile(file);
		const onFailedAttempt = (error: FailedAttemptError) => {
			console.error(
				`Error downloading ${file.url}. Attempt ${error.attemptNumber}. ${error.retriesLeft} retries left.`,
			);
		};

		const blob = await pRetry(localDownload, {onFailedAttempt});

		downloaded++;
		updateStatus(file.path);

		const zip = await zipPromise;
		zip.file(file.path.replace(directory + '/', ''), blob, {
			binary: true,
		});
	};

	if (repoIsPrivate) {
		await waitForToken();
	}

	try {
		await pMap(files, downloadFile, {concurrency: 20});
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

	const zipFilename = filename
		? (filename.toLowerCase().endsWith('.zip')
			? filename
			: filename + '.zip')
		: `${user} ${repository} ${reference} ${directory}.zip`.replace(/\//, '-');
	await saveFile(zipBlob, zipFilename);
	updateStatus(`Downloaded ${downloaded} files! Done!`);
}

await init();

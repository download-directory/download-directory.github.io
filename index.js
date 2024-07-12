import saveFile from 'save-file';
import listContent from 'list-github-dir-content';
import pMap from 'p-map';
import pRetry from 'p-retry';

async function maybeResponseLfs(response) {
	const length = Number(response.headers.get('content-length'));
	if (length > 128 && length < 140) {
		const contents = await response.clone().text();
		return contents.startsWith('version https://git-lfs.github.com/spec/v1');
	}
}

async function repoListingSlashblanchSupport(ref, dir, repoListingConfig) {
	let files;
	const dirParts = decodeURIComponent(dir).split('/');
	while (dirParts.length >= 0) {
		try {
			files = await listContent.viaTreesApi(repoListingConfig); // eslint-disable-line no-await-in-loop
			break;
		} catch (error) {
			if (error.message === 'Not Found') {
				ref += '/' + dirParts.shift();
				repoListingConfig.directory = dirParts.join('/');
				repoListingConfig.ref = ref;
			} else {
				throw error;
			}
		}
	}

	if (files.length === 0 && files.truncated) {
		updateStatus('Warning: It’s a large repo and this it take a long while just to download the list of files. You might want to use "git sparse checkout" instead.');
		files = await listContent.viaContentsApi(repoListingConfig);
	}

	return [files, ref];
}

function updateStatus(status, ...extra) {
	const element = document.querySelector('.status');
	if (status) {
		const wrapper = document.createElement('div');
		wrapper.textContent = status;
		element.prepend(wrapper);
	} else {
		element.textContent = status || '';
	}

	console.log(status, ...extra);
}

async function waitForToken() {
	const input = document.querySelector('#token');

	if (localStorage.token) {
		input.value = localStorage.token;
	} else {
		const toggle = document.querySelector('#token-toggle');
		toggle.checked = true;
		updateStatus('Waiting for token…');
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

async function fetchRepoInfo(repo) {
	const response = await fetch(`https://api.github.com/repos/${repo}`,
		localStorage.token ? {
			headers: {
				Authorization: `Bearer ${localStorage.token}`,
			},
		} : {},
	);

	switch (response.status) {
		case 401: {
			updateStatus('⚠ The token provided is invalid or has been revoked.', {token: localStorage.token});
			throw new Error('Invalid token');
		}

		case 403: {
			// See https://developer.github.com/v3/#rate-limiting
			if (response.headers.get('X-RateLimit-Remaining') === '0') {
				updateStatus('⚠ Your token rate limit has been exceeded. Please wait or add a token', {token: localStorage.token});
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

	return response.json();
}

async function getZIP() {
	const JSZip = await import('jszip');
	return new JSZip();
}

function escapeFilepath(path) {
	return path.replaceAll('#', '%23');
}

const googleDoesntLikeThis = /malware|virus|trojan/i;

async function init() {
	const zipPromise = getZIP();
	let user;
	let repository;
	let ref;
	let dir;
	let type;
	let filename;

	const input = document.querySelector('#token');
	if (localStorage.token) {
		input.value = localStorage.token;
	}

	input.addEventListener('input', () => {
		if (input.checkValidity()) {
			localStorage.token = input.value;
		}
	});

	try {
		const query = new URLSearchParams(location.search);
		const url = query.get('url');
		if (!url) {
			return updateStatus();
		}

		filename = query.get('filename');
		const parsedUrl = new URL(url);
		[, user, repository, type, ref, ...dir] = parsedUrl.pathname
			.replace(/[/]$/, '') // https://github.com/download-directory/download-directory.github.io/issues/98
			.split('/');
		dir = dir.join('/');

		if (googleDoesntLikeThis.test(parsedUrl)) {
			updateStatus();
			updateStatus('Virus, malware, trojans are not allowed');
			return;
		}

		if (type && type !== 'tree') {
			return updateStatus(`⚠ ${parsedUrl.pathname} is not a directory.`);
		}

		updateStatus(`Repo: ${user}/${repository}\nDirectory: /${dir}`);
		console.log('Source:', {user, repository, ref, dir});

		if (!ref) {
			updateStatus('Downloading the entire repository directly from GitHub');
			window.location.href = `https://api.github.com/repos/${user}/${repository}/zipball`;
			return;
		}

		if (!dir) {
			updateStatus('Downloading the entire repository directly from GitHub');
			window.location.href = `https://api.github.com/repos/${user}/${repository}/zipball/${ref}`;
			return;
		}
	} catch (error) {
		console.error(error);
		return updateStatus();
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
		ref,
		directory: decodeURIComponent(dir),
		token: localStorage.token,
		getFullData: true,
	};
	let files;
	[files, ref] = await repoListingSlashblanchSupport(ref, dir, repoListingConfig);

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

	const fetchPublicFile = async file => {
		const response = await fetch(`https://raw.githubusercontent.com/${user}/${repository}/${ref}/${escapeFilepath(file.path)}`, {
			signal: controller.signal,
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.statusText} for ${file.path}`);
		}

		const lfsCompatibleResponse = await maybeResponseLfs(response)
			? await fetch(`https://media.githubusercontent.com/media/${user}/${repository}/${ref}/${escapeFilepath(file.path)}`, {
				signal: controller.signal,
			})
			: response;

		if (!response.ok) {
			throw new Error(`HTTP ${response.statusText} for ${file.path}`);
		}

		return lfsCompatibleResponse.blob();
	};

	const fetchPrivateFile = async file => {
		const response = await fetch(file.url, {
			headers: {
				Authorization: `Bearer ${localStorage.token}`,
			},
			signal: controller.signal,
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.statusText} for ${file.path}`);
		}

		const {content} = await response.json();
		const decoder = await fetch(`data:application/octet-stream;base64,${content}`);
		return decoder.blob();
	};

	let downloaded = 0;

	const downloadFile = async file => {
		const localDownload = () => repoIsPrivate ? fetchPrivateFile(file) : fetchPublicFile(file);
		const onFailedAttempt = error => {
			console.error(`Error downloading ${file.url}. Attempt ${error.attemptNumber}. ${error.retriesLeft} retries left.`);
		};

		const blob = await pRetry(localDownload, {onFailedAttempt});

		downloaded++;
		updateStatus(file.path);

		const zip = await zipPromise;
		zip.file(file.path.replace(dir + '/', ''), blob, {
			binary: true,
		});
	};

	if (repoIsPrivate) {
		await waitForToken();
	}

	await pMap(files, downloadFile, {concurrency: 20}).catch(error => {
		controller.abort();

		if (!navigator.onLine) {
			updateStatus('⚠ Could not download all files, network connection lost.');
		} else if (error.message.startsWith('HTTP ')) {
			updateStatus('⚠ Could not download all files.');
		} else {
			updateStatus('⚠ Some files were blocked from downloading, try to disable any ad blockers and refresh the page.');
		}

		throw error;
	});

	updateStatus(`Zipping ${downloaded} files`);

	const zip = await zipPromise;
	const zipBlob = await zip.generateAsync({
		type: 'blob',
	});

	const zipFilename = filename
		? (filename.toLowerCase().endsWith('.zip')
			? filename
			: filename + '.zip')
		: `${user} ${repository} ${ref} ${dir}.zip`.replace(/\//, '-');
	await saveFile(zipBlob, zipFilename);
	updateStatus(`Downloaded ${downloaded} files! Done!`);
}

// eslint-disable-next-line unicorn/prefer-top-level-await -- I like having an `init` function since there's a lot of code in this file
init();

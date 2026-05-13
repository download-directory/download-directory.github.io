import {
	getDirectoryContentViaContentsApi,
	getDirectoryContentViaTreesApi,
	type ListGithubDirectoryOptions,
	type TreeResponseObject,
	type ContentsReponseObject,
} from 'list-github-dir-content';
import pMap from 'p-map';
import {type FailedAttemptError} from 'p-retry';
import {downloadFile} from './download.js';
import getRepositoryInfo from './repository-info.js';

type ApiOptions = ListGithubDirectoryOptions & {getFullData: true};

export type DownloadedFile = {
	path: string;
	blob: Blob;
};

type DownloadStatusEvent = CustomEvent<{message: string} & Record<string, unknown>>;

type DownloadDirectorySource = Exclude<Awaited<ReturnType<typeof getRepositoryInfo>>, {error: string}>;

export type DirectoryDownload = EventTarget & {
	source: Promise<DownloadDirectorySource>;
	files: Promise<DownloadedFile[]>;
	abort: () => void;
};

async function listFiles(
	repoListingConfig: ApiOptions,
	onWarning: (message: string) => void,
): Promise<Array<TreeResponseObject | ContentsReponseObject>> {
	const files = await getDirectoryContentViaTreesApi(repoListingConfig);

	if (!files.truncated) {
		return files;
	}

	onWarning('It’s a large repo and this it take a long while just to download the list of files. You might want to use "git sparse checkout" instead.');
	return getDirectoryContentViaContentsApi(repoListingConfig);
}

function createStatusEvent(type: string, message: string, detail: Record<string, unknown> = {}) {
	return new CustomEvent(type, {
		detail: {
			message,
			...detail,
		},
	});
}

class DownloadDirectoryTask extends EventTarget {
	readonly #controller = new AbortController();
	readonly #sourcePromise: Promise<DownloadDirectorySource>;
	readonly #filesPromise: Promise<DownloadedFile[]>;

	constructor(url: string) {
		super();

		this.#sourcePromise = this.#resolveSource(url);
		this.#filesPromise = this.#downloadFiles();
	}

	get source() {
		return this.#sourcePromise;
	}

	get files() {
		return this.#filesPromise;
	}

	abort() {
		this.#controller.abort();
	}

	async #resolveSource(url: string): Promise<DownloadDirectorySource> {
		const parsedPath = await getRepositoryInfo(url);
		if ('error' in parsedPath) {
			throw new Error(parsedPath.error);
		}

		return parsedPath;
	}

	#emitInfo(message: string, detail: Record<string, unknown> = {}) {
		this.dispatchEvent(createStatusEvent('info', message, detail));
	}

	#emitWarning(message: string, detail: Record<string, unknown> = {}) {
		this.dispatchEvent(createStatusEvent('warning', message, detail));
	}

	#emitDownload(path: string) {
		this.dispatchEvent(createStatusEvent('download', path, {path}));
	}

	#onRetry(path: string) {
		return (error: FailedAttemptError) => {
			this.#emitWarning(`Retrying ${path}. Attempt ${error.attemptNumber}. ${error.retriesLeft} retries left.`, {
				path,
				attemptNumber: error.attemptNumber,
				retriesLeft: error.retriesLeft,
			});
		};
	}

	async #downloadFiles(): Promise<DownloadedFile[]> {
		const parsedPath = await this.#sourcePromise;
		if ('downloadUrl' in parsedPath) {
			return [];
		}

		const {user, repository, gitReference, directory, isPrivate} = parsedPath;
		this.#emitInfo('Retrieving directory info');
		const files = await listFiles({
			user,
			repository,
			ref: gitReference,
			directory,
			token: globalThis.localStorage?.getItem('token') ?? undefined,
			getFullData: true,
		}, message => {
			this.#emitWarning(message);
		});

		if (files.length === 0) {
			this.#emitInfo('No files to download');
			return [];
		}

		this.#emitInfo(`Will download ${files.length} files`);

		const downloadedFiles = await pMap(files, async file => {
			const blob = await downloadFile({
				user,
				repository,
				reference: gitReference,
				file,
				isPrivate,
				signal: this.#controller.signal,
				onRetry: this.#onRetry(file.path),
			});

			this.#emitDownload(file.path);
			return {
				path: file.path,
				blob,
			};
		}, {concurrency: 20});

		return downloadedFiles;
	}
}

export default function downloadDirectory(url: string): DirectoryDownload {
	const task = new DownloadDirectoryTask(url);
	const proxy: DirectoryDownload = {
		addEventListener: task.addEventListener.bind(task),
		removeEventListener: task.removeEventListener.bind(task),
		dispatchEvent: task.dispatchEvent.bind(task),
		files: task.files,
		source: task.source,
		abort: task.abort.bind(task),
	};
	return proxy;
}

export type StatusEvent = DownloadStatusEvent;

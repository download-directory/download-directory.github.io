import {type GitObject} from 'list-github-dir-content';
import pRetry, {type FailedAttemptError} from 'p-retry';

function escapeFilepath(path: string) {
	return path.replaceAll('#', '%23');
}

export function getAuthorizationHeader() {
	const token = localStorage.getItem('token');

	return token
		? {
			headers: {
				// eslint-disable-next-line @typescript-eslint/naming-convention
				Authorization: `Bearer ${token}`,
			},
		}
		: {};
}

async function maybeResponseLfs(response: Response): Promise<boolean> {
	const length = Number(response.headers.get('content-length'));
	if (length > 128 && length < 140) {
		const contents = await response.clone().text();
		return contents.startsWith('version https://git-lfs.github.com/spec/v1');
	}

	return false;
}

type FileRequest = {
	user: string;
	repository: string;
	reference: string;
	file: GitObject;
	signal: AbortSignal;
};

async function fetchPublicFile({
	user,
	repository,
	reference,
	file,
	signal,
}: FileRequest) {
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
}

async function fetchPrivateFile({
	file,
	signal,
}: FileRequest) {
	const response = await fetch(file.url, {
		...getAuthorizationHeader(),
		signal,
	});

	if (!response.ok) {
		throw new Error(`HTTP ${response.statusText} for ${file.path}`);
	}

	// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
	const {content} = await response.json();
	const decoder = await fetch(
		`data:application/octet-stream;base64,${content}`,
	);
	return decoder.blob();
}

export async function downloadFile({
	user,
	repository,
	reference,
	file,
	repoIsPrivate,
	signal,
}: {
	user: string;
	repository: string;
	reference: string;
	repoIsPrivate: boolean;
	file: GitObject;
	signal: AbortSignal;
}) {
	const fileRequest = {
		user, repository, reference, file, signal,
	};
	const localDownload = async () =>
		repoIsPrivate
			? fetchPrivateFile(fileRequest)
			: fetchPublicFile(fileRequest);
	const onFailedAttempt = (error: FailedAttemptError) => {
		console.error(
			`Error downloading ${file.path}. Attempt ${error.attemptNumber}. ${error.retriesLeft} retries left.`,
		);
	};

	return pRetry(localDownload, {onFailedAttempt});
}

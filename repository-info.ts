import authenticatedFetch from './authenticated-fetch.js';

function cleanUrl(url: string) {
	return url
		.replace(/[/]{2,}/, '/') // Drop double slashes
		.replace(/[/]$/, ''); // Drop trailing slash
}

export function getRepositoryPreview(url: string):
| {error: 'NOT_A_REPOSITORY' | 'NOT_A_DIRECTORY'}
| {user: string; repository: string; directory: string} {
	const [, user, repository, ...restPathParts] = cleanUrl(
		decodeURIComponent(new URL(url).pathname),
	).split('/');
	const type = restPathParts[0];

	if (!user || !repository) {
		return {error: 'NOT_A_REPOSITORY'};
	}

	if (type && type !== 'tree') {
		return {error: 'NOT_A_DIRECTORY'};
	}

	const directoryParts = type === 'tree' ? restPathParts.slice(2) : [];

	return {
		user,
		repository,
		directory: directoryParts.join('/'),
	};
}

async function parsePath(
	user: string,
	repo: string,
	parts: string[],
): Promise<{gitReference: string; directory: string} | void> {
	for (let i = 0; i < parts.length; i++) {
		const gitReference = parts.slice(0, i + 1).join('/');
		// eslint-disable-next-line no-await-in-loop -- One at a time
		if (await checkBranchExists(user, repo, gitReference)) {
			return {
				gitReference,
				directory: parts.slice(i + 1).join('/'),
			};
		}
	}
}

export default async function getRepositoryInfo(
	url: string,
): Promise<
	| {error: string}
	| {
		user: string;
		repository: string;
		gitReference?: string;
		directory: string;
		downloadUrl: string;
		isPrivate: boolean;
	}
	| {
		user: string;
		repository: string;
		gitReference: string;
		directory: string;
		isPrivate: boolean;
	}
	> {
	const preview = getRepositoryPreview(url);
	if ('error' in preview) {
		return preview;
	}

	const {user, repository} = preview;
	const pathParts = cleanUrl(
		decodeURIComponent(new URL(url).pathname),
	).split('/');
	const parts = pathParts.slice(4);

	const repoInfoResponse = await authenticatedFetch(
		`https://api.github.com/repos/${user}/${repository}`,
	);

	if (repoInfoResponse.status === 404) {
		return {error: 'REPOSITORY_NOT_FOUND'};
	}

	const {private: isPrivate} = await repoInfoResponse.json() as {private: boolean};

	if (parts.length === 0) {
		return {
			user,
			repository,
			directory: '',
			isPrivate,
			downloadUrl: `https://api.github.com/repos/${user}/${repository}/zipball`,
		};
	}

	if (parts.length === 1) {
		return {
			user,
			repository,
			gitReference: parts[0],
			directory: '',
			isPrivate,
			downloadUrl: `https://api.github.com/repos/${user}/${repository}/zipball/${parts[0]}`,
		};
	}

	const parsedPath = await parsePath(user, repository, parts);
	if (!parsedPath) {
		return {error: 'BRANCH_NOT_FOUND'};
	}

	return {
		user,
		repository,
		isPrivate,
		...parsedPath,
	};
}

async function checkBranchExists(user: string, repo: string, gitReference: string): Promise<boolean> {
	const apiUrl = `https://api.github.com/repos/${user}/${repo}/commits/${gitReference}?per_page=1`;
	const response = await authenticatedFetch(apiUrl, {method: 'HEAD'});
	return response.ok;
}

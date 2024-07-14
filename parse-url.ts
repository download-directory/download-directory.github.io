import authenticatedFetch from './authenticated-fetch.js';

function cleanUrl(url: string) {
	return url
		.replace(/[/]{2,}/, '/') // Drop double slashes
		.replace(/[/]$/, ''); // Drop trailing slash
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

export default async function parseUrl(
	url: string,
): Promise<
	| {error: string}
	| {
		user: string;
		repository: string;
		gitReference?: string;
		directory: string;
		downloadUrl: string;
	}
	| {
		user: string;
		repository: string;
		gitReference: string;
		directory: string;
	}
	> {
	const [, user, repository, type, ...parts] = cleanUrl(
		decodeURIComponent(new URL(url).pathname),
	).split('/');

	if (!user || !repository) {
		return {error: 'NOT_A_REPOSITORY'};
	}

	if (type && type !== 'tree') {
		return {error: 'NOT_A_DIRECTORY'};
	}

	if (parts.length === 0) {
		return {
			user,
			repository,
			directory: '',
			downloadUrl: `https://api.github.com/repos/${user}/${repository}/zipball`,
		};
	}

	if (parts.length === 1) {
		return {
			user,
			repository,
			gitReference: parts[0],
			directory: '',
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
		...parsedPath,
	};
}

async function checkBranchExists(user: string, repo: string, gitReference: string): Promise<boolean> {
	const apiUrl = `https://api.github.com/repos/${user}/${repo}/branches/${gitReference}`;
	const response = await authenticatedFetch(apiUrl);
	return response.ok;
}

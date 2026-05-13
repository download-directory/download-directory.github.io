import {
	afterEach,
	expect,
	test,
	vi,
} from 'vitest';
import authenticatedFetch from './authenticated-fetch.js';

const originalFetch = globalThis.fetch;
const originalLocalStorage = globalThis.localStorage;

function createLocalStorageWithToken(): Storage {
	return {
		length: 1,
		clear: () => undefined,
		getItem: () => 'token',
		key: () => null,
		removeItem: () => undefined,
		setItem: () => undefined,
	};
}

afterEach(() => {
	globalThis.fetch = originalFetch;
	globalThis.localStorage = originalLocalStorage;
});

test('sends token to the GitHub API', async () => {
	const fetchMock = vi.fn().mockResolvedValue(new Response());
	globalThis.fetch = fetchMock;
	globalThis.localStorage = createLocalStorageWithToken();

	await authenticatedFetch('https://api.github.com/repos/user/repo');

	const authorizationHeader = 'Authorization';
	expect(fetchMock).toHaveBeenCalledWith('https://api.github.com/repos/user/repo', {
		headers: {
			[authorizationHeader]: 'Bearer token',
		},
		method: undefined,
		signal: undefined,
	});
});

test('does not send token to raw.githubusercontent.com', async () => {
	const fetchMock = vi.fn().mockResolvedValue(new Response());
	globalThis.fetch = fetchMock;
	globalThis.localStorage = createLocalStorageWithToken();

	await authenticatedFetch('https://raw.githubusercontent.com/user/repo/main/readme.md');

	expect(fetchMock).toHaveBeenCalledWith('https://raw.githubusercontent.com/user/repo/main/readme.md', {
		method: undefined,
		signal: undefined,
	});
});

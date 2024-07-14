import {test, expect} from 'vitest';
import {type TreeResponseObject} from 'list-github-dir-content';
import {downloadFile} from './download.js';

test('downloadFile', async () => {
	await expect(downloadFile({
		user: 'refined-github',
		repository: 'sandbox',
		reference: 'github-moji',
		file: {
			path: '.github/workflows/wait-for-checks.yml',
		} as unknown as TreeResponseObject,
		signal: new AbortController().signal,
		isPrivate: false,
	})).resolves.toBeInstanceOf(Blob);
});

test.skip('downloadFile private', async () => {
	// It will eventually have to immediately skip if the token is missing
	await expect(downloadFile({
		user: 'refined-github',
		repository: 'private',
		reference: 'github-moji',
		file: {
			path: '.github/workflows/wait-for-checks.yml',
		} as unknown as TreeResponseObject,
		signal: new AbortController().signal,
		isPrivate: true,
	})).resolves.toBeInstanceOf(Blob);
});

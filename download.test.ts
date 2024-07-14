import {test, expect} from 'vitest';
import {downloadFile} from './download.js';

test('downloadFile', async () => {
	await expect(downloadFile({
		user: 'refined-github',
		repository: 'sandbox',
		reference: 'github-moji',
		file: {
			path: '.github/workflows/wait-for-checks.yml',
		},
		signal: new AbortController().signal,
		repoIsPrivate: false,
	})).resolves.toBeInstanceOf(Blob);
});

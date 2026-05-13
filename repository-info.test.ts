import {test, expect} from 'vitest';
import getRepositoryInfo, {getRepositoryPreview} from './repository-info.js';

test('getRepositoryPreview', () => {
	expect(getRepositoryPreview('https://github.com/user')).toEqual({
		error: 'NOT_A_REPOSITORY',
	});
	expect(getRepositoryPreview('https://github.com/fregante/doma/blob/develop/readme.md')).toEqual({
		error: 'NOT_A_DIRECTORY',
	});
	expect(getRepositoryPreview('https://github.com/wesbos/JavaScript30/tree/master/01%20-%20JavaScript%20Drum%20Kit/sounds')).toEqual({
		user: 'wesbos',
		repository: 'JavaScript30',
		directory: '01 - JavaScript Drum Kit/sounds',
	});
});

test('getRepositoryInfo', async () => {
	await expect(getRepositoryInfo('https://github.com/user')).resolves.toMatchInlineSnapshot(`
		{
		  "error": "NOT_A_REPOSITORY",
		}
	`);
	await expect(getRepositoryInfo('https://github.com/fregante/doma/blob/develop/readme.md')).resolves.toMatchInlineSnapshot(`
		{
		  "error": "NOT_A_DIRECTORY",
		}
	`);
	await expect(getRepositoryInfo('https://github.com/refined-github/sandbox/tree/durian/folder')).resolves.toMatchInlineSnapshot(`
		{
		  "error": "BRANCH_NOT_FOUND",
		}
	`);
	await expect(getRepositoryInfo('https://github.com/refined-github/private/tree/durian/folder')).resolves.toMatchInlineSnapshot(`
		{
		  "error": "REPOSITORY_NOT_FOUND",
		}
	`);
	// Simple branches are not verified at this point. Should they be?
	await expect(getRepositoryInfo('https://github.com/refined-github/sandbox/tree/durian')).resolves.toMatchInlineSnapshot(`
		{
		  "directory": "",
		  "downloadUrl": "https://api.github.com/repos/refined-github/sandbox/zipball/durian",
		  "gitReference": "durian",
		  "isPrivate": false,
		  "repository": "sandbox",
		  "user": "refined-github",
		}
	`);
	await expect(getRepositoryInfo('https://github.com/refined-github/sandbox/tree/branch/with/slashes')).resolves.toMatchInlineSnapshot(`
		{
		  "directory": "",
		  "gitReference": "branch/with/slashes",
		  "isPrivate": false,
		  "repository": "sandbox",
		  "user": "refined-github",
		}
	`);
	await expect(getRepositoryInfo('https://github.com/refined-github/sandbox/tree/default-a/.github/workflows')).resolves.toMatchInlineSnapshot(`
		{
		  "directory": ".github/workflows",
		  "gitReference": "default-a",
		  "isPrivate": false,
		  "repository": "sandbox",
		  "user": "refined-github",
		}
	`);
	await expect(getRepositoryInfo('https://github.com/microsoft/typescript')).resolves.toMatchInlineSnapshot(`
		{
		  "directory": "",
		  "downloadUrl": "https://api.github.com/repos/microsoft/typescript/zipball",
		  "isPrivate": false,
		  "repository": "typescript",
		  "user": "microsoft",
		}
	`);
	await expect(getRepositoryInfo('https://github.com/fregante/doma/tree/develop')).resolves.toMatchInlineSnapshot(`
		{
		  "directory": "",
		  "downloadUrl": "https://api.github.com/repos/fregante/doma/zipball/develop",
		  "gitReference": "develop",
		  "isPrivate": false,
		  "repository": "doma",
		  "user": "fregante",
		}
	`);
	await expect(getRepositoryInfo('https://github.com/wesbos/JavaScript30/tree/master/01%20-%20JavaScript%20Drum%20Kit/sounds')).resolves.toMatchInlineSnapshot(`
		{
		  "directory": "01 - JavaScript Drum Kit/sounds",
		  "gitReference": "master",
		  "isPrivate": false,
		  "repository": "JavaScript30",
		  "user": "wesbos",
		}
	`);
});

import {test, expect} from 'vitest';
import getRepositoryInfo from './repository-info.js';

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
	// Simple branches are not verified at this point. Should they be?
	await expect(getRepositoryInfo('https://github.com/refined-github/sandbox/tree/durian')).resolves.toMatchInlineSnapshot(`
		{
		  "directory": "",
		  "downloadUrl": "https://api.github.com/repos/refined-github/sandbox/zipball/durian",
		  "gitReference": "durian",
		  "repository": "sandbox",
		  "user": "refined-github",
		}
	`);
	await expect(getRepositoryInfo('https://github.com/refined-github/sandbox/tree/branch/with/slashes')).resolves.toMatchInlineSnapshot(`
		{
		  "directory": "",
		  "gitReference": "branch/with/slashes",
		  "repository": "sandbox",
		  "user": "refined-github",
		}
	`);
	await expect(getRepositoryInfo('https://github.com/refined-github/sandbox/tree/default-a/.github/workflows')).resolves.toMatchInlineSnapshot(`
		{
		  "directory": ".github/workflows",
		  "gitReference": "default-a",
		  "repository": "sandbox",
		  "user": "refined-github",
		}
	`);
	await expect(getRepositoryInfo('https://github.com/microsoft/typescript')).resolves.toMatchInlineSnapshot(`
		{
		  "directory": "",
		  "downloadUrl": "https://api.github.com/repos/microsoft/typescript/zipball",
		  "repository": "typescript",
		  "user": "microsoft",
		}
	`);
	await expect(getRepositoryInfo('https://github.com/fregante/doma/tree/develop')).resolves.toMatchInlineSnapshot(`
		{
		  "directory": "",
		  "downloadUrl": "https://api.github.com/repos/fregante/doma/zipball/develop",
		  "gitReference": "develop",
		  "repository": "doma",
		  "user": "fregante",
		}
	`);
	await expect(getRepositoryInfo('https://github.com/wesbos/JavaScript30/tree/master/01%20-%20JavaScript%20Drum%20Kit/sounds')).resolves.toMatchInlineSnapshot(`
		{
		  "directory": "01 - JavaScript Drum Kit/sounds",
		  "gitReference": "master",
		  "repository": "JavaScript30",
		  "user": "wesbos",
		}
	`);
});

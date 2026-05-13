import {test, expect} from 'vitest';
import {getRepositoryInfo, getRepositoryPreview} from './repository-info.js';

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
		parts: ['master', '01 - JavaScript Drum Kit', 'sounds'],
		directory: '01 - JavaScript Drum Kit/sounds',
	});
});

test('getRepositoryInfo', async () => {
	const sandboxDurianFolder = getRepositoryPreview('https://github.com/refined-github/sandbox/tree/durian/folder');
	expect(sandboxDurianFolder).not.toHaveProperty('error');
	await expect(getRepositoryInfo(sandboxDurianFolder as {user: string; repository: string; parts: string[]})).resolves.toMatchInlineSnapshot(`
		{
		  "error": "BRANCH_NOT_FOUND",
		}
	`);
	const privateDurianFolder = getRepositoryPreview('https://github.com/refined-github/private/tree/durian/folder');
	expect(privateDurianFolder).not.toHaveProperty('error');
	await expect(getRepositoryInfo(privateDurianFolder as {user: string; repository: string; parts: string[]})).resolves.toMatchInlineSnapshot(`
		{
		  "error": "REPOSITORY_NOT_FOUND",
		}
	`);
	// Simple branches are not verified at this point. Should they be?
	const sandboxDurian = getRepositoryPreview('https://github.com/refined-github/sandbox/tree/durian');
	expect(sandboxDurian).not.toHaveProperty('error');
	await expect(getRepositoryInfo(sandboxDurian as {user: string; repository: string; parts: string[]})).resolves.toMatchInlineSnapshot(`
		{
		  "directory": "",
		  "downloadUrl": "https://api.github.com/repos/refined-github/sandbox/zipball/durian",
		  "gitReference": "durian",
		  "isPrivate": false,
		  "repository": "sandbox",
		  "user": "refined-github",
		}
	`);
	const sandboxSlashes = getRepositoryPreview('https://github.com/refined-github/sandbox/tree/branch/with/slashes');
	expect(sandboxSlashes).not.toHaveProperty('error');
	await expect(getRepositoryInfo(sandboxSlashes as {user: string; repository: string; parts: string[]})).resolves.toMatchInlineSnapshot(`
		{
		  "directory": "",
		  "gitReference": "branch/with/slashes",
		  "isPrivate": false,
		  "repository": "sandbox",
		  "user": "refined-github",
		}
	`);
	const sandboxWorkflows = getRepositoryPreview('https://github.com/refined-github/sandbox/tree/default-a/.github/workflows');
	expect(sandboxWorkflows).not.toHaveProperty('error');
	await expect(getRepositoryInfo(sandboxWorkflows as {user: string; repository: string; parts: string[]})).resolves.toMatchInlineSnapshot(`
		{
		  "directory": ".github/workflows",
		  "gitReference": "default-a",
		  "isPrivate": false,
		  "repository": "sandbox",
		  "user": "refined-github",
		}
	`);
	const microsoftTypescript = getRepositoryPreview('https://github.com/microsoft/typescript');
	expect(microsoftTypescript).not.toHaveProperty('error');
	await expect(getRepositoryInfo(microsoftTypescript as {user: string; repository: string; parts: string[]})).resolves.toMatchInlineSnapshot(`
		{
		  "directory": "",
		  "downloadUrl": "https://api.github.com/repos/microsoft/typescript/zipball",
		  "isPrivate": false,
		  "repository": "typescript",
		  "user": "microsoft",
		}
	`);
	const domaDevelop = getRepositoryPreview('https://github.com/fregante/doma/tree/develop');
	expect(domaDevelop).not.toHaveProperty('error');
	await expect(getRepositoryInfo(domaDevelop as {user: string; repository: string; parts: string[]})).resolves.toMatchInlineSnapshot(`
		{
		  "directory": "",
		  "downloadUrl": "https://api.github.com/repos/fregante/doma/zipball/develop",
		  "gitReference": "develop",
		  "isPrivate": false,
		  "repository": "doma",
		  "user": "fregante",
		}
	`);
	const javascript30Sounds = getRepositoryPreview('https://github.com/wesbos/JavaScript30/tree/master/01%20-%20JavaScript%20Drum%20Kit/sounds');
	expect(javascript30Sounds).not.toHaveProperty('error');
	await expect(getRepositoryInfo(javascript30Sounds as {user: string; repository: string; parts: string[]})).resolves.toMatchInlineSnapshot(`
		{
		  "directory": "01 - JavaScript Drum Kit/sounds",
		  "gitReference": "master",
		  "isPrivate": false,
		  "repository": "JavaScript30",
		  "user": "wesbos",
		}
	`);
});

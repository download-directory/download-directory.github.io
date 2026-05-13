import {expect, test} from 'vitest';
import {type TreeResponseObject} from 'list-github-dir-content';
import {filterBlockedFiles, hasBlockedKeyword} from './blocked-files.js';

test('hasBlockedKeyword', () => {
	expect(hasBlockedKeyword('Other/icons/Malwarebytes.icns')).toBe(true);
	expect(hasBlockedKeyword('Other/icons/Finder.icns')).toBe(false);
});

test('filterBlockedFiles', () => {
	const {allowedFiles, blockedFiles} = filterBlockedFiles([
		{path: 'Other/icons/Malwarebytes.icns'},
		{path: 'Other/icons/Finder.icns'},
		{path: 'Other/icons/Trojan Horse.icns'},
	] as unknown as TreeResponseObject[]);

	expect(allowedFiles.map(file => file.path)).toEqual([
		'Other/icons/Finder.icns',
	]);
	expect(blockedFiles.map(file => file.path)).toEqual([
		'Other/icons/Malwarebytes.icns',
		'Other/icons/Trojan Horse.icns',
	]);
});

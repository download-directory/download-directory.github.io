import {type ContentsReponseObject, type TreeResponseObject} from 'list-github-dir-content';

const googleDoesntLikeThis = /malware|virus|trojan/i;

export function hasBlockedKeyword(value: string): boolean {
	return googleDoesntLikeThis.test(value);
}

export function filterBlockedFiles(
	files: Array<TreeResponseObject | ContentsReponseObject>,
): {
		allowedFiles: Array<TreeResponseObject | ContentsReponseObject>;
		blockedFiles: Array<TreeResponseObject | ContentsReponseObject>;
	} {
	const allowedFiles: Array<TreeResponseObject | ContentsReponseObject> = [];
	const blockedFiles: Array<TreeResponseObject | ContentsReponseObject> = [];

	for (const file of files) {
		if (hasBlockedKeyword(file.path)) {
			blockedFiles.push(file);
		} else {
			allowedFiles.push(file);
		}
	}

	return {
		allowedFiles,
		blockedFiles,
	};
}

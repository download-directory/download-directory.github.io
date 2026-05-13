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
	return {
		allowedFiles: files.filter(file => !hasBlockedKeyword(file.path)),
		blockedFiles: files.filter(file => hasBlockedKeyword(file.path)),
	};
}

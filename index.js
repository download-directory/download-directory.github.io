import JSZip from 'jszip';
import listContent from 'list-github-dir-content';
import saveFile from 'save-file';

async function init() {
	const query = new URLSearchParams(location.search);
	const files = await listContent.viaTreesApi(query.get('repo'), query.get('dir'), localStorage.token);
	const requests = await Promise.all(files.map(async path => {
		const response = await fetch(`https://raw.githubusercontent.com/${query.get('repo')}/master/${path}`);
		return {
			path: path,
			blob: response.blob()
		};
	}));

	const zip = new JSZip();
	for (const file of requests) {
		zip.file(file.path.replace(query.get('dir') + '/', ''), file.blob, {
			binary: true
		});
	}
	const zipBlob = await zip.generateAsync({
		type: 'blob'
	});

	saveFile(zipBlob, `${query.get('repo')} ${query.get('dir')}.zip`.replace(/\//, '-'))
}

init()

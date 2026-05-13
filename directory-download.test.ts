import {
	beforeEach,
	expect,
	test,
	vi,
} from 'vitest';
import {getDirectoryContentViaContentsApi, getDirectoryContentViaTreesApi} from 'list-github-dir-content';
import downloadDirectory, {type StatusEvent} from './directory-download.js';
import {downloadFile} from './download.js';
import getRepositoryInfo from './repository-info.js';

vi.mock('./repository-info.js');
vi.mock('./download.js');
vi.mock('list-github-dir-content');

const mockedGetRepositoryInfo = vi.mocked(getRepositoryInfo);
const mockedDownloadFile = vi.mocked(downloadFile);
const mockedGetDirectoryContentViaTreesApi = vi.mocked(getDirectoryContentViaTreesApi);
const mockedGetDirectoryContentViaContentsApi = vi.mocked(getDirectoryContentViaContentsApi);

beforeEach(() => {
	vi.resetAllMocks();
});

test('downloadDirectory emits status events and returns downloaded files', async () => {
	mockedGetRepositoryInfo.mockResolvedValue({
		user: 'owner',
		repository: 'repo',
		gitReference: 'main',
		directory: 'folder',
		isPrivate: false,
	});

	const treeFiles = [{path: 'folder/a.txt'}] as Array<{path: string}>;
	Object.assign(treeFiles, {truncated: true});
	mockedGetDirectoryContentViaTreesApi.mockResolvedValue(treeFiles as never);
	mockedGetDirectoryContentViaContentsApi.mockResolvedValue([{path: 'folder/a.txt'}] as never);

	mockedDownloadFile.mockImplementation(async input => {
		input.onRetry?.({attemptNumber: 1, retriesLeft: 2} as never);
		return new Blob(['a']);
	});

	const download = downloadDirectory('https://github.com/owner/repo/tree/main/folder');
	const events: string[] = [];
	const listen = (event: Event) => {
		events.push((event as StatusEvent).detail.message);
	};

	download.addEventListener('warning', listen);
	download.addEventListener('info', listen);
	download.addEventListener('download', listen);

	const files = await download.files;

	expect(files).toHaveLength(1);
	expect(files[0]!.path).toBe('folder/a.txt');
	expect(events).toContain('Retrieving directory info');
	expect(events).toContain('Will download 1 files');
	expect(events).toContain('folder/a.txt');
	expect(events).toContain('Retrying folder/a.txt. Attempt 1. 2 retries left.');
	expect(events.some(event => event.startsWith('It’s a large repo'))).toBe(true);
});

test('downloadDirectory resolves empty files when the URL maps to direct repository download', async () => {
	mockedGetRepositoryInfo.mockResolvedValue({
		user: 'owner',
		repository: 'repo',
		directory: '',
		isPrivate: false,
		downloadUrl: 'https://example.com/repo.zip',
	});

	const download = downloadDirectory('https://github.com/owner/repo');
	await expect(download.files).resolves.toEqual([]);
});

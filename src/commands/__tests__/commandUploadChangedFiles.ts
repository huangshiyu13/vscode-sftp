jest.mock('vscode');

jest.mock('../../logger', () => ({
  __esModule: true,
  default: {
    trace: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    critical: jest.fn(),
    log: jest.fn(),
  },
}));

const uploadFile = jest.fn();
const renameRemote = jest.fn();
const removeRemote = jest.fn();
const getFileService = jest.fn();
const getGitService = jest.fn();

jest.mock('../../fileHandlers', () => ({
  __esModule: true,
  uploadFile: (...args) => uploadFile(...args),
  renameRemote: (...args) => renameRemote(...args),
  removeRemote: (...args) => removeRemote(...args),
}));

jest.mock('../../modules/serviceManager', () => ({
  __esModule: true,
  getFileService: (...args) => getFileService(...args),
}));

jest.mock('../../modules/git', () => ({
  __esModule: true,
  getGitService: (...args) => getGitService(...args),
  Status: {
    INDEX_MODIFIED: 'INDEX_MODIFIED',
    MODIFIED: 'MODIFIED',
    INDEX_ADDED: 'INDEX_ADDED',
    UNTRACKED: 'UNTRACKED',
    INDEX_RENAMED: 'INDEX_RENAMED',
    INDEX_DELETED: 'INDEX_DELETED',
    DELETED: 'DELETED',
  },
}));

jest.mock('../../helper', () => ({
  __esModule: true,
  simplifyPath: (value: string) => value,
}));

import command from '../commandUploadChangedFiles';
import { Status } from '../../modules/git';

describe('commandUploadChangedFiles', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('skips ignored files and waits for upload, rename, and delete operations', async () => {
    const ignoredUri = { fsPath: '/workspace/.vscode/sftp.json' } as any;
    const uploadUri = { fsPath: '/workspace/src/index.ts' } as any;
    const originalUri = { fsPath: '/workspace/src/old.ts' } as any;
    const renameUri = { fsPath: '/workspace/src/new.ts' } as any;
    const deleteUri = { fsPath: '/workspace/src/removed.ts' } as any;

    let uploadFinished = false;
    uploadFile.mockImplementation(
      () =>
        new Promise(resolve => {
          setTimeout(() => {
            uploadFinished = true;
            resolve(undefined);
          }, 0);
        })
    );
    renameRemote.mockResolvedValue(undefined);
    removeRemote.mockResolvedValue(undefined);

    getFileService.mockImplementation(uri => ({
      getConfig: () => ({
        ignore: (fsPath: string) => fsPath === ignoredUri.fsPath,
      }),
    }));

    getGitService.mockReturnValue({
      repositories: [
        {
          rootUri: { fsPath: '/workspace' },
          state: {
            HEAD: { name: 'develop' },
            indexChanges: [
              {
                status: Status.INDEX_RENAMED,
                originalUri,
                renameUri,
                uri: renameUri,
              },
            ],
            workingTreeChanges: [
              {
                status: Status.MODIFIED,
                uri: uploadUri,
              },
              {
                status: Status.MODIFIED,
                uri: ignoredUri,
              },
              {
                status: Status.DELETED,
                uri: deleteUri,
              },
            ],
          },
        },
      ],
    });

    await (command.handleCommand as any)(undefined);

    expect(uploadFinished).toBe(true);
    expect(uploadFile).toHaveBeenCalledTimes(1);
    expect(uploadFile).toHaveBeenCalledWith(uploadUri);
    expect(renameRemote).toHaveBeenCalledTimes(1);
    expect(renameRemote).toHaveBeenCalledWith(originalUri, {
      originPath: renameUri.fsPath,
    });
    expect(removeRemote).toHaveBeenCalledTimes(1);
    expect(removeRemote).toHaveBeenCalledWith(deleteUri);
  });
});

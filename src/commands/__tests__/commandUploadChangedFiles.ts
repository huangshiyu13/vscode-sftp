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

  test('prompts for a repository when multiple repositories exist and exits on cancel', async () => {
    const vscode = require('vscode');
    vscode.window = vscode.window || {};
    vscode.window.showQuickPick = jest.fn().mockResolvedValue(undefined);
    const repoA = {
      rootUri: { fsPath: '/workspace-a' },
      ui: { selected: false },
      state: {
        HEAD: { name: 'main' },
        indexChanges: [],
        workingTreeChanges: [],
      },
    };
    const repoB = {
      rootUri: { fsPath: '/workspace-b' },
      ui: { selected: false },
      state: {
        HEAD: { name: 'develop' },
        indexChanges: [],
        workingTreeChanges: [],
      },
    };
    getGitService.mockReturnValue({
      repositories: [repoA, repoB],
    });

    await expect((command.handleCommand as any)(undefined)).resolves.toBeUndefined();

    expect(vscode.window.showQuickPick).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          label: 'workspace-a',
          description: 'main',
          repository: repoA,
        }),
        expect.objectContaining({
          label: 'workspace-b',
          description: 'develop',
          repository: repoB,
        }),
      ],
      { placeHolder: 'Choose a repository' }
    );
    expect(uploadFile).not.toHaveBeenCalled();
    expect(renameRemote).not.toHaveBeenCalled();
    expect(removeRemote).not.toHaveBeenCalled();
  });

  test('filters source control group changes and logs handler failures without throwing', async () => {
    const logger = require('../../logger').default;
    const createdUri = { fsPath: '/workspace/src/new.ts' } as any;
    const uploadUri = { fsPath: '/workspace/src/index.ts' } as any;
    const originalUri = { fsPath: '/workspace/src/old.ts' } as any;
    const renameUri = { fsPath: '/workspace/src/renamed.ts' } as any;
    const deleteUri = { fsPath: '/workspace/src/deleted.ts' } as any;
    const ignoredWorkingTreeUri = { fsPath: '/workspace/src/ignored-working-tree.ts' } as any;

    uploadFile
      .mockRejectedValueOnce(new Error('create failed'))
      .mockRejectedValueOnce(new Error('upload failed'));
    renameRemote.mockRejectedValueOnce(new Error('rename failed'));
    removeRemote.mockRejectedValueOnce(new Error('delete failed'));
    getFileService.mockReturnValue({
      getConfig: () => ({}),
    });
    getGitService.mockReturnValue({
      repositories: [
        {
          ui: { selected: true },
          state: {
            indexChanges: [
              { status: Status.INDEX_ADDED, uri: createdUri },
              { status: Status.INDEX_MODIFIED, uri: uploadUri },
              {
                status: Status.INDEX_RENAMED,
                originalUri,
                renameUri,
                uri: renameUri,
              },
              { status: Status.INDEX_DELETED, uri: deleteUri },
            ],
            workingTreeChanges: [
              { status: Status.MODIFIED, uri: ignoredWorkingTreeUri },
            ],
          },
        },
      ],
    });

    await expect(
      (command.handleCommand as any)({
        id: 'index',
        resourceStates: [],
      })
    ).resolves.toBeUndefined();

    expect(uploadFile).toHaveBeenCalledTimes(2);
    expect(uploadFile).toHaveBeenNthCalledWith(1, createdUri);
    expect(uploadFile).toHaveBeenNthCalledWith(2, uploadUri);
    expect(renameRemote).toHaveBeenCalledWith(originalUri, {
      originPath: renameUri.fsPath,
    });
    expect(removeRemote).toHaveBeenCalledWith(deleteUri);
    expect(getFileService).not.toHaveBeenCalledWith(ignoredWorkingTreeUri);
    expect(logger.error).toHaveBeenCalledWith('Upload failed.', expect.any(Error));
    expect(logger.error).toHaveBeenCalledWith('Rename failed.', expect.any(Error));
    expect(logger.error).toHaveBeenCalledWith('Deletion failed.', expect.any(Error));
    expect(logger.log).toHaveBeenCalledWith('CREATE:');
    expect(logger.log).toHaveBeenCalledWith('UPLOAD:');
    expect(logger.log).toHaveBeenCalledWith('RENAMED:');
    expect(logger.log).toHaveBeenCalledWith('DELETED:');
  });

  test('uses a repository hint, skips changes without services, and ignores unknown statuses', async () => {
    const selectedRepo = {
      rootUri: { fsPath: '/workspace' },
      ui: { selected: true },
      state: {
        HEAD: { name: 'main' },
        indexChanges: [
          { status: Status.UNTRACKED, uri: { fsPath: '/workspace/src/new.ts' } },
          { status: 'CONFLICT', uri: { fsPath: '/workspace/src/conflict.ts' } },
        ],
        workingTreeChanges: [
          { status: Status.MODIFIED, uri: { fsPath: '/workspace/src/missing-service.ts' } },
        ],
      },
    };

    getGitService.mockReturnValue({
      repositories: [selectedRepo],
    });
    getFileService.mockImplementation(uri =>
      uri.fsPath === '/workspace/src/missing-service.ts'
        ? undefined
        : {
            getConfig: () => ({}),
          }
    );
    uploadFile.mockResolvedValue(undefined);

    await expect((command.handleCommand as any)(selectedRepo)).resolves.toBeUndefined();

    expect(uploadFile).toHaveBeenCalledTimes(1);
    expect(uploadFile).toHaveBeenCalledWith(selectedRepo.state.indexChanges[0].uri);
    expect(renameRemote).not.toHaveBeenCalled();
    expect(removeRemote).not.toHaveBeenCalled();
  });

  test('uploads changes from the repository selected in the quick pick', async () => {
    const vscode = require('vscode');
    vscode.window = vscode.window || {};

    const repoA = {
      rootUri: { fsPath: '/workspace-a' },
      ui: { selected: false },
      state: {
        HEAD: undefined,
        indexChanges: [],
        workingTreeChanges: [],
      },
    };
    const repoB = {
      rootUri: { fsPath: '/workspace-b' },
      ui: { selected: false },
      state: {
        HEAD: { name: 'feature/upload' },
        indexChanges: [],
        workingTreeChanges: [
          {
            status: Status.MODIFIED,
            uri: { fsPath: '/workspace-b/src/app.ts' },
          },
        ],
      },
    };

    vscode.window.showQuickPick = jest.fn().mockResolvedValue({
      label: 'workspace-b',
      description: 'feature/upload',
      repository: repoB,
    });
    getGitService.mockReturnValue({
      repositories: [repoA, repoB],
    });
    getFileService.mockReturnValue({
      getConfig: () => ({}),
    });
    uploadFile.mockResolvedValue(undefined);

    await expect((command.handleCommand as any)(undefined)).resolves.toBeUndefined();

    expect(vscode.window.showQuickPick).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          label: 'workspace-a',
          description: '',
          repository: repoA,
        }),
        expect.objectContaining({
          label: 'workspace-b',
          description: 'feature/upload',
          repository: repoB,
        }),
      ],
      { placeHolder: 'Choose a repository' }
    );
    expect(uploadFile).toHaveBeenCalledWith(repoB.state.workingTreeChanges[0].uri);
  });

  test('throws when there are no available repositories', async () => {
    getGitService.mockReturnValue({
      repositories: [],
    });

    await expect((command.handleCommand as any)(undefined)).rejects.toThrow(
      'There are no available repositories'
    );
  });
});

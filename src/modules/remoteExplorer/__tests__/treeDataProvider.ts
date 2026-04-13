const path = require('path').posix;

const showTextDocument = jest.fn();
const getAllFileService = jest.fn();
const getExtensionSetting = jest.fn();

class EventEmitterMock<T = any> {
  fire = jest.fn();
  event = jest.fn();
}

function createUri(remoteId: number, fsPath: string) {
  return {
    query: `${remoteId}:${fsPath}`,
    path: fsPath,
    toString: () => `sftp://${remoteId}${fsPath}`,
    with(changes) {
      return {
        ...this,
        ...changes,
      };
    },
  };
}

function createResource(remoteId: number, fsPath: string) {
  return {
    fsPath,
    remoteId,
    uri: createUri(remoteId, fsPath),
  };
}

const makeResource = jest.fn((input: any) => {
  if (input && input.query) {
    const divider = input.query.indexOf(':');
    return createResource(Number(input.query.slice(0, divider)), input.query.slice(divider + 1));
  }

  return createResource(input.remoteId, input.fsPath);
});

const updateResource = jest.fn((resource: any, option: { remotePath: string }) =>
  createResource(resource.remoteId, option.remotePath)
);

class IgnoreMock {
  patterns: string[];

  constructor(patterns: string[]) {
    this.patterns = patterns;
  }

  ignores(relativePath: string) {
    return this.patterns.some(pattern => pattern === relativePath || pattern === path.basename(relativePath));
  }
}

jest.mock('vscode', () => ({
  __esModule: true,
  EventEmitter: EventEmitterMock,
  TreeItemCollapsibleState: {
    Collapsed: 1,
  },
}));

jest.mock('../../../host', () => ({
  __esModule: true,
  showTextDocument,
}));

jest.mock('../../serviceManager', () => ({
  __esModule: true,
  getAllFileService,
}));

jest.mock('../../ext', () => ({
  __esModule: true,
  getExtensionSetting,
}));

jest.mock('../../../core', () => ({
  __esModule: true,
  upath: {
    basename: path.basename,
    relative: path.relative,
    dirname: path.dirname,
    join: path.join,
  },
  UResource: {
    makeResource,
    updateResource,
  },
  FileType: {
    Directory: 1,
    File: 2,
    SymbolicLink: 64,
  },
  Ignore: IgnoreMock,
}));

import RemoteTreeDataProvider from '../treeDataProvider';

describe('remoteExplorer/treeDataProvider', () => {
  const remoteFsA = {
    list: jest.fn(),
    readFile: jest.fn(),
  };
  const remoteFsB = {
    list: jest.fn(),
    readFile: jest.fn(),
  };

  const serviceA = {
    id: 2,
    name: 'Zulu',
    getConfig: () => ({
      host: 'zulu.example.com',
      port: 22,
      remotePath: '/remote/zulu',
      remoteExplorer: {
        order: 2,
        filesExclude: ['ignored.txt'],
      },
    }),
    getRemoteFileSystem: jest.fn().mockResolvedValue(remoteFsA),
  };
  const serviceB = {
    id: 1,
    name: 'Alpha',
    getConfig: () => ({
      host: 'alpha.example.com',
      port: 22,
      remotePath: '/remote/alpha',
      remoteExplorer: {
        order: 1,
        filesExclude: [],
      },
    }),
    getRemoteFileSystem: jest.fn().mockResolvedValue(remoteFsB),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    getAllFileService.mockReturnValue([serviceA, serviceB]);
    getExtensionSetting.mockReturnValue({
      downloadWhenOpenInRemoteExplorer: false,
    });
    remoteFsA.list.mockResolvedValue([
      { fspath: '/remote/zulu/folder', filename: 'folder', attrs: { size: 0, mode: 0o755, mtime: 1, atime: 1, isDirectory: () => true, isFile: () => false, isSymbolicLink: () => false }, type: 1 },
      { fspath: '/remote/zulu/file.txt', filename: 'file.txt', attrs: { size: 3, mode: 0o644, mtime: 1, atime: 1, isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false }, type: 2 },
      { fspath: '/remote/zulu/ignored.txt', filename: 'ignored.txt', attrs: { size: 3, mode: 0o644, mtime: 1, atime: 1, isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false }, type: 2 },
      { fspath: '/remote/zulu/.git', filename: '.git', attrs: { size: 0, mode: 0o755, mtime: 1, atime: 1, isDirectory: () => true, isFile: () => false, isSymbolicLink: () => false }, type: 1 },
    ]);
    remoteFsB.list.mockResolvedValue([]);
    remoteFsA.readFile.mockResolvedValue(Buffer.from('remote content'));
  });

  test('builds sorted roots and tree items with the expected labels and commands', async () => {
    const provider = new RemoteTreeDataProvider();
    const roots = await provider.getChildren();

    expect(roots).toHaveLength(2);
    expect(roots[0].resource.fsPath).toBe('/remote/alpha');
    expect(roots[1].resource.fsPath).toBe('/remote/zulu');

    const rootItem = provider.getTreeItem(roots[0] as any);
    expect(rootItem).toEqual(
      expect.objectContaining({
        label: 'Alpha',
        collapsibleState: 1,
        contextValue: 'root',
      })
    );

    const fileItem = {
      resource: createResource(2, '/remote/zulu/file.txt'),
      isDirectory: false,
    };

    expect(provider.getTreeItem(fileItem as any)).toEqual(
      expect.objectContaining({
        label: 'file.txt',
        contextValue: 'file',
        command: expect.objectContaining({
          arguments: [fileItem],
        }),
      })
    );

    getExtensionSetting.mockReturnValue({
      downloadWhenOpenInRemoteExplorer: true,
    });

    expect(provider.getTreeItem(fileItem as any).command.command).toBe('sftp.remoteExplorer.editInLocal');
  });

  test('lists filtered remote children, sorts directories first, and reuses cached items', async () => {
    const provider = new RemoteTreeDataProvider();
    const roots = await provider.getChildren();
    const children = await provider.getChildren(roots[1] as any);
    const childrenAgain = await provider.getChildren(roots[1] as any);

    expect(remoteFsA.list).toHaveBeenCalledWith('/remote/zulu');
    expect(children.map(child => child.resource.fsPath)).toEqual([
      '/remote/zulu/folder',
      '/remote/zulu/file.txt',
    ]);
    expect(children[0].isDirectory).toBe(true);
    expect(children[1].isDirectory).toBe(false);
    expect(childrenAgain[0]).toBe(children[0]);
    expect(childrenAgain[1]).toBe(children[1]);
  });

  test('refreshes the root, directories, and files with the expected events', async () => {
    const provider = new RemoteTreeDataProvider();
    const roots = await provider.getChildren();
    const root = roots[1];
    const children = await provider.getChildren(root as any);
    const folderFire = (provider as any)._onDidChangeFolder.fire as jest.Mock;
    const fileFire = (provider as any)._onDidChangeFile.fire as jest.Mock;

    await provider.refresh();
    expect(folderFire).toHaveBeenCalledWith();

    const rootsAfterReset = await provider.getChildren();
    const rootAfterReset = rootsAfterReset[1];

    folderFire.mockClear();
    fileFire.mockClear();
    await provider.refresh(rootAfterReset as any);
    expect(folderFire.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        explorerContext: expect.objectContaining({
          id: 2,
        }),
        resource: expect.objectContaining({
          fsPath: '/remote/zulu',
        }),
      })
    );
    expect(fileFire).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/~ file.txt',
      })
    );

    folderFire.mockClear();
    fileFire.mockClear();
    await provider.refresh(children[1] as any);
    expect(folderFire.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        resource: expect.objectContaining({
          fsPath: '/remote/zulu',
        }),
      })
    );
    expect(fileFire).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/~ file.txt',
      })
    );
  });

  test('finds parents and roots from the cached tree', async () => {
    const provider = new RemoteTreeDataProvider();

    expect(provider.findRoot(createUri(1, '/remote/alpha'))).toBeNull();

    const roots = await provider.getChildren();
    const root = roots[1];
    const children = await provider.getChildren(root as any);

    expect(provider.findRoot(root.resource.uri as any)).toBe(root);
    await expect(provider.getParent(root as any)).resolves.toBe(root);
    await expect(provider.getParent(children[1] as any)).resolves.toBe(root);

    const nestedFile = {
      resource: createResource(2, '/remote/zulu/folder/deep.txt'),
      isDirectory: false,
    };

    const nestedParent = await provider.getParent(nestedFile as any);
    expect(nestedParent).toEqual(
      expect.objectContaining({
        resource: expect.objectContaining({
          fsPath: '/remote/zulu/folder',
        }),
        isDirectory: true,
      })
    );
    await expect(provider.getParent(nestedFile as any)).resolves.toBe(nestedParent);
  });

  test('reads remote file content and surfaces missing-root errors', async () => {
    const provider = new RemoteTreeDataProvider();
    await provider.getChildren();

    await expect(
      provider.provideTextDocumentContent(createUri(2, '/remote/zulu/file.txt') as any, null as any)
    ).resolves.toBe('remote content');

    await expect(
      provider.provideTextDocumentContent(createUri(9, '/remote/missing.txt') as any, null as any)
    ).rejects.toThrow("Can't find remote for resource");
  });

  test('opens file items and ignores directories when asked to show them', async () => {
    const provider = new RemoteTreeDataProvider();
    const fileItem = {
      resource: createResource(2, '/remote/zulu/file.txt'),
      isDirectory: false,
    };
    const dirItem = {
      resource: createResource(2, '/remote/zulu/folder'),
      isDirectory: true,
    };

    provider.showItem(dirItem as any);
    provider.showItem(fileItem as any);

    expect(showTextDocument).toHaveBeenCalledTimes(1);
    expect(showTextDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/~ file.txt',
      })
    );
  });

  test('rejects unknown remote resources and leaves directory tree items without commands', async () => {
    const provider = new RemoteTreeDataProvider();
    await provider.getChildren();

    await expect(
      provider.getChildren({
        resource: createResource(9, '/remote/missing'),
        isDirectory: true,
      } as any)
    ).rejects.toThrow("Can't find config for remote resource");

    await expect(
      provider.getParent({
        resource: createResource(9, '/remote/missing/file.txt'),
        isDirectory: false,
      } as any)
    ).rejects.toThrow("Can't find config for remote resource");

    expect(
      provider.getTreeItem({
        resource: createResource(2, '/remote/zulu/folder'),
        isDirectory: true,
      } as any).command
    ).toBeUndefined();
  });

  test('getChildren falls back to DEFAULT_FILES_EXCLUDE when remoteExplorer.filesExclude is not configured', async () => {
    // Service without filesExclude in config
    const serviceC = {
      id: 3,
      name: 'NoExclude',
      getConfig: () => ({
        host: 'noexclude.example.com',
        port: 22,
        remotePath: '/remote/noexclude',
        remoteExplorer: {
          order: 3,
          // no filesExclude
        },
      }),
      getRemoteFileSystem: jest.fn().mockResolvedValue({
        list: jest.fn().mockResolvedValue([
          { fspath: '/remote/noexclude/file.txt', type: 2 },
          { fspath: '/remote/noexclude/.git', type: 1 },
          { fspath: '/remote/noexclude/.DS_Store', type: 2 },
        ]),
        readFile: jest.fn(),
      }),
    };

    getAllFileService.mockReturnValue([serviceC]);

    const provider = new RemoteTreeDataProvider();
    const roots = await provider.getChildren();
    const children = await provider.getChildren(roots[0] as any);

    // .git and .DS_Store should be filtered by DEFAULT_FILES_EXCLUDE
    expect(children.map(c => c.resource.fsPath)).toEqual(['/remote/noexclude/file.txt']);
  });

  test('getTreeItem uses basename for non-root items without a service name', async () => {
    const provider = new RemoteTreeDataProvider();
    await provider.getChildren();

    const nonRootItem = {
      resource: createResource(2, '/remote/zulu/folder'),
      isDirectory: true,
    };

    const treeItem = provider.getTreeItem(nonRootItem as any);
    expect(treeItem.label).toBe('folder');
  });

  test('refresh on non-directory item with parent fires folder and file events', async () => {
    const provider = new RemoteTreeDataProvider();
    await provider.getChildren();

    const folderFire = (provider as any)._onDidChangeFolder.fire as jest.Mock;
    const fileFire = (provider as any)._onDidChangeFile.fire as jest.Mock;

    // Get a child file from the zulu root
    const roots = await provider.getChildren();
    const children = await provider.getChildren(roots[1] as any);

    folderFire.mockClear();
    fileFire.mockClear();

    // Refresh the child file item - should fire both folder (parent) and file events
    await provider.refresh(children[1] as any);

    expect(folderFire).toHaveBeenCalled();
    expect(fileFire).toHaveBeenCalled();
  });

  test('provideTextDocumentContent reads file content from remote filesystem', async () => {
    const provider = new RemoteTreeDataProvider();
    await provider.getChildren();

    const result = await provider.provideTextDocumentContent(
      createUri(2, '/remote/zulu/file.txt') as any,
      null as any
    );

    expect(result).toBe('remote content');
  });
});

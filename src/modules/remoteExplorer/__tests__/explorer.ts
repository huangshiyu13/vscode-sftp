const registerTextDocumentContentProvider = jest.fn();
const createTreeView = jest.fn();
const registerCommand = jest.fn();
const getFileService = jest.fn();
const toRemotePath = jest.fn();
const isRemote = jest.fn();
const makeResource = jest.fn();
const updateResource = jest.fn();
const refresh = jest.fn();
const showItem = jest.fn();
const findRoot = jest.fn();
const reveal = jest.fn();

const providerInstance = {
  refresh,
  showItem,
  findRoot,
};

const treeView = {
  selection: [],
  reveal,
};

let activeTextEditor;

jest.mock('vscode', () => ({
  __esModule: true,
  workspace: {
    registerTextDocumentContentProvider,
  },
  window: {
    createTreeView,
    get activeTextEditor() {
      return activeTextEditor;
    },
  },
}));

jest.mock('../../../host', () => ({
  __esModule: true,
  registerCommand,
}));

jest.mock('../../../helper', () => ({
  __esModule: true,
  toRemotePath,
}));

jest.mock('../../serviceManager', () => ({
  __esModule: true,
  getFileService,
}));

jest.mock('../../../core', () => ({
  __esModule: true,
  UResource: {
    isRemote,
    makeResource,
    updateResource,
  },
}));

jest.mock('../treeDataProvider', () => ({
  __esModule: true,
  default: function() {
    return providerInstance;
  },
}));

import RemoteExplorer from '../index';

describe('remoteExplorer/explorer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    activeTextEditor = undefined;
    registerTextDocumentContentProvider.mockReturnValue({ dispose: jest.fn() });
    createTreeView.mockReturnValue(treeView);
    isRemote.mockReturnValue(true);
    toRemotePath.mockReturnValue('/remote/project/file.txt');
    getFileService.mockReturnValue({
      id: 8,
      getConfig: () => ({
        host: 'target.internal',
        port: 22,
        remotePath: '/remote/project',
        context: '/workspace/project',
      }),
    });
    makeResource.mockImplementation((input: any) => ({
      remoteId: input.remoteId || 8,
      fsPath: input.fsPath || '/remote/project/file.txt',
      uri: input.uri || input,
    }));
    updateResource.mockImplementation((_resource: any, option: any) => ({
      fsPath: option.remotePath,
      uri: { path: option.remotePath },
    }));
  });

  test('registers the provider, tree view, and explorer commands', () => {
    const context = {
      subscriptions: [],
    };

    new RemoteExplorer(context as any);

    expect(registerTextDocumentContentProvider).toHaveBeenCalledWith('remote', providerInstance);
    expect(createTreeView).toHaveBeenCalledWith(
      'remoteExplorer',
      expect.objectContaining({
        showCollapseAll: true,
        treeDataProvider: providerInstance,
        canSelectMany: true,
      })
    );
    expect(registerCommand.mock.calls.map(call => call[1])).toEqual([
      'sftp.remoteExplorer.refresh',
      'sftp.remoteExplorer.refreshActiveFile',
      'sftp.viewContent',
    ]);
  });

  test('refreshes remote items directly and translates local items to remote resources', () => {
    const explorer = new RemoteExplorer({ subscriptions: [] } as any);
    const remoteItem = {
      resource: {
        uri: {
          toString: () => 'sftp://remote/file.txt',
        },
      },
      isDirectory: false,
    };
    const localItem = {
      resource: {
        fsPath: '/workspace/project/file.txt',
        uri: {
          toString: () => 'file:///workspace/project/file.txt',
        },
      },
      isDirectory: false,
    };
    const localUri = localItem.resource.uri;

    explorer.refresh(remoteItem as any);
    isRemote.mockReturnValue(false);
    explorer.refresh(localItem as any);

    expect(refresh).toHaveBeenNthCalledWith(1, remoteItem);
    expect(getFileService).toHaveBeenCalledWith(localUri);
    expect(toRemotePath).toHaveBeenCalledWith(
      '/workspace/project/file.txt',
      '/workspace/project',
      '/remote/project'
    );
    expect(makeResource).toHaveBeenCalled();
    expect((refresh as jest.Mock).mock.calls[1][0].resource.fsPath).toBe('/remote/project/file.txt');
  });

  test('throws helpful errors when refreshing local items without a matching config', () => {
    const explorer = new RemoteExplorer({ subscriptions: [] } as any);
    const specialUri = {
      toString: () => 'file:///${command:sftp.sync.remoteToLocal}',
    };
    const localItem = {
      resource: {
        fsPath: '/workspace/project/file.txt',
        uri: specialUri,
      },
      isDirectory: false,
    };

    isRemote.mockReturnValue(false);
    getFileService.mockReturnValue(undefined);

    expect(() => explorer.refresh(localItem as any)).toThrow('');

    localItem.resource.uri = {
      toString: () => 'file:///workspace/project/file.txt',
    };
    expect(() => explorer.refresh(localItem as any)).toThrow(
      'Config Not Found. (file:///workspace/project/file.txt)'
    );
  });

  test('reveals items, finds roots, and refreshes selection-based commands', async () => {
    const explorer = new RemoteExplorer({ subscriptions: [] } as any);
    const item = {
      resource: {
        uri: {
          toString: () => 'sftp://remote/file.txt',
        },
      },
      isDirectory: false,
    };
    const refreshSelectionCallback = registerCommand.mock.calls[0][2];
    const viewContentCallback = registerCommand.mock.calls[2][2];

    treeView.selection = [item];
    refresh.mockClear();
    refreshSelectionCallback();
    expect(refresh).toHaveBeenCalledWith(item);

    treeView.selection = [];
    refresh.mockClear();
    refreshSelectionCallback();
    expect(refresh).toHaveBeenCalledWith(undefined);

    expect(explorer.reveal(item as any)).toBeUndefined();
    await expect(explorer.reveal(undefined as any)).resolves.toBeUndefined();
    expect(reveal).toHaveBeenCalledWith(item);

    findRoot.mockReturnValue('root');
    expect(explorer.findRoot({ query: '8:/remote/file.txt' } as any)).toBe('root');

    viewContentCallback(item);
    expect(showItem).toHaveBeenCalledWith(item);
  });

  test('refreshes the active remote file when the command is invoked', () => {
    const explorer = new RemoteExplorer({ subscriptions: [] } as any);
    const refreshActiveFileCallback = registerCommand.mock.calls[1][2];
    const root = {
      resource: {
        fsPath: '/remote/project',
        uri: { path: '/remote/project' },
      },
    };

    activeTextEditor = {
      document: {
        uri: { path: '/remote/project/file.txt' },
      },
    };
    findRoot.mockReturnValue(root);
    makeResource.mockReturnValue({
      fsPath: '/remote/project/file.txt',
    });
    updateResource.mockReturnValue({
      fsPath: '/remote/project/file.txt',
      uri: { path: '/remote/project/file.txt' },
    });

    refreshActiveFileCallback();

    expect(refresh).toHaveBeenCalledWith({
      resource: {
        fsPath: '/remote/project/file.txt',
        uri: { path: '/remote/project/file.txt' },
      },
      isDirectory: false,
    });

    refresh.mockClear();
    findRoot.mockReturnValue(undefined);
    refreshActiveFileCallback();
    expect(refresh).not.toHaveBeenCalled();
  });
});

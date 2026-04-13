const initCommands = jest.fn();
const reportError = jest.fn();
const fileActivityMonitor = {
  init: jest.fn(),
  destory: jest.fn(),
};
const tryLoadConfigs = jest.fn();
const getAllFileService = jest.fn();
const createFileService = jest.fn();
const disposeFileService = jest.fn();
const getWorkspaceFolders = jest.fn();
const setContextValue = jest.fn();
const remoteExplorerRefresh = jest.fn();
const subscribe = jest.fn();
const show = jest.fn();
const reset = jest.fn();
const getText = jest.fn();
const RemoteExplorer = jest.fn();

const app = {
  sftpBarItem: {
    show: (...args) => show(...args),
    reset: (...args) => reset(...args),
    getText: (...args) => getText(...args),
  },
  state: {
    subscribe: (...args) => subscribe(...args),
  },
  remoteExplorer: {
    refresh: (...args) => remoteExplorerRefresh(...args),
  },
};

jest.mock('../initCommands', () => ({
  __esModule: true,
  default: (...args) => initCommands(...args),
}));

jest.mock('../helper', () => ({
  __esModule: true,
  reportError: (...args) => reportError(...args),
}));

jest.mock('../modules/fileActivityMonitor', () => ({
  __esModule: true,
  default: fileActivityMonitor,
}));

jest.mock('../modules/config', () => ({
  __esModule: true,
  tryLoadConfigs: (...args) => tryLoadConfigs(...args),
}));

jest.mock('../modules/serviceManager', () => ({
  __esModule: true,
  getAllFileService: (...args) => getAllFileService(...args),
  createFileService: (...args) => createFileService(...args),
  disposeFileService: (...args) => disposeFileService(...args),
}));

jest.mock('../host', () => ({
  __esModule: true,
  getWorkspaceFolders: (...args) => getWorkspaceFolders(...args),
  setContextValue: (...args) => setContextValue(...args),
}));

jest.mock('../modules/remoteExplorer', () => ({
  __esModule: true,
  default: function(...args) {
    return RemoteExplorer(...args);
  },
}));

jest.mock('../app', () => ({
  __esModule: true,
  default: app,
}));

import { activate, deactivate } from '../extension';

describe('extension', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getText.mockReturnValue('SFTP [prod]');
    getWorkspaceFolders.mockReturnValue([
      { uri: { fsPath: '/workspace/a' } },
      { uri: { fsPath: '/workspace/b' } },
    ]);
    tryLoadConfigs
      .mockResolvedValueOnce([{ name: 'one' }, { name: 'two' }])
      .mockResolvedValueOnce([{ name: 'three' }]);
    RemoteExplorer.mockImplementation(() => ({
      refresh: remoteExplorerRefresh,
    }));
    getAllFileService.mockReturnValue([{ id: 1 }, { id: 2 }]);
    subscribe.mockImplementation(callback => {
      (subscribe as any).callback = callback;
      return { dispose: jest.fn() };
    });
    app.remoteExplorer = {
      refresh: remoteExplorerRefresh,
    };
  });

  test('activates the extension, creates file services, and refreshes explorer state changes', async () => {
    const context = {
      subscriptions: [],
    };

    await activate(context as any);

    expect(initCommands).toHaveBeenCalledWith(context);
    expect(fileActivityMonitor.init).toHaveBeenCalledTimes(1);
    expect(setContextValue).toHaveBeenCalledWith('enabled', true);
    expect(show).toHaveBeenCalledTimes(1);
    expect(tryLoadConfigs).toHaveBeenCalledWith('/workspace/a');
    expect(tryLoadConfigs).toHaveBeenCalledWith('/workspace/b');
    expect(createFileService).toHaveBeenCalledTimes(3);
    expect(createFileService).toHaveBeenCalledWith({ name: 'one' }, '/workspace/a');
    expect(createFileService).toHaveBeenCalledWith({ name: 'three' }, '/workspace/b');
    expect(RemoteExplorer).toHaveBeenCalledWith(context);

    (subscribe as any).callback({});

    expect(reset).toHaveBeenCalledTimes(1);
    expect(remoteExplorerRefresh).toHaveBeenCalled();
  });

  test('reports init command and setup failures and exits early without workspaces', async () => {
    initCommands.mockImplementationOnce(() => {
      throw new Error('init failed');
    });
    getWorkspaceFolders.mockReturnValueOnce(undefined);

    await activate({ subscriptions: [] } as any);

    expect(reportError).toHaveBeenCalledWith(expect.any(Error), 'initCommands');
    expect(setContextValue).not.toHaveBeenCalled();

    getWorkspaceFolders.mockReturnValueOnce([{ uri: { fsPath: '/workspace/a' } }]);
    tryLoadConfigs.mockReset();
    tryLoadConfigs.mockRejectedValueOnce(new Error('setup failed'));

    await activate({ subscriptions: [] } as any);

    expect(reportError).toHaveBeenCalledWith(expect.any(Error));
  });

  test('deactivates file monitoring and disposes every file service', () => {
    deactivate();

    expect(fileActivityMonitor.destory).toHaveBeenCalledTimes(1);
    expect(disposeFileService).toHaveBeenCalledTimes(2);
    expect((disposeFileService as jest.Mock).mock.calls.map(call => call[0])).toEqual([
      { id: 1 },
      { id: 2 },
    ]);
  });
});

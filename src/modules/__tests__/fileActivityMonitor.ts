const createFileSystemWatcher: any = jest.fn();
const getWorkspaceFolder: any = jest.fn();
const onDidOpenTextDocument: any = jest.fn();
const onDidSaveTextDocument: any = jest.fn();

jest.mock('vscode', () => ({
  workspace: {
    createFileSystemWatcher,
    getWorkspaceFolder,
  },
}));

jest.mock('../../logger', () => ({
  __esModule: true,
  default: {
    trace: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    critical: jest.fn(),
  },
}));

const refresh: any = jest.fn();

jest.mock('../../app', () => ({
  __esModule: true,
  default: {
    fsCache: new Map(),
    remoteExplorer: {
      refresh: (...args) => refresh(...args),
    },
    sftpBarItem: {
      updateStatus: jest.fn(),
    },
  },
}));

const readConfigsFromFile: any = jest.fn();
const createFileService: any = jest.fn();
const findAllFileService: any = jest.fn();
const disposeFileService: any = jest.fn();

jest.mock('../config', () => ({
  __esModule: true,
  readConfigsFromFile,
}));

jest.mock('../serviceManager', () => ({
  __esModule: true,
  createFileService,
  getFileService: jest.fn(),
  findAllFileService,
  disposeFileService,
}));

jest.mock('../../host', () => ({
  __esModule: true,
  onDidOpenTextDocument,
  onDidSaveTextDocument,
  showConfirmMessage: jest.fn(),
}));

jest.mock('../../helper', () => ({
  __esModule: true,
  reportError: jest.fn(),
  isValidFile: jest.fn(() => true),
  isConfigFile: jest.fn(uri => uri.fsPath.endsWith('sftp.json')),
  isInWorkspace: jest.fn(() => true),
}));

jest.mock('../../fileHandlers', () => ({
  __esModule: true,
  downloadFile: jest.fn(),
  uploadFile: jest.fn(),
}));

import fileActivityMonitor from '../fileActivityMonitor';

function flushPromises() {
  return new Promise(resolve => setImmediate(resolve));
}

describe('fileActivityMonitor config watcher', () => {
  let watcherHandlers: {
    change?: (uri: any) => void;
    create?: (uri: any) => void;
  };
  let watcherDisposable;
  let saveDisposable;

  beforeEach(() => {
    watcherHandlers = {};
    watcherDisposable = { dispose: jest.fn() };
    saveDisposable = { dispose: jest.fn() };

    createFileSystemWatcher.mockImplementation(() => ({
      onDidChange: jest.fn(listener => {
        watcherHandlers.change = listener;
      }),
      onDidCreate: jest.fn(listener => {
        watcherHandlers.create = listener;
      }),
      dispose: watcherDisposable.dispose,
    }));

    onDidSaveTextDocument.mockImplementation(() => saveDisposable);
    onDidOpenTextDocument.mockImplementation(() => saveDisposable);

    getWorkspaceFolder.mockReturnValue({
      uri: {
        fsPath: '/workspace/project',
      },
    });

    findAllFileService.mockImplementation(predicate =>
      [{ workspace: '/workspace/project' }].filter(predicate)
    );
    readConfigsFromFile.mockResolvedValue([
      {
        name: 'Test',
        host: 'target.internal',
      },
    ]);
  });

  afterEach(() => {
    fileActivityMonitor.destory();
    jest.clearAllMocks();
  });

  test('reloads configs when sftp.json changes outside the editor', async () => {
    const uri = {
      fsPath: '/workspace/project/.vscode/sftp.json',
    } as any;

    fileActivityMonitor.init();
    watcherHandlers.change!(uri);
    await flushPromises();
    await flushPromises();

    expect(createFileSystemWatcher).toHaveBeenCalledWith(
      '**/.vscode/sftp.json',
      false,
      false,
      true
    );
    expect(readConfigsFromFile).toHaveBeenCalledWith(uri.fsPath);
    expect(disposeFileService).toHaveBeenCalledTimes(1);
    expect(createFileService).toHaveBeenCalledWith(
      {
        name: 'Test',
        host: 'target.internal',
      },
      '/workspace/project'
    );
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

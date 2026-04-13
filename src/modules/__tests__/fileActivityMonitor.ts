const onDidSaveTextDocumentMock = jest.fn().mockReturnValue({ dispose: jest.fn() });
const onDidOpenTextDocumentMock = jest.fn().mockReturnValue({ dispose: jest.fn() });
const createFileSystemWatcherMock = jest.fn().mockReturnValue({
  onDidChange: jest.fn(),
  onDidCreate: jest.fn(),
  dispose: jest.fn(),
});
const getWorkspaceFolderMock = jest.fn();

jest.mock('vscode', () => ({
  __esModule: true,
  Uri: {
    file: (path: string) => ({ fsPath: path, scheme: 'file' }),
  },
  workspace: {
    onDidSaveTextDocument: onDidSaveTextDocumentMock,
    onDidOpenTextDocument: onDidOpenTextDocumentMock,
    createFileSystemWatcher: createFileSystemWatcherMock,
    getWorkspaceFolder: getWorkspaceFolderMock,
  },
}));

jest.mock('fs', () => ({
  __esModule: true,
  realpathSync: {
    native: jest.fn().mockImplementation((p: string) => p),
  },
}));

const loggerInfoMock = jest.fn();
const loggerErrorMock = jest.fn();

jest.mock('../../logger', () => ({
  __esModule: true,
  default: {
    info: loggerInfoMock,
    error: loggerErrorMock,
  },
}));

const refreshMock = jest.fn();
const updateStatusMock = jest.fn();

jest.mock('../../app', () => ({
  __esModule: true,
  default: {
    remoteExplorer: { refresh: refreshMock },
    sftpBarItem: { updateStatus: updateStatusMock },
    fsCache: {
      has: jest.fn().mockReturnValue(false),
      del: jest.fn(),
    },
  },
}));

const showConfirmMessageMock = jest.fn().mockResolvedValue(true);

jest.mock('../../host', () => ({
  __esModule: true,
  onDidSaveTextDocument: onDidSaveTextDocumentMock,
  onDidOpenTextDocument: onDidOpenTextDocumentMock,
  showConfirmMessage: showConfirmMessageMock,
}));

jest.mock('../config', () => ({
  __esModule: true,
  readConfigsFromFile: jest.fn().mockResolvedValue([]),
}));

const getFileServiceMock = jest.fn();
const createFileServiceMock = jest.fn();
const findAllFileServiceMock = jest.fn().mockReturnValue([]);
const disposeFileServiceMock = jest.fn();

jest.mock('../serviceManager', () => ({
  __esModule: true,
  getFileService: getFileServiceMock,
  createFileService: createFileServiceMock,
  findAllFileService: findAllFileServiceMock,
  disposeFileService: disposeFileServiceMock,
}));

const isValidFileMock = jest.fn().mockReturnValue(true);
const isConfigFileMock = jest.fn().mockReturnValue(false);
const isInWorkspaceMock = jest.fn().mockReturnValue(true);
const reportErrorMock = jest.fn();

jest.mock('../../helper', () => ({
  __esModule: true,
  reportError: reportErrorMock,
  isValidFile: isValidFileMock,
  isConfigFile: isConfigFileMock,
  isInWorkspace: isInWorkspaceMock,
}));

const uploadFileMock = jest.fn().mockResolvedValue(undefined);
const downloadFileMock = jest.fn().mockResolvedValue(undefined);

jest.mock('../../fileHandlers', () => ({
  __esModule: true,
  uploadFile: uploadFileMock,
  downloadFile: downloadFileMock,
}));

jest.mock('../../ui/statusBarItem', () => ({
  __esModule: true,
  default: {
    Status: {
      ok: 1,
      warn: 2,
      error: 3,
    },
  },
}));

import fileActivityMonitor from '../fileActivityMonitor';
import { isValidFile, isConfigFile, isInWorkspace } from '../../helper';
import { readConfigsFromFile } from '../config';
import app from '../../app';

const StatusBarItemStatus = { ok: 1, warn: 2, error: 3 };

describe('modules/fileActivityMonitor', () => {
  let saveCallback: any;
  let openCallback: any;
  let configChangeCallback: any;
  let configCreateCallback: any;

  beforeEach(() => {
    jest.clearAllMocks();

    onDidSaveTextDocumentMock.mockImplementation((cb: any) => {
      saveCallback = cb;
      return { dispose: jest.fn() };
    });
    onDidOpenTextDocumentMock.mockImplementation((cb: any) => {
      openCallback = cb;
      return { dispose: jest.fn() };
    });
    createFileSystemWatcherMock.mockReturnValue({
      onDidChange: jest.fn().mockImplementation((cb: any) => {
        configChangeCallback = cb;
      }),
      onDidCreate: jest.fn().mockImplementation((cb: any) => {
        configCreateCallback = cb;
      }),
      dispose: jest.fn(),
    });
  });

  describe('init', () => {
    test('registers save and open document listeners', () => {
      fileActivityMonitor.init();

      expect(onDidOpenTextDocumentMock).toHaveBeenCalled();
      expect(onDidSaveTextDocumentMock).toHaveBeenCalled();
      expect(createFileSystemWatcherMock).toHaveBeenCalled();
    });
  });

  describe('handleFileSave', () => {
    test('skips invalid files', () => {
      fileActivityMonitor.init();
      isValidFileMock.mockReturnValue(false);

      saveCallback({ uri: { fsPath: '/test/file.txt' } });
      expect(getFileServiceMock).not.toHaveBeenCalled();
    });

    test('skips files not in workspace', () => {
      fileActivityMonitor.init();
      isValidFileMock.mockReturnValue(true);
      isInWorkspaceMock.mockReturnValue(false);

      saveCallback({ uri: { fsPath: '/test/file.txt' } });
      expect(getFileServiceMock).not.toHaveBeenCalled();
    });

    test('skips when no fileService found', () => {
      fileActivityMonitor.init();
      isValidFileMock.mockReturnValue(true);
      isInWorkspaceMock.mockReturnValue(true);
      getFileServiceMock.mockReturnValue(null);

      saveCallback({ uri: { fsPath: '/test/file.txt' } });
    });

    test('skips when uploadOnSave is false', () => {
      fileActivityMonitor.init();
      getFileServiceMock.mockReturnValue({
        getConfig: () => ({ uploadOnSave: false }),
      });

      saveCallback({ uri: { fsPath: '/test/file.txt' } });
      expect(uploadFileMock).not.toHaveBeenCalled();
    });

    test('uploads file when uploadOnSave is true', async () => {
      fileActivityMonitor.init();
      getFileServiceMock.mockReturnValue({
        getConfig: () => ({ uploadOnSave: true }),
      });

      saveCallback({ uri: { fsPath: '/test/file.txt' } });

      // Need multiple ticks for async handleFileSave
      for (let i = 0; i < 10; i++) {
        await Promise.resolve();
      }

      expect(uploadFileMock).toHaveBeenCalled();
    });

    test('updates status bar on upload error', async () => {
      fileActivityMonitor.init();
      getFileServiceMock.mockReturnValue({
        getConfig: () => ({ uploadOnSave: true }),
      });
      uploadFileMock.mockRejectedValueOnce(new Error('upload failed'));

      saveCallback({ uri: { fsPath: '/test/file.txt' } });

      // Need multiple ticks for async handleFileSave + error handling
      for (let i = 0; i < 10; i++) {
        await Promise.resolve();
      }

      expect(loggerErrorMock).toHaveBeenCalled();
      expect(updateStatusMock).toHaveBeenCalledWith(StatusBarItemStatus.error);
    });

    test('deletes fsCache entry if present', () => {
      fileActivityMonitor.init();
      getFileServiceMock.mockReturnValue({
        getConfig: () => ({ uploadOnSave: false }),
      });
      (app.fsCache.has as jest.Mock).mockReturnValue(true);

      saveCallback({ uri: { fsPath: '/test/file.txt' } });

      expect(app.fsCache.del).toHaveBeenCalledWith('/test/file.txt');
    });
  });

  describe('handleConfigSave', () => {
    test('disposes old services and creates new ones on config save', async () => {
      fileActivityMonitor.init();
      const config = { host: 'new-host', remotePath: '/remote' };
      (readConfigsFromFile as jest.Mock).mockResolvedValue([config]);
      getWorkspaceFolderMock.mockReturnValue({ uri: { fsPath: '/workspace' } });
      findAllFileServiceMock.mockReturnValue([{ workspace: '/workspace' }]);
      isConfigFileMock.mockReturnValue(true);

      saveCallback({ uri: { fsPath: '/workspace/.vscode/sftp.json' } });

      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(disposeFileServiceMock).toHaveBeenCalled();
      expect(createFileServiceMock).toHaveBeenCalledWith(config, '/workspace');
      expect(refreshMock).toHaveBeenCalled();
    });

    test('reports config reload failures and still refreshes the explorer', async () => {
      fileActivityMonitor.init();
      getWorkspaceFolderMock.mockReturnValue({ uri: { fsPath: '/workspace' } });
      findAllFileServiceMock.mockReturnValue([{ workspace: '/workspace' }]);
      isConfigFileMock.mockReturnValue(true);
      (readConfigsFromFile as jest.Mock).mockRejectedValueOnce(new Error('broken config'));

      saveCallback({ uri: { fsPath: '/workspace/.vscode/sftp.json' } });

      for (let i = 0; i < 5; i++) {
        await Promise.resolve();
      }

      expect(reportErrorMock).toHaveBeenCalledWith(expect.any(Error));
      expect(refreshMock).toHaveBeenCalled();
    });

    test('skips config save when no workspace folder', async () => {
      fileActivityMonitor.init();
      getWorkspaceFolderMock.mockReturnValue(undefined);
      isConfigFileMock.mockReturnValue(true);

      saveCallback({ uri: { fsPath: '/workspace/.vscode/sftp.json' } });

      await Promise.resolve();

      expect(findAllFileServiceMock).not.toHaveBeenCalled();
    });
  });

  describe('downloadOnOpen', () => {
    test('skips when no fileService found', () => {
      fileActivityMonitor.init();
      getFileServiceMock.mockReturnValue(null);

      openCallback({ uri: { fsPath: '/test/file.txt' } });
    });

    test('skips when downloadOnOpen is false', () => {
      fileActivityMonitor.init();
      getFileServiceMock.mockReturnValue({
        getConfig: () => ({ downloadOnOpen: false }),
      });

      openCallback({ uri: { fsPath: '/test/file.txt' } });
      expect(downloadFileMock).not.toHaveBeenCalled();
    });

    test('downloads file when downloadOnOpen is true', async () => {
      fileActivityMonitor.init();
      getFileServiceMock.mockReturnValue({
        getConfig: () => ({ downloadOnOpen: true }),
      });

      openCallback({ uri: { fsPath: '/test/file.txt' } });

      await Promise.resolve();
      await Promise.resolve();

      expect(downloadFileMock).toHaveBeenCalled();
    });

    test('shows confirm when downloadOnOpen is confirm and user declines', async () => {
      fileActivityMonitor.init();
      getFileServiceMock.mockReturnValue({
        getConfig: () => ({ downloadOnOpen: 'confirm' }),
      });
      showConfirmMessageMock.mockResolvedValue(false);

      openCallback({ uri: { fsPath: '/test/file.txt' } });

      await Promise.resolve();
      await Promise.resolve();

      expect(downloadFileMock).not.toHaveBeenCalled();
    });

    test('logs error on download error', async () => {
      fileActivityMonitor.init();
      getFileServiceMock.mockReturnValue({
        getConfig: () => ({ downloadOnOpen: true }),
      });
      downloadFileMock.mockRejectedValueOnce(new Error('download failed'));

      openCallback({ uri: { fsPath: '/test/file.txt' } });

      for (let i = 0; i < 10; i++) {
        await Promise.resolve();
      }

      expect(loggerErrorMock).toHaveBeenCalled();
      expect(updateStatusMock).toHaveBeenCalledWith(StatusBarItemStatus.error);
    });

    test('watches config file changes and creations', async () => {
      fileActivityMonitor.init();
      getWorkspaceFolderMock.mockReturnValue({ uri: { fsPath: '/workspace' } });
      isConfigFileMock.mockReturnValue(true);

      configChangeCallback({ fsPath: '/workspace/.vscode/sftp.json' });
      configCreateCallback({ fsPath: '/workspace/.vscode/sftp.json' });

      for (let i = 0; i < 5; i++) {
        await Promise.resolve();
      }

      expect(loggerInfoMock).toHaveBeenCalledWith('[config-change] /workspace/.vscode/sftp.json');
      expect(loggerInfoMock).toHaveBeenCalledWith('[config-create] /workspace/.vscode/sftp.json');
      expect(refreshMock).toHaveBeenCalled();
    });
  });

  describe('destory', () => {
    test('destory disposes watchers', () => {
      const disposeMock = jest.fn();
      onDidSaveTextDocumentMock.mockReturnValue({ dispose: disposeMock });
      createFileSystemWatcherMock.mockReturnValue({
        onDidChange: jest.fn(),
        onDidCreate: jest.fn(),
        dispose: disposeMock,
      });

      fileActivityMonitor.init();
      fileActivityMonitor.destory();

      expect(disposeMock).toHaveBeenCalled();
    });
  });
});

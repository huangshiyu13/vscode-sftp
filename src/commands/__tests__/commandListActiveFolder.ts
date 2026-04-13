const showTextDocument = jest.fn();
const downloadFile = jest.fn();
const downloadFolder = jest.fn();
const getActiveFolder = jest.fn();
const handleCtxFromUri = jest.fn();
const listFiles = jest.fn();
const toLocalPath = jest.fn();

jest.mock('vscode', () => ({
  __esModule: true,
  Uri: {
    file: (fsPath: string) => ({ fsPath }),
  },
}));

jest.mock('../../host', () => ({
  __esModule: true,
  showTextDocument: (...args) => showTextDocument(...args),
}));

jest.mock('../../fileHandlers', () => ({
  __esModule: true,
  downloadFile: (...args) => downloadFile(...args),
  downloadFolder: (...args) => downloadFolder(...args),
  handleCtxFromUri: (...args) => handleCtxFromUri(...args),
}));

jest.mock('../shared', () => ({
  __esModule: true,
  getActiveFolder: (...args) => getActiveFolder(...args),
}));

jest.mock('../../helper', () => ({
  __esModule: true,
  listFiles: (...args) => listFiles(...args),
  toLocalPath: (...args) => toLocalPath(...args),
}));

jest.mock('../../core', () => ({
  __esModule: true,
  FileType: {
    File: 1,
    Directory: 2,
  },
}));

jest.mock('../abstract/createCommand', () => ({
  __esModule: true,
  checkCommand: (option: any) => option,
}));

import commandListActiveFolder from '../commandListActiveFolder';

describe('commandListActiveFolder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns early when there is no active folder or no selected remote entry', async () => {
    getActiveFolder.mockReturnValue(undefined);

    await commandListActiveFolder.handleCommand();

    expect(handleCtxFromUri).not.toHaveBeenCalled();

    getActiveFolder.mockReturnValue({ fsPath: '/workspace/project' });
    handleCtxFromUri.mockReturnValue({
      config: {
        remotePath: '/remote/project',
      },
      target: {
        remoteFsPath: '/remote/project',
      },
      fileService: {
        baseDir: '/workspace/project',
        getRemoteFileSystem: jest.fn().mockResolvedValue({
          list: jest.fn().mockResolvedValue([]),
        }),
      },
    });
    listFiles.mockResolvedValue(undefined);

    await commandListActiveFolder.handleCommand();

    expect(listFiles).toHaveBeenCalled();
    expect(downloadFile).not.toHaveBeenCalled();
  });

  test('downloads a selected file and reveals it locally', async () => {
    getActiveFolder.mockReturnValue({ fsPath: '/workspace/project' });
    handleCtxFromUri.mockReturnValue({
      config: {
        remotePath: '/remote/project',
      },
      target: {
        remoteFsPath: '/remote/project',
      },
      fileService: {
        baseDir: '/workspace/project',
        getRemoteFileSystem: jest.fn().mockResolvedValue({
          list: jest.fn().mockResolvedValue([
            {
              fspath: '/remote/project/file.txt',
              type: 1,
            },
          ]),
        }),
      },
    });
    listFiles.mockResolvedValue({
      fsPath: '/remote/project/file.txt',
      type: 1,
    });
    toLocalPath.mockReturnValue('/workspace/project/file.txt');
    showTextDocument.mockRejectedValueOnce(new Error('editor closed'));

    await commandListActiveFolder.handleCommand();

    expect(downloadFile).toHaveBeenCalledWith({ fsPath: '/workspace/project/file.txt' });
    expect(showTextDocument).toHaveBeenCalledWith({ fsPath: '/workspace/project/file.txt' });
  });

  test('downloads a selected directory without trying to open it', async () => {
    getActiveFolder.mockReturnValue({ fsPath: '/workspace/project' });
    handleCtxFromUri.mockReturnValue({
      config: {
        remotePath: '/remote/project',
      },
      target: {
        remoteFsPath: '/remote/project',
      },
      fileService: {
        baseDir: '/workspace/project',
        getRemoteFileSystem: jest.fn().mockResolvedValue({
          list: jest.fn().mockResolvedValue([
            {
              fspath: '/remote/project/folder',
              type: 2,
            },
          ]),
        }),
      },
    });
    listFiles.mockResolvedValue({
      fsPath: '/remote/project/folder',
      type: 2,
    });
    toLocalPath.mockReturnValue('/workspace/project/folder');

    await commandListActiveFolder.handleCommand();

    expect(downloadFolder).toHaveBeenCalledWith({ fsPath: '/workspace/project/folder' });
    expect(showTextDocument).not.toHaveBeenCalled();
  });
});

const removeFileMock = jest.fn().mockResolvedValue(undefined);
const removeDirMock = jest.fn().mockResolvedValue(undefined);
const refreshRemoteExplorerMock = jest.fn();
const warnMock = jest.fn();
const lstatMock = jest.fn();

jest.mock('../../core', () => ({
  __esModule: true,
  fileOperations: {
    removeFile: (...args) => removeFileMock(...args),
    removeDir: (...args) => removeDirMock(...args),
  },
  FileType: {
    File: 1,
    Directory: 2,
    SymbolicLink: 64,
    Unknown: 0,
  },
}));

jest.mock('../../logger', () => ({
  __esModule: true,
  default: {
    warn: (...args) => warnMock(...args),
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../shared', () => ({
  __esModule: true,
  refreshRemoteExplorer: refreshRemoteExplorerMock,
}));

jest.mock('../createFileHandler', () => ({
  __esModule: true,
  default: (option: any) => option,
  FileHandlerContext: class {},
}));

import { removeRemote } from '../remove';

describe('fileHandlers/remove', () => {
  const remoteFs = {
    lstat: lstatMock,
  };
  const context: any = {
    config: {
      ignore: undefined,
    },
    fileService: {
      getRemoteFileSystem: jest.fn().mockResolvedValue(remoteFs),
    },
    target: {
      remoteFsPath: '/remote/project/file.txt',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    context.fileService.getRemoteFileSystem.mockResolvedValue(remoteFs);
  });

  test('removes a regular file', async () => {
    lstatMock.mockResolvedValue({ type: 1 }); // FileType.File
    await removeRemote.handle.call(context, {});
    expect(removeFileMock).toHaveBeenCalledWith('/remote/project/file.txt', remoteFs, {});
    expect(removeDirMock).not.toHaveBeenCalled();
  });

  test('removes a symbolic link', async () => {
    lstatMock.mockResolvedValue({ type: 64 }); // FileType.SymbolicLink
    await removeRemote.handle.call(context, {});
    expect(removeFileMock).toHaveBeenCalledWith('/remote/project/file.txt', remoteFs, {});
  });

  test('removes a directory when skipDir is not set', async () => {
    lstatMock.mockResolvedValue({ type: 2 }); // FileType.Directory
    await removeRemote.handle.call(context, {});
    expect(removeDirMock).toHaveBeenCalledWith('/remote/project/file.txt', remoteFs, {});
  });

  test('skips directory when skipDir is true', async () => {
    lstatMock.mockResolvedValue({ type: 2 }); // FileType.Directory
    await removeRemote.handle.call(context, { skipDir: true });
    expect(removeDirMock).not.toHaveBeenCalled();
    expect(removeFileMock).not.toHaveBeenCalled();
  });

  test('warns for unsupported file type', async () => {
    lstatMock.mockResolvedValue({ type: 0 }); // FileType.Unknown
    await removeRemote.handle.call(context, {});
    expect(warnMock).toHaveBeenCalledWith(
      expect.stringContaining('Unsupported file type')
    );
    expect(removeFileMock).not.toHaveBeenCalled();
    expect(removeDirMock).not.toHaveBeenCalled();
  });

  test('transformOption returns config ignore', () => {
    context.config.ignore = jest.fn();
    const option = removeRemote.transformOption.call(context);
    expect(option.ignore).toBe(context.config.ignore);
  });

  test('afterHandle refreshes remote explorer with false', () => {
    removeRemote.afterHandle.call(context);
    expect(refreshRemoteExplorerMock).toHaveBeenCalledWith(context.target, false);
  });
});

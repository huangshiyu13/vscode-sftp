const createFile = jest.fn();
const createDir = jest.fn();
const removeDir = jest.fn();
const removeFile = jest.fn();
const rename = jest.fn();
const warn = jest.fn();
const refreshRemoteExplorer = jest.fn();

jest.mock('../createFileHandler', () => ({
  __esModule: true,
  default: (option: any) => option,
}));

jest.mock('../shared', () => ({
  __esModule: true,
  refreshRemoteExplorer: (...args) => refreshRemoteExplorer(...args),
}));

jest.mock('../../logger', () => ({
  __esModule: true,
  default: {
    warn: (...args) => warn(...args),
  },
}));

jest.mock('../../core', () => ({
  __esModule: true,
  fileOperations: {
    createFile: (...args) => createFile(...args),
    createDir: (...args) => createDir(...args),
    removeDir: (...args) => removeDir(...args),
    removeFile: (...args) => removeFile(...args),
    rename: (...args) => rename(...args),
  },
  FileType: {
    Directory: 1,
    File: 2,
    SymbolicLink: 3,
    Unknown: 4,
  },
}));

import { createRemoteFile, createRemoteFolder } from '../create';
import { removeRemote } from '../remove';
import { renameRemote } from '../rename';

describe('fileHandlers operation wrappers', () => {
  const createRemoteFileHandler: any = createRemoteFile;
  const createRemoteFolderHandler: any = createRemoteFolder;
  const removeRemoteHandler: any = removeRemote;
  const renameRemoteHandler: any = renameRemote;
  const remoteFs = {
    lstat: jest.fn() as any,
  };
  const context: any = {
    config: {
      ignore: jest.fn(),
    },
    fileService: {
      getRemoteFileSystem: jest.fn().mockResolvedValue(remoteFs),
    },
    target: {
      remoteFsPath: '/remote/project/file.txt',
      localFsPath: '/remote/project/renamed.txt',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    context.fileService.getRemoteFileSystem.mockResolvedValue(remoteFs);
    remoteFs.lstat.mockReset();
  });

  test('createRemoteFile and createRemoteFolder call the expected file operations', async () => {
    await createRemoteFileHandler.handle.call(context, {});
    await createRemoteFolderHandler.handle.call(context, {});

    expect(context.fileService.getRemoteFileSystem).toHaveBeenCalledWith(context.config);
    expect(createFile).toHaveBeenCalledWith('/remote/project/file.txt', remoteFs, {});
    expect(createDir).toHaveBeenCalledWith('/remote/project/file.txt', remoteFs, {});
    expect(createRemoteFileHandler.transformOption.call(context)).toEqual({
      ignore: context.config.ignore,
    });
    expect(createRemoteFolderHandler.transformOption.call(context)).toEqual({
      ignore: context.config.ignore,
    });
  });

  test('removeRemote removes directories, files, and symbolic links, and supports skipDir', async () => {
    (remoteFs.lstat as any)
      .mockResolvedValueOnce({ type: 1 })
      .mockResolvedValueOnce({ type: 1 })
      .mockResolvedValueOnce({ type: 2 })
      .mockResolvedValueOnce({ type: 3 });

    await removeRemoteHandler.handle.call(context, { skipDir: true });
    await removeRemoteHandler.handle.call(context, {});
    await removeRemoteHandler.handle.call(context, {});
    await removeRemoteHandler.handle.call(context, {});

    expect(removeDir).toHaveBeenCalledTimes(1);
    expect(removeDir).toHaveBeenCalledWith('/remote/project/file.txt', remoteFs, {});
    expect(removeFile).toHaveBeenCalledTimes(2);
    expect(removeFile).toHaveBeenNthCalledWith(1, '/remote/project/file.txt', remoteFs, {});
    expect(removeFile).toHaveBeenNthCalledWith(2, '/remote/project/file.txt', remoteFs, {});
    expect(removeRemoteHandler.transformOption.call(context)).toEqual({
      ignore: context.config.ignore,
    });
  });

  test('removeRemote warns for unsupported file types and refresh helpers use the remote target', async () => {
    (remoteFs.lstat as any).mockResolvedValue({ type: 4 });

    await removeRemoteHandler.handle.call(context, {});
    createRemoteFileHandler.afterHandle.call(context);
    createRemoteFolderHandler.afterHandle.call(context);
    removeRemoteHandler.afterHandle.call(context);

    expect(warn).toHaveBeenCalledWith('Unsupported file type (type = 4). File /remote/project/file.txt');
    expect(refreshRemoteExplorer).toHaveBeenNthCalledWith(1, context.target, false);
    expect(refreshRemoteExplorer).toHaveBeenNthCalledWith(2, context.target, false);
    expect(refreshRemoteExplorer).toHaveBeenNthCalledWith(3, context.target, false);
  });

  test('renameRemote forwards the origin path and the target local path to the file operation', async () => {
    await renameRemoteHandler.handle.call(context, {
      originPath: '/remote/project/original.txt',
    });

    expect(rename).toHaveBeenCalledWith(
      '/remote/project/original.txt',
      '/remote/project/renamed.txt',
      remoteFs
    );
  });
});

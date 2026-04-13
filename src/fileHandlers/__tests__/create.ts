const createFileMock = jest.fn().mockResolvedValue(undefined);
const createDirMock = jest.fn().mockResolvedValue(undefined);
const refreshRemoteExplorerMock = jest.fn();
const lstatMock = jest.fn();

jest.mock('../../core', () => ({
  __esModule: true,
  fileOperations: {
    createFile: (...args) => createFileMock(...args),
    createDir: (...args) => createDirMock(...args),
  },
  FileType: {
    File: 1,
    Directory: 2,
    SymbolicLink: 64,
  },
}));

jest.mock('../../logger', () => ({
  __esModule: true,
  default: {
    warn: jest.fn(),
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

import { createRemoteFile, createRemoteFolder } from '../create';

describe('fileHandlers/create', () => {
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

  describe('createRemoteFile', () => {
    test('handle creates a file on the remote filesystem', async () => {
      await createRemoteFile.handle.call(context, {});

      expect(context.fileService.getRemoteFileSystem).toHaveBeenCalledWith(context.config);
      expect(createFileMock).toHaveBeenCalledWith(
        '/remote/project/file.txt',
        remoteFs,
        {}
      );
    });

    test('transformOption returns config ignore', () => {
      context.config.ignore = jest.fn();
      const option = createRemoteFile.transformOption.call(context);
      expect(option.ignore).toBe(context.config.ignore);
    });

    test('transformOption returns undefined ignore when not configured', () => {
      context.config.ignore = undefined;
      const option = createRemoteFile.transformOption.call(context);
      expect(option.ignore).toBeUndefined();
    });

    test('afterHandle refreshes remote explorer with false', () => {
      createRemoteFile.afterHandle.call(context);
      expect(refreshRemoteExplorerMock).toHaveBeenCalledWith(context.target, false);
    });
  });

  describe('createRemoteFolder', () => {
    test('handle creates a directory on the remote filesystem', async () => {
      await createRemoteFolder.handle.call(context, {});

      expect(context.fileService.getRemoteFileSystem).toHaveBeenCalledWith(context.config);
      expect(createDirMock).toHaveBeenCalledWith(
        '/remote/project/file.txt',
        remoteFs,
        {}
      );
    });

    test('transformOption returns config ignore', () => {
      context.config.ignore = jest.fn();
      const option = createRemoteFolder.transformOption.call(context);
      expect(option.ignore).toBe(context.config.ignore);
    });

    test('afterHandle refreshes remote explorer with false', () => {
      createRemoteFolder.afterHandle.call(context);
      expect(refreshRemoteExplorerMock).toHaveBeenCalledWith(context.target, false);
    });
  });
});

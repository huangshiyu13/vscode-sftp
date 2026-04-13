const renameMock = jest.fn().mockResolvedValue(undefined);

jest.mock('../../core', () => ({
  __esModule: true,
  fileOperations: {
    rename: (...args) => renameMock(...args),
  },
}));

jest.mock('../createFileHandler', () => ({
  __esModule: true,
  default: (option: any) => option,
  FileHandlerContext: class {},
}));

import { renameRemote } from '../rename';

describe('fileHandlers/rename', () => {
  const remoteFs = {};
  const context: any = {
    config: {},
    fileService: {
      getRemoteFileSystem: jest.fn().mockResolvedValue(remoteFs),
    },
    target: {
      localFsPath: '/local/project/new-name.txt',
      remoteFsPath: '/remote/project/new-name.txt',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    context.fileService.getRemoteFileSystem.mockResolvedValue(remoteFs);
  });

  test('renames a remote file using originPath and localFsPath', async () => {
    await renameRemote.handle.call(context, { originPath: '/remote/project/old-name.txt' });

    expect(context.fileService.getRemoteFileSystem).toHaveBeenCalledWith(context.config);
    expect(renameMock).toHaveBeenCalledWith(
      '/remote/project/old-name.txt',
      '/local/project/new-name.txt',
      remoteFs
    );
  });
});

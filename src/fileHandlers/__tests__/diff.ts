const diffFilesMock = jest.fn().mockResolvedValue(undefined);
const transferFileMock = jest.fn().mockResolvedValue(undefined);
const makeTmpFileMock = jest.fn().mockResolvedValue('/tmp/sftp-abc123.txt');

jest.mock('../../host', () => ({
  __esModule: true,
  diffFiles: diffFilesMock,
}));

jest.mock('../../constants', () => ({
  __esModule: true,
  EXTENSION_NAME: 'sftp',
}));

jest.mock('../../core', () => ({
  __esModule: true,
  fileOperations: {
    transferFile: transferFileMock,
  },
}));

jest.mock('../../helper', () => ({
  __esModule: true,
  makeTmpFile: makeTmpFileMock,
}));

jest.mock('../createFileHandler', () => ({
  __esModule: true,
  default: (option: any) => option,
}));

import { diff } from '../diff';

describe('fileHandlers/diff', () => {
  const remoteFs = {};
  const localFs = {};
  const context: any = {
    config: { host: 'host1' },
    fileService: {
      getRemoteFileSystem: jest.fn().mockResolvedValue(remoteFs),
      getLocalFileSystem: jest.fn().mockReturnValue(localFs),
      name: 'sftp',
    },
    target: {
      localFsPath: '/local/project/file.txt',
      remoteFsPath: '/remote/project/file.txt',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    context.fileService.getRemoteFileSystem.mockResolvedValue(remoteFs);
  });

  test('diff handle downloads remote file to tmp then calls diffFiles', async () => {
    await diff.handle.call(context, {});

    expect(context.fileService.getRemoteFileSystem).toHaveBeenCalledWith(context.config);
    expect(context.fileService.getLocalFileSystem).toHaveBeenCalled();
    expect(makeTmpFileMock).toHaveBeenCalledWith({
      prefix: 'sftp-',
      postfix: '.txt',
    });
    expect(transferFileMock).toHaveBeenCalledWith(
      '/remote/project/file.txt',
      '/tmp/sftp-abc123.txt',
      remoteFs,
      localFs
    );
    expect(diffFilesMock).toHaveBeenCalledWith(
      '/tmp/sftp-abc123.txt',
      '/local/project/file.txt',
      'file.txt (sftp ↔ local)'
    );
  });

  test('diff handle uses fileService name in diff title', async () => {
    context.fileService.name = 'my-remote';

    await diff.handle.call(context, {});

    expect(diffFilesMock).toHaveBeenCalledWith(
      '/tmp/sftp-abc123.txt',
      '/local/project/file.txt',
      'file.txt (my-remote ↔ local)'
    );
  });

  test('diff handle with no extension in localFsPath', async () => {
    context.target.localFsPath = '/local/project/Makefile';
    context.fileService.name = 'sftp';

    await diff.handle.call(context, {});

    expect(makeTmpFileMock).toHaveBeenCalledWith({
      prefix: 'sftp-',
      postfix: '',
    });
  });
});
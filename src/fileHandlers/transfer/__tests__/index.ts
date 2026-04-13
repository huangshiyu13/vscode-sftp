const transferMock = jest.fn().mockResolvedValue(undefined);
const syncMock = jest.fn().mockResolvedValue([]);
const refreshRemoteExplorerMock = jest.fn();

jest.mock('../../shared', () => ({
  __esModule: true,
  refreshRemoteExplorer: refreshRemoteExplorerMock,
}));

jest.mock('../../createFileHandler', () => ({
  __esModule: true,
  default: (option: any) => option,
  FileHandlerContext: class {},
}));

jest.mock('../transfer', () => ({
  __esModule: true,
  transfer: transferMock,
  sync: syncMock,
  TransferDirection: {
    LOCAL_TO_REMOTE: 'LOCAL_TO_REMOTE',
    REMOTE_TO_LOCAL: 'REMOTE_TO_LOCAL',
  },
}));

import {
  sync2Remote,
  sync2Local,
  upload,
  uploadFile,
  uploadFolder,
  download,
  downloadFile,
  downloadFolder,
} from '../index';
import { TransferDirection } from '../transfer';

describe('fileHandlers/transfer/index', () => {
  const remoteFs = {};
  const localFs = {};
  const schedulerMock = { add: jest.fn(), run: jest.fn().mockResolvedValue(undefined) };
  const joinMock = jest.fn().mockReturnValue('/remote/project/file.txt');
  const dirnameMock = jest.fn().mockReturnValue('/remote/project');

  const context: any = {
    config: {
      protocol: 'sftp',
      filePerm: undefined,
      dirPerm: undefined,
      useTempFile: false,
      openSsh: false,
      ignore: undefined,
      syncOption: undefined,
      concurrency: 5,
    },
    fileService: {
      getRemoteFileSystem: jest.fn().mockResolvedValue(remoteFs),
      getLocalFileSystem: jest.fn().mockReturnValue(localFs),
      createTransferScheduler: jest.fn().mockReturnValue(schedulerMock),
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
    context.fileService.createTransferScheduler.mockReturnValue(schedulerMock);
    schedulerMock.run.mockResolvedValue(undefined);
  });

  describe('upload', () => {
    test('handle calls transfer with LOCAL_TO_REMOTE direction', async () => {
      await upload.handle.call(context, {});

      expect(context.fileService.getRemoteFileSystem).toHaveBeenCalledWith(context.config);
      expect(context.fileService.getLocalFileSystem).toHaveBeenCalled();
      expect(context.fileService.createTransferScheduler).toHaveBeenCalledWith(5);
      expect(transferMock).toHaveBeenCalled();
      const transferConfig = transferMock.mock.calls[0][0];
      expect(transferConfig.transferDirection).toBe(TransferDirection.LOCAL_TO_REMOTE);
      expect(transferConfig.srcFsPath).toBe('/local/project/file.txt');
      expect(transferConfig.targetFsPath).toBe('/remote/project/file.txt');
      expect(schedulerMock.run).toHaveBeenCalled();
    });

    test('transformOption returns expected options for sftp with no perms', () => {
      const option = upload.transformOption.call(context);
      expect(option).toEqual({
        perserveTargetMode: true,
        useTempFile: false,
        openSsh: false,
        ignore: undefined,
      });
    });

    test('transformOption returns perserveTargetMode=false for ftp protocol', () => {
      context.config.protocol = 'ftp';
      const option = upload.transformOption.call(context);
      expect(option.perserveTargetMode).toBe(false);
      context.config.protocol = 'sftp';
    });

    test('transformOption returns perserveTargetMode=false when filePerm is set', () => {
      context.config.filePerm = 0o644;
      const option = upload.transformOption.call(context);
      expect(option.perserveTargetMode).toBe(false);
      context.config.filePerm = undefined;
    });

    test('transformOption returns perserveTargetMode=false when dirPerm is set', () => {
      context.config.dirPerm = 0o755;
      const option = upload.transformOption.call(context);
      expect(option.perserveTargetMode).toBe(false);
      context.config.dirPerm = undefined;
    });

    test('afterHandle refreshes with fileService', () => {
      upload.afterHandle.call(context);
      expect(refreshRemoteExplorerMock).toHaveBeenCalledWith(context.target, context.fileService);
    });
  });

  describe('uploadFile', () => {
    test('transformOption returns perserveTargetMode=false when filePerm is set', () => {
      context.config.filePerm = 0o644;
      const option = uploadFile.transformOption.call(context);
      expect(option.perserveTargetMode).toBe(false);
      context.config.filePerm = undefined;
    });

    test('afterHandle refreshes with false (not directory)', () => {
      uploadFile.afterHandle.call(context);
      expect(refreshRemoteExplorerMock).toHaveBeenCalledWith(context.target, false);
    });
  });

  describe('uploadFolder', () => {
    test('transformOption returns perserveTargetMode=false when dirPerm is set', () => {
      context.config.dirPerm = 0o755;
      const option = uploadFolder.transformOption.call(context);
      expect(option.perserveTargetMode).toBe(false);
      context.config.dirPerm = undefined;
    });

    test('afterHandle refreshes with true (directory)', () => {
      uploadFolder.afterHandle.call(context);
      expect(refreshRemoteExplorerMock).toHaveBeenCalledWith(context.target, true);
    });
  });

  describe('download', () => {
    test('handle calls transfer with REMOTE_TO_LOCAL direction', async () => {
      await download.handle.call(context, {});

      expect(transferMock).toHaveBeenCalled();
      const transferConfig = transferMock.mock.calls[0][0];
      expect(transferConfig.transferDirection).toBe(TransferDirection.REMOTE_TO_LOCAL);
      expect(transferConfig.srcFsPath).toBe('/remote/project/file.txt');
      expect(transferConfig.targetFsPath).toBe('/local/project/file.txt');
    });

    test('transformOption returns perserveTargetMode=false', () => {
      const option = download.transformOption.call(context);
      expect(option.perserveTargetMode).toBe(false);
    });
  });

  describe('downloadFile', () => {
    test('transformOption returns perserveTargetMode=false', () => {
      const option = downloadFile.transformOption.call(context);
      expect(option.perserveTargetMode).toBe(false);
    });
  });

  describe('downloadFolder', () => {
    test('transformOption returns perserveTargetMode=false', () => {
      const option = downloadFolder.transformOption.call(context);
      expect(option.perserveTargetMode).toBe(false);
    });
  });

  describe('sync2Remote', () => {
    test('handle calls sync with LOCAL_TO_REMOTE direction and attaches filePerm/dirPerm', async () => {
      context.config.filePerm = 0o644;
      context.config.dirPerm = 0o755;

      await sync2Remote.handle.call(context, {});

      expect(syncMock).toHaveBeenCalled();
      const syncConfig = syncMock.mock.calls[0][0];
      expect(syncConfig.transferDirection).toBe(TransferDirection.LOCAL_TO_REMOTE);
      expect(syncConfig.srcFsPath).toBe('/local/project/file.txt');
      expect(syncConfig.targetFsPath).toBe('/remote/project/file.txt');

      // Check that option has filePerm/dirPerm from config
      const syncOption = syncMock.mock.calls[0][0].transferOption;
      expect(syncOption.filePerm).toBe(0o644);
      expect(syncOption.dirPerm).toBe(0o755);

      expect(schedulerMock.run).toHaveBeenCalled();
      context.config.filePerm = undefined;
      context.config.dirPerm = undefined;
    });

    test('transformOption returns correct sync options', () => {
      context.config.syncOption = {
        delete: true,
        skipCreate: false,
        ignoreExisting: true,
        update: false,
      };
      context.config.protocol = 'sftp';
      context.config.filePerm = undefined;
      context.config.dirPerm = undefined;

      const option = sync2Remote.transformOption.call(context);
      expect(option).toEqual({
        perserveTargetMode: true,
        useTempFile: false,
        openSsh: false,
        ignore: undefined,
        delete: true,
        skipCreate: false,
        ignoreExisting: true,
        update: false,
      });
      context.config.syncOption = undefined;
    });

    test('afterHandle refreshes with true', () => {
      sync2Remote.afterHandle.call(context);
      expect(refreshRemoteExplorerMock).toHaveBeenCalledWith(context.target, true);
    });
  });

  describe('sync2Local', () => {
    test('handle calls sync with REMOTE_TO_LOCAL direction', async () => {
      await sync2Local.handle.call(context, {});

      expect(syncMock).toHaveBeenCalled();
      const syncConfig = syncMock.mock.calls[0][0];
      expect(syncConfig.transferDirection).toBe(TransferDirection.REMOTE_TO_LOCAL);
      expect(syncConfig.srcFsPath).toBe('/remote/project/file.txt');
      expect(syncConfig.targetFsPath).toBe('/local/project/file.txt');
      expect(schedulerMock.run).toHaveBeenCalled();
    });

    test('transformOption returns perserveTargetMode=false always', () => {
      const option = sync2Local.transformOption.call(context);
      expect(option.perserveTargetMode).toBe(false);
    });

    test('transformOption includes syncOption fields', () => {
      context.config.syncOption = {
        delete: true,
        skipCreate: true,
        ignoreExisting: false,
        update: true,
      };

      const option = sync2Local.transformOption.call(context);
      expect(option.delete).toBe(true);
      expect(option.skipCreate).toBe(true);
      expect(option.ignoreExisting).toBe(false);
      expect(option.update).toBe(true);
      context.config.syncOption = undefined;
    });
  });
});
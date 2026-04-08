import { Readable } from 'stream';

const transferSymlink = jest.fn();
const info = jest.fn();
const warn = jest.fn();

jest.mock('../fileBaseOperations', () => ({
  __esModule: true,
  transferSymlink: (...args) => transferSymlink(...args),
}));

jest.mock('../../logger', () => ({
  __esModule: true,
  default: {
    info: (...args) => info(...args),
    warn: (...args) => warn(...args),
  },
}));

import TransferTask, { TransferDirection } from '../transferTask';
import { FileSystem, FileType } from '../fs';

describe('core/transferTask', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('transfers a regular file and preserves timestamps', async () => {
    const handle = new Readable({ read() { this.push(null); } });
    const srcFs = {
      get: jest.fn().mockResolvedValue(handle),
    };
    const targetFs = {
      open: jest.fn().mockResolvedValue('upload-fd'),
      put: jest.fn().mockResolvedValue(undefined),
      futimes: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
    };

    const task = new TransferTask(
      {
        fsPath: '/workspace/project/src/index.ts',
        fileSystem: srcFs as any,
      },
      {
        fsPath: '/remote/project/src/index.ts',
        fileSystem: targetFs as any,
      },
      {
        fileType: FileType.File,
        transferDirection: TransferDirection.LOCAL_TO_REMOTE,
        transferOption: {
          atime: 1000,
          mtime: 2000,
          mode: 0o644,
          perserveTargetMode: false,
        },
      }
    );

    await task.run();

    expect(task.localFsPath).toBe('/workspace/project/src/index.ts');
    expect(task.srcFsPath).toBe('/workspace/project/src/index.ts');
    expect(task.targetFsPath).toBe('/remote/project/src/index.ts');
    expect(task.transferType).toBe(TransferDirection.LOCAL_TO_REMOTE);
    expect(srcFs.get).toHaveBeenCalledWith('/workspace/project/src/index.ts');
    expect(targetFs.open).toHaveBeenCalledWith('/remote/project/src/index.ts', 'w');
    expect(targetFs.put).toHaveBeenCalledWith(handle, '/remote/project/src/index.ts', {
      mode: 0o644,
      fd: 'upload-fd',
      autoClose: false,
    });
    expect(targetFs.futimes).toHaveBeenCalledWith('upload-fd', 1, 2);
    expect(targetFs.close).toHaveBeenCalledWith('upload-fd');
  });

  test('uses a temp file, preserves the target mode, and renames atomically for openSsh uploads', async () => {
    const handle = new Readable({ read() { this.push(null); } });
    const srcFs = {
      get: jest.fn().mockResolvedValue(handle),
    };
    const open: any = jest.fn();
    open.mockResolvedValueOnce('target-fd');
    open.mockResolvedValueOnce('upload-fd');
    const targetFs = {
      open,
      fstat: jest.fn().mockResolvedValue({ mode: 0o600 }),
      put: jest.fn().mockResolvedValue(undefined),
      futimes: jest.fn().mockRejectedValue(new Error('permission denied')),
      close: jest.fn().mockResolvedValue(undefined),
      renameAtomic: jest.fn().mockResolvedValue(undefined),
      unlink: jest.fn(),
      rename: jest.fn(),
    };

    const task = new TransferTask(
      {
        fsPath: '/remote/project/file.txt',
        fileSystem: srcFs as any,
      },
      {
        fsPath: '/workspace/project/file.txt',
        fileSystem: targetFs as any,
      },
      {
        fileType: FileType.File,
        transferDirection: TransferDirection.REMOTE_TO_LOCAL,
        transferOption: {
          atime: 1000,
          mtime: 2000,
          perserveTargetMode: true,
          useTempFile: true,
          openSsh: true,
          fallbackMode: 0o644,
        },
      }
    );

    await task.run();

    expect(task.localFsPath).toBe('/workspace/project/file.txt');
    expect(targetFs.open).toHaveBeenNthCalledWith(1, '/workspace/project/file.txt', 'r');
    expect(targetFs.open).toHaveBeenNthCalledWith(2, '/workspace/project/file.txt.new', 'w');
    expect(targetFs.fstat).toHaveBeenCalledWith('target-fd');
    expect(targetFs.close).toHaveBeenNthCalledWith(1, 'target-fd');
    expect(targetFs.put).toHaveBeenCalledWith(handle, '/workspace/project/file.txt.new', {
      mode: 0o600,
      fd: 'upload-fd',
      autoClose: false,
    });
    expect(warn).toHaveBeenCalledWith(
      'Can\'t set modified time to the file because permission denied'
    );
    expect(info).toHaveBeenCalledWith('uploading temp file: /workspace/project/file.txt.new');
    expect(info).toHaveBeenCalledWith(
      'moving from: /workspace/project/file.txt.new to: /workspace/project/file.txt'
    );
    expect(targetFs.renameAtomic).toHaveBeenCalledWith(
      '/workspace/project/file.txt.new',
      '/workspace/project/file.txt'
    );
    expect(targetFs.unlink).not.toHaveBeenCalled();
    expect(targetFs.rename).not.toHaveBeenCalled();
    expect(targetFs.close).toHaveBeenLastCalledWith('upload-fd');
  });

  test('delegates symlink transfers and warns for unsupported file types', async () => {
    const srcFs = {};
    const targetFs = {};

    const symlinkTask = new TransferTask(
      {
        fsPath: '/workspace/project/link',
        fileSystem: srcFs as any,
      },
      {
        fsPath: '/remote/project/link',
        fileSystem: targetFs as any,
      },
      {
        fileType: FileType.SymbolicLink,
        transferDirection: TransferDirection.LOCAL_TO_REMOTE,
        transferOption: {
          atime: 0,
          mtime: 0,
          perserveTargetMode: false,
        },
      }
    );

    await symlinkTask.run();

    expect(transferSymlink).toHaveBeenCalledWith(
      '/workspace/project/link',
      '/remote/project/link',
      srcFs,
      targetFs,
      expect.objectContaining({ perserveTargetMode: false })
    );

    const unknownTask = new TransferTask(
      {
        fsPath: '/workspace/project/unknown',
        fileSystem: srcFs as any,
      },
      {
        fsPath: '/remote/project/unknown',
        fileSystem: targetFs as any,
      },
      {
        fileType: FileType.Unknown,
        transferDirection: TransferDirection.LOCAL_TO_REMOTE,
        transferOption: {
          atime: 0,
          mtime: 0,
          perserveTargetMode: false,
        },
      }
    );

    await unknownTask.run();

    expect(warn).toHaveBeenCalledWith('Unsupported file type (type = 4). File /workspace/project/unknown');
  });

  test('cancel aborts the active stream only once', () => {
    const task = new TransferTask(
      {
        fsPath: '/workspace/project/file.txt',
        fileSystem: {} as any,
      },
      {
        fsPath: '/remote/project/file.txt',
        fileSystem: {} as any,
      },
      {
        fileType: FileType.File,
        transferDirection: TransferDirection.LOCAL_TO_REMOTE,
        transferOption: {
          atime: 0,
          mtime: 0,
          perserveTargetMode: false,
        },
      }
    );
    const handle = new Readable({ read() { this.push(null); } });
    const abortSpy = jest.spyOn(FileSystem, 'abortReadableStream').mockImplementation(() => undefined);

    (task as any)._handle = handle;

    task.cancel();
    task.cancel();

    expect(task.isCancelled()).toBe(true);
    expect(abortSpy).toHaveBeenCalledTimes(1);

    abortSpy.mockRestore();
  });
});

jest.mock('fs');

const getOpenTextDocuments = jest.fn();
const loggerInfo = jest.fn();
const loggerWarn = jest.fn();

jest.mock('../../../host', () => ({
  __esModule: true,
  getOpenTextDocuments,
}));

jest.mock('../../../logger', () => ({
  __esModule: true,
  default: {
    info: (...args) => loggerInfo(...args),
    warn: (...args) => loggerWarn(...args),
    error: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
    critical: jest.fn(),
  },
}));

import { vol } from 'memfs';
import * as fs from 'fs';
import * as path from 'path';
import * as core from '../../../core';
import localFs from '../../../core/localFs';
import TransferTask from '../../../core/transferTask';
import { sync, transfer, TransferDirection } from '../transfer';

const file = (content: string, time = 0) => ({
  $$type: 'file',
  content,
  mtime: new Date(new Date().getTime() + time * 1000),
});

const fillFs = obj => {
  const files: { [x: string]: string } = {};
  const dirs: string[] = [];
  const stats: {
    [x: string]: {
      mtime: Date;
    };
  } = {};

  const processDirTree = (entry, filepath = '/') => {
    const keys = Object.keys(entry);
    if (keys.length <= 0) {
      dirs.push(filepath);
      return;
    }

    keys.forEach(key => {
      const fullpath = path.join(filepath, key);
      if (entry[key].$$type === 'file') {
        files[fullpath] = entry[key].content;
        stats[fullpath] = entry[key];
      } else {
        processDirTree(entry[key], fullpath);
      }
    });
  };

  processDirTree(obj);
  vol.fromJSON(files, '/');
  dirs.forEach(dir => fs.mkdirSync(dir));
  Object.keys(stats).forEach(filepath => {
    fs.utimesSync(filepath, stats[filepath].mtime, stats[filepath].mtime);
  });
};

describe('transfer branch coverage', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    vol.reset();
  });

  test('saves dirty documents before upload and chmods the parent directory when dirPerm is set', async () => {
    fillFs({
      local: {
        'a.txt': file('hello', 1),
      },
      remote: {},
    });

    const save = jest.fn().mockImplementation(async () => {
      const updatedTime = new Date(new Date().getTime() + 5000);
      fs.utimesSync('/local/a.txt', updatedTime, updatedTime);
    });
    getOpenTextDocuments.mockReturnValue([
      {
        fileName: '/local/a.txt',
        isClosed: false,
        isDirty: true,
        save,
      },
    ]);

    const chmod = jest.spyOn(localFs, 'chmod').mockResolvedValue(undefined);
    const tasks: TransferTask[] = [];

    await transfer(
      {
        srcFsPath: '/local/a.txt',
        srcFs: localFs,
        targetFs: localFs,
        targetFsPath: '/remote/nested/a.txt',
        transferDirection: TransferDirection.LOCAL_TO_REMOTE,
        dirPerm: 755 as any,
        transferOption: {
          perserveTargetMode: false,
        },
      },
      task => tasks.push(task)
    );

    expect(save).toHaveBeenCalledTimes(1);
    expect(chmod).toHaveBeenCalledWith('/remote/nested', 0o755);
    expect(loggerInfo).toHaveBeenCalledWith('save before upload.');
    expect(tasks).toHaveLength(1);
    expect((tasks[0] as any)._TransferOption.mtime).toBeGreaterThan(1000);
  });

  test('chmods transferred folders and warns for unsupported file types', async () => {
    fillFs({
      local: {
        folder: {
          'child.txt': file('child', 1),
        },
      },
      remote: {},
    });

    const chmod = jest.spyOn(localFs, 'chmod').mockResolvedValue(undefined);
    const tasks: TransferTask[] = [];

    await transfer(
      {
        srcFsPath: '/local/folder',
        srcFs: localFs,
        targetFs: localFs,
        targetFsPath: '/remote/folder',
        transferDirection: TransferDirection.LOCAL_TO_REMOTE,
        dirPerm: 755 as any,
        transferOption: {
          perserveTargetMode: false,
        },
      },
      task => tasks.push(task)
    );

    expect(chmod).toHaveBeenCalledWith('/remote/folder', 0o755);
    expect(tasks).toHaveLength(1);

    const weirdFs = {
      pathResolver: path,
      lstat: jest.fn().mockResolvedValue({
        type: 999,
        mode: 0o644,
        mtime: 0,
        atime: 0,
      }),
    };
    const weirdTasks: TransferTask[] = [];

    await transfer(
      {
        srcFsPath: '/local/weird',
        srcFs: weirdFs as any,
        targetFs: localFs,
        targetFsPath: '/remote/weird',
        transferDirection: TransferDirection.LOCAL_TO_REMOTE,
        transferOption: {
          perserveTargetMode: false,
        },
      },
      task => weirdTasks.push(task)
    );

    expect(weirdTasks).toHaveLength(0);
    expect(loggerWarn).toHaveBeenCalledWith('Unsupported file type (type = 999). File /local/weird');
  });

  test('syncs newer target files back to the source and copies target-only files in both directions', async () => {
    fillFs({
      local: {
        'common.txt': file('local', 1),
      },
      remote: {
        'common.txt': file('remote-newer', 10),
        'remote-only.txt': file('remote-only', 8),
      },
    });

    const tasks: TransferTask[] = [];

    const deleted = await sync(
      {
        srcFsPath: '/local',
        srcFs: localFs,
        targetFs: localFs,
        targetFsPath: '/remote',
        transferDirection: TransferDirection.LOCAL_TO_REMOTE,
        transferOption: {
          bothDiretions: true,
          perserveTargetMode: false,
        },
      },
      task => tasks.push(task)
    );

    expect(deleted).toEqual([]);
    expect(tasks).toHaveLength(2);
    expect(tasks.map(task => [task.srcFsPath, task.targetFsPath]).sort()).toEqual([
      ['/remote/common.txt', '/local/common.txt'],
      ['/remote/remote-only.txt', '/local/remote-only.txt'],
    ]);
    expect(tasks.map(task => task.transferType)).toEqual([
      TransferDirection.REMOTE_TO_LOCAL,
      TransferDirection.REMOTE_TO_LOCAL,
    ]);
  });

  test('delegates deletions for extraneous files and directories during sync', async () => {
    fillFs({
      local: {},
      remote: {
        'remote-only.txt': file('remote-only', 8),
        folder: {},
      },
    });

    const removeFile = jest
      .spyOn(core.fileOperations, 'removeFile')
      .mockResolvedValue(undefined);
    const removeDir = jest
      .spyOn(core.fileOperations, 'removeDir')
      .mockResolvedValue(undefined);

    const deleted = await sync(
      {
        srcFsPath: '/local',
        srcFs: localFs,
        targetFs: localFs,
        targetFsPath: '/remote',
        transferDirection: TransferDirection.LOCAL_TO_REMOTE,
        transferOption: {
          delete: true,
          perserveTargetMode: false,
        },
      },
      () => undefined
    );
    await Promise.resolve();

    expect(deleted.map(item => item.fspath).sort()).toEqual([
      '/remote/folder',
      '/remote/remote-only.txt',
    ]);
    expect(removeFile).toHaveBeenCalledWith(
      '/remote/remote-only.txt',
      localFs,
      expect.anything()
    );
    expect(removeDir).toHaveBeenCalledWith(
      '/remote/folder',
      localFs,
      expect.anything()
    );
    expect(loggerInfo).toHaveBeenCalledWith('file removed.');
    expect(loggerInfo).toHaveBeenCalledWith('folder removed.');
  });

  test('treats failed directory listings as empty during sync', async () => {
    const srcFs = {
      pathResolver: path.posix,
      list: jest.fn().mockRejectedValue(new Error('missing source')),
    };
    const targetFs = {
      pathResolver: path.posix,
      ensureDir: jest.fn().mockResolvedValue(undefined),
      list: jest.fn().mockRejectedValue(new Error('missing target')),
    };
    const tasks: TransferTask[] = [];

    await expect(
      sync(
        {
          srcFsPath: '/local',
          srcFs: srcFs as any,
          targetFs: targetFs as any,
          targetFsPath: '/remote',
          transferDirection: TransferDirection.LOCAL_TO_REMOTE,
          transferOption: {
            perserveTargetMode: false,
          },
        },
        task => tasks.push(task)
      )
    ).resolves.toEqual([]);

    expect(targetFs.ensureDir).toHaveBeenCalledWith('/remote');
    expect(tasks).toEqual([]);
  });

  test('skips unsupported source-only and target-only entries while still reporting unknown deletions', async () => {
    const unknownEntry = {
      name: 'mystery',
      fspath: '/remote/mystery',
      type: 999,
      mode: 0,
      mtime: 0,
      atime: 0,
    };
    const srcFs = {
      pathResolver: path.posix,
      list: jest.fn().mockResolvedValue([
        {
          ...unknownEntry,
          fspath: '/local/mystery',
        },
      ]),
    };
    const targetFs = {
      pathResolver: path.posix,
      ensureDir: jest.fn().mockResolvedValue(undefined),
      list: jest.fn().mockResolvedValue([unknownEntry]),
    };
    const tasks: TransferTask[] = [];

    const deletedFromBothDirections = await sync(
      {
        srcFsPath: '/local',
        srcFs: srcFs as any,
        targetFs: targetFs as any,
        targetFsPath: '/remote',
        transferDirection: TransferDirection.LOCAL_TO_REMOTE,
        transferOption: {
          bothDiretions: true,
          perserveTargetMode: false,
        },
      },
      task => tasks.push(task)
    );
    expect(tasks).toEqual([]);
    expect(deletedFromBothDirections).toEqual([]);

    const deleted = await sync(
      {
        srcFsPath: '/local',
        srcFs: {
          ...srcFs,
          list: jest.fn().mockResolvedValue([]),
        } as any,
        targetFs: targetFs as any,
        targetFsPath: '/remote',
        transferDirection: TransferDirection.LOCAL_TO_REMOTE,
        transferOption: {
          delete: true,
          perserveTargetMode: false,
        },
      },
      () => undefined
    );
    expect(deleted).toEqual([
      expect.objectContaining({
        fspath: '/remote/mystery',
        name: 'mystery',
        type: 999,
      }),
    ]);
  });

  test('sync with update skips files that are not newer', async () => {
    fillFs({
      local: {
        'old.txt': file('old content', 1),
        'new.txt': file('new content', 10),
      },
      remote: {
        'old.txt': file('remote old', 5),
        'new.txt': file('remote new', 5),
      },
    });

    const tasks: TransferTask[] = [];
    const collect = (t: TransferTask) => tasks.push(t);

    const deleted = await sync(
      {
        srcFsPath: '/local',
        srcFs: localFs,
        targetFs: localFs,
        targetFsPath: '/remote',
        transferDirection: TransferDirection.LOCAL_TO_REMOTE,
        transferOption: {
          update: true,
          perserveTargetMode: false,
        },
      },
      collect
    );

    expect(deleted).toEqual([]);
    // Only new.txt should be transferred (mtime 10 > 5)
    // old.txt should be skipped (mtime 1 < 5)
    expect(tasks.length).toBe(1);
    expect(tasks[0].srcFsPath).toBe('/local/new.txt');
  });

  test('sync with skipCreate skips creating new files on target', async () => {
    fillFs({
      local: {
        'existing.txt': file('local', 5),
        'new.txt': file('new', 5),
      },
      remote: {
        'existing.txt': file('remote', 1),
      },
    });

    const tasks: TransferTask[] = [];
    const collect = (t: TransferTask) => tasks.push(t);

    const deleted = await sync(
      {
        srcFsPath: '/local',
        srcFs: localFs,
        targetFs: localFs,
        targetFsPath: '/remote',
        transferDirection: TransferDirection.LOCAL_TO_REMOTE,
        transferOption: {
          skipCreate: true,
          perserveTargetMode: false,
        },
      },
      collect
    );

    expect(deleted).toEqual([]);
    // Only existing.txt should be updated (skip new.txt creation)
    const srcPaths = tasks.map(t => t.srcFsPath);
    expect(srcPaths).toContain('/local/existing.txt');
    expect(srcPaths).not.toContain('/local/new.txt');
  });

  test('transfers a file with filePerm chmod on the remote directory', async () => {
    fillFs({
      local: {
        'a.txt': file('hello', 1),
      },
      remote: {},
    });

    const chmod = jest.spyOn(localFs, 'chmod').mockResolvedValue(undefined);
    const tasks: TransferTask[] = [];

    await transfer(
      {
        srcFsPath: '/local/a.txt',
        srcFs: localFs,
        targetFs: localFs,
        targetFsPath: '/remote/a.txt',
        transferDirection: TransferDirection.LOCAL_TO_REMOTE,
        filePerm: 644 as any,
        transferOption: {
          perserveTargetMode: false,
        },
      },
      task => tasks.push(task)
    );

    expect(tasks).toHaveLength(1);
    // filePerm should be passed into transferOption
    expect((tasks[0] as any)._TransferOption.filePerm).toBe(644);
  });

  test('removes a symbolic link during sync delete', async () => {
    const { transferSymlink } = require('../../../core/fileBaseOperations');
    const removeFileSpy = jest.spyOn(core.fileOperations, 'removeFile').mockResolvedValue(undefined);

    const srcFs = {
      pathResolver: path.posix,
      list: jest.fn().mockResolvedValue([]),
    };
    const targetFs = {
      pathResolver: path.posix,
      ensureDir: jest.fn().mockResolvedValue(undefined),
      list: jest.fn().mockResolvedValue([
        { fspath: '/remote/link', name: 'link', type: core.FileType.SymbolicLink, mode: 0, mtime: 0, atime: 0 },
      ]),
    };

    const deleted = await sync(
      {
        srcFsPath: '/local',
        srcFs: srcFs as any,
        targetFs: targetFs as any,
        targetFsPath: '/remote',
        transferDirection: TransferDirection.LOCAL_TO_REMOTE,
        transferOption: {
          delete: true,
          perserveTargetMode: false,
        },
      },
      () => undefined
    );

    expect(deleted).toHaveLength(1);
    expect(deleted[0].fspath).toBe('/remote/link');
    expect(removeFileSpy).toHaveBeenCalledWith('/remote/link', targetFs, expect.anything());
    expect(loggerInfo).toHaveBeenCalledWith('file removed.');
  });

  test('sync bothDirections with skipCreate skips creating new files in both directions', async () => {
    fillFs({
      local: {
        'local-only.txt': file('local', 5),
      },
      remote: {
        'remote-only.txt': file('remote', 5),
      },
    });

    const tasks: TransferTask[] = [];
    const collect = (t: TransferTask) => tasks.push(t);

    const deleted = await sync(
      {
        srcFsPath: '/local',
        srcFs: localFs,
        targetFs: localFs,
        targetFsPath: '/remote',
        transferDirection: TransferDirection.LOCAL_TO_REMOTE,
        transferOption: {
          bothDiretions: true,
          skipCreate: true,
          perserveTargetMode: false,
        },
      },
      collect
    );

    expect(deleted).toEqual([]);
    // No files should be transferred since skipCreate is true
    expect(tasks.length).toBe(0);
  });
});

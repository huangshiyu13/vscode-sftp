jest.mock('fs');

import { vol } from 'memfs';
import * as fs from 'fs';
import * as path from 'path';
import { transfer, sync, TransferDirection } from '../transfer';
import localFs from '../../../core/localFs';
import TransferTask from '../../../core/transferTask';

const file = (c, time = 0) => ({
  $$type: 'file',
  content: c,
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
  const processDirTree = (obj1, filepath = '/') => {
    const keys = Object.keys(obj1);
    if (keys.length <= 0) {
      dirs.push(filepath);
      return;
    }

    keys.forEach(key => {
      const fullpath = path.join(filepath, key);
      if (obj1[key].$$type === 'file') {
        files[fullpath] = obj1[key].content;
        stats[fullpath] = obj1[key];
      } else {
        processDirTree(obj1[key], fullpath);
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

describe('transfer function', () => {
  afterEach(() => {
    vol.reset();
  });

  test('transfer a single file', async () => {
    fillFs({
      local: {
        'a.txt': file('hello', 1),
      },
      remote: {},
    });

    const tasks: TransferTask[] = [];
    const collect = (t: TransferTask) => tasks.push(t);

    await transfer(
      {
        srcFsPath: '/local/a.txt',
        srcFs: localFs,
        targetFs: localFs,
        targetFsPath: '/remote/a.txt',
        transferDirection: TransferDirection.LOCAL_TO_REMOTE,
        transferOption: {
          perserveTargetMode: false,
        },
      },
      collect
    );

    expect(tasks.length).toEqual(1);
    expect(tasks[0].targetFsPath).toBe(path.join('/remote', 'a.txt'));
  });

  test('transfer a folder', async () => {
    fillFs({
      local: {
        dir: {
          'a.txt': file('hello', 1),
          'b.txt': file('world', 1),
        },
      },
      remote: {},
    });

    const tasks: TransferTask[] = [];
    const collect = (t: TransferTask) => tasks.push(t);

    await transfer(
      {
        srcFsPath: '/local/dir',
        srcFs: localFs,
        targetFs: localFs,
        targetFsPath: '/remote/dir',
        transferDirection: TransferDirection.LOCAL_TO_REMOTE,
        transferOption: {
          perserveTargetMode: false,
        },
      },
      collect
    );

    expect(tasks.length).toEqual(2);
    const targetPaths = tasks.map(t => t.targetFsPath).sort();
    expect(targetPaths).toEqual(
      [path.join('/remote/dir', 'a.txt'), path.join('/remote/dir', 'b.txt')].sort()
    );
  });

  test('transfer with ignore skips ignored files', async () => {
    fillFs({
      local: {
        'a.txt': file('hello', 1),
        'b.txt': file('world', 1),
      },
      remote: {},
    });

    const tasks: TransferTask[] = [];
    const collect = (t: TransferTask) => tasks.push(t);

    await transfer(
      {
        srcFsPath: '/local/a.txt',
        srcFs: localFs,
        targetFs: localFs,
        targetFsPath: '/remote/a.txt',
        transferDirection: TransferDirection.LOCAL_TO_REMOTE,
        transferOption: {
          perserveTargetMode: false,
          ignore: (fp: string) => fp.endsWith('a.txt'),
        },
      },
      collect
    );

    expect(tasks.length).toEqual(0);
  });

  test('transfer folder with ignore skips ignored items', async () => {
    fillFs({
      local: {
        dir: {
          'a.txt': file('hello', 1),
          'b.txt': file('world', 1),
        },
      },
      remote: {},
    });

    const tasks: TransferTask[] = [];
    const collect = (t: TransferTask) => tasks.push(t);

    await transfer(
      {
        srcFsPath: '/local/dir',
        srcFs: localFs,
        targetFs: localFs,
        targetFsPath: '/remote/dir',
        transferDirection: TransferDirection.LOCAL_TO_REMOTE,
        transferOption: {
          perserveTargetMode: false,
          ignore: (fp: string) => fp.endsWith('a.txt'),
        },
      },
      collect
    );

    expect(tasks.length).toEqual(1);
    expect(tasks[0].targetFsPath).toBe(path.join('/remote/dir', 'b.txt'));
  });

  test('transfer from remote to local', async () => {
    fillFs({
      remote: {
        'a.txt': file('hello', 1),
      },
      local: {},
    });

    const tasks: TransferTask[] = [];
    const collect = (t: TransferTask) => tasks.push(t);

    await transfer(
      {
        srcFsPath: '/remote/a.txt',
        srcFs: localFs,
        targetFs: localFs,
        targetFsPath: '/local/a.txt',
        transferDirection: TransferDirection.REMOTE_TO_LOCAL,
        transferOption: {
          perserveTargetMode: false,
        },
      },
      collect
    );

    expect(tasks.length).toEqual(1);
    expect(tasks[0].targetFsPath).toBe(path.join('/local', 'a.txt'));
  });
});

describe('sync --ignoreExisting', () => {
  afterEach(() => {
    vol.reset();
  });

  test('sync with ignoreExisting skips existing files', async () => {
    fillFs({
      local: {
        a: file('a', 1),
        b: file('b', 1),
      },
      remote: {
        a: file('$a'),
        b: file('$b'),
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
          ignoreExisting: true,
          perserveTargetMode: false,
        },
      },
      collect
    );

    expect(tasks.length).toEqual(0);
    expect(deleted.length).toEqual(0);
  });
});

describe('sync with filePerm and dirPerm', () => {
  afterEach(() => {
    vol.reset();
  });

  test('sync passes filePerm and dirPerm in transferOption', async () => {
    fillFs({
      local: {
        a: file('a', 1),
      },
      remote: {},
    });

    const tasks: TransferTask[] = [];
    const collect = (t: TransferTask) => tasks.push(t);

    await sync(
      {
        srcFsPath: '/local',
        srcFs: localFs,
        targetFs: localFs,
        targetFsPath: '/remote',
        transferDirection: TransferDirection.LOCAL_TO_REMOTE,
        transferOption: {
          perserveTargetMode: false,
          filePerm: 0o644,
          dirPerm: 0o755,
        },
      },
      collect
    );

    expect(tasks.length).toEqual(1);
  });
});
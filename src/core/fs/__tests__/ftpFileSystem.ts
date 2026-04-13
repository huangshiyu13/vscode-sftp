import * as path from 'path';
import { PassThrough, Readable } from 'stream';

const loggerInfo = jest.fn();
const loggerError = jest.fn();

jest.mock('../../../logger', () => ({
  __esModule: true,
  default: {
    info: (...args) => loggerInfo(...args),
    error: (...args) => loggerError(...args),
    warn: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
    critical: jest.fn(),
  },
}));

import FTPFileSystem from '../ftpFileSystem';
import { FileType } from '../fileSystem';

function makeStat(name: string, type: string, rights = { user: 'rw', group: 'r', other: 'r' }) {
  return {
    name,
    type,
    rights,
    size: 3,
    date: new Date(1000),
    target: '/remote/target',
  };
}

function createFileSystem() {
  const ftp = {
    list: jest.fn(),
    get: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    mkdir: jest.fn(),
    rmdir: jest.fn(),
    rename: jest.fn(),
    site: jest.fn(),
    setLastMod: jest.fn(),
    abort: jest.fn(),
  };
  const client = {
    getFsClient: () => ftp,
    connect: jest.fn(),
    onDisconnected: jest.fn(),
    end: jest.fn(),
  };
  const fileSystem = new FTPFileSystem(path.posix, {
    client,
  } as any);
  (fileSystem as any).queue = {
    add(task) {
      return task();
    },
  };

  return {
    fileSystem,
    ftp,
  };
}

describe('core/fs/ftpFileSystem', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('converts ftp stats, lists files, resolves lstat, and reads symlink targets', async () => {
    const { fileSystem, ftp } = createFileSystem();
    const fileStat = makeStat('file.txt', '-');

    expect(FTPFileSystem.getFileType('d')).toBe(FileType.Directory);
    expect(FTPFileSystem.getFileType('-')).toBe(FileType.File);
    expect(FTPFileSystem.getFileType('l')).toBe(FileType.SymbolicLink);
    expect(FTPFileSystem.getFileType('?')).toBe(FileType.Unknown);

    expect(fileSystem.toFileStat(fileStat as any)).toEqual(
      expect.objectContaining({
        type: FileType.File,
        mode: 0o644,
        size: 3,
        target: '/remote/target',
      })
    );
    expect(fileSystem.toFileEntry('/remote/file.txt', fileStat as any)).toEqual(
      expect.objectContaining({
        fspath: '/remote/file.txt',
        name: 'file.txt',
      })
    );

    ftp.list.mockImplementation((_dir, cb) => cb(null, [fileStat, '.', '..', {}]));

    await expect(fileSystem.lstat('/')).resolves.toEqual({
      type: FileType.Directory,
      mode: 0o666,
      size: 0,
      mtime: 0,
      atime: 0,
    });
    await expect(fileSystem.lstat('/remote/file.txt')).resolves.toEqual(
      expect.objectContaining({
        type: FileType.File,
        size: 3,
      })
    );
    await expect(fileSystem.list('/remote')).resolves.toEqual([
      expect.objectContaining({
        fspath: '/remote/file.txt',
        name: 'file.txt',
      }),
    ]);
    await expect(fileSystem.readlink('/remote/file.txt')).resolves.toBe('/remote/target');

    ftp.list.mockImplementation((_dir, cb) => cb(null, []));
    await expect(fileSystem.lstat('/remote/missing.txt')).rejects.toThrow('file not exist');
  });

  test('wraps basic file operations over the ftp client', async () => {
    const { fileSystem, ftp } = createFileSystem();
    const fd = await fileSystem.open('/remote/file.txt', 'w', 0o644);

    expect(fd).toEqual({
      path: '/remote/file.txt',
      flags: 'w',
      mode: 0o644,
    });
    await expect(fileSystem.close(fd as any)).resolves.toBeUndefined();

    jest.spyOn(fileSystem, 'lstat').mockResolvedValue({
      type: FileType.File,
      mode: 0o644,
      size: 3,
      mtime: 0,
      atime: 0,
      target: '/remote/target',
    });

    await expect(fileSystem.fstat(fd as any)).resolves.toEqual(
      expect.objectContaining({
        type: FileType.File,
      })
    );

    const readable = Readable.from(['hello']);
    ftp.get.mockImplementation((_path, cb) => cb(null, readable));
    await expect(fileSystem.get('/remote/file.txt')).resolves.toBe(readable);

    ftp.get.mockImplementationOnce((_path, cb) => cb(null, undefined));
    await expect(fileSystem.get('/remote/missing.txt')).rejects.toThrow('create ReadStream failed');

    ftp.site.mockImplementation((_command, cb) => cb(null));
    ftp.mkdir.mockImplementation((_dir, cb) => cb(null));
    ftp.delete.mockImplementation((_path, cb) => cb(null));
    ftp.rmdir.mockImplementation((_path, _recursive, cb) => cb(null));
    ftp.rename.mockImplementation((_src, _dest, cb) => cb(null));

    await expect(fileSystem.chmod('/remote/file.txt', 0o755)).resolves.toBeUndefined();
    await expect(fileSystem.mkdir('/remote/folder')).resolves.toBeUndefined();
    await expect(fileSystem.unlink('/remote/file.txt')).resolves.toBeUndefined();
    await expect(fileSystem.rmdir('/remote/folder', true)).resolves.toBeUndefined();
    await expect(fileSystem.rename('/remote/old.txt', '/remote/new.txt')).resolves.toBeUndefined();
    await expect(fileSystem.renameAtomic('/remote/old.txt', '/remote/new.txt')).resolves.toBeUndefined();
    await expect(fileSystem.symlink('/remote/target', '/remote/link')).resolves.toBeUndefined();

    expect(ftp.site).toHaveBeenCalledWith('CHMOD 755 /remote/file.txt', expect.any(Function));
    expect(ftp.rename).toHaveBeenCalledTimes(2);
  });

  test('preserves mtime when supported and prefers input errors from put operations', async () => {
    const { fileSystem, ftp } = createFileSystem();
    const fd = {
      path: '/remote/file.txt',
      flags: 'w',
    };
    const setLastMod = jest.spyOn(fileSystem as any, 'atomicSetLastMod');

    setLastMod.mockResolvedValueOnce(undefined);
    await expect(fileSystem.futimes(fd as any, 0, 1)).resolves.toBeUndefined();
    expect(setLastMod).toHaveBeenCalledWith('/remote/file.txt', new Date(1000));

    setLastMod.mockRejectedValueOnce(new Error('unsupported'));
    await expect(fileSystem.futimes(fd as any, 0, 2)).resolves.toBeUndefined();
    expect(loggerInfo).toHaveBeenCalledWith("Don't Support MFMT");

    setLastMod.mockClear();
    await expect(fileSystem.futimes(fd as any, 0, 3)).resolves.toBeUndefined();
    expect(setLastMod).not.toHaveBeenCalled();

    ftp.put.mockImplementation((_input, _path, cb) => cb(null));
    await expect(
      fileSystem.put(Readable.from(['ok']), '/remote/file.txt')
    ).resolves.toBeUndefined();

    ftp.put.mockImplementation((_input, _path, cb) => {
      setImmediate(() => cb(new Error('upload failed')));
    });
    ftp.abort.mockImplementation(cb => cb(new Error('abort failed')));

    const brokenInput = new PassThrough();
    const pending = fileSystem.put(brokenInput, '/remote/file.txt');
    brokenInput.emit('error', new Error('input failed'));

    await expect(pending).rejects.toThrow('input failed');
    expect(loggerError).toHaveBeenCalledWith(expect.any(Error), 'fail to abort');
  });

  test('ensures directories across success, recursion, and fallback error paths', async () => {
    const { fileSystem } = createFileSystem();
    const lstat = jest.spyOn(fileSystem, 'lstat');
    const mkdir = jest.spyOn(fileSystem, 'mkdir');

    lstat.mockResolvedValueOnce({
      type: FileType.Directory,
    } as any);
    await expect(fileSystem.ensureDir('/remote/existing')).resolves.toBeUndefined();
    expect(mkdir).not.toHaveBeenCalled();

    lstat.mockReset();
    mkdir.mockReset();
    lstat.mockResolvedValueOnce({
      type: FileType.File,
    } as any);
    await expect(fileSystem.ensureDir('/remote/file.txt')).rejects.toThrow(
      '/remote/file.txt is not a valid directory path'
    );
    expect(loggerError).toHaveBeenCalledWith(
      '/remote/file.txt (type = 2)is not a directory'
    );

    lstat.mockReset();
    mkdir.mockReset();
    const existsError: any = new Error('File exists');
    existsError.code = 550;
    lstat.mockRejectedValueOnce(new Error('missing'));
    mkdir.mockRejectedValueOnce(existsError);
    await expect(fileSystem.ensureDir('/remote/existing')).resolves.toBeUndefined();

    lstat.mockReset();
    mkdir.mockReset();
    const missingParentError: any = new Error('Missing parent');
    missingParentError.code = 550;
    missingParentError.message = 'No such file';
    lstat.mockRejectedValueOnce(new Error('missing'));
    mkdir.mockImplementation(async dir => {
      if (dir === '/remote/a/b') {
        if ((mkdir as jest.Mock).mock.calls.filter(call => call[0] === '/remote/a/b').length === 1) {
          throw missingParentError;
        }
        return;
      }
      if (dir === '/remote/a') {
        return;
      }
      throw new Error(`unexpected dir ${dir}`);
    });
    await expect(fileSystem.ensureDir('/remote/a/b')).resolves.toBeUndefined();
    expect((mkdir as jest.Mock).mock.calls.map(call => call[0])).toEqual([
      '/remote/a/b',
      '/remote/a',
      '/remote/a/b',
    ]);

    lstat.mockReset();
    mkdir.mockReset();
    const fallbackError: any = new Error('Unknown error');
    fallbackError.code = 500;
    lstat
      .mockRejectedValueOnce(new Error('missing'))
      .mockResolvedValueOnce({
        type: FileType.Directory,
      } as any);
    mkdir.mockRejectedValueOnce(fallbackError);
    await expect(fileSystem.ensureDir('/remote/fallback')).resolves.toBeUndefined();

    lstat.mockReset();
    mkdir.mockReset();
    const fatalError: any = new Error('Fatal');
    fatalError.code = 500;
    lstat
      .mockRejectedValueOnce(new Error('missing'))
      .mockRejectedValueOnce(new Error('still missing'));
    mkdir.mockRejectedValueOnce(fatalError);
    await expect(fileSystem.ensureDir('/remote/fatal')).rejects.toThrow('Fatal');
  });

  test('covers rights-less stats and the low-level atomic ftp helpers directly', async () => {
    const { fileSystem, ftp } = createFileSystem();
    const readable = Readable.from(['payload']);

    expect(
      fileSystem.toFileStat({
        ...makeStat('file.txt', '-'),
        rights: undefined,
      } as any).mode
    ).toBe(0o666);

    ftp.list.mockImplementation((_path, cb) => cb(null, undefined));
    ftp.get.mockImplementation((_path, cb) => cb(null, readable));
    ftp.put.mockImplementation((_input, _path, cb) => cb(null));
    ftp.delete.mockImplementation((_path, cb) => cb(null));
    ftp.mkdir.mockImplementation((_path, cb) => cb(null));
    ftp.rmdir.mockImplementation((_path, _recursive, cb) => cb(null));
    ftp.site.mockImplementation((_command, cb) => cb(null));
    ftp.setLastMod.mockImplementation((_path, _date, cb) => cb(null));

    await expect((fileSystem as any).atomicList('/remote')).resolves.toEqual([]);
    await expect((fileSystem as any).atomicGet('/remote/file.txt')).resolves.toBe(readable);
    await expect((fileSystem as any).atomicPut(Readable.from(['x']), '/remote/file.txt')).resolves.toBeUndefined();
    await expect((fileSystem as any).atomicDeleteFile('/remote/file.txt')).resolves.toBeUndefined();
    await expect((fileSystem as any).atomicMakeDir('/remote/folder')).resolves.toBeUndefined();
    await expect((fileSystem as any).atomicRemoveDir('/remote/folder', true)).resolves.toBeUndefined();
    await expect((fileSystem as any).atomicSite('NOOP')).resolves.toBeUndefined();
    await expect((fileSystem as any).atomicSetLastMod('/remote/file.txt', new Date(1000))).resolves.toBeUndefined();
  });

  test('surfaces atomic helper failures and stops recursive ensureDir at the root path', async () => {
    const { fileSystem, ftp } = createFileSystem();
    const failure = new Error('ftp failed');

    ftp.list.mockImplementation((_path, cb) => cb(failure));
    ftp.get.mockImplementation((_path, cb) => cb(failure));
    ftp.put.mockImplementation((_input, _path, cb) => cb(failure));
    ftp.delete.mockImplementation((_path, cb) => cb(failure));
    ftp.mkdir.mockImplementation((_path, cb) => cb(failure));
    ftp.rmdir.mockImplementation((_path, _recursive, cb) => cb(failure));
    ftp.site.mockImplementation((_command, cb) => cb(failure));
    ftp.setLastMod.mockImplementation((_path, _date, cb) => cb(failure));
    ftp.rename.mockImplementation((_src, _dest, cb) => cb(failure));

    await expect((fileSystem as any).atomicList('/remote')).rejects.toBe(failure);
    await expect((fileSystem as any).atomicGet('/remote/file.txt')).rejects.toBe(failure);
    await expect((fileSystem as any).atomicPut(Readable.from(['x']), '/remote/file.txt')).rejects.toBe(failure);
    await expect((fileSystem as any).atomicDeleteFile('/remote/file.txt')).rejects.toBe(failure);
    await expect((fileSystem as any).atomicMakeDir('/remote/folder')).rejects.toBe(failure);
    await expect((fileSystem as any).atomicRemoveDir('/remote/folder', true)).rejects.toBe(failure);
    await expect((fileSystem as any).atomicSite('NOOP')).rejects.toBe(failure);
    await expect((fileSystem as any).atomicSetLastMod('/remote/file.txt', new Date(1000))).rejects.toBe(failure);
    await expect(fileSystem.renameAtomic('/remote/a', '/remote/b')).rejects.toBe(failure);

    const rootError: any = new Error('root failed');
    rootError.code = 550;
    rootError.message = 'No such file';
    jest.spyOn(fileSystem, 'mkdir').mockRejectedValueOnce(rootError);
    await expect((fileSystem as any)._ensureDir('/', false)).rejects.toBe(rootError);
  });
});

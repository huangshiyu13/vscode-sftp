import * as path from 'path';
import { PassThrough, Readable } from 'stream';

import SFTPFileSystem from '../sftpFileSystem';
import { FileType } from '../fileSystem';

function makeStats({
  mode = 0o100644,
  size = 3,
  mtime = 2,
  atime = 1,
  type = 'file',
} = {}) {
  return {
    mode,
    size,
    mtime,
    atime,
    isDirectory: () => type === 'dir',
    isFile: () => type === 'file',
    isSymbolicLink: () => type === 'link',
  };
}

function createFileSystem() {
  const sftp = {
    lstat: jest.fn(),
    open: jest.fn(),
    close: jest.fn(),
    fstat: jest.fn(),
    stat: jest.fn(),
    futimes: jest.fn(),
    fchmod: jest.fn(),
    chmod: jest.fn(),
    createReadStream: jest.fn(),
    rename: jest.fn(),
    ext_openssh_rename: jest.fn(),
    readlink: jest.fn(),
    symlink: jest.fn(),
    mkdir: jest.fn(),
    readdir: jest.fn(),
    unlink: jest.fn(),
    rmdir: jest.fn(),
    createWriteStream: jest.fn(),
  };
  const client = {
    getFsClient: () => sftp,
    connect: jest.fn(),
    onDisconnected: jest.fn(),
    end: jest.fn(),
  };

  return {
    fileSystem: new SFTPFileSystem(path.posix, {
      client,
    } as any),
    sftp,
  };
}

describe('core/fs/sftpFileSystem', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('converts file stats and wraps lstat, open, close, and fstat operations', async () => {
    const { fileSystem, sftp } = createFileSystem();
    const fileStats = makeStats();
    const fileItem = {
      filename: 'file.txt',
      attrs: fileStats,
    };

    expect(fileSystem.toFileStat(fileStats as any)).toEqual(
      expect.objectContaining({
        type: FileType.File,
        mode: 0o644,
        size: 3,
        mtime: 2000,
        atime: 1000,
      })
    );
    expect(fileSystem.toFileEntry('/remote/file.txt', fileItem as any)).toEqual(
      expect.objectContaining({
        fspath: '/remote/file.txt',
        name: 'file.txt',
      })
    );

    sftp.lstat.mockImplementation((_path, cb) => cb(null, fileStats));
    await expect(fileSystem.lstat('/remote/file.txt')).resolves.toEqual(
      expect.objectContaining({
        type: FileType.File,
      })
    );

    sftp.lstat.mockImplementationOnce((_path, cb) => cb(new Error('missing')));
    await expect(fileSystem.lstat('/remote/missing.txt')).rejects.toThrow('missing');

    const handle = Buffer.from('fd');
    sftp.open.mockImplementation((_path, _flags, _mode, cb) => cb(null, handle));
    await expect(fileSystem.open('/remote/file.txt', 'w', 0o644)).resolves.toEqual({
      path: '/remote/file.txt',
      handle,
    });

    sftp.open.mockImplementationOnce((_path, _flags, _mode, cb) => cb(new Error('open failed')));
    await expect(fileSystem.open('/remote/file.txt', 'w', 0o644)).rejects.toThrow('open failed');

    sftp.close.mockImplementation((_handle, cb) => cb(null));
    await expect(fileSystem.close({ handle, path: '/remote/file.txt' } as any)).resolves.toBeUndefined();

    sftp.close.mockImplementationOnce((_handle, cb) => cb(new Error('close failed')));
    await expect(fileSystem.close({ handle, path: '/remote/file.txt' } as any)).rejects.toThrow(
      'close failed'
    );

    sftp.fstat.mockImplementation((_handle, cb) => cb(null, fileStats));
    await expect(fileSystem.fstat({ handle, path: '/remote/file.txt' } as any)).resolves.toEqual(
      expect.objectContaining({
        type: FileType.File,
      })
    );

    sftp.fstat.mockImplementationOnce((_handle, cb) => cb(new Error('fstat failed')));
    sftp.stat.mockImplementationOnce((_path, cb) => cb(null, makeStats({ type: 'dir' })));
    await expect(fileSystem.fstat({ handle, path: '/remote/folder' } as any)).resolves.toEqual(
      expect.objectContaining({
        type: FileType.Directory,
      })
    );

    sftp.fstat.mockImplementationOnce((_handle, cb) => cb(new Error('fstat failed')));
    sftp.stat.mockImplementationOnce((_path, cb) => cb(new Error('stat failed')));
    await expect(fileSystem.fstat({ handle, path: '/remote/file.txt' } as any)).rejects.toThrow(
      'fstat failed'
    );
  });

  test('wraps timestamps, permissions, links, directories, and rename operations', async () => {
    const { fileSystem, sftp } = createFileSystem();
    const handle = Buffer.from('fd');
    const fd = {
      handle,
      path: '/remote/file.txt',
    };

    sftp.futimes.mockImplementation((_handle, _atime, _mtime, cb) => cb(null));
    sftp.fchmod.mockImplementation((_handle, _mode, cb) => cb(null));
    sftp.chmod.mockImplementation((_path, _mode, cb) => cb(null));
    sftp.readlink.mockImplementation((_path, cb) => cb(null, '/remote/target'));
    sftp.symlink.mockImplementation((_target, _path, cb) => cb(null));
    sftp.mkdir.mockImplementation((_dir, cb) => cb(null));
    sftp.rename.mockImplementation((_src, _dest, cb) => cb(null));
    sftp.ext_openssh_rename.mockImplementation((_src, _dest, cb) => cb(null));
    sftp.unlink.mockImplementation((_path, cb) => cb(null));
    sftp.rmdir.mockImplementation((_path, cb) => cb(null));
    sftp.readdir.mockImplementation((_dir, cb) =>
      cb(null, [
        {
          filename: 'file.txt',
          attrs: makeStats(),
        },
      ])
    );

    await expect(fileSystem.futimes(fd as any, 1, 2)).resolves.toBeUndefined();
    await expect(fileSystem.fchmod(fd as any, 0o600)).resolves.toBeUndefined();
    await expect(fileSystem.chmod('/remote/file.txt', 0o755)).resolves.toBeUndefined();
    await expect(fileSystem.readlink('/remote/file.txt')).resolves.toBe('/remote/target');
    await expect(fileSystem.symlink('/remote/target', '/remote/link')).resolves.toBeUndefined();
    await expect(fileSystem.mkdir('/remote/folder')).resolves.toBeUndefined();
    await expect(fileSystem.rename('/remote/old.txt', '/remote/new.txt')).resolves.toBeUndefined();
    await expect(fileSystem.renameAtomic('/remote/old.txt', '/remote/new.txt')).resolves.toBeUndefined();
    await expect(fileSystem.unlink('/remote/file.txt')).resolves.toBeUndefined();
    await expect(fileSystem.rmdir('/remote/folder', false)).resolves.toBeUndefined();
    await expect(fileSystem.list('/remote')).resolves.toEqual([
      expect.objectContaining({
        fspath: '/remote/file.txt',
        name: 'file.txt',
      }),
    ]);

    sftp.fchmod.mockImplementationOnce((_handle, _mode, cb) => cb(new Error('fchmod failed')));
    sftp.chmod.mockImplementationOnce((_path, _mode, cb) => cb(null));
    await expect(fileSystem.fchmod(fd as any, 0o600)).resolves.toBeUndefined();

    sftp.fchmod.mockImplementationOnce((_handle, _mode, cb) => cb(new Error('fchmod failed')));
    sftp.chmod.mockImplementationOnce((_path, _mode, cb) => cb(new Error('chmod failed')));
    await expect(fileSystem.fchmod(fd as any, 0o600)).rejects.toThrow('fchmod failed');

    sftp.chmod.mockImplementationOnce((_path, _mode, cb) => cb(new Error('chmod failed')));
    await expect(fileSystem.chmod('/remote/file.txt', 0o755)).rejects.toThrow('chmod failed');

    sftp.readlink.mockImplementationOnce((_path, cb) => cb(new Error('readlink failed')));
    await expect(fileSystem.readlink('/remote/file.txt')).rejects.toThrow('readlink failed');

    sftp.symlink.mockImplementationOnce((_target, _path, cb) => cb(new Error('link failed')));
    await expect(fileSystem.symlink('/remote/target', '/remote/link')).rejects.toThrow('link failed');

    sftp.mkdir.mockImplementationOnce((_dir, cb) => cb(new Error('mkdir failed')));
    await expect(fileSystem.mkdir('/remote/folder')).rejects.toThrow('mkdir failed');

    sftp.rename.mockImplementationOnce((_src, _dest, cb) => cb(new Error('rename failed')));
    await expect(fileSystem.rename('/remote/old.txt', '/remote/new.txt')).rejects.toThrow(
      'rename failed'
    );

    sftp.ext_openssh_rename.mockImplementationOnce((_src, _dest, cb) =>
      cb(new Error('atomic rename failed'))
    );
    await expect(fileSystem.renameAtomic('/remote/old.txt', '/remote/new.txt')).rejects.toThrow(
      'atomic rename failed'
    );

    sftp.readdir.mockImplementationOnce((_dir, cb) => cb(new Error('readdir failed')));
    await expect(fileSystem.list('/remote')).rejects.toThrow('readdir failed');

    sftp.unlink.mockImplementationOnce((_path, cb) => cb(new Error('unlink failed')));
    await expect(fileSystem.unlink('/remote/file.txt')).rejects.toThrow('unlink failed');

    sftp.rmdir.mockImplementationOnce((_path, cb) => cb(new Error('rmdir failed')));
    await expect(fileSystem.rmdir('/remote/folder', false)).rejects.toThrow('rmdir failed');
  });

  test('creates read and write streams and supports fd-based put operations', async () => {
    const { fileSystem, sftp } = createFileSystem();
    const fd = {
      handle: Buffer.from('fd'),
      path: '/remote/file.txt',
    };
    const readable = Readable.from(['hello']);
    const writer = new PassThrough() as PassThrough & {
      handle?: Buffer;
      path?: string;
      flags?: string;
      mode?: number;
    };

    sftp.createReadStream.mockReturnValue(readable);
    await expect(fileSystem.get('/remote/file.txt')).resolves.toBe(readable);

    sftp.createReadStream.mockImplementationOnce(() => {
      throw new Error('stream failed');
    });
    await expect(fileSystem.get('/remote/file.txt')).rejects.toThrow('stream failed');

    sftp.createWriteStream.mockReturnValue(writer as any);
    await expect(fileSystem.put(Readable.from(['payload']), '/remote/file.txt')).resolves.toBeUndefined();

    const putSpy = jest.spyOn(fileSystem as any, '_put').mockResolvedValue(undefined);
    const chmodSpy = jest.spyOn(fileSystem, 'fchmod').mockResolvedValue(undefined);
    await expect(
      fileSystem.put(Readable.from(['payload']), '/remote/file.txt', {
        fd,
        mode: 0o600,
      } as any)
    ).resolves.toBeUndefined();
    expect(chmodSpy).toHaveBeenCalledWith(fd, 0o600);
    expect(putSpy).toHaveBeenCalledWith(
      expect.anything(),
      '/remote/file.txt',
      expect.objectContaining({
        handle: fd.handle,
        mode: 0o600,
      })
    );

    chmodSpy.mockRejectedValueOnce(new Error('chmod failed'));
    await expect(
      fileSystem.put(Readable.from(['payload']), '/remote/file.txt', {
        fd,
        mode: 0o600,
      } as any)
    ).resolves.toBeUndefined();

    putSpy.mockRestore();
    chmodSpy.mockRestore();

    const brokenWriter = new PassThrough();
    sftp.createWriteStream.mockReturnValueOnce(brokenWriter as any);
    const brokenInput = new PassThrough();
    const pending = (fileSystem as any)._put(brokenInput, '/remote/file.txt');
    brokenInput.emit('error', new Error('input failed'));
    await expect(pending).rejects.toThrow('input failed');
  });

  test('ensures directories and recursively removes trees', async () => {
    const { fileSystem } = createFileSystem();
    const mkdir = jest.spyOn(fileSystem, 'mkdir');
    const lstat = jest.spyOn(fileSystem, 'lstat');

    await expect(fileSystem.ensureDir('/')).resolves.toBeUndefined();
    await expect(fileSystem.ensureDir('C:/')).resolves.toBeUndefined();

    mkdir.mockResolvedValueOnce(undefined);
    await expect(fileSystem.ensureDir('/remote/folder')).resolves.toBeUndefined();

    mkdir.mockReset();
    const missingParentError: any = new Error('missing parent');
    missingParentError.code = 2;
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

    mkdir.mockReset();
    lstat.mockResolvedValueOnce({
      type: FileType.Directory,
    } as any);
    const existsError: any = new Error('exists');
    existsError.code = 4;
    mkdir.mockRejectedValueOnce(existsError);
    await expect(fileSystem.ensureDir('/remote/existing')).resolves.toBeUndefined();

    mkdir.mockReset();
    lstat.mockRejectedValueOnce(new Error('missing'));
    const fatalError: any = new Error('fatal');
    fatalError.code = 4;
    mkdir.mockRejectedValueOnce(fatalError);
    await expect(fileSystem.ensureDir('/remote/fatal')).rejects.toThrow('fatal');

    const listSpy = jest
      .spyOn(fileSystem, 'list')
      .mockImplementation(async dir =>
        dir === '/remote/root'
          ? [
              {
                fspath: '/remote/root/folder',
                type: FileType.Directory,
              },
              {
                fspath: '/remote/root/file.txt',
                type: FileType.File,
              },
            ]
          : []
      );
    const unlinkSpy = jest.spyOn(fileSystem, 'unlink').mockResolvedValue(undefined);
    const rmdirSpy = jest.spyOn(fileSystem as any, 'sftp', 'get').mockReturnValue({
      ...((fileSystem as any).sftp || {}),
      rmdir: jest.fn((_path, cb) => cb(null)),
    });

    await expect(fileSystem.rmdir('/remote/root', true)).resolves.toBeUndefined();
    expect(listSpy).toHaveBeenCalledWith('/remote/root');
    expect(unlinkSpy).toHaveBeenCalledWith('/remote/root/file.txt');

    rmdirSpy.mockRestore();
  });
});

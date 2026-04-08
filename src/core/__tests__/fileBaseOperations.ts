const showErrorMessage = jest.fn();
const warn = jest.fn();

jest.mock('vscode', () => ({
  window: {
    showErrorMessage: (...args) => showErrorMessage(...args),
  },
}));

jest.mock('../../logger', () => ({
  __esModule: true,
  default: {
    warn: (...args) => warn(...args),
  },
}));

import {
  transferFile,
  transferSymlink,
  removeFile,
  removeDir,
  rename,
  createDir,
  createFile,
} from '../fileBaseOperations';

describe('core/fileBaseOperations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('transferFile streams from the source filesystem into the destination filesystem', async () => {
    const stream = { kind: 'stream' };
    const srcFs = {
      get: jest.fn().mockResolvedValue(stream),
    };
    const desFs = {
      put: jest.fn().mockResolvedValue(undefined),
    };

    await transferFile('/src/a.txt', '/dest/a.txt', srcFs as any, desFs as any, { mode: 0o644 });

    expect(srcFs.get).toHaveBeenCalledWith('/src/a.txt', { mode: 0o644 });
    expect(desFs.put).toHaveBeenCalledWith(stream, '/dest/a.txt', { mode: 0o644 });
  });

  test('transferSymlink ignores "already exists" errors and rethrows other failures', async () => {
    const srcFs = {
      readlink: jest.fn().mockResolvedValue('/target/path'),
    };
    const desFs = {
      symlink: jest.fn().mockRejectedValueOnce({ code: 'EEXIST' }).mockRejectedValueOnce({ code: 'EPERM' }),
    };

    await expect(
      transferSymlink('/src/link', '/dest/link', srcFs as any, desFs as any, {})
    ).resolves.toBeUndefined();
    await expect(
      transferSymlink('/src/link', '/dest/link', srcFs as any, desFs as any, {})
    ).rejects.toEqual({ code: 'EPERM' });
  });

  test('remove, rename, and mkdir helpers forward directly to the filesystem', async () => {
    const fs = {
      unlink: jest.fn().mockResolvedValue(undefined),
      rmdir: jest.fn().mockResolvedValue(undefined),
      rename: jest.fn().mockResolvedValue(undefined),
      mkdir: jest.fn().mockResolvedValue(undefined),
    };

    await removeFile('/tmp/file.txt', fs as any, {});
    await removeDir('/tmp/folder', fs as any, {});
    await rename('/tmp/a.txt', '/tmp/b.txt', fs as any);
    await createDir('/tmp/folder', fs as any, {});

    expect(fs.unlink).toHaveBeenCalledWith('/tmp/file.txt');
    expect(fs.rmdir).toHaveBeenCalledWith('/tmp/folder', true);
    expect(fs.rename).toHaveBeenCalledWith('/tmp/a.txt', '/tmp/b.txt');
    expect(fs.mkdir).toHaveBeenCalledWith('/tmp/folder');
  });

  test('createFile aborts when the target already exists', async () => {
    const fs = {
      lstat: jest.fn().mockResolvedValue({}),
      open: jest.fn(),
      put: jest.fn(),
    };

    await createFile('/remote/existing.txt', fs as any, {});

    expect(warn).toHaveBeenCalledWith('Can\'t create file becase file already exist');
    expect(showErrorMessage).toHaveBeenCalledWith('Can\'t create file becase file already exist');
    expect(fs.open).not.toHaveBeenCalled();
    expect(fs.put).not.toHaveBeenCalled();
  });

  test('createFile opens a new file descriptor and uploads an empty stream', async () => {
    const fs = {
      lstat: jest.fn().mockRejectedValue(new Error('missing')),
      open: jest.fn().mockResolvedValue(17),
      put: jest.fn().mockResolvedValue(undefined),
    };

    await createFile('/remote/new.txt', fs as any, {});

    expect(fs.open).toHaveBeenCalledWith('/remote/new.txt', 'w');
    expect(fs.put).toHaveBeenCalledWith(
      expect.objectContaining({ read: expect.any(Function) }),
      '/remote/new.txt',
      { fd: 17 }
    );
  });
});

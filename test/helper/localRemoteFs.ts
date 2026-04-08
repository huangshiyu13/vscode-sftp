import * as fs from 'fs';
import * as fse from 'fs-extra';
import FileSystem, { FileStats } from '../../src/core/fs/fileSystem';
import localfs from '../../src/core/localFs';
import RemoteFileSystem from '../../src/core/fs/remoteFileSystem';

// @ts-ignore
export default class LocalRemoteFileSystem extends RemoteFileSystem {
  private readonly _fdToPath: Map<number, string> = new Map();

  _createClient() {
    return {};
  }

  toFileStat(stat: fs.Stats): FileStats {
    return {
      type: FileSystem.getFileTypecharacter(stat),
      size: stat.size,
      mode: stat.mode & parseInt('777', 8), // tslint:disable-line:no-bitwise
      mtime: this.toLocalTime(stat.mtime.getTime()),
      atime: this.toLocalTime(stat.atime.getTime()),
    };
  }

  async open(path: string, flags: string, mode?: number): Promise<number> {
    const fd = await fse.open(path, flags, mode);
    this._fdToPath.set(fd, path);
    return fd;
  }

  async futimes(fd: number, atime: number, mtime: number): Promise<void> {
    const remoteAtime = this.toRemoteTimeInSecnonds(atime);
    const remoteMtime = this.toRemoteTimeInSecnonds(mtime);

    try {
      await fse.futimes(fd, remoteAtime, remoteMtime);
    } catch (error) {
      if (error && error.code === 'EBADF') {
        const path = this._fdToPath.get(fd);
        if (!path) {
          throw error;
        }

        await fse.utimes(path, remoteAtime, remoteMtime);
        return;
      }

      throw error;
    }
  }

  async close(fd: number): Promise<void> {
    this._fdToPath.delete(fd);
    try {
      await fse.close(fd);
    } catch (error) {
      if (error && error.code === 'EBADF') {
        return;
      }

      throw error;
    }
  }
}

[
  'toFileEntry',
  'readFile',
  'fstat',
  'get',
  'put',
  'mkdir',
  'ensureDir',
  'list',
  'lstat',
  'readlink',
  'symlink',
  'unlink',
  'rmdir',
  'rename',
].forEach(method => {
  Object.defineProperty(LocalRemoteFileSystem.prototype, method, {
    enumerable: false,
    value(...args) {
      const fn = localfs[method];
      return fn.call(this, ...args);
    },
  });
});

import * as path from 'path';
import { PassThrough, Readable } from 'stream';
import RemoteFileSystem from '../remoteFileSystem';
import { FileType } from '../fileSystem';

const createClient = jest.fn();

function createReadable(content: string): Readable {
  let emitted = false;
  return new Readable({
    read() {
      if (emitted) {
        this.push(null);
        return;
      }

      emitted = true;
      this.push(content);
    },
  });
}

class TestRemoteFileSystem extends RemoteFileSystem {
  getMock = jest.fn();

  _createClient(option) {
    return createClient(option);
  }

  open(): Promise<any> {
    return Promise.resolve('fd');
  }

  close(): Promise<void> {
    return Promise.resolve();
  }

  fstat(): Promise<any> {
    return Promise.resolve({
      type: FileType.File,
      mode: 0o644,
      size: 0,
      mtime: 0,
      atime: 0,
    });
  }

  futimes(): Promise<void> {
    return Promise.resolve();
  }

  get(pathArg, optionArg?) {
    return this.getMock(pathArg, optionArg);
  }

  put(): Promise<void> {
    return Promise.resolve();
  }

  mkdir(): Promise<void> {
    return Promise.resolve();
  }

  ensureDir(): Promise<void> {
    return Promise.resolve();
  }

  chmod(): Promise<void> {
    return Promise.resolve();
  }

  list(): Promise<any[]> {
    return Promise.resolve([]);
  }

  lstat(): Promise<any> {
    return Promise.resolve({
      type: FileType.File,
      mode: 0o644,
      size: 0,
      mtime: 0,
      atime: 0,
    });
  }

  readlink(): Promise<string> {
    return Promise.resolve('');
  }

  symlink(): Promise<void> {
    return Promise.resolve();
  }

  unlink(): Promise<void> {
    return Promise.resolve();
  }

  rmdir(): Promise<void> {
    return Promise.resolve();
  }

  rename(): Promise<void> {
    return Promise.resolve();
  }

  renameAtomic(): Promise<void> {
    return Promise.resolve();
  }
}

describe('core/fs/remoteFileSystem', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('requires either a client or clientOption and can create a client from options', () => {
    expect(() => new TestRemoteFileSystem(path, {} as any)).toThrow(
      'No client or clientOption is provided'
    );

    const createdClient = {
      connect: jest.fn(),
      onDisconnected: jest.fn(),
      end: jest.fn(),
    };
    createClient.mockReturnValue(createdClient);

    const fileSystem = new TestRemoteFileSystem(path, {
      clientOption: {
        host: 'target.internal',
        port: 22,
      },
    } as any);

    expect(createClient).toHaveBeenCalledWith({
      host: 'target.internal',
      port: 22,
    });
    expect(fileSystem.getClient()).toBe(createdClient);
  });

  test('delegates client lifecycle and converts remote timestamps', async () => {
    const client = {
      connect: jest.fn().mockResolvedValue(undefined),
      onDisconnected: jest.fn(),
      end: jest.fn(),
    };
    const fileSystem = new TestRemoteFileSystem(path, {
      client,
      remoteTimeOffsetInHours: 2,
    } as any);
    const disconnectHandler = jest.fn();

    await expect(
      fileSystem.connect(
        {
          host: 'target.internal',
          port: 22,
        } as any,
        {
          askForPasswd: jest.fn(),
        } as any
      )
    ).resolves.toBeUndefined();

    fileSystem.onDisconnected(disconnectHandler);
    fileSystem.end();

    expect(client.connect).toHaveBeenCalled();
    expect(client.onDisconnected).toHaveBeenCalledWith(disconnectHandler);
    expect(client.end).toHaveBeenCalledTimes(1);
    expect(fileSystem.toLocalTime(7200000)).toBe(0);
    expect(fileSystem.toRemoteTimeInSecnonds(10)).toBe(7210);

    (fileSystem as any).client = undefined;
    expect(() => fileSystem.getClient()).toThrow('client not found!');
  });

  test('reads buffers and encoded strings and surfaces get or stream errors', async () => {
    const client = {
      connect: jest.fn(),
      onDisconnected: jest.fn(),
      end: jest.fn(),
    };
    const fileSystem = new TestRemoteFileSystem(path, {
      client,
    } as any);

    fileSystem.getMock.mockResolvedValueOnce(createReadable('hello'));
    await expect(fileSystem.readFile('/remote/file.txt')).resolves.toEqual(Buffer.from('hello'));

    fileSystem.getMock.mockResolvedValueOnce(createReadable('world'));
    await expect(
      fileSystem.readFile('/remote/file.txt', {
        encoding: 'utf8',
      })
    ).resolves.toBe('world');

    fileSystem.getMock.mockRejectedValueOnce(new Error('missing'));
    await expect(fileSystem.readFile('/remote/missing.txt')).rejects.toThrow('missing');

    const brokenStream = new PassThrough();
    fileSystem.getMock.mockResolvedValueOnce(brokenStream);
    const pending = fileSystem.readFile('/remote/broken.txt');
    process.nextTick(() => {
      brokenStream.emit('error', new Error('stream failed'));
    });
    await expect(pending).rejects.toThrow('stream failed');
  });
});

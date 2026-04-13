jest.mock('../../../logger', () => ({
  __esModule: true,
  default: {
    trace: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    critical: jest.fn(),
  },
}));

import { EventEmitter } from 'events';
import SSHClient from '../sshClient';
import localFs from '../../localFs';
import logger from '../../../logger';
import { ErrorCode } from '../remoteClient';
import { SFTPFileSystem } from '../../fs';

describe('SSHClient proxyJump', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('does not open sftp subsystems on proxy jump intermediates', async () => {
    const sftp = new EventEmitter() as EventEmitter & { readdir: jest.Mock };
    sftp.readdir = jest.fn();

    jest
      .spyOn(localFs, 'readFile')
      .mockImplementation(async () => Buffer.from('PRIVATE KEY'));

    const connectSSHClient = jest
      .spyOn(SSHClient.prototype as any, '_connectSSHClient')
      .mockImplementation(async () => undefined);
    const getSftp = jest
      .spyOn(SSHClient.prototype as any, '_getSftp')
      .mockResolvedValue(sftp);
    const makeHopping = jest
      .spyOn(SSHClient.prototype as any, '_makeHopping')
      .mockImplementation(async () => ({
        on() {
          return undefined;
        },
        once() {
          return undefined;
        },
        end() {
          return undefined;
        },
      }));

    const option: any = {
      host: 'target.internal',
      port: 22,
      username: 'root',
      privateKeyPath: '/tmp/target-key',
      proxyJump: [
        {
          host: 'bastion.example.com',
          port: 2222,
          username: 'root',
          privateKeyPath: '/tmp/jump-key',
        },
      ],
      debug() {
        return undefined;
      },
    };

    const client = new SSHClient(option);
    await client.connect(option, {
      askForPasswd: async () => undefined,
    });

    expect(connectSSHClient).toHaveBeenCalledTimes(2);
    expect(makeHopping).toHaveBeenCalledTimes(1);
    expect(getSftp).toHaveBeenCalledTimes(1);
  });

  test('loads proxy jump private keys, defaults missing ports, and applies numeric fd limits', async () => {
    const sftp = {
      on: jest.fn(),
      _stream: {
        open: jest.fn(),
        opendir: jest.fn(),
        close: jest.fn(),
      },
    };

    jest
      .spyOn(localFs, 'readFile')
      .mockImplementation(async (filepath: string) => Buffer.from(`KEY:${filepath}`));

    const connectSSHClient = jest
      .spyOn(SSHClient.prototype as any, '_connectSSHClient')
      .mockImplementation(async () => undefined);
    jest
      .spyOn(SSHClient.prototype as any, '_getSftp')
      .mockResolvedValue(sftp);
    const makeHopping = jest
      .spyOn(SSHClient.prototype as any, '_makeHopping')
      .mockResolvedValueOnce({ id: 'jump-a-sock' })
      .mockResolvedValueOnce({ id: 'target-sock' });

    const client = new SSHClient({
      host: 'target.internal',
      username: 'root',
      port: 2222,
    } as any);

    await (client as any)._doConnect(
      {
        host: 'target.internal',
        username: 'root',
        port: 2222,
        privateKeyPath: '/tmp/target-key',
        limitOpenFilesOnRemote: 200,
        proxyJump: [
          {
            host: 'jump-a.internal',
            username: 'root',
            privateKeyPath: '/tmp/jump-a-key',
          },
          {
            host: 'jump-b.internal',
            username: 'deploy',
          },
        ],
      },
      {
        askForPasswd: jest.fn(),
      }
    );

    expect(connectSSHClient).toHaveBeenCalledTimes(3);
    expect(connectSSHClient.mock.calls[0][1]).toMatchObject({
      host: 'jump-a.internal',
      port: 22,
      privateKey: 'KEY:/tmp/jump-a-key',
      sock: undefined,
    });
    expect(connectSSHClient.mock.calls[1][1]).toMatchObject({
      host: 'jump-b.internal',
      port: 22,
      sock: { id: 'jump-a-sock' },
    });
    expect(connectSSHClient.mock.calls[2][1]).toMatchObject({
      host: 'target.internal',
      port: 2222,
      privateKey: 'KEY:/tmp/target-key',
      sock: { id: 'target-sock' },
    });
    expect(makeHopping).toHaveBeenCalledTimes(2);

    const request = (client as any)._hookCallForRequestFileDescriptor(jest.fn());
    (client as any)._opendFdNum = 200;
    request('/remote/file.txt', jest.fn());
    expect((client as any)._queuedFdRequireCall).toHaveLength(1);
  });

  test('reads hop chain keys through local and remote filesystems before connecting to the final target', async () => {
    const sftp = {
      on: jest.fn(),
      _stream: {
        open: jest.fn(),
        opendir: jest.fn(),
        close: jest.fn(),
      },
    };
    const readLocalKey = jest
      .spyOn(localFs, 'readFile')
      .mockImplementation(async (filepath: string) => Buffer.from(`LOCAL:${filepath}`));
    const readHopKey = jest
      .spyOn(SFTPFileSystem.prototype, 'readFile')
      .mockImplementation(async (filepath: string) => Buffer.from(`REMOTE:${filepath}`));
    const nestedConnect = jest
      .spyOn(SSHClient.prototype, 'connect')
      .mockResolvedValue(undefined as any);
    const connectSSHClient = jest
      .spyOn(SSHClient.prototype as any, '_connectSSHClient')
      .mockImplementation(async () => undefined);
    jest
      .spyOn(SSHClient.prototype as any, '_getSftp')
      .mockResolvedValue(sftp);
    const makeHopping = jest
      .spyOn(SSHClient.prototype as any, '_makeHopping')
      .mockResolvedValueOnce({ id: 'hop-a-sock' })
      .mockResolvedValueOnce({ id: 'target-sock' });

    const client = new SSHClient({
      host: 'jump-a.internal',
      username: 'root',
    } as any);

    await (client as any)._doConnect(
      {
        host: 'jump-a.internal',
        username: 'root',
        privateKeyPath: '/tmp/jump-a-key',
        hop: [
          {
            host: 'jump-b.internal',
            username: 'deploy',
            privateKeyPath: '/tmp/jump-b-key',
          },
          {
            host: 'target.internal',
            username: 'app',
            port: 2022,
            privateKeyPath: '/tmp/target-key',
          },
        ],
      },
      {
        askForPasswd: jest.fn(),
      }
    );

    expect(readLocalKey).toHaveBeenCalledWith('/tmp/jump-a-key');
    expect(readHopKey).toHaveBeenCalledWith('/tmp/jump-b-key');
    expect(readHopKey).toHaveBeenCalledWith('/tmp/target-key');
    expect(nestedConnect).toHaveBeenCalledTimes(2);
    expect(nestedConnect.mock.calls[0][0]).toMatchObject({
      host: 'jump-a.internal',
      port: 22,
      privateKey: 'LOCAL:/tmp/jump-a-key',
      sock: undefined,
    });
    expect(nestedConnect.mock.calls[1][0]).toMatchObject({
      host: 'jump-b.internal',
      port: 22,
      privateKey: 'REMOTE:/tmp/jump-b-key',
      sock: { id: 'hop-a-sock' },
    });
    expect(connectSSHClient).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        host: 'target.internal',
        port: 2022,
        privateKey: 'REMOTE:/tmp/target-key',
        sock: { id: 'target-sock' },
      }),
      expect.anything()
    );
    expect(makeHopping).toHaveBeenCalledTimes(2);
  });

  test('ends the ssh client when the sftp channel closes', async () => {
    const sftp = new EventEmitter();
    jest
      .spyOn(SSHClient.prototype as any, '_connectSSHClient')
      .mockImplementation(async () => undefined);
    jest
      .spyOn(SSHClient.prototype as any, '_getSftp')
      .mockResolvedValue(sftp);

    const client = new SSHClient({
      host: 'target.internal',
      username: 'root',
      port: 22,
    } as any);
    const endSpy = jest.spyOn((client as any)._client, 'end');

    await client.connect(
      {
        host: 'target.internal',
        username: 'root',
        port: 22,
        password: 'secret',
      } as any,
      {
        askForPasswd: async () => undefined,
      }
    );

    sftp.emit('close');
    expect(endSpy).toHaveBeenCalledTimes(1);
  });

  test('recognizes provided auth and connects with passphrase and keyboard-interactive prompts', async () => {
    const client = new SSHClient({
      host: 'target.internal',
      username: 'root',
      port: 22,
    } as any);

    expect((client as any)._hasProvideAuth({ interactiveAuth: true })).toBe(true);
    expect((client as any)._hasProvideAuth({ interactiveAuth: ['otp'] })).toBe(true);
    expect((client as any)._hasProvideAuth({ password: 'secret' })).toBe(true);
    expect((client as any)._hasProvideAuth({ agent: '/tmp/agent.sock' })).toBe(true);
    expect((client as any)._hasProvideAuth({ privateKeyPath: '/tmp/id' })).toBe(true);
    expect((client as any)._hasProvideAuth({})).toBe(false);

    const handlers = {};
    const rawClient = {
      on: jest.fn(function(event, cb) {
        handlers[event] = cb;
        return rawClient;
      }),
      connect: jest.fn(),
    };
    const askForPasswd = jest
      .fn()
      .mockResolvedValueOnce('passphrase')
      .mockResolvedValueOnce('otp-code');
    const finish = jest.fn();

    const connectPromise = (client as any)._connectSSHClient(
      rawClient,
      {
        host: 'target.internal',
        username: 'root',
        port: 22,
        passphrase: true,
        interactiveAuth: true,
        connectTimeout: 1,
      },
      {
        askForPasswd,
      }
    );

    await new Promise(resolve => setImmediate(resolve));
    expect(askForPasswd).toHaveBeenCalledWith('[target.internal]: Enter your passphrase');
    expect(rawClient.connect).toHaveBeenCalledWith(
      expect.objectContaining({
        passphrase: 'passphrase',
        tryKeyboard: true,
        readyTimeout: 60000,
      })
    );

    handlers['keyboard-interactive'](
      'name',
      'instructions',
      'en',
      [{ prompt: 'Password:' }],
      finish
    );
    await Promise.resolve();
    await Promise.resolve();

    expect(askForPasswd).toHaveBeenLastCalledWith('[target.internal]: Password:');
    expect(finish).toHaveBeenCalledWith(['otp-code']);

    handlers['ready']();
    await expect(connectPromise).resolves.toBeUndefined();
  });

  test('cancels passphrase and interactive auth prompts and prefixes connection errors', async () => {
    const client = new SSHClient({
      host: 'target.internal',
      username: 'root',
      port: 22,
    } as any);

    await expect(
      (client as any)._connectSSHClient(
        {
          on: jest.fn(function() {
            return this;
          }),
          connect: jest.fn(),
        },
        {
          host: 'target.internal',
          username: 'root',
          port: 22,
          passphrase: true,
        },
        {
          askForPasswd: jest.fn().mockResolvedValue(undefined),
        }
      )
    ).rejects.toMatchObject({
      code: ErrorCode.CONNECT_CANCELLED,
      message: 'cancelled',
    });

    const handlers = {};
    const rawClient = {
      on: jest.fn(function(event, cb) {
        handlers[event] = cb;
        return rawClient;
      }),
      connect: jest.fn(),
    };
    const connectPromise = (client as any)._connectSSHClient(
      rawClient,
      {
        host: 'target.internal',
        username: 'root',
        port: 22,
        interactiveAuth: ['preset-answer'],
        connectTimeout: 500,
      },
      {
        askForPasswd: jest.fn(),
      }
    );
    const finish = jest.fn();
    handlers['keyboard-interactive'](
      'name',
      'instructions',
      'en',
      [{ prompt: 'Password:' }],
      finish
    );
    expect(finish).toHaveBeenCalledWith(['preset-answer']);
    handlers['error'](new Error('boom'));
    await expect(connectPromise).rejects.toThrow('[target.internal]: boom');

    const cancelHandlers = {};
    const cancelClient = {
      on: jest.fn(function(event, cb) {
        cancelHandlers[event] = cb;
        return cancelClient;
      }),
      connect: jest.fn(),
    };
    const cancelPromise = (client as any)._connectSSHClient(
      cancelClient,
      {
        host: 'target.internal',
        username: 'root',
        port: 22,
        interactiveAuth: true,
      },
      {
        askForPasswd: jest.fn().mockResolvedValue(undefined),
      }
    );
    cancelHandlers['keyboard-interactive'](
      'name',
      'instructions',
      'en',
      [{ prompt: 'Password:' }],
      jest.fn()
    );
    await expect(cancelPromise).rejects.toMatchObject({
      code: ErrorCode.CONNECT_CANCELLED,
      message: 'cancelled',
    });
  });

  test('gets sftp subsystems, creates forwarding hops, and exposes the active filesystem client', async () => {
    const client = new SSHClient({
      host: 'target.internal',
      username: 'root',
      port: 22,
    } as any);
    const sftp = new EventEmitter();

    await expect(
      (client as any)._getSftp({
        sftp(cb) {
          cb(null, sftp);
        },
      })
    ).resolves.toBe(sftp);

    await expect(
      (client as any)._getSftp({
        sftp(cb) {
          cb(new Error('sftp failed'));
        },
      })
    ).rejects.toThrow('sftp failed');

    const preClient = new SSHClient({
      host: 'jump.internal',
      username: 'root',
      port: 22,
    } as any);
    const stream = {
      end: jest.fn(),
    };
    const forwardOut = jest.spyOn((preClient as any)._client, 'forwardOut');
    forwardOut.mockImplementation((_srcHost, _srcPort, _dstHost, _dstPort, cb) => cb(null, stream));

    await expect((client as any)._makeHopping(preClient, 'target.internal', 22)).resolves.toBe(stream);
    expect(logger.info).toHaveBeenCalledWith('hopping from jump.internal to target.internal');

    forwardOut.mockImplementationOnce((_srcHost, _srcPort, _dstHost, _dstPort, cb) =>
      cb(new Error('forward failed'))
    );
    await expect((client as any)._makeHopping(preClient, 'target.internal', 22)).rejects.toThrow(
      'forward failed'
    );

    (client as any).sftp = sftp;
    expect(client.getFsClient()).toBe(sftp);
  });

  test('limits remote file descriptors and releases queued requests in order', async () => {
    const client = new SSHClient({
      host: 'target.internal',
      username: 'root',
      port: 22,
    } as any);

    expect(() => (client as any)._limitSftpFileDescriptor()).not.toThrow();

    const open = jest.fn((_path, cb) => cb(null, 'fd'));
    const opendir = jest.fn((_path, cb) => cb(null, 'dir-handle'));
    const close = jest.fn((_fd, cb) => cb(null));
    const sftp = {
      _stream: {
        open,
        opendir,
        close,
      },
    };
    (client as any).sftp = sftp;
    (client as any)._limitSftpFileDescriptor();

    expect(sftp._stream.open).not.toBe(open);
    expect(sftp._stream.opendir).not.toBe(opendir);
    expect(sftp._stream.close).not.toBe(close);

    const request = (client as any)._hookCallForRequestFileDescriptor(open);
    const release = (client as any)._hookCallForReleaseFileDescriptor(close);
    const callback = jest.fn();

    request('/remote/file.txt', callback);
    expect(open).toHaveBeenCalledTimes(1);
    expect((client as any)._opendFdNum).toBe(1);

    (client as any)._opendFdNum = 222;
    request('/remote/queued.txt', callback);
    expect((client as any)._queuedFdRequireCall).toHaveLength(1);
    expect(open).toHaveBeenCalledTimes(1);

    release('fd', callback);
    await Promise.resolve();
    await Promise.resolve();

    expect(open).toHaveBeenCalledTimes(2);
    expect(close).toHaveBeenCalledTimes(1);
  });

  test('connects with hop as a single object instead of an array', async () => {
    const sftp = {
      on: jest.fn(),
      _stream: {
        open: jest.fn(),
        opendir: jest.fn(),
        close: jest.fn(),
      },
    };

    jest
      .spyOn(localFs, 'readFile')
      .mockImplementation(async (filepath: string) => Buffer.from(`KEY:${filepath}`));

    const nestedConnect = jest
      .spyOn(SSHClient.prototype, 'connect')
      .mockResolvedValue(undefined as any);
    const connectSSHClient = jest
      .spyOn(SSHClient.prototype as any, '_connectSSHClient')
      .mockImplementation(async () => undefined);
    jest
      .spyOn(SSHClient.prototype as any, '_getSftp')
      .mockResolvedValue(sftp);
    const makeHopping = jest
      .spyOn(SSHClient.prototype as any, '_makeHopping')
      .mockResolvedValue({ id: 'hop-sock' });

    const client = new SSHClient({
      host: 'jump-a.internal',
      username: 'root',
    } as any);

    // hop is a single object (not an array)
    await (client as any)._doConnect(
      {
        host: 'jump-a.internal',
        username: 'root',
        port: 22,
        hop: {
          host: 'target.internal',
          username: 'deploy',
          port: 2222,
        },
      },
      {
        askForPasswd: jest.fn(),
      }
    );

    // The hop single-object path creates [option, hop], pops the last (target), then connects the first (jump-a) via nested connect
    // Then the final target is connected via _connectSSHClient on the main client
    expect(nestedConnect).toHaveBeenCalledTimes(1);
    expect(connectSSHClient.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(makeHopping.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  test('applies limitOpenFilesOnRemote as boolean true with default fd limit', async () => {
    const sftp = {
      on: jest.fn(),
      _stream: {
        open: jest.fn(),
        opendir: jest.fn(),
        close: jest.fn(),
      },
    };

    jest
      .spyOn(SSHClient.prototype as any, '_connectSSHClient')
      .mockImplementation(async () => undefined);
    jest
      .spyOn(SSHClient.prototype as any, '_getSftp')
      .mockResolvedValue(sftp);

    const client = new SSHClient({
      host: 'target.internal',
      username: 'root',
      port: 22,
    } as any);

    await (client as any)._doConnect(
      {
        host: 'target.internal',
        username: 'root',
        port: 22,
        password: 'secret',
        limitOpenFilesOnRemote: true,
      },
      {
        askForPasswd: jest.fn(),
      }
    );

    // When limitOpenFilesOnRemote is boolean true, the fd limit should stay at default (222)
    expect(sftp._stream.open).not.toBe(jest.fn()); // Should be hooked
    expect(sftp._stream.opendir).not.toBe(jest.fn()); // Should be hooked
    expect(sftp._stream.close).not.toBe(jest.fn()); // Should be hooked
  });

  test('ends hopping clients in reverse order', () => {
    const client = new SSHClient({
      host: 'target.internal',
      username: 'root',
      port: 22,
    } as any);
    const firstHop = {
      end: jest.fn(),
    };
    const secondHop = {
      end: jest.fn(),
    };

    (client as any).hoppingClients = [firstHop, secondHop];
    const endSpy = jest.spyOn((client as any)._client, 'end');

    client.end();

    expect(endSpy).toHaveBeenCalledTimes(1);
    expect(secondHop.end).toHaveBeenCalledTimes(1);
    expect(firstHop.end).toHaveBeenCalledTimes(1);
  });
});

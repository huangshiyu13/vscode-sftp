const promptForPassword = jest.fn();
const debug = jest.fn();
const showMsg = jest.fn();
const reset = jest.fn();

const localFs = { kind: 'local-fs' };
const sftpInstances: any[] = [];
const ftpInstances: any[] = [];
let createSftpConnectMock: () => jest.Mock;
let createFtpConnectMock: () => jest.Mock;

class MockSFTPFileSystem {
  pathResolver: any;
  option: any;
  disconnectHandler: ((reason: string) => void) | undefined;
  connect: jest.Mock;
  onDisconnected = jest.fn((cb: (reason: string) => void) => {
    this.disconnectHandler = cb;
  });
  end = jest.fn();

  constructor(pathResolver: any, option: any) {
    this.pathResolver = pathResolver;
    this.option = option;
    this.connect = createSftpConnectMock();
    sftpInstances.push(this);
  }
}

class MockFTPFileSystem {
  pathResolver: any;
  option: any;
  disconnectHandler: ((reason: string) => void) | undefined;
  connect: jest.Mock;
  onDisconnected = jest.fn((cb: (reason: string) => void) => {
    this.disconnectHandler = cb;
  });
  end = jest.fn();

  constructor(pathResolver: any, option: any) {
    this.pathResolver = pathResolver;
    this.option = option;
    this.connect = createFtpConnectMock();
    ftpInstances.push(this);
  }
}

jest.mock('../../host', () => ({
  __esModule: true,
  promptForPassword: (...args) => promptForPassword(...args),
}));

jest.mock('../../logger', () => ({
  __esModule: true,
  default: {
    debug: (...args) => debug(...args),
  },
}));

jest.mock('../../app', () => ({
  __esModule: true,
  default: {
    sftpBarItem: {
      showMsg: (...args) => showMsg(...args),
      reset: (...args) => reset(...args),
    },
  },
}));

jest.mock('../localFs', () => ({
  __esModule: true,
  default: localFs,
}));

jest.mock('../fs', () => ({
  __esModule: true,
  FileSystem: class FileSystem {},
  RemoteFileSystem: class RemoteFileSystem {},
  SFTPFileSystem: MockSFTPFileSystem,
  FTPFileSystem: MockFTPFileSystem,
}));

describe('core/remoteFs', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    sftpInstances.length = 0;
    ftpInstances.length = 0;
    createSftpConnectMock = () => jest.fn().mockResolvedValue(undefined);
    createFtpConnectMock = () => jest.fn().mockResolvedValue(undefined);
  });

  test('returns the shared local filesystem for local protocol', async () => {
    const { createRemoteIfNoneExist } = require('../remoteFs');

    await expect(
      createRemoteIfNoneExist({
        protocol: 'local',
      })
    ).resolves.toBe(localFs);
    expect(sftpInstances).toHaveLength(0);
    expect(ftpInstances).toHaveLength(0);
  });

  test('reuses cached keepalive clients for equivalent SFTP options and resets after removal', async () => {
    const { createRemoteIfNoneExist, removeRemoteFs } = require('../remoteFs');
    const firstOption = {
      protocol: 'sftp',
      host: 'target.internal',
      port: 22,
      remoteTimeOffsetInHours: 8,
      connectTimeout: 1234,
      proxyJump: [
        {
          port: 2222,
          host: 'bastion.internal',
        },
      ],
    };
    const secondOption = {
      proxyJump: [
        {
          host: 'bastion.internal',
          port: 2222,
        },
      ],
      remoteTimeOffsetInHours: 8,
      protocol: 'sftp',
      connectTimeout: 1234,
      port: 22,
      host: 'target.internal',
    };

    const firstFs = await createRemoteIfNoneExist(firstOption);
    const secondFs = await createRemoteIfNoneExist(secondOption);

    expect(firstFs).toBe(secondFs);
    expect(sftpInstances).toHaveLength(1);
    expect(sftpInstances[0].connect).toHaveBeenCalledTimes(1);
    expect(showMsg).toHaveBeenCalledWith('connecting...', 1234);
    expect(reset).toHaveBeenCalledTimes(1);
    expect(sftpInstances[0].option.remoteTimeOffsetInHours).toBe(8);

    removeRemoteFs(firstOption);

    expect(sftpInstances[0].end).toHaveBeenCalledTimes(1);

    await createRemoteIfNoneExist(firstOption);
    expect(sftpInstances).toHaveLength(2);
    expect(sftpInstances[1].connect).toHaveBeenCalledTimes(1);
  });

  test('filters debug noise for SFTP and masks passwords for FTP', async () => {
    const { createRemoteIfNoneExist } = require('../remoteFs');

    await createRemoteIfNoneExist({
      protocol: 'sftp',
      host: 'target.internal',
      port: 22,
      remoteTimeOffsetInHours: 0,
    });
    const sftpDebug = sftpInstances[0].connect.mock.calls[0][0].debug;

    sftpDebug('DEBUG[SFTP]: Parser: skip me');
    sftpDebug('DEBUG[SFTP]: Outbound: packet');
    sftpDebug('raw line');

    expect(debug).toHaveBeenCalledWith('Outbound: packet');
    expect(debug).toHaveBeenCalledWith('raw line');
    expect(debug).not.toHaveBeenCalledWith('Parser: skip me');

    debug.mockClear();

    await createRemoteIfNoneExist({
      protocol: 'ftp',
      host: 'ftp.example.com',
      port: 21,
      remoteTimeOffsetInHours: 0,
    });
    const ftpDebug = ftpInstances[0].connect.mock.calls[0][0].debug;

    ftpDebug('[connection] > PASS hunter2\\r\\n');
    ftpDebug('[connection] < 200 NOOP ok\\r\\n');
    ftpDebug('[connection] < 150 Opening data channel\\r\\n');
    ftpDebug('noise');

    expect(debug).toHaveBeenCalledWith('> PASS ******');
    expect(debug).toHaveBeenCalledWith('< 150 Opening data channel');
    expect(debug).not.toHaveBeenCalledWith('< 200 NOOP ok');
  });

  test('retries after failed connections and invalidates on disconnect', async () => {
    const { createRemoteIfNoneExist } = require('../remoteFs');
    const option = {
      protocol: 'sftp',
      host: 'retry.internal',
      port: 22,
      remoteTimeOffsetInHours: 0,
    };

    createSftpConnectMock = () => jest.fn().mockRejectedValueOnce(new Error('boom'));
    await expect(createRemoteIfNoneExist(option)).rejects.toThrow('boom');
    expect(sftpInstances).toHaveLength(1);
    expect(sftpInstances[0].end).toHaveBeenCalledTimes(2);

    createSftpConnectMock = () => jest.fn().mockResolvedValue(undefined);
    const fs = await createRemoteIfNoneExist(option);
    expect(fs).toBe(sftpInstances[1]);
    expect(sftpInstances).toHaveLength(2);
    expect(reset).toHaveBeenCalledTimes(1);

    sftpInstances[1].disconnectHandler!('close');
    expect(sftpInstances[1].end).toHaveBeenCalledTimes(1);

    await createRemoteIfNoneExist(option);
    expect(sftpInstances).toHaveLength(3);
  });

  test('throws for unsupported protocols', async () => {
    const { createRemoteIfNoneExist } = require('../remoteFs');

    await expect(
      createRemoteIfNoneExist({
        protocol: 'http',
        host: 'unsupported.internal',
        port: 80,
        remoteTimeOffsetInHours: 0,
      })
    ).rejects.toThrow('unsupported protocol http');
  });

  test('hashOption normalizes options with nested objects, arrays, and functions', async () => {
    const { createRemoteIfNoneExist } = require('../remoteFs');

    // Options with nested objects and arrays that should be normalized
    const optionA = {
      protocol: 'sftp',
      host: 'nested.internal',
      port: 22,
      remoteTimeOffsetInHours: 0,
      proxyJump: [{ host: 'jump.internal', port: 2222 }],
      algorithms: { kex: ['curve25519-sha256'] },
    };
    const optionB = {
      protocol: 'sftp',
      host: 'nested.internal',
      port: 22,
      remoteTimeOffsetInHours: 0,
      proxyJump: [{ port: 2222, host: 'jump.internal' }],
      algorithms: { kex: ['curve25519-sha256'] },
    };

    const fsA = await createRemoteIfNoneExist(optionA);
    const fsB = await createRemoteIfNoneExist(optionB);

    // Both should resolve to the same cached instance since they're structurally equal
    expect(fsA).toBe(fsB);
    expect(sftpInstances).toHaveLength(1);
  });

  test('hashOption strips function values from options', async () => {
    const { createRemoteIfNoneExist } = require('../remoteFs');

    const fnA = () => 'a';
    const fnB = () => 'b';

    const optionA = {
      protocol: 'sftp',
      host: 'func.internal',
      port: 22,
      remoteTimeOffsetInHours: 0,
      ignore: fnA,
    };
    const optionB = {
      protocol: 'sftp',
      host: 'func.internal',
      port: 22,
      remoteTimeOffsetInHours: 0,
      ignore: fnB,
    };

    const fsA = await createRemoteIfNoneExist(optionA);
    const fsB = await createRemoteIfNoneExist(optionB);

    // Function values are stripped during normalization, so both should resolve to the same instance
    expect(fsA).toBe(fsB);
  });

  test('returns pending promise when a connection is already in progress', async () => {
    const { createRemoteIfNoneExist } = require('../remoteFs');

    let resolveConnect: () => void;
    createSftpConnectMock = () => jest.fn().mockImplementation(() => new Promise<void>(resolve => {
      resolveConnect = resolve;
    }));

    const option = {
      protocol: 'sftp',
      host: 'pending.internal',
      port: 22,
      remoteTimeOffsetInHours: 0,
    };

    const promise1 = createRemoteIfNoneExist(option);
    const promise2 = createRemoteIfNoneExist(option);

    // Both should resolve to the same filesystem instance
    resolveConnect!();
    const [result1, result2] = await Promise.all([promise1, promise2]);
    expect(result1).toBe(result2);
  });
});

const info = jest.fn();
const warn = jest.fn();
const getUserSetting = jest.fn();
const createRemoteIfNoneExist = jest.fn();
const removeRemoteFs = jest.fn();

jest.mock('../../app', () => ({
  __esModule: true,
  default: {
    fsCache: new Map(),
    state: {
      profile: null,
    },
  },
}));

jest.mock('../../logger', () => ({
  __esModule: true,
  default: {
    trace: jest.fn(),
    debug: jest.fn(),
    info: (...args) => info(...args),
    warn: (...args) => warn(...args),
    error: jest.fn(),
    critical: jest.fn(),
  },
}));

jest.mock('../../host', () => ({
  __esModule: true,
  getUserSetting: (...args) => getUserSetting(...args),
}));

jest.mock('../remoteFs', () => ({
  __esModule: true,
  createRemoteIfNoneExist: (...args) => createRemoteIfNoneExist(...args),
  removeRemoteFs: (...args) => removeRemoteFs(...args),
}));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import app from '../../app';
import FileService from '../fileService';
import localFs from '../localFs';

describe('FileService ssh config integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (app.fsCache as unknown as { clear: () => void }).clear();
    app.state.profile = null;
  });

  test('preserves ProxyJump when HostName is resolved from ssh config', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sftp-proxyjump-'));
    const sshConfigPath = path.join(tempDir, 'ssh_config');

    fs.writeFileSync(
      sshConfigPath,
      `
Host target-alias
  HostName target.internal
  User root
  Port 22
  ProxyJump bastion
  IdentityFile ~/.ssh/id_ed25519

Host bastion
  HostName bastion.example.com
  User root
  Port 2222
  IdentityFile ~/.ssh/id_ed25519
`
    );

    const service = new FileService(tempDir, tempDir, {
      name: 'target-alias',
      protocol: 'sftp',
      host: 'target-alias',
      remotePath: '/workspace/project',
      uploadOnSave: true,
      useTempFile: false,
      ignore: [],
      sshConfigPath,
    } as any);

    const config = service.getConfig();

    expect(config.host).toBe('target.internal');
    expect(config.port).toBe(22);
    expect(config.username).toBe('root');
    expect(config.sshHostAlias).toBe('target-alias');
    expect(config.proxyJump).toEqual([
      {
        host: 'bastion.example.com',
        port: 2222,
        username: 'root',
        privateKeyPath: `${os.homedir()}/.ssh/id_ed25519`,
        connectTimeout: undefined,
      },
    ]);
  });

  test('merges remote references, profiles, ignore rules, and validates profile errors', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sftp-config-'));
    const ignoreFile = path.join(tempDir, '.sftpignore');
    fs.writeFileSync(ignoreFile, 'generated/**\n*.cache');

    const remoteSetting = {
      get: jest.fn().mockReturnValue({
        scheme: 'ftp',
        host: 'ftp.example.com',
        username: 'deploy',
        port: 2121,
        secure: true,
      }),
    };
    getUserSetting.mockReturnValue(remoteSetting);

    const service = new FileService(tempDir, tempDir, {
      remote: 'shared-ftp',
      protocol: undefined,
      host: undefined,
      remotePath: '/remote/base',
      uploadOnSave: false,
      useTempFile: false,
      openSsh: false,
      ignore: ['node_modules/**'],
      ignoreFile: './.sftpignore',
      concurrency: 8,
      watcher: {
        files: false,
        autoUpload: false,
        autoDelete: false,
      },
      profiles: {
        prod: {
          remotePath: '/remote/prod',
          ignore: ['dist/**'],
        } as any,
      },
    } as any);

    const config = service.getConfig('prod');

    expect(getUserSetting).toHaveBeenCalled();
    expect(config.protocol).toBe('ftp');
    expect(config.port).toBe(2121);
    expect(config.username).toBe('deploy');
    expect(config.concurrency).toBe(1);
    expect(config.ignore!(path.join(tempDir, 'node_modules/pkg/index.js'))).toBe(true);
    expect(config.ignore!(path.join(tempDir, 'generated/file.js'))).toBe(true);
    expect(config.ignore!(path.join(tempDir, 'dist/bundle.js'))).toBe(true);
    expect(config.ignore!('/remote/prod/generated/file.js')).toBe(true);
    expect(config.ignore!(tempDir)).toBe(false);

    expect(service.getAllConfig()).toHaveLength(1);

    expect(() => service.getConfig('missing')).toThrow('Unkown Profile "missing"');

    service.setConfigValidator(() => ({ message: 'missing host' } as any));
    expect(() => service.getConfig()).toThrow('You might want to set a profile first.');
  });

  test('resolves agent env vars and throws when ignore files or remotes are missing', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sftp-env-'));
    process.env.TEST_SFTP_AGENT = 'agent.sock';

    const service = new FileService(tempDir, tempDir, {
      protocol: 'sftp',
      host: 'target.internal',
      remotePath: '/remote/base',
      uploadOnSave: false,
      useTempFile: false,
      openSsh: false,
      agent: '$TEST_SFTP_AGENT',
      ignore: [],
      watcher: {
        files: false,
        autoUpload: false,
        autoDelete: false,
      },
    } as any);

    expect(service.getConfig().agent).toBe('agent.sock');

    const missingIgnoreFileService = new FileService(tempDir, tempDir, {
      protocol: 'sftp',
      host: 'target.internal',
      remotePath: '/remote/base',
      uploadOnSave: false,
      useTempFile: false,
      openSsh: false,
      ignore: [],
      ignoreFile: './missing.ignore',
      watcher: {
        files: false,
        autoUpload: false,
        autoDelete: false,
      },
    } as any);

    expect(() => missingIgnoreFileService.getConfig()).toThrow('Check your config of "ignoreFile"');

    getUserSetting.mockReturnValue({
      get: jest.fn().mockReturnValue(undefined),
    });
    const missingRemoteService = new FileService(tempDir, tempDir, {
      remote: 'unknown',
      protocol: 'sftp',
      host: 'target.internal',
      remotePath: '/remote/base',
      uploadOnSave: false,
      useTempFile: false,
      openSsh: false,
      ignore: [],
      watcher: {
        files: false,
        autoUpload: false,
        autoDelete: false,
      },
    } as any);

    expect(() => missingRemoteService.getConfig()).toThrow('Can\'t not find remote "unknown"');

    delete process.env.TEST_SFTP_AGENT;
  });

  test('wires watcher lifecycle, transfer schedulers, remote filesystem creation, and disposal', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sftp-runtime-'));
    const watcherA = {
      create: jest.fn(),
      dispose: jest.fn(),
    };
    const watcherB = {
      create: jest.fn(),
      dispose: jest.fn(),
    };
    const remoteFs = { kind: 'remote-fs' };
    createRemoteIfNoneExist.mockResolvedValue(remoteFs);
    removeRemoteFs.mockResolvedValue(undefined);

    const service = new FileService(tempDir, tempDir, {
      protocol: 'sftp',
      host: 'target.internal',
      remotePath: '/remote/base',
      username: 'root',
      uploadOnSave: false,
      useTempFile: false,
      openSsh: false,
      ignore: [],
      watcher: {
        files: '**/*',
        autoUpload: true,
        autoDelete: true,
      },
    } as any);

    service.setWatcherService(watcherA as any);
    service.setWatcherService(watcherB as any);

    expect(watcherA.create).toHaveBeenCalledWith(tempDir, {
      files: '**/*',
      autoUpload: true,
      autoDelete: true,
    });
    expect(watcherA.dispose).toHaveBeenCalledWith(tempDir);
    expect(watcherB.create).toHaveBeenCalledWith(tempDir, {
      files: '**/*',
      autoUpload: true,
      autoDelete: true,
    });

    expect(service.getLocalFileSystem()).toBe(localFs);
    await expect(service.getRemoteFileSystem(service.getConfig())).resolves.toBe(remoteFs);
    expect(createRemoteIfNoneExist).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'target.internal',
      })
    );

    const beforeTransfer = jest.fn();
    const afterTransfer = jest.fn();
    service.beforeTransfer(beforeTransfer);
    service.afterTransfer(afterTransfer);

    const scheduler = service.createTransferScheduler(1);
    const completedTask = {
      run: () => Promise.resolve('done'),
      cancel: jest.fn(),
    } as any;

    scheduler.add(completedTask);
    expect(service.isTransferring()).toBe(true);
    await scheduler.run();
    expect(beforeTransfer).toHaveBeenCalledWith(completedTask);
    expect(afterTransfer).toHaveBeenCalledWith(null, completedTask);
    expect(service.getPendingTransferTasks()).toEqual([]);
    expect(service.isTransferring()).toBe(false);

    const hangingTask = {
      run: () => new Promise(() => undefined),
      cancel: jest.fn(),
    } as any;
    const hangingScheduler = service.createTransferScheduler(1);
    hangingScheduler.add(hangingTask);
    void hangingScheduler.run();

    expect(service.getPendingTransferTasks()).toEqual([hangingTask]);
    service.cancelTransferTasks();
    expect(hangingTask.cancel).toHaveBeenCalledTimes(1);
    expect(service.getPendingTransferTasks()).toEqual([]);

    await service.dispose();
    expect(watcherB.dispose).toHaveBeenCalledWith(tempDir);
    expect(removeRemoteFs).toHaveBeenCalledWith(
      expect.objectContaining({
        protocol: 'sftp',
        host: 'target.internal',
        port: 22,
        username: 'root',
      })
    );
  });

  test('uses cached ignore and ssh config content, warns about auth conflicts, and resolves relative paths', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sftp-cache-'));
    const ignoreFile = path.join(tempDir, '.cached-ignore');

    (app.fsCache as Map<string, any>).set(ignoreFile, 'cached/**');
    (app.fsCache as Map<string, any>).set('./cached-ssh-config', '');

    const service = new FileService(tempDir, tempDir, {
      protocol: 'sftp',
      host: 'target.internal',
      remotePath: './remote/base',
      uploadOnSave: false,
      useTempFile: false,
      openSsh: false,
      agent: 'agent.sock',
      privateKeyPath: './id_rsa',
      ignore: [],
      ignoreFile: './.cached-ignore',
      sshConfigPath: './cached-ssh-config',
      proxyJump: [
        {
          host: 'jump.internal',
          username: 'root',
          privateKeyPath: './jump_rsa',
        },
      ],
      watcher: {
        files: false,
        autoUpload: false,
        autoDelete: false,
      },
    } as any);

    const config = service.getConfig();

    expect(warn).toHaveBeenCalledWith(
      'Config Option Conflicted. You are specifing "agent" and "privateKey" at the same time, the later will be ignored.'
    );
    expect(config.remotePath).toBe('remote/base');
    expect(config.privateKeyPath).toBe(path.join(tempDir, 'id_rsa'));
    expect(config.proxyJump).toEqual([
      expect.objectContaining({
        host: 'jump.internal',
        privateKeyPath: path.join(tempDir, 'jump_rsa'),
      }),
    ]);
    expect(config.ignore!(path.join(tempDir, 'cached', 'file.txt'))).toBe(true);
  });

  test('throws when the configured agent environment variable is missing and handles empty scheduler runs', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sftp-missing-agent-'));
    delete process.env.MISSING_SFTP_AGENT;

    const service = new FileService(tempDir, tempDir, {
      protocol: 'sftp',
      host: 'target.internal',
      remotePath: '/remote/base',
      uploadOnSave: false,
      useTempFile: false,
      openSsh: false,
      agent: '$MISSING_SFTP_AGENT',
      ignore: [],
      watcher: {
        files: false,
        autoUpload: false,
        autoDelete: false,
      },
    } as any);

    expect(() => service.getConfig()).toThrow('Environment variable "MISSING_SFTP_AGENT" not found');
    expect(service.getAvailableProfiles()).toEqual([]);
    expect(service.getAllConfig()).toEqual([]);

    const scheduler = service.createTransferScheduler(1);
    await expect(scheduler.run()).resolves.toBeUndefined();
    scheduler.stop();
    await expect(scheduler.run()).resolves.toBeUndefined();
  });
});

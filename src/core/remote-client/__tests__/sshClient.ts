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
});

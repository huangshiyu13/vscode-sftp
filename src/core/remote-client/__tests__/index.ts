import * as remoteClient from '../index';
import RemoteClient from '../remoteClient';
import SSHClient from '../sshClient';
import FTPClient from '../ftpClient';

describe('core/remote-client/index', () => {
  test('re-exports all remote client modules', () => {
    expect(remoteClient.RemoteClient).toBe(RemoteClient);
    expect(remoteClient.SSHClient).toBe(SSHClient);
    expect(remoteClient.FTPClient).toBe(FTPClient);
  });

  test('re-exports ErrorCode', () => {
    expect(remoteClient.ErrorCode).toBeDefined();
    expect(remoteClient.ErrorCode.CONNECT_CANCELLED).toBe(0);
  });
});

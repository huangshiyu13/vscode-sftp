jest.mock('vscode', () => ({
  __esModule: true,
  Uri: {
    file: (path: string) => ({ scheme: 'file', fsPath: path }),
  },
  window: {
    showQuickPick: jest.fn().mockResolvedValue(undefined),
    createTerminal: jest.fn().mockReturnValue({
      sendText: jest.fn(),
      show: jest.fn(),
    }),
    createStatusBarItem: jest.fn().mockReturnValue({
      show: jest.fn(),
      hide: jest.fn(),
      text: '',
      tooltip: '',
      command: '',
    }),
    createOutputChannel: jest.fn().mockReturnValue({
      show: jest.fn(),
      hide: jest.fn(),
      appendLine: jest.fn(),
      clear: jest.fn(),
      dispose: jest.fn(),
    }),
  },
  workspace: {
    onDidSaveTextDocument: jest.fn(),
    onDidOpenTextDocument: jest.fn(),
    createFileSystemWatcher: jest.fn().mockReturnValue({
      onDidChange: jest.fn(),
      onDidCreate: jest.fn(),
      dispose: jest.fn(),
    }),
  },
  Disposable: class Disposable { dispose() {} },
  StatusBarAlignment: { Left: 1, Right: 2 },
  ThemeColor: class ThemeColor {},
}));

jest.mock('../../modules/serviceManager', () => ({
  __esModule: true,
  getAllFileService: jest.fn().mockReturnValue([]),
}));

jest.mock('../../utils', () => ({
  __esModule: true,
  interpolate: jest.fn().mockImplementation((str: string, vars: any) =>
    str.replace(/\{(\w+)\}/g, (_: string, k: string) => vars[k] || _)
  ),
}));

jest.mock('../../host', () => ({
  __esModule: true,
  registerCommand: jest.fn(),
  showConfirmMessage: jest.fn(),
  openFolder: jest.fn(),
  addWorkspaceFolder: jest.fn(),
  getWorkspaceFolders: jest.fn().mockReturnValue([]),
  getActiveTextEditor: jest.fn().mockReturnValue(null),
}));

jest.mock('../../app', () => ({
  __esModule: true,
  default: {
    remoteExplorer: { refresh: jest.fn() },
    sftpBarItem: { updateStatus: jest.fn() },
    fsCache: { has: jest.fn(), del: jest.fn() },
  },
}));

jest.mock('../../logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('../../modules/config', () => ({
  __esModule: true,
  readConfigsFromFile: jest.fn().mockResolvedValue([]),
}));

import commandOpenSshConnection from '../commandOpenSshConnection';
import { getAllFileService } from '../../modules/serviceManager';
import * as vscode from 'vscode';

describe('commands/commandOpenSshConnection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('handleCommand', () => {
    test('does nothing when no SFTP services available', async () => {
      (getAllFileService as jest.Mock).mockReturnValue([]);
      await commandOpenSshConnection.handleCommand();
      expect(vscode.window.createTerminal).not.toHaveBeenCalled();
    });

    test('does nothing when no SFTP protocol services', async () => {
      (getAllFileService as jest.Mock).mockReturnValue([
        { getConfig: () => ({ protocol: 'ftp', host: 'ftp.example.com' }) },
      ]);
      await commandOpenSshConnection.handleCommand();
      expect(vscode.window.showQuickPick).not.toHaveBeenCalled();
    });

    test('shows quick pick when SFTP services available', async () => {
      const config = {
        protocol: 'sftp',
        host: 'sftp.example.com',
        port: 22,
        username: 'user',
        name: 'test',
      };
      (getAllFileService as jest.Mock).mockReturnValue([
        { getConfig: () => config },
      ]);
      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue(undefined);

      await commandOpenSshConnection.handleCommand();
      expect(vscode.window.showQuickPick).toHaveBeenCalled();
    });

    test('creates terminal with SSH command when service selected', async () => {
      const config = {
        protocol: 'sftp',
        host: 'sftp.example.com',
        port: 22,
        username: 'user',
        name: 'test',
      };
      const mockTerminal = { sendText: jest.fn(), show: jest.fn() };
      (getAllFileService as jest.Mock).mockReturnValue([
        { getConfig: () => config },
      ]);
      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({
        label: 'test',
        description: 'sftp.example.com',
        config,
      });
      (vscode.window.createTerminal as jest.Mock).mockReturnValue(mockTerminal);

      await commandOpenSshConnection.handleCommand();
      expect(vscode.window.createTerminal).toHaveBeenCalledWith('test');
      expect(mockTerminal.sendText).toHaveBeenCalled();
      expect(mockTerminal.show).toHaveBeenCalled();
    });

    test('uses SSH config path when specified', async () => {
      const config = {
        protocol: 'sftp',
        host: 'sftp.example.com',
        port: 22,
        username: 'user',
        name: 'test',
        sshConfigPath: '/home/user/.ssh/config',
      };
      const mockTerminal = { sendText: jest.fn(), show: jest.fn() };
      (getAllFileService as jest.Mock).mockReturnValue([
        { getConfig: () => config },
      ]);
      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({
        label: 'test',
        description: 'sftp.example.com',
        config,
      });
      (vscode.window.createTerminal as jest.Mock).mockReturnValue(mockTerminal);

      await commandOpenSshConnection.handleCommand();
      expect(mockTerminal.sendText).toHaveBeenCalledWith(
        expect.stringContaining('-F')
      );
    });

    test('uses private key when agent not set', async () => {
      const config = {
        protocol: 'sftp',
        host: 'sftp.example.com',
        port: 22,
        username: 'user',
        name: 'test',
        privateKeyPath: '/home/user/.ssh/id_rsa',
      };
      const mockTerminal = { sendText: jest.fn(), show: jest.fn() };
      (getAllFileService as jest.Mock).mockReturnValue([
        { getConfig: () => config },
      ]);
      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({
        label: 'test',
        description: 'sftp.example.com',
        config,
      });
      (vscode.window.createTerminal as jest.Mock).mockReturnValue(mockTerminal);

      await commandOpenSshConnection.handleCommand();
      expect(mockTerminal.sendText).toHaveBeenCalledWith(
        expect.stringContaining('-i')
      );
    });

    test('uses agent when set', async () => {
      const config = {
        protocol: 'sftp',
        host: 'sftp.example.com',
        port: 22,
        username: 'user',
        name: 'test',
        agent: '/usr/bin/ssh-agent',
      };
      const mockTerminal = { sendText: jest.fn(), show: jest.fn() };
      (getAllFileService as jest.Mock).mockReturnValue([
        { getConfig: () => config },
      ]);
      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({
        label: 'test',
        description: 'sftp.example.com',
        config,
      });
      (vscode.window.createTerminal as jest.Mock).mockReturnValue(mockTerminal);

      await commandOpenSshConnection.handleCommand();
      expect(mockTerminal.sendText).toHaveBeenCalled();
    });

    test('appends sshCustomParams when present', async () => {
      const config = {
        protocol: 'sftp',
        host: 'sftp.example.com',
        port: 22,
        username: 'user',
        name: 'test',
        sshCustomParams: '-o StrictHostKeyChecking=no',
        remotePath: '/remote',
      };
      const mockTerminal = { sendText: jest.fn(), show: jest.fn() };
      (getAllFileService as jest.Mock).mockReturnValue([
        { getConfig: () => config },
      ]);
      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({
        label: 'test',
        description: 'sftp.example.com',
        config,
      });
      (vscode.window.createTerminal as jest.Mock).mockReturnValue(mockTerminal);

      await commandOpenSshConnection.handleCommand();
      expect(mockTerminal.sendText).toHaveBeenCalledWith(
        expect.stringContaining('-o StrictHostKeyChecking=no')
      );
    });

    test('handles explorer item with non-sftp protocol', async () => {
      const exploreItem = {
        explorerContext: {
          config: { protocol: 'ftp', host: 'ftp.example.com' },
        },
      };

      await commandOpenSshConnection.handleCommand(exploreItem);
      expect(vscode.window.createTerminal).not.toHaveBeenCalled();
    });

    test('handles explorer item with sftp protocol', async () => {
      const config = {
        protocol: 'sftp',
        host: 'sftp.example.com',
        port: 22,
        username: 'user',
        name: 'test',
      };
      const exploreItem = {
        explorerContext: { config },
      };
      const mockTerminal = { sendText: jest.fn(), show: jest.fn() };
      (vscode.window.createTerminal as jest.Mock).mockReturnValue(mockTerminal);

      await commandOpenSshConnection.handleCommand(exploreItem);
      expect(vscode.window.createTerminal).toHaveBeenCalled();
      expect(mockTerminal.sendText).toHaveBeenCalled();
    });

    test('uses sshHostAlias when available', async () => {
      const config = {
        protocol: 'sftp',
        host: 'actual-host.com',
        sshHostAlias: 'alias-host',
        port: 2222,
        username: 'user',
        name: 'test',
      };
      const exploreItem = {
        explorerContext: { config },
      };
      const mockTerminal = { sendText: jest.fn(), show: jest.fn() };
      (vscode.window.createTerminal as jest.Mock).mockReturnValue(mockTerminal);

      await commandOpenSshConnection.handleCommand(exploreItem);
      expect(mockTerminal.sendText).toHaveBeenCalledWith(
        expect.stringContaining('alias-host')
      );
    });

    test('quick pick cancelled does not create terminal', async () => {
      const config = {
        protocol: 'sftp',
        host: 'sftp.example.com',
        port: 22,
        username: 'user',
        name: 'test',
      };
      (getAllFileService as jest.Mock).mockReturnValue([
        { getConfig: () => config },
      ]);
      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue(undefined);

      await commandOpenSshConnection.handleCommand();
      expect(vscode.window.createTerminal).not.toHaveBeenCalled();
    });
  });
});
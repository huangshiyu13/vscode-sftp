jest.mock('vscode', () => ({
  __esModule: true,
  Uri: { file: (p: string) => ({ scheme: 'file', fsPath: p }) },
  window: {
    showQuickPick: jest.fn().mockResolvedValue(undefined),
    showOpenDialog: jest.fn().mockResolvedValue(undefined),
    createStatusBarItem: jest.fn().mockReturnValue({ show: jest.fn(), hide: jest.fn(), text: '', tooltip: '', command: '' }),
    createOutputChannel: jest.fn().mockReturnValue({ show: jest.fn(), hide: jest.fn(), appendLine: jest.fn(), clear: jest.fn(), dispose: jest.fn() }),
  },
  Disposable: class Disposable { dispose() {} },
  StatusBarAlignment: { Left: 1, Right: 2 },
  ThemeColor: class ThemeColor {},
}));

jest.mock('../../host', () => ({
  __esModule: true,
  getWorkspaceFolders: jest.fn().mockReturnValue(null),
  showConfirmMessage: jest.fn().mockResolvedValue(true),
  openFolder: jest.fn(),
  addWorkspaceFolder: jest.fn(),
  showOpenDialog: jest.fn(),
  registerCommand: jest.fn(),
  getActiveTextEditor: jest.fn().mockReturnValue(null),
}));

jest.mock('../../modules/config', () => ({
  __esModule: true,
  newConfig: jest.fn(),
  readConfigsFromFile: jest.fn().mockResolvedValue([]),
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
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

import commandConfig from '../commandConfig';
import { getWorkspaceFolders, showConfirmMessage, openFolder, addWorkspaceFolder, showOpenDialog } from '../../host';
import { newConfig } from '../../modules/config';

describe('commands/commandConfig', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('prompts to open folder when no workspace', async () => {
    (getWorkspaceFolders as jest.Mock).mockReturnValue(null);
    (showConfirmMessage as jest.Mock).mockResolvedValue(true);

    await commandConfig.handleCommand();
    expect(showConfirmMessage).toHaveBeenCalled();
    expect(openFolder).toHaveBeenCalled();
  });

  test('returns when user declines open folder', async () => {
    (getWorkspaceFolders as jest.Mock).mockReturnValue(null);
    (showConfirmMessage as jest.Mock).mockResolvedValue(false);

    await commandConfig.handleCommand();
    expect(openFolder).not.toHaveBeenCalled();
  });

  test('prompts to add folder when workspace has no folders', async () => {
    (getWorkspaceFolders as jest.Mock).mockReturnValue([]);
    (showConfirmMessage as jest.Mock).mockResolvedValue(true);
    (showOpenDialog as jest.Mock).mockResolvedValue([{ fsPath: '/selected/folder' }]);

    await commandConfig.handleCommand();
    expect(showConfirmMessage).toHaveBeenCalled();
    expect(addWorkspaceFolder).toHaveBeenCalled();
  });

  test('returns when user declines add folder', async () => {
    (getWorkspaceFolders as jest.Mock).mockReturnValue([]);
    (showConfirmMessage as jest.Mock).mockResolvedValue(false);

    await commandConfig.handleCommand();
    expect(addWorkspaceFolder).not.toHaveBeenCalled();
  });

  test('creates config directly for single workspace folder', async () => {
    (getWorkspaceFolders as jest.Mock).mockReturnValue([
      { uri: { fsPath: '/workspace' }, name: 'workspace' },
    ]);

    await commandConfig.handleCommand();
    expect(newConfig).toHaveBeenCalledWith('/workspace');
  });

  test('shows quick pick for multiple workspace folders', async () => {
    const vscode = require('vscode');
    (getWorkspaceFolders as jest.Mock).mockReturnValue([
      { uri: { fsPath: '/workspace1' }, name: 'workspace1' },
      { uri: { fsPath: '/workspace2' }, name: 'workspace2' },
    ]);

    await commandConfig.handleCommand();
    expect(vscode.window.showQuickPick).toHaveBeenCalled();
    const pickItems = vscode.window.showQuickPick.mock.calls[0][0];
    expect(pickItems).toEqual([
      { value: '/workspace1', label: 'workspace1', description: '/workspace1' },
      { value: '/workspace2', label: 'workspace2', description: '/workspace2' },
    ]);
  });

  test('creates config when quick pick selection is made', async () => {
    const vscode = require('vscode');
    (getWorkspaceFolders as jest.Mock).mockReturnValue([
      { uri: { fsPath: '/workspace1' }, name: 'workspace1' },
      { uri: { fsPath: '/workspace2' }, name: 'workspace2' },
    ]);
    (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({
      value: '/workspace2',
      label: 'workspace2',
    });

    await commandConfig.handleCommand();
    expect(newConfig).toHaveBeenCalledWith('/workspace2');
  });

  test('does nothing when quick pick is cancelled for multiple folders', async () => {
    const vscode = require('vscode');
    (getWorkspaceFolders as jest.Mock).mockReturnValue([
      { uri: { fsPath: '/workspace1' }, name: 'workspace1' },
      { uri: { fsPath: '/workspace2' }, name: 'workspace2' },
    ]);
    (vscode.window.showQuickPick as jest.Mock).mockResolvedValue(undefined);

    await commandConfig.handleCommand();
    expect(newConfig).not.toHaveBeenCalled();
  });

  test('returns when user declines to add folder to empty workspace', async () => {
    (getWorkspaceFolders as jest.Mock).mockReturnValue([]);
    (showConfirmMessage as jest.Mock).mockResolvedValue(false);

    await commandConfig.handleCommand();
    expect(showOpenDialog).not.toHaveBeenCalled();
    expect(addWorkspaceFolder).not.toHaveBeenCalled();
  });

  test('returns when no resources selected in open dialog', async () => {
    (getWorkspaceFolders as jest.Mock).mockReturnValue([]);
    (showConfirmMessage as jest.Mock).mockResolvedValue(true);
    (showOpenDialog as jest.Mock).mockResolvedValue(undefined);

    await commandConfig.handleCommand();
    expect(addWorkspaceFolder).not.toHaveBeenCalled();
  });
});
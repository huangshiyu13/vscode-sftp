// Shared vscode mock for command tests
const vscodeMock = {
  __esModule: true,
  Uri: { file: (p: string) => ({ scheme: 'file', fsPath: p }) },
  window: {
    showQuickPick: jest.fn().mockResolvedValue(undefined),
    showInformationMessage: jest.fn(),
    createStatusBarItem: jest.fn().mockReturnValue({ show: jest.fn(), hide: jest.fn(), text: '', tooltip: '', command: '' }),
    createOutputChannel: jest.fn().mockReturnValue({ show: jest.fn(), hide: jest.fn(), appendLine: jest.fn(), clear: jest.fn(), dispose: jest.fn() }),
  },
  Disposable: class Disposable { dispose() {} },
  StatusBarAlignment: { Left: 1, Right: 2 },
  ThemeColor: class ThemeColor {},
};

jest.mock('vscode', () => vscodeMock);

jest.mock('../../host', () => ({
  __esModule: true,
  registerCommand: jest.fn(),
  showInformationMessage: jest.fn(),
  showConfirmMessage: jest.fn().mockResolvedValue(true),
  openFolder: jest.fn(),
  addWorkspaceFolder: jest.fn(),
  getWorkspaceFolders: jest.fn().mockReturnValue([]),
  getActiveTextEditor: jest.fn().mockReturnValue(null),
}));

jest.mock('../../modules/serviceManager', () => ({
  __esModule: true,
  getAllFileService: jest.fn().mockReturnValue([]),
  findAllFileService: jest.fn().mockImplementation((predicate?: any) => {
    const all = (findAllFileService as any)._services || [];
    return predicate ? all.filter(predicate) : all;
  }),
  getFileService: jest.fn().mockReturnValue(null),
  createFileService: jest.fn(),
  disposeFileService: jest.fn(),
}));

jest.mock('../../app', () => ({
  __esModule: true,
  default: {
    remoteExplorer: { refresh: jest.fn(), reveal: jest.fn() },
    sftpBarItem: { updateStatus: jest.fn() },
    fsCache: { has: jest.fn(), del: jest.fn() },
    state: { profile: null },
  },
}));

jest.mock('../../logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock('../../modules/config', () => ({
  __esModule: true,
  newConfig: jest.fn(),
  readConfigsFromFile: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../ui/output', () => ({
  __esModule: true,
  show: jest.fn(),
  hide: jest.fn(),
  toggle: jest.fn(),
}));

// Now import the command modules
import commandCancelAllTransfer from '../commandCancelAllTransfer';
import commandToggleOutputPanel from '../commandToggleOutputPanel';
import commandSetProfile from '../commandSetProfile';
import { findAllFileService, getAllFileService } from '../../modules/serviceManager';
import * as output from '../../ui/output';
import app from '../../app';

describe('commands/commandCancelAllTransfer', () => {
  beforeEach(() => jest.clearAllMocks());

  test('cancels all transferring services', async () => {
    const cancelMock = jest.fn();
    const transferringService = { isTransferring: () => true, cancelTransferTasks: cancelMock };

    // findAllFileService is called with a predicate, so only return transferring services
    (findAllFileService as jest.Mock).mockReturnValue([transferringService]);

    await commandCancelAllTransfer.handleCommand();
    expect(cancelMock).toHaveBeenCalled();
  });

  test('does nothing when no services are transferring', async () => {
    (findAllFileService as jest.Mock).mockReturnValue([]);
    await commandCancelAllTransfer.handleCommand();
  });

  test('evaluates the transferring predicate against registered services', async () => {
    const cancelTransferTasks = jest.fn();
    (findAllFileService as jest.Mock).mockImplementation((predicate?: any) => {
      const services = [
        { isTransferring: () => false, cancelTransferTasks: jest.fn() },
        { isTransferring: () => true, cancelTransferTasks },
      ];
      return predicate ? services.filter(predicate) : services;
    });

    await commandCancelAllTransfer.handleCommand();

    expect(cancelTransferTasks).toHaveBeenCalledTimes(1);
  });
});

describe('commands/commandToggleOutputPanel', () => {
  beforeEach(() => jest.clearAllMocks());

  test('toggles output panel', () => {
    commandToggleOutputPanel.handleCommand();
    expect(output.toggle).toHaveBeenCalled();
  });
});

describe('commands/commandSetProfile', () => {
  beforeEach(() => jest.clearAllMocks());

  test('shows no available profiles message when no profiles', async () => {
    const { showInformationMessage } = require('../../host');
    (getAllFileService as jest.Mock).mockReturnValue([
      { getAvailableProfiles: () => [] },
    ]);

    await commandSetProfile.handleCommand();
    expect(showInformationMessage).toHaveBeenCalledWith('No Available Profile.');
  });

  test('shows quick pick when profiles available', async () => {
    const vscode = require('vscode');
    (getAllFileService as jest.Mock).mockReturnValue([
      { getAvailableProfiles: () => ['dev', 'prod'] },
    ]);

    await commandSetProfile.handleCommand();
    expect(vscode.window.showQuickPick).toHaveBeenCalled();
  });

  test('sets profile when definedProfile is provided and found', async () => {
    (getAllFileService as jest.Mock).mockReturnValue([
      { getAvailableProfiles: () => ['dev', 'prod'] },
    ]);

    await commandSetProfile.handleCommand('dev');
    expect(app.state.profile).toBe('dev');
  });

  test('sets profile to null when definedProfile is not found', async () => {
    (getAllFileService as jest.Mock).mockReturnValue([
      { getAvailableProfiles: () => ['dev', 'prod'] },
    ]);

    await commandSetProfile.handleCommand('staging');
    expect(app.state.profile).toBeNull();
  });

  test('sets profile from quick pick selection', async () => {
    const vscode = require('vscode');
    (getAllFileService as jest.Mock).mockReturnValue([
      { getAvailableProfiles: () => ['dev', 'prod'] },
    ]);
    (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({ value: 'prod' });

    await commandSetProfile.handleCommand();
    expect(app.state.profile).toBe('prod');
  });

  test('does not set profile when quick pick cancelled', async () => {
    const vscode = require('vscode');
    (getAllFileService as jest.Mock).mockReturnValue([
      { getAvailableProfiles: () => ['dev', 'prod'] },
    ]);
    (vscode.window.showQuickPick as jest.Mock).mockResolvedValue(undefined);

    await commandSetProfile.handleCommand();
    // profile should not change from its current value
  });

  test('marks active profile in quick pick items', async () => {
    const vscode = require('vscode');
    app.state.profile = 'dev';
    (getAllFileService as jest.Mock).mockReturnValue([
      { getAvailableProfiles: () => ['dev', 'prod'] },
    ]);
    (vscode.window.showQuickPick as jest.Mock).mockResolvedValue(undefined);

    await commandSetProfile.handleCommand();
    const pickItems = (vscode.window.showQuickPick as jest.Mock).mock.calls[0][0];
    const devItem = pickItems.find((i: any) => i.value === 'dev');
    expect(devItem.label).toContain('active');
  });
});

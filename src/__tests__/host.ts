const executeCommand = jest.fn();
const registerCommandMock = jest.fn();
const getConfiguration = jest.fn();
const onWillSaveTextDocument = jest.fn();
const onDidSaveTextDocument = jest.fn();
const onDidOpenTextDocument = jest.fn();
const asRelativePath = jest.fn();
const updateWorkspaceFolders = jest.fn();
const showTextDocument = jest.fn();
const showInputBox = jest.fn();
const showErrorMessage = jest.fn();
const showInformationMessage = jest.fn();
const showWarningMessage = jest.fn();
const showOpenDialog = jest.fn();
const uriFile = jest.fn((fsPath: string) => ({ scheme: 'file', fsPath }));

jest.mock('vscode', () => ({
  __esModule: true,
  workspace: {
    textDocuments: [{ uri: { fsPath: '/workspace/a.txt' } }],
    getConfiguration: (...args) => getConfiguration(...args),
    onWillSaveTextDocument: (...args) => onWillSaveTextDocument(...args),
    onDidSaveTextDocument: (...args) => onDidSaveTextDocument(...args),
    onDidOpenTextDocument: (...args) => onDidOpenTextDocument(...args),
    asRelativePath: (...args) => asRelativePath(...args),
    workspaceFolders: [{ uri: { fsPath: '/workspace' } }],
    updateWorkspaceFolders: (...args) => updateWorkspaceFolders(...args),
  },
  commands: {
    executeCommand: (...args) => executeCommand(...args),
    registerCommand: (...args) => registerCommandMock(...args),
  },
  window: {
    activeTextEditor: { document: { uri: { fsPath: '/workspace/active.txt' } } },
    showTextDocument: (...args) => showTextDocument(...args),
    showInputBox: (...args) => showInputBox(...args),
    showErrorMessage: (...args) => showErrorMessage(...args),
    showInformationMessage: (...args) => showInformationMessage(...args),
    showWarningMessage: (...args) => showWarningMessage(...args),
    showOpenDialog: (...args) => showOpenDialog(...args),
  },
  Uri: {
    file: (...args) => uriFile(...args),
  },
}));

import { EXTENSION_NAME } from '../constants';
import * as host from '../host';

describe('host', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('delegates workspace accessors and event registration', () => {
    const listener = jest.fn();
    const setting = { get: jest.fn() };
    getConfiguration.mockReturnValue(setting);
    asRelativePath.mockReturnValue('src/index.ts');

    expect(host.getOpenTextDocuments()).toEqual([{ uri: { fsPath: '/workspace/a.txt' } }]);
    expect(host.getUserSetting('sftp', null as any)).toBe(setting);
    expect(host.pathRelativeToWorkspace('/workspace/src/index.ts')).toBe('src/index.ts');
    expect(host.getActiveTextEditor()).toEqual({
      document: { uri: { fsPath: '/workspace/active.txt' } },
    });
    expect(host.getWorkspaceFolders()).toEqual([{ uri: { fsPath: '/workspace' } }]);

    host.onWillSaveTextDocument(listener);
    host.onDidSaveTextDocument(listener);
    host.onDidOpenTextDocument(listener);

    expect(onWillSaveTextDocument).toHaveBeenCalledWith(listener, undefined);
    expect(onDidSaveTextDocument).toHaveBeenCalledWith(listener, undefined);
    expect(onDidOpenTextDocument).toHaveBeenCalledWith(listener, undefined);
  });

  test('delegates commands, dialogs, and workspace updates', async () => {
    const leftUri = { scheme: 'file', fsPath: '/left.txt' };
    const rightUri = { scheme: 'file', fsPath: '/right.txt' };
    const openDialogResult = [{ fsPath: '/picked' }];
    const disposable = { dispose: jest.fn() };
    const context = {
      subscriptions: [],
    };

    registerCommandMock.mockReturnValue(disposable);
    showTextDocument.mockResolvedValue('shown');
    showInputBox.mockResolvedValue('secret');
    showErrorMessage.mockResolvedValue('detail');
    showInformationMessage
      .mockResolvedValueOnce('info')
      .mockResolvedValueOnce({ title: 'Deploy' })
      .mockResolvedValueOnce({ title: 'Nope' })
      .mockResolvedValueOnce(undefined);
    showWarningMessage.mockResolvedValue('warn');
    showOpenDialog.mockResolvedValue(openDialogResult);

    await host.refreshExplorer();
    await host.focusOpenEditors();
    await host.showTextDocument(leftUri as any, { preview: true });
    await host.diffFiles('/left.txt', '/right.txt', 'Diff Title', { preview: false });
    await host.promptForPassword('Password');
    host.setContextValue('enabled', true);
    await host.showErrorMessage('boom', 'detail');
    await host.showInformationMessage('info', 'detail');
    await host.showWarningMessage('warn', 'detail');
    expect(await host.showConfirmMessage('Continue?', 'Deploy', 'Cancel')).toBe(true);
    expect(await host.showConfirmMessage('Continue?', 'Deploy', 'Cancel')).toBe(false);
    expect(await host.showConfirmMessage('Close dialog?')).toBe(false);
    await host.showOpenDialog({ canSelectFiles: true } as any);
    await host.openFolder(leftUri as any, true);
    host.registerCommand(context as any, 'sftp.test', jest.fn(), { scope: 'ctx' });
    host.addWorkspaceFolder({ uri: rightUri as any, name: 'second' });

    expect(executeCommand).toHaveBeenNthCalledWith(
      1,
      'workbench.files.action.refreshFilesExplorer'
    );
    expect(executeCommand).toHaveBeenNthCalledWith(
      2,
      'workbench.files.action.focusOpenEditorsView'
    );
    expect(showTextDocument).toHaveBeenCalledWith(leftUri, { preview: true });
    expect(uriFile).toHaveBeenNthCalledWith(1, '/left.txt');
    expect(uriFile).toHaveBeenNthCalledWith(2, '/right.txt');
    expect(executeCommand).toHaveBeenNthCalledWith(
      3,
      'vscode.diff',
      leftUri,
      rightUri,
      'Diff Title',
      { preview: false }
    );
    expect(showInputBox).toHaveBeenCalledWith({
      ignoreFocusOut: true,
      password: true,
      prompt: 'Password',
    });
    expect(executeCommand).toHaveBeenCalledWith(
      'setContext',
      `${EXTENSION_NAME}.enabled`,
      true
    );
    expect(showErrorMessage).toHaveBeenCalledWith('boom', 'detail');
    expect(showInformationMessage).toHaveBeenCalledWith('info', 'detail');
    expect(showWarningMessage).toHaveBeenCalledWith('warn', 'detail');
    expect(showOpenDialog).toHaveBeenCalledWith({ canSelectFiles: true });
    expect(executeCommand).toHaveBeenCalledWith('vscode.openFolder', leftUri, true);
    expect(registerCommandMock).toHaveBeenCalledWith(
      'sftp.test',
      expect.any(Function),
      { scope: 'ctx' }
    );
    expect(context.subscriptions).toEqual([disposable]);
    expect(updateWorkspaceFolders).toHaveBeenCalledWith(0, 0, {
      uri: rightUri,
      name: 'second',
    });
  });
});

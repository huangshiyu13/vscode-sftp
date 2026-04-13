class UriMock {
  fsPath: string;

  constructor(fsPath: string) {
    this.fsPath = fsPath;
  }

  static file(fsPath: string) {
    return new UriMock(fsPath);
  }
}

const showInformationMessage = jest.fn();
const trace = jest.fn();
const warn = jest.fn();
const reportError = jest.fn();
const handleCtxFromUri = jest.fn();
const allHandleCtxFromUri = jest.fn();

jest.mock('vscode', () => ({
  Uri: UriMock,
  window: {
    showInformationMessage: (...args) => showInformationMessage(...args),
  },
}));

jest.mock('../../../logger', () => ({
  __esModule: true,
  default: {
    trace: (...args) => trace(...args),
    warn: (...args) => warn(...args),
  },
}));

jest.mock('../../../helper', () => ({
  __esModule: true,
  reportError: (...args) => reportError(...args),
}));

jest.mock('../../../fileHandlers', () => ({
  __esModule: true,
  handleCtxFromUri: (...args) => handleCtxFromUri(...args),
  allHandleCtxFromUri: (...args) => allHandleCtxFromUri(...args),
}));

import Command from '../command';
import {
  createCommand,
  createFileCommand,
  createFileMultiCommand,
} from '../createCommand';
import {
  COMMAND_UPLOAD_FILE_TO_ALL_PROFILES,
  COMMAND_UPLOAD_FOLDER_TO_ALL_PROFILES,
} from '../../../constants';

describe('commands/abstract/createCommand', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('createCommand binds metadata, runs the handler, and notifies listeners', async () => {
    const handleCommand = jest.fn(function(this: Command, ...args: any[]) {
      expect(this.id).toBe('test.command');
      expect(this.name).toBe('Test Command');
      return args.join(':');
    });
    const listener = jest.fn();

    const commandClass = createCommand({
      id: 'test.command',
      name: 'Test Command',
      handleCommand,
    });

    const command = new commandClass();
    command.onCommandDone(listener);

    await command.run('alpha', 'beta');

    expect(trace).toHaveBeenCalledWith('run command \'Test Command\'');
    expect(handleCommand).toHaveBeenCalledWith('alpha', 'beta');
    expect(listener).toHaveBeenCalledWith('alpha', 'beta');
  });

  test('Command.run reports errors and still notifies listeners', async () => {
    const error = new Error('boom');
    const listener = jest.fn();

    class ThrowingCommand extends Command {
      id = 'throwing.command';
      name = 'Throwing Command';

      protected async doCommandRun() {
        throw error;
      }
    }

    const command = new ThrowingCommand();
    command.onCommandDone(listener);

    await command.run('payload');

    expect(reportError).toHaveBeenCalledWith(error);
    expect(listener).toHaveBeenCalledWith('payload');
  });

  test('createFileCommand asks for confirmation before uploading to all profiles', async () => {
    const getFileTarget = jest.fn();
    const handleFile = jest.fn();
    showInformationMessage.mockResolvedValue('No');

    const commandClass = createFileCommand({
      id: COMMAND_UPLOAD_FILE_TO_ALL_PROFILES,
      name: 'Upload File To All Profiles',
      getFileTarget,
      handleFile,
    });

    await new commandClass().run();

    expect(showInformationMessage).toHaveBeenCalledWith(
      'Are you sure you want to upload to all profiles?',
      'Yes',
      'No'
    );
    expect(getFileTarget).not.toHaveBeenCalled();
    expect(handleFile).not.toHaveBeenCalled();
  });

  test('createFileCommand warns when no file target is selected', async () => {
    const getFileTarget = jest.fn().mockResolvedValue(undefined);
    const handleFile = jest.fn();

    const commandClass = createFileCommand({
      id: 'sftp.upload.file',
      name: 'Upload File',
      getFileTarget,
      handleFile,
    });

    await new commandClass().run();

    expect(warn).toHaveBeenCalledWith(
      'The "Upload File" command get canceled because of missing targets.'
    );
    expect(handleFile).not.toHaveBeenCalled();
  });

  test('createFileCommand handles each file target and reports per-target failures', async () => {
    const firstTarget = UriMock.file('/workspace/project/a.ts');
    const secondTarget = UriMock.file('/workspace/project/b.ts');
    const firstContext = { localFsPath: firstTarget.fsPath };
    const secondContext = { localFsPath: secondTarget.fsPath };
    const error = new Error('upload failed');
    const getFileTarget = jest.fn().mockResolvedValue([firstTarget, secondTarget]);
    const handleFile = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(error);

    handleCtxFromUri
      .mockReturnValueOnce(firstContext)
      .mockReturnValueOnce(secondContext);

    const commandClass = createFileCommand({
      id: 'sftp.upload.file',
      name: 'Upload File',
      getFileTarget,
      handleFile,
    });

    await new commandClass().run('from-editor');

    expect(getFileTarget).toHaveBeenCalledWith('from-editor');
    expect(handleCtxFromUri).toHaveBeenNthCalledWith(1, firstTarget);
    expect(handleCtxFromUri).toHaveBeenNthCalledWith(2, secondTarget);
    expect(handleFile).toHaveBeenNthCalledWith(1, firstContext);
    expect(handleFile).toHaveBeenNthCalledWith(2, secondContext);
    expect(reportError).toHaveBeenCalledWith(error);
  });

  test('createFileCommand skips the upload-to-all-profiles confirmation for other command IDs', async () => {
    const getFileTarget = jest.fn().mockResolvedValue(UriMock.file('/workspace/project/a.ts'));
    const handleFile = jest.fn().mockResolvedValue(undefined);

    // Use a regular command ID (not the upload-to-all-profiles one)
    const commandClass = createFileCommand({
      id: 'sftp.upload.file',
      name: 'Upload File',
      getFileTarget,
      handleFile,
    });

    await new commandClass().run();

    // Should NOT show confirmation for non-upload-to-all-profiles commands
    expect(showInformationMessage).not.toHaveBeenCalled();
    expect(getFileTarget).toHaveBeenCalled();
  });

  test('createFileMultiCommand skips the upload-to-all-profiles confirmation for non-matching IDs', async () => {
    const getFileTarget = jest.fn().mockResolvedValue(UriMock.file('/workspace/project/a.ts'));
    const handleFile = jest.fn().mockResolvedValue(undefined);

    const commandClass = createFileMultiCommand({
      id: 'sftp.sync.both',
      name: 'Sync Both Directions',
      getFileTarget,
      handleFile,
    });

    showInformationMessage.mockResolvedValue('No');

    await new commandClass().run();

    expect(showInformationMessage).not.toHaveBeenCalled();
    expect(getFileTarget).toHaveBeenCalled();
  });

  test('createFileMultiCommand expands all profiles for every selected target', async () => {
    const target = UriMock.file('/workspace/project/a.ts');
    const profileA = { remoteId: 1 };
    const profileB = { remoteId: 2 };
    const getFileTarget = jest.fn().mockResolvedValue(target);
    const handleFile = jest.fn().mockResolvedValue(undefined);

    showInformationMessage.mockResolvedValue('Yes');
    allHandleCtxFromUri.mockReturnValue([profileA, profileB]);

    const commandClass = createFileMultiCommand({
      id: COMMAND_UPLOAD_FOLDER_TO_ALL_PROFILES,
      name: 'Upload Folder To All Profiles',
      getFileTarget,
      handleFile,
    });

    await new commandClass().run();

    expect(showInformationMessage).toHaveBeenCalled();
    expect(allHandleCtxFromUri).toHaveBeenCalledWith(target);
    expect(handleFile.mock.calls.map(call => call[0])).toEqual([profileA, profileB]);
  });
});

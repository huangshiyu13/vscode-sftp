const registerCommand = jest.fn();
const debug = jest.fn();
const warn = jest.fn();
const error = jest.fn();
const createCommand = jest.fn();
const createFileCommand = jest.fn();
const createFileMultiCommand = jest.fn();

jest.mock('../host', () => ({
  __esModule: true,
  registerCommand: (...args) => registerCommand(...args),
}));

jest.mock('../logger', () => ({
  __esModule: true,
  default: {
    debug: (...args) => debug(...args),
    warn: (...args) => warn(...args),
    error: (...args) => error(...args),
  },
}));

jest.mock('../commands/abstract/createCommand', () => ({
  __esModule: true,
  createCommand: (...args) => createCommand(...args),
  createFileCommand: (...args) => createFileCommand(...args),
  createFileMultiCommand: (...args) => createFileMultiCommand(...args),
}));

import initCommands, {
  loadCommands,
  nomalizeCommandName,
} from '../initCommands';

function makeRequireContext(modules) {
  const context = (fileName: string) => modules[fileName];
  context.keys = () => Object.keys(modules);
  return context;
}

describe('initCommands', () => {
  const context = {
    subscriptions: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    createCommand.mockImplementation(
      commandOption =>
        class TestCommand {
          id = commandOption.id;
          name = commandOption.name;
          run = jest.fn();
        }
    );
    createFileCommand.mockImplementation(
      commandOption =>
        class TestFileCommand {
          id = commandOption.id;
          name = commandOption.name;
          run = jest.fn();
        }
    );
    createFileMultiCommand.mockImplementation(
      commandOption =>
        class TestMultiFileCommand {
          id = commandOption.id;
          name = commandOption.name;
          run = jest.fn();
        }
    );
  });

  test('normalizes command names for logging and registration', () => {
    expect(nomalizeCommandName('openSshConnection')).toBe('Open Ssh Connection');
    expect(nomalizeCommandName('cancelAllTransfer')).toBe('Cancel All Transfer');
  });

  test('loadCommands registers valid modules and handles invalid names and creator failures', async () => {
    const creator = jest
      .fn()
      .mockImplementationOnce(
        commandOption =>
          class TestCommand {
            id = commandOption.id;
            name = commandOption.name;
            run = jest.fn();
          }
      )
      .mockImplementationOnce(() => {
        throw new Error('broken creator');
      });

    const requireContext = makeRequireContext({
      './commandConfig.ts': {
        default: {
          id: 'sftp.config',
        },
      },
      './invalid.ts': {
        default: {
          id: 'ignored',
        },
      },
      './commandBroken.ts': {
        default: {
          id: 'sftp.broken',
        },
      },
    });

    await loadCommands(requireContext, /command(.*)/, creator, context as any);

    expect(registerCommand).toHaveBeenCalledTimes(1);
    expect(registerCommand).toHaveBeenCalledWith(
      context,
      'sftp.config',
      expect.any(Function),
      expect.objectContaining({
        id: 'sftp.config',
        name: 'Config',
      })
    );
    expect(debug).toHaveBeenCalledWith(
      'register command "Config" from "./commandConfig.ts"'
    );
    expect(warn).toHaveBeenCalledWith('Command name not found from ./invalid.ts');
    expect(error).toHaveBeenCalledWith(expect.any(Error), 'load command "./commandBroken.ts"');
  });

  test('initializes normal, file, and multi-file command groups through the injected require context factory', () => {
    const requireContextFactory = jest
      .fn()
      .mockImplementation((_path, _recursive, regex) => {
        if (regex.toString() === /command.*.ts$/.toString()) {
          return makeRequireContext({
            './commandConfig.ts': {
              default: {
                id: 'sftp.config',
              },
            },
          });
        }

        if (regex.toString() === /fileCommand.*.ts$/.toString()) {
          return makeRequireContext({
            './fileCommandUpload.ts': {
              default: {
                id: 'sftp.upload',
              },
            },
          });
        }

        return makeRequireContext({
          './fileMultiCommandUploadToAllProfiles.ts': {
            default: {
              id: 'sftp.upload.all',
            },
          },
        });
      });

    initCommands(context as any, requireContextFactory);

    expect(requireContextFactory).toHaveBeenCalledTimes(3);
    expect(createCommand).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'sftp.config', name: 'Config' })
    );
    expect(createFileCommand).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'sftp.upload', name: 'Upload' })
    );
    expect(createFileMultiCommand).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'sftp.upload.all', name: 'Upload To All Profiles' })
    );
    expect(registerCommand).toHaveBeenCalledTimes(3);
  });
});

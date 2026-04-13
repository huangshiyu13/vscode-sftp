class UriMock {
  fsPath: string;
  raw: string;

  constructor(fsPath: string, raw?: string) {
    this.fsPath = fsPath;
    this.raw = raw || `file://${fsPath}`;
  }

  toString() {
    return this.raw;
  }
}

const startSpinner = jest.fn();
const stopSpinner = jest.fn();
const trace = jest.fn();
const getFileService = jest.fn();
const fromResource = jest.fn();

jest.mock('vscode', () => ({
  Uri: UriMock,
}));

jest.mock('../../app', () => ({
  __esModule: true,
  default: {
    sftpBarItem: {
      startSpinner: (...args) => startSpinner(...args),
      stopSpinner: (...args) => stopSpinner(...args),
    },
  },
}));

jest.mock('../../logger', () => ({
  __esModule: true,
  default: {
    trace: (...args) => trace(...args),
  },
}));

jest.mock('../../modules/serviceManager', () => ({
  __esModule: true,
  getFileService: (...args) => getFileService(...args),
}));

jest.mock('../../core', () => ({
  __esModule: true,
  UResource: {
    from: (...args) => fromResource(...args),
  },
}));

import createFileHandler, {
  handleCtxFromUri,
  allHandleCtxFromUri,
} from '../createFileHandler';

describe('fileHandlers/createFileHandler', () => {
  const uri = new UriMock('/workspace/project/src/index.ts');
  const service = {
    baseDir: '/workspace/project',
    id: 9,
    getConfig: jest.fn(() => ({
      host: 'target.internal',
      port: 22,
      remotePath: '/remote/project',
    })),
    getAllConfig: jest.fn(() => [
      {
        host: 'target.internal',
        port: 22,
        remotePath: '/remote/project',
      },
      {
        host: 'backup.internal',
        port: 22,
        remotePath: '/remote/backup',
      },
    ]),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    getFileService.mockReturnValue(service);
    fromResource.mockImplementation((_uri, option) => ({
      localFsPath: option.localBasePath + '/src/index.ts',
      option,
    }));
  });

  test('builds a handler context from a local uri', () => {
    const ctx = handleCtxFromUri(uri as any);

    expect(getFileService).toHaveBeenCalledWith(uri);
    expect(fromResource).toHaveBeenCalledWith(uri, {
      localBasePath: '/workspace/project',
      remoteBasePath: '/remote/project',
      remoteId: 9,
      remote: {
        host: 'target.internal',
        port: 22,
      },
    });
    expect(ctx.fileService).toBe(service);
    expect(ctx.config.remotePath).toBe('/remote/project');
  });

  test('throws a helpful error when no config matches the uri', () => {
    getFileService.mockReturnValue(undefined);

    expect(() => handleCtxFromUri(uri as any)).toThrow(
      'Config Not Found. (file:///workspace/project/src/index.ts)'
    );
  });

  test('supports the special remote-to-local command uri without wrapping the error', () => {
    getFileService.mockReturnValue(undefined);
    const specialUri = new UriMock(
      '/workspace/project',
      'file:///${command:sftp.sync.remoteToLocal}'
    );

    expect(() => handleCtxFromUri(specialUri as any)).toThrow('');
  });

  test('builds one context per profile for multi-profile commands', () => {
    const all = allHandleCtxFromUri(uri as any);

    expect(all).toHaveLength(2);
    expect(all[0].config.remotePath).toBe('/remote/project');
    expect(all[1].config.remotePath).toBe('/remote/backup');
    expect(fromResource).toHaveBeenCalledTimes(2);
  });

  test('allHandleCtxFromUri throws for special command URI', () => {
    getFileService.mockReturnValue(undefined);
    const specialUri = new UriMock(
      '/workspace/project',
      'file:///${command:sftp.sync.remoteToLocal}'
    );

    expect(() => allHandleCtxFromUri(specialUri as any)).toThrow('');
  });

  test('allHandleCtxFromUri throws for missing config', () => {
    getFileService.mockReturnValue(undefined);

    expect(() => allHandleCtxFromUri(uri as any)).toThrow(
      'Config Not Found. (file:///workspace/project/src/index.ts)'
    );
  });

  test('runs a handler with merged options and spinner lifecycle', async () => {
    const handle = jest.fn().mockResolvedValue(undefined);
    const afterHandle = jest.fn();
    const fileHandler = createFileHandler({
      name: 'upload',
      handle,
      afterHandle,
      transformOption() {
        return { base: true };
      },
    });

    await fileHandler(uri as any, { force: true } as any);

    expect(startSpinner).toHaveBeenCalledTimes(1);
    expect(stopSpinner).toHaveBeenCalledTimes(1);
    expect(trace).toHaveBeenCalledWith(
      'handle upload for',
      '/workspace/project/src/index.ts'
    );
    expect(handle).toHaveBeenCalledWith({ base: true, force: true });
    expect(afterHandle).toHaveBeenCalledTimes(1);
  });

  test('skips the handler when the ignore option matches the local path', async () => {
    const handle = jest.fn().mockResolvedValue(undefined);
    const fileHandler = createFileHandler({
      name: 'upload',
      handle,
      transformOption() {
        return {
          ignore: (fsPath: string) => fsPath === '/workspace/project/src/index.ts',
        };
      },
    });

    await fileHandler(uri as any);

    expect(handle).not.toHaveBeenCalled();
    expect(startSpinner).not.toHaveBeenCalled();
    expect(stopSpinner).not.toHaveBeenCalled();
  });

  test('does not ignore when ignore returns false', async () => {
    const handle = jest.fn().mockResolvedValue(undefined);
    const fileHandler = createFileHandler({
      name: 'upload',
      handle,
      transformOption() {
        return {
          base: true,
          ignore: () => false,
        };
      },
    });

    await fileHandler(uri as any, { force: true } as any);

    expect(handle).toHaveBeenCalledWith(
      expect.objectContaining({
        base: true,
        force: true,
        ignore: expect.any(Function),
      })
    );
    expect(startSpinner).toHaveBeenCalledTimes(1);
    expect(stopSpinner).toHaveBeenCalledTimes(1);
  });

  test('always stops the spinner when the handler throws', async () => {
    const fileHandler = createFileHandler({
      name: 'upload',
      async handle() {
        throw new Error('boom');
      },
    });

    await expect(fileHandler(uri as any)).rejects.toThrow('boom');
    expect(startSpinner).toHaveBeenCalledTimes(1);
    expect(stopSpinner).toHaveBeenCalledTimes(1);
  });

  test('accepts a pre-built context instead of a Uri', async () => {
    const handle = jest.fn().mockResolvedValue(undefined);
    const afterHandle = jest.fn();
    const fileHandler = createFileHandler({
      name: 'download',
      handle,
      afterHandle,
    });

    const ctx = {
      target: { localFsPath: '/workspace/project/file.txt' },
      fileService: service,
      config: service.getConfig(),
    };

    await fileHandler(ctx as any);

    expect(getFileService).not.toHaveBeenCalled();
    expect(handle).toHaveBeenCalled();
    expect(afterHandle).toHaveBeenCalled();
  });

  test('does not call afterHandle when not provided', async () => {
    const handle = jest.fn().mockResolvedValue(undefined);
    const fileHandler = createFileHandler({
      name: 'upload',
      handle,
    });

    await fileHandler(uri as any);

    expect(handle).toHaveBeenCalled();
    expect(stopSpinner).toHaveBeenCalled();
  });

  test('runs without transformOption', async () => {
    const handle = jest.fn().mockResolvedValue(undefined);
    const fileHandler = createFileHandler({
      name: 'upload',
      handle,
    });

    await fileHandler(uri as any);

    expect(handle).toHaveBeenCalledWith({});
  });
});

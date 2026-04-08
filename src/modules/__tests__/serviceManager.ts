class UriMock {
  fsPath: string;

  constructor(fsPath: string) {
    this.fsPath = fsPath;
  }

  static file(fsPath: string) {
    return new UriMock(fsPath);
  }
}

const info = jest.fn();
const simplifyPath = jest.fn();
const reportError = jest.fn();
const findRoot = jest.fn();
const showMsg = jest.fn();
const validateConfig = jest.fn();
const maskConfig = jest.fn();
const isRemote = jest.fn();
const watcherService = {
  id: 'watcher-service',
};

class MockFileService {
  baseDir: string;
  workspace: string;
  config: any;
  name: string | undefined;
  validator: any;
  watcher: any;
  beforeTransferHandler: any;
  afterTransferHandler: any;
  pendingTasks: any[];
  dispose: jest.Mock;

  constructor(baseDir: string, workspace: string, config: any) {
    this.baseDir = baseDir;
    this.workspace = workspace;
    this.config = config;
    this.pendingTasks = [];
    this.dispose = jest.fn();
  }

  setConfigValidator(validator: any) {
    this.validator = validator;
  }

  setWatcherService(watcher: any) {
    this.watcher = watcher;
  }

  beforeTransfer(listener: any) {
    this.beforeTransferHandler = listener;
  }

  afterTransfer(listener: any) {
    this.afterTransferHandler = listener;
  }

  getPendingTransferTasks() {
    return this.pendingTasks;
  }
}

jest.mock('vscode', () => ({
  Uri: UriMock,
}));

jest.mock('../../app', () => ({
  __esModule: true,
  default: {
    state: {},
    remoteExplorer: {
      findRoot: (...args) => findRoot(...args),
    },
    sftpBarItem: {
      showMsg: (...args) => showMsg(...args),
    },
  },
}));

jest.mock('../../logger', () => ({
  __esModule: true,
  default: {
    info: (...args) => info(...args),
  },
}));

jest.mock('../../helper', () => ({
  __esModule: true,
  simplifyPath: (...args) => simplifyPath(...args),
  reportError: (...args) => reportError(...args),
}));

jest.mock('../../core', () => ({
  __esModule: true,
  UResource: {
    isRemote: (...args) => isRemote(...args),
  },
  FileService: MockFileService,
  TransferTask: class TransferTask {},
}));

jest.mock('../config', () => ({
  __esModule: true,
  validateConfig: (...args) => validateConfig(...args),
}));

jest.mock('../fileWatcher', () => ({
  __esModule: true,
  default: watcherService,
}));

jest.mock('../serviceManager/maskConfig', () => ({
  __esModule: true,
  default: (...args) => maskConfig(...args),
}));

import app from '../../app';
import {
  getBasePath,
  createFileService,
  getFileService,
  disposeFileService,
  findAllFileService,
  getAllFileService,
  getRunningTransformTasks,
} from '../serviceManager';

describe('modules/serviceManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (app.state as any).profile = undefined;
    simplifyPath.mockImplementation((target: string) => `short:${target}`);
    maskConfig.mockImplementation(config => ({ maskedName: config.name }));
  });

  afterEach(() => {
    getAllFileService().forEach(disposeFileService);
  });

  test('getBasePath resolves relative context against the workspace', () => {
    expect(getBasePath('src', '/workspace/project')).toBe('/workspace/project/src');
    expect(getBasePath(undefined as any, '/workspace/project')).toBe('/workspace/project');
    expect(getBasePath('/workspace/project/custom', '/workspace/project')).toBe(
      '/workspace/project/custom'
    );
  });

  test('createFileService registers a service and wires transfer lifecycle messages', () => {
    const config = {
      name: 'Primary',
      host: 'target.internal',
      remotePath: '/remote/project',
      defaultProfile: 'prod',
    };

    const service: any = createFileService(config, '/workspace/project');

    expect((app.state as any).profile).toBe('prod');
    expect(service.baseDir).toBe('/workspace/project');
    expect(service.name).toBe('Primary');
    service.validator('payload');
    expect(validateConfig).toHaveBeenCalledWith('payload');
    expect(service.watcher).toBe(watcherService);
    expect(info).toHaveBeenCalledWith('config at /workspace/project', { maskedName: 'Primary' });

    service.beforeTransferHandler({
      localFsPath: '/workspace/project/src/index.ts',
      transferType: 'upload',
    });

    expect(showMsg).toHaveBeenCalledWith(
      'upload index.ts',
      'short:/workspace/project/src/index.ts'
    );

    service.afterTransferHandler(undefined, {
      localFsPath: '/workspace/project/src/index.ts',
      transferType: 'upload',
      isCancelled: () => true,
    });
    service.afterTransferHandler(new Error('failed'), {
      localFsPath: '/workspace/project/src/index.ts',
      transferType: 'download',
      isCancelled: () => false,
    });
    service.afterTransferHandler(undefined, {
      localFsPath: '/workspace/project/src/index.ts',
      transferType: 'sync',
      isCancelled: () => false,
    });

    expect(info).toHaveBeenCalledWith('cancel transfer /workspace/project/src/index.ts');
    expect(reportError).toHaveBeenCalledWith(
      expect.any(Error),
      'when download /workspace/project/src/index.ts'
    );
    expect(info).toHaveBeenCalledWith('sync /workspace/project/src/index.ts');
    expect(showMsg).toHaveBeenCalledWith(
      'failed index.ts',
      'short:/workspace/project/src/index.ts',
      4000
    );
    expect(showMsg).toHaveBeenCalledWith(
      'done index.ts',
      'short:/workspace/project/src/index.ts',
      4000
    );
  });

  test('getFileService supports local prefixes, remote roots, and task aggregation', () => {
    const localService: any = createFileService(
      {
        name: 'Local',
        host: 'target.internal',
        remotePath: '/remote/project',
      },
      '/workspace/project'
    );
    const remoteService = { id: 'remote-service' };

    localService.pendingTasks = [{ id: 1 }, { id: 2 }];
    isRemote.mockReturnValue(false);

    expect(getFileService(UriMock.file('/workspace/project/src/index.ts') as any)).toBe(localService);
    expect(findAllFileService(service => service.name === 'Local')).toEqual([localService]);
    expect(getRunningTransformTasks()).toEqual([{ id: 1 }, { id: 2 }]);

    isRemote.mockReturnValue(true);
    findRoot.mockReturnValue({
      explorerContext: {
        fileService: remoteService,
      },
    });

    expect(getFileService({ scheme: 'remote' } as any)).toBe(remoteService);

    disposeFileService(localService);

    expect(localService.dispose).toHaveBeenCalled();
    expect(getAllFileService()).toEqual([]);
  });
});

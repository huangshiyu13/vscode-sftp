jest.mock('../../app', () => ({
  __esModule: true,
  default: {
    sftpBarItem: { showMsg: jest.fn(), startSpinner: jest.fn(), stopSpinner: jest.fn() },
    remoteExplorer: { findRoot: jest.fn().mockReturnValue(null) },
    state: { profile: null },
  },
}));

jest.mock('../../logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), trace: jest.fn() },
}));

jest.mock('../../helper', () => ({
  __esModule: true,
  simplifyPath: jest.fn().mockImplementation((p: string) => p),
  reportError: jest.fn(),
}));

jest.mock('../../core', () => ({
  __esModule: true,
  UResource: {
    isRemote: jest.fn().mockReturnValue(false),
  },
  FileService: jest.fn().mockImplementation((baseDir: string, workspace: string, config: any) => ({
    baseDir,
    workspace,
    _config: config,
    name: '',
    getConfig: jest.fn().mockReturnValue(config),
    getAllConfig: jest.fn().mockReturnValue([config]),
    setConfigValidator: jest.fn(),
    setWatcherService: jest.fn(),
    beforeTransfer: jest.fn(),
    afterTransfer: jest.fn(),
    dispose: jest.fn(),
    getPendingTransferTasks: jest.fn().mockReturnValue([]),
  })),
  TransferTask: jest.fn(),
}));

jest.mock('../config', () => ({
  __esModule: true,
  validateConfig: jest.fn(),
}));

jest.mock('../fileWatcher', () => ({
  __esModule: true,
  default: { create: jest.fn() },
}));

jest.mock('../serviceManager/maskConfig', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation((config: any) => config),
}));

jest.mock('../serviceManager/trie', () => {
  class MockTrie {
    private data: Map<string, any> = new Map();
    add(path: string, value: any) { this.data.set(path, value); }
    findPrefix(path: string) {
      for (const [key, value] of this.data) {
        if (path.startsWith(key)) return value;
      }
      return undefined;
    }
    remove(path: string) { this.data.delete(path); }
    getAllValues() { return Array.from(this.data.values()); }
  }
  return { __esModule: true, default: MockTrie };
});

import {
  getBasePath,
  createFileService,
  getFileService,
  disposeFileService,
  findAllFileService,
  getAllFileService,
  getRunningTransformTasks,
} from '../serviceManager';
import app from '../../app';
import logger from '../../logger';
import { reportError, simplifyPath } from '../../helper';
import maskConfig from '../serviceManager/maskConfig';

describe('modules/serviceManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getBasePath', () => {
    test('returns workspace when context is empty', () => {
      expect(getBasePath('', '/workspace')).toBe('/workspace');
    });

    test('returns absolute context directly', () => {
      expect(getBasePath('/absolute/path', '/workspace')).toBe('/absolute/path');
    });

    test('joins relative context with workspace', () => {
      const result = getBasePath('relative', '/workspace');
      expect(result).toContain('relative');
    });

    test('normalizes the path', () => {
      const result = getBasePath('/workspace/../other', '/workspace');
      expect(result).not.toContain('..');
    });
  });

  describe('createFileService', () => {
    test('creates and registers a file service', () => {
      const config = {
        context: '/project',
        name: 'test',
        host: 'example.com',
      };

      const service = createFileService(config, '/workspace');
      expect(service).toBeDefined();
      expect(service.baseDir).toBeDefined();
    });

    test('sets defaultProfile when configured', () => {
      const config = {
        context: '/project2',
        name: 'test2',
        defaultProfile: 'dev',
      };

      createFileService(config, '/workspace');
      expect(app.state.profile).toBe('dev');
    });

    test('calls maskConfig with the config', () => {
      const config = {
        context: '/project3',
        name: 'test3',
        host: 'example.com',
      };

      createFileService(config, '/workspace');
      expect(maskConfig).toHaveBeenCalledWith(config);
    });

    test('registers beforeTransfer callback', () => {
      const config = {
        context: '/project4',
        name: 'test4',
        host: 'example.com',
      };

      const service = createFileService(config, '/workspace');
      expect(service.beforeTransfer).toHaveBeenCalled();
    });

    test('registers afterTransfer callback', () => {
      const config = {
        context: '/project5',
        name: 'test5',
        host: 'example.com',
      };

      const service = createFileService(config, '/workspace');
      expect(service.afterTransfer).toHaveBeenCalled();
    });

    test('beforeTransfer callback shows the pending file name in the status bar', () => {
      const service = createFileService(
        {
          context: '/project-before-transfer',
          name: 'before-transfer',
          host: 'example.com',
        },
        '/workspace'
      );

      const callback = (service.beforeTransfer as jest.Mock).mock.calls[0][0];
      callback({
        localFsPath: '/workspace/src/index.ts',
        transferType: 'upload',
      });

      expect(simplifyPath).toHaveBeenCalledWith('/workspace/src/index.ts');
      expect(app.sftpBarItem.showMsg).toHaveBeenCalledWith(
        'upload index.ts',
        '/workspace/src/index.ts'
      );
    });

    test('afterTransfer callback reports cancelled, failed, and successful transfers', () => {
      const service = createFileService(
        {
          context: '/project-after-transfer',
          name: 'after-transfer',
          host: 'example.com',
        },
        '/workspace'
      );

      const callback = (service.afterTransfer as jest.Mock).mock.calls[0][0];
      const task = {
        localFsPath: '/workspace/src/index.ts',
        transferType: 'download',
        isCancelled: jest.fn(),
      };

      task.isCancelled.mockReturnValueOnce(true);
      callback(undefined, task);
      expect(logger.info).toHaveBeenCalledWith('cancel transfer /workspace/src/index.ts');
      expect(app.sftpBarItem.showMsg).toHaveBeenCalledWith(
        'cancelled index.ts',
        '/workspace/src/index.ts',
        4000
      );

      const error = new Error('boom');
      task.isCancelled.mockReturnValueOnce(false);
      callback(error, task);
      expect(reportError).toHaveBeenCalledWith(error, 'when download /workspace/src/index.ts');
      expect(app.sftpBarItem.showMsg).toHaveBeenCalledWith(
        'failed index.ts',
        '/workspace/src/index.ts',
        4000
      );

      task.isCancelled.mockReturnValueOnce(false);
      callback(undefined, task);
      expect(logger.info).toHaveBeenCalledWith('download /workspace/src/index.ts');
      expect(app.sftpBarItem.showMsg).toHaveBeenCalledWith(
        'done index.ts',
        '/workspace/src/index.ts',
        4000
      );
    });

    test('sets config validator', () => {
      const config = {
        context: '/project6',
        name: 'test6',
        host: 'example.com',
      };

      const service = createFileService(config, '/workspace');
      expect(service.setConfigValidator).toHaveBeenCalled();
    });

    test('sets watcher service', () => {
      const config = {
        context: '/project7',
        name: 'test7',
        host: 'example.com',
      };

      const service = createFileService(config, '/workspace');
      expect(service.setWatcherService).toHaveBeenCalled();
    });

    test('logs config info', () => {
      const config = {
        context: '/project8',
        name: 'test8',
        host: 'example.com',
      };

      createFileService(config, '/workspace');
      expect(logger.info).toHaveBeenCalled();
    });
  });

  describe('getFileService', () => {
    test('returns undefined for remote URI without root', () => {
      const uri = { scheme: 'remote', fsPath: '/remote/path', authority: '' };
      const result = getFileService(uri as any);
      expect(result).toBeUndefined();
    });

    test('returns undefined for local URI with no service', () => {
      const uri = { scheme: 'file', fsPath: '/nonexistent/path', authority: '' };
      const result = getFileService(uri as any);
      expect(result).toBeUndefined();
    });

    test('returns service for registered local URI', () => {
      const config = {
        context: '/registered-project',
        name: 'test-reg',
        host: 'example.com',
      };
      createFileService(config, '/workspace');

      const uri = { scheme: 'file', fsPath: '/registered-project', authority: '' };
      const result = getFileService(uri as any);
      expect(result).toBeDefined();
    });

    test('returns service from remote root', () => {
      const { UResource } = require('../../core');
      const mockService = { id: 'remote-service' };
      UResource.isRemote.mockReturnValueOnce(true);
      (app.remoteExplorer.findRoot as jest.Mock).mockReturnValueOnce({
        explorerContext: { fileService: mockService },
      });

      const uri = { scheme: 'remote', fsPath: '/remote/path', authority: '' };
      const result = getFileService(uri as any);
      expect(result).toBe(mockService);
    });
  });

  describe('getAllFileService', () => {
    test('returns empty array when no services registered', () => {
      const result = getAllFileService();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('findAllFileService', () => {
    test('returns filtered services matching predicate', () => {
      const result = findAllFileService(() => true);
      expect(Array.isArray(result)).toBe(true);
    });

    test('returns empty array when no services match', () => {
      const result = findAllFileService(() => false);
      expect(result).toEqual([]);
    });
  });

  describe('disposeFileService', () => {
    test('calls dispose on file service', () => {
      const mockService = {
        baseDir: '/test-path',
        dispose: jest.fn(),
      };

      disposeFileService(mockService as any);
      expect(mockService.dispose).toHaveBeenCalled();
    });
  });

  describe('getRunningTransformTasks', () => {
    test('returns pending tasks from every registered service', () => {
      const firstService = createFileService(
        {
          context: '/pending-project-a',
          name: 'pending-a',
          host: 'example.com',
        },
        '/workspace'
      );
      const secondService = createFileService(
        {
          context: '/pending-project-b',
          name: 'pending-b',
          host: 'example.com',
        },
        '/workspace'
      );

      const taskA = { id: 'task-a' };
      const taskB = { id: 'task-b' };
      (firstService.getPendingTransferTasks as jest.Mock).mockReturnValue([taskA]);
      (secondService.getPendingTransferTasks as jest.Mock).mockReturnValue([taskB]);

      expect(getRunningTransformTasks()).toEqual([taskA, taskB]);
    });
  });
});

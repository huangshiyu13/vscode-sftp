const loggerInfoMock = jest.fn();
const reportErrorMock = jest.fn();

jest.mock('../../logger', () => ({
  __esModule: true,
  default: {
    info: loggerInfoMock,
  },
}));

jest.mock('../../helper', () => ({
  __esModule: true,
  reportError: reportErrorMock,
  simplifyPath: jest.fn().mockReturnValue('simplified-path'),
}));

jest.mock('../../app', () => ({
  __esModule: true,
  default: {
    state: { profile: undefined },
    sftpBarItem: {
      showMsg: jest.fn(),
    },
    remoteExplorer: {
      findRoot: jest.fn().mockReturnValue(null),
    },
  },
}));

jest.mock('../../core', () => ({
  __esModule: true,
  UResource: {
    isRemote: jest.fn().mockReturnValue(false),
  },
  FileService: class FileService {
    baseDir = '/workspace';
    name = '';
    setConfigValidator = jest.fn();
    setWatcherService = jest.fn();
    beforeTransfer = jest.fn();
    afterTransfer = jest.fn();
    dispose = jest.fn();
    getPendingTransferTasks = jest.fn().mockReturnValue([]);
  },
  TransferTask: class TransferTask {},
}));

jest.mock('../config', () => ({
  __esModule: true,
  validateConfig: jest.fn(),
}));

jest.mock('../fileWatcher', () => ({
  __esModule: true,
  default: {},
}));

jest.mock('../serviceManager/maskConfig', () => ({
  __esModule: true,
  default: (config: any) => config,
}));

jest.mock('../serviceManager/trie', () => {
  const TrieClass = class Trie<T> {
    private data: { [key: string]: T } = {};
    add(path: string, value: T) {
      this.data[path] = value;
    }
    findPrefix(path: string): T | null {
      const keys = Object.keys(this.data).sort().reverse();
      for (const key of keys) {
        if (path.startsWith(key)) {
          return this.data[key];
        }
      }
      return null;
    }
    remove(path: string) {
      delete this.data[path];
    }
    getAllValues(): T[] {
      return Object.values(this.data);
    }
  };
  return { __esModule: true, default: TrieClass };
});

import * as path from 'path';
import { getBasePath, createFileService, getFileService, disposeFileService, findAllFileService, getAllFileService } from '../serviceManager';
import app from '../../app';
import { UResource } from '../../core';

describe('modules/serviceManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    app.state.profile = undefined;
  });

  describe('getBasePath', () => {
    test('returns workspace when context is empty', () => {
      expect(getBasePath('', '/workspace')).toBe(path.normalize('/workspace'));
    });

    test('returns absolute context directly', () => {
      expect(getBasePath('/custom/path', '/workspace')).toBe(path.normalize('/custom/path'));
    });

    test('joins relative context with workspace', () => {
      expect(getBasePath('subdir', '/workspace')).toBe(path.normalize('/workspace/subdir'));
    });

    test('normalizes the result path', () => {
      // path.normalize strips trailing slashes but getBasePath joins paths then normalizes
      const result = getBasePath('subdir/', '/workspace/');
      expect(result).not.toContain('//');
    });
  });

  describe('createFileService', () => {
    test('creates and registers a file service', () => {
      const config = { host: 'example.com' };
      const service = createFileService(config, '/workspace');

      expect(service).toBeDefined();
      expect(service.name).toBeUndefined();
      expect(loggerInfoMock).toHaveBeenCalled();
    });

    test('sets default profile from config', () => {
      const config = { defaultProfile: 'production' };
      createFileService(config, '/workspace');

      expect(app.state.profile).toBe('production');
    });

    test('sets service name from config', () => {
      const config = { name: 'my-server', host: 'example.com' };
      const service = createFileService(config, '/workspace');

      expect(service.name).toBe('my-server');
    });

    test('registers beforeTransfer callback', () => {
      const config = { host: 'example.com' };
      const service = createFileService(config, '/workspace');

      expect(service.beforeTransfer).toHaveBeenCalled();
    });

    test('registers afterTransfer callback', () => {
      const config = { host: 'example.com' };
      const service = createFileService(config, '/workspace');

      expect(service.afterTransfer).toHaveBeenCalled();
    });
  });

  describe('getFileService', () => {
    test('returns null for non-remote URI with no matching service', () => {
      (UResource.isRemote as jest.Mock).mockReturnValue(false);
      const uri = { fsPath: '/unknown/path/file.txt' };

      const result = getFileService(uri as any);

      expect(result).toBeNull();
    });

    test('returns file service for remote URI via remoteExplorer', () => {
      (UResource.isRemote as jest.Mock).mockReturnValue(true);
      const mockService = { baseDir: '/remote' };
      (app.remoteExplorer.findRoot as jest.Mock).mockReturnValue({
        explorerContext: { fileService: mockService },
      });
      const uri = { fsPath: '/remote/file.txt' };

      const result = getFileService(uri as any);

      expect(result).toBe(mockService);
    });

    test('returns undefined for remote URI with no root found', () => {
      (UResource.isRemote as jest.Mock).mockReturnValue(true);
      (app.remoteExplorer.findRoot as jest.Mock).mockReturnValue(null);
      const uri = { fsPath: '/remote/file.txt' };

      const result = getFileService(uri as any);

      expect(result).toBeUndefined();
    });
  });

  describe('disposeFileService', () => {
    test('calls dispose on the file service', () => {
      const mockService: any = {
        baseDir: '/workspace',
        dispose: jest.fn(),
      };

      disposeFileService(mockService);

      expect(mockService.dispose).toHaveBeenCalled();
    });
  });

  describe('findAllFileService', () => {
    test('returns filtered services', () => {
      const config = { host: 'example.com', name: 'test-service' };
      createFileService(config, '/workspace-test');

      const result = findAllFileService((s: any) => s.name === 'test-service');

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].name).toBe('test-service');
    });

    test('returns empty array when no service matches', () => {
      const result = findAllFileService(() => false);

      expect(result).toEqual([]);
    });
  });

  describe('getAllFileService', () => {
    test('returns all registered services', () => {
      const config1 = { host: 'host1.com', name: 'service1' };
      const config2 = { host: 'host2.com', name: 'service2' };
      createFileService(config1, '/workspace1');
      createFileService(config2, '/workspace2');

      const result = getAllFileService();

      expect(result.length).toBeGreaterThanOrEqual(2);
      const names = result.map((s: any) => s.name);
      expect(names).toContain('service1');
      expect(names).toContain('service2');
    });
  });
});
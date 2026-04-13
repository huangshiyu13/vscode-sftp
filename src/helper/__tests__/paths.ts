jest.mock('../../host', () => ({
  __esModule: true,
  pathRelativeToWorkspace: jest.fn().mockImplementation((p: string) => p.replace('/workspace/', './')),
  getWorkspaceFolders: jest.fn().mockReturnValue([
    { uri: { fsPath: '/workspace/project1' } },
    { uri: { fsPath: '/workspace/project2' } },
  ]),
}));

jest.mock('../../modules/ext', () => ({
  __esModule: true,
  getUserSetting: jest.fn().mockReturnValue(undefined),
  getExtensionSetting: jest.fn().mockReturnValue(undefined),
}));

jest.mock('../../logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock('vscode-uri', () => ({
  __esModule: true,
  default: {
    URI: {
      parse: (str: string) => ({ fsPath: str.replace('file://', '') }),
    },
  },
}));

import {
  simplifyPath,
  toRemotePath,
  toLocalPath,
  isSubpathOf,
  replaceHomePath,
  resolvePath,
  isInWorkspace,
} from '../paths';
import * as fs from 'fs';
import * as os from 'os';

describe('helper/paths', () => {
  const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');

  afterEach(() => {
    jest.restoreAllMocks();
    if (platformDescriptor) {
      Object.defineProperty(process, 'platform', platformDescriptor);
    }
  });

  describe('simplifyPath', () => {
    test('simplifies absolute path relative to workspace', () => {
      expect(simplifyPath('/workspace/src/file.txt')).toBe('./src/file.txt');
    });
  });

  describe('toRemotePath', () => {
    test('converts local path to remote path', () => {
      const result = toRemotePath('/workspace/src/file.txt', '/workspace', '/var/www');
      expect(result).toContain('file.txt');
    });

    test('handles root local context', () => {
      const result = toRemotePath('/workspace/file.txt', '/workspace', '/remote');
      expect(result).toContain('file.txt');
    });

    test('normalizes URI-like fs paths and real paths on Windows', () => {
      Object.defineProperty(process, 'platform', {
        configurable: true,
        value: 'win32',
      });
      const realpathNative = jest.spyOn(fs.realpathSync, 'native' as any);
      realpathNative.mockImplementation((input: string) =>
        input === 'C:/workspace'
          ? 'C:/workspace'
          : input === 'C:/workspace/src/file.txt'
            ? 'C:/workspace/src/file.txt'
            : input
      );

      const result = toRemotePath(
        { fsPath: 'c:/workspace/src/file.txt' } as any,
        { fsPath: 'c:/workspace' } as any,
        '/remote'
      );

      expect(result).toBe('/remote/src/file.txt');
      expect(realpathNative).toHaveBeenCalledWith('C:/workspace');
      expect(realpathNative).toHaveBeenCalledWith('C:/workspace/src/file.txt');
    });

    test('keeps the original URI-like fs path when the real path differs by more than casing', () => {
      Object.defineProperty(process, 'platform', {
        configurable: true,
        value: 'darwin',
      });
      const realpathNative = jest.spyOn(fs.realpathSync, 'native' as any);
      realpathNative.mockImplementation((input: string) =>
        input === '/workspace'
          ? '/private/workspace'
          : input === '/workspace/src/file.txt'
            ? '/private/workspace/src/file.txt'
            : input
      );

      const result = toRemotePath(
        { fsPath: '/workspace/src/file.txt' } as any,
        { fsPath: '/workspace' } as any,
        '/remote'
      );

      expect(result).toBe('/remote/src/file.txt');
      expect(realpathNative).toHaveBeenCalledWith('/workspace');
      expect(realpathNative).toHaveBeenCalledWith('/workspace/src/file.txt');
    });
  });

  describe('toLocalPath', () => {
    test('converts remote path to local path', () => {
      const result = toLocalPath('/var/www/src/file.txt', '/var/www', '/workspace');
      expect(result).toBe('/workspace/src/file.txt');
    });

    test('handles root remote context', () => {
      const result = toLocalPath('/remote/file.txt', '/remote', '/local');
      expect(result).toBe('/local/file.txt');
    });
  });

  describe('isSubpathOf', () => {
    test('returns true for subpath', () => {
      expect(isSubpathOf('/workspace', '/workspace/src/file.txt')).toBe(true);
    });

    test('returns true for exact match', () => {
      expect(isSubpathOf('/workspace', '/workspace')).toBe(true);
    });

    test('returns false for non-subpath', () => {
      expect(isSubpathOf('/workspace', '/other/file.txt')).toBe(false);
    });

    test('handles normalized paths', () => {
      expect(isSubpathOf('/workspace', '/workspace/../other/file.txt')).toBe(false);
    });

    test('handles trailing slash', () => {
      expect(isSubpathOf('/workspace/', '/workspace/src')).toBe(true);
    });
  });

  describe('replaceHomePath', () => {
    test('replaces ~/ with home directory', () => {
      const result = replaceHomePath('~/Documents');
      expect(result).toBe(os.homedir() + '/Documents');
    });

    test('does not modify paths without ~/', () => {
      expect(replaceHomePath('/absolute/path')).toBe('/absolute/path');
    });

    test('does not modify ~ not followed by /', () => {
      expect(replaceHomePath('~other')).toBe('~other');
    });

    test('handles empty string', () => {
      expect(replaceHomePath('')).toBe('');
    });
  });

  describe('resolvePath', () => {
    test('resolves relative path', () => {
      const result = resolvePath('/workspace', 'src/file.txt');
      expect(result).toBe('/workspace/src/file.txt');
    });

    test('resolves with home path', () => {
      const result = resolvePath('/workspace', '~/Documents');
      expect(result).toContain(os.homedir());
    });

    test('resolves absolute path', () => {
      const result = resolvePath('/workspace', '/other/path');
      expect(result).toBe('/other/path');
    });
  });

  describe('isInWorkspace', () => {
    test('returns true for file in workspace', () => {
      expect(isInWorkspace('/workspace/project1/src/file.txt')).toBe(true);
    });

    test('returns true for file in another workspace folder', () => {
      expect(isInWorkspace('/workspace/project2/lib/file.txt')).toBe(true);
    });

    test('returns false for file not in workspace', () => {
      expect(isInWorkspace('/other/path/file.txt')).toBe(false);
    });

    test('handles case-insensitive comparison', () => {
      expect(isInWorkspace('/WORKSPACE/PROJECT1/file.txt')).toBe(true);
    });
  });
});

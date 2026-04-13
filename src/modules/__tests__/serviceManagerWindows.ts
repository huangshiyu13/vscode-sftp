describe('modules/serviceManager windows path handling', () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');

  afterEach(() => {
    jest.resetModules();
    if (originalPlatform) {
      Object.defineProperty(process, 'platform', originalPlatform);
    }
  });

  test('normalizes drive letters and prefixes the workspace drive for absolute contexts without one', () => {
    Object.defineProperty(process, 'platform', {
      configurable: true,
      value: 'win32',
    });

    jest.isolateModules(() => {
      jest.doMock('path', () => jest.requireActual('path').win32);
      jest.doMock('../../app', () => ({
        __esModule: true,
        default: {
          sftpBarItem: { showMsg: jest.fn() },
          remoteExplorer: { findRoot: jest.fn() },
          state: { profile: null },
        },
      }));
      jest.doMock('../../logger', () => ({
        __esModule: true,
        default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), trace: jest.fn() },
      }));
      jest.doMock('../../helper', () => ({
        __esModule: true,
        simplifyPath: jest.fn((value: string) => value),
        reportError: jest.fn(),
      }));
      jest.doMock('../../core', () => ({
        __esModule: true,
        UResource: {
          isRemote: jest.fn().mockReturnValue(false),
        },
        FileService: jest.fn(),
        TransferTask: jest.fn(),
      }));
      jest.doMock('../config', () => ({
        __esModule: true,
        validateConfig: jest.fn(),
      }));
      jest.doMock('../fileWatcher', () => ({
        __esModule: true,
        default: { create: jest.fn() },
      }));
      jest.doMock('../serviceManager/maskConfig', () => ({
        __esModule: true,
        default: jest.fn((config: any) => config),
      }));
      jest.doMock('../serviceManager/trie', () => ({
        __esModule: true,
        default: class MockTrie {
          add() {
            return undefined;
          }
          findPrefix() {
            return undefined;
          }
          remove() {
            return undefined;
          }
          getAllValues() {
            return [];
          }
        },
      }));

      const path = require('path');
      const { getBasePath } = require('../serviceManager');

      expect(getBasePath('C:/Project/Folder', 'C:/Workspace')).toBe(
        path.normalize('c:/Project/Folder')
      );
      expect(getBasePath('/Project/Folder', 'D:/Workspace')).toBe(
        path.normalize('d:/Project/Folder')
      );
    });
  });
});

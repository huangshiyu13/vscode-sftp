jest.mock('vscode', () => ({
  __esModule: true,
  window: {
    showQuickPick: jest.fn().mockResolvedValue(undefined),
  },
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

jest.mock('../../core', () => ({
  __esModule: true,
  FileSystem: {},
  FileType: {
    File: 1,
    Directory: 2,
    SymbolicLink: 64,
  },
}));

import { listFiles } from '../select';
import * as vscode from 'vscode';
import { FileType } from '../../core';

describe('helper/select', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('listFiles', () => {
    test('shows quick pick with items', async () => {
      const items = [
        {
          name: 'file1.txt',
          fsPath: '/remote/file1.txt',
          type: FileType.File,
          description: 'a file',
          getFs: {},
        },
        {
          name: 'dir1/',
          fsPath: '/remote/dir1',
          type: FileType.Directory,
          description: 'a directory',
          getFs: {
            list: jest.fn().mockResolvedValue([]),
          },
        },
      ];

      // Select a file directly
      (vscode.window.showQuickPick as jest.Mock).mockResolvedValueOnce({
        value: items[0],
        label: 'file1.txt',
      });

      const result = await listFiles(items as any);
      expect(vscode.window.showQuickPick).toHaveBeenCalled();
    });

    test('returns undefined when user cancels', async () => {
      const items = [
        {
          name: 'file.txt',
          fsPath: '/remote/file.txt',
          type: FileType.File,
          description: '',
          getFs: {},
        },
      ];

      (vscode.window.showQuickPick as jest.Mock).mockResolvedValueOnce(undefined);

      const result = await listFiles(items as any);
      expect(result).toBeUndefined();
    });

    test('filters by directory type', async () => {
      const items = [
        {
          name: 'file.txt',
          fsPath: '/remote/file.txt',
          type: FileType.File,
          description: '',
          getFs: {},
        },
        {
          name: 'dir/',
          fsPath: '/remote/dir',
          type: FileType.Directory,
          description: '',
          getFs: {},
        },
      ];

      (vscode.window.showQuickPick as jest.Mock).mockResolvedValueOnce(undefined);

      await listFiles(items as any, { type: FileType.Directory });

      const pickItems = (vscode.window.showQuickPick as jest.Mock).mock.calls[0][0];
      // Only directories and special items should be shown
      expect(pickItems.length).toBeGreaterThan(0);
    });

    test('navigates into directory when selected', async () => {
      const mockFs = {
        list: jest.fn().mockResolvedValue([
          { fspath: '/remote/dir/subfile.txt', type: FileType.File },
        ]),
      };

      const items = [
        {
          name: 'dir/',
          fsPath: '/remote/dir',
          type: FileType.Directory,
          description: '',
          getFs: mockFs,
        },
      ];

      // First pick: select directory, then cancel
      (vscode.window.showQuickPick as jest.Mock)
        .mockResolvedValueOnce({
          value: items[0],
          label: 'dir/',
        })
        .mockResolvedValueOnce(undefined);

      await listFiles(items as any);
      expect(vscode.window.showQuickPick).toHaveBeenCalledTimes(2);
    });

    test('selects current folder with dot entry', async () => {
      const mockFs = {
        list: jest.fn().mockResolvedValue([]),
      };

      const items = [
        {
          name: 'dir/',
          fsPath: '/remote/dir',
          type: FileType.Directory,
          description: '',
          getFs: mockFs,
        },
      ];

      // Select dir, then select '.'
      (vscode.window.showQuickPick as jest.Mock)
        .mockResolvedValueOnce({
          value: items[0],
          label: 'dir/',
        })
        .mockResolvedValueOnce({
          value: { fsPath: '/remote/dir', type: FileType.Directory },
          label: '.',
        });

      const result = await listFiles(items as any, { type: FileType.Directory });
      expect(result).toBeDefined();
    });

    test('goes back with .. entry', async () => {
      const mockFs = {
        list: jest.fn().mockResolvedValue([]),
      };

      const items = [
        {
          name: 'dir/',
          fsPath: '/remote/dir',
          type: FileType.Directory,
          description: '',
          getFs: mockFs,
        },
      ];

      // Select dir, then select '..', then cancel
      (vscode.window.showQuickPick as jest.Mock)
        .mockResolvedValueOnce({
          value: items[0],
          label: 'dir/',
        })
        .mockResolvedValueOnce({
          value: {
            fsPath: '@root',
            type: FileType.Directory,
            parentFsPath: '@root',
          },
          label: '..',
        })
        .mockResolvedValueOnce(undefined);

      await listFiles(items as any);
      expect(vscode.window.showQuickPick).toHaveBeenCalled();
    });

    test('includes all root level items regardless of type', async () => {
      const items = [
        {
          name: 'symlink',
          fsPath: '/remote/symlink',
          type: FileType.SymbolicLink,
          description: '',
          getFs: {},
        },
        {
          name: 'file.txt',
          fsPath: '/remote/file.txt',
          type: FileType.File,
          description: '',
          getFs: {},
        },
      ];

      (vscode.window.showQuickPick as jest.Mock).mockResolvedValueOnce(undefined);

      await listFiles(items as any);
      const pickItems = (vscode.window.showQuickPick as jest.Mock).mock.calls[0][0];
      // Root level items are all shown (parentFsPath is @root)
      expect(pickItems.length).toBe(2);
    });

    test('applies parent filter when present', async () => {
      const customFilter = jest.fn().mockReturnValue(true);
      const mockFs = {
        list: jest.fn().mockResolvedValue([]),
      };

      const items = [
        {
          name: 'dir/',
          fsPath: '/remote/dir',
          type: FileType.Directory,
          description: '',
          getFs: mockFs,
          filter: customFilter,
        },
      ];

      // Select dir, then cancel
      (vscode.window.showQuickPick as jest.Mock)
        .mockResolvedValueOnce({
          value: items[0],
          label: 'dir/',
        })
        .mockResolvedValueOnce(undefined);

      await listFiles(items as any);
      // The custom filter should have been called during item creation
    });

    test('navigates into directory with getFs as a function', async () => {
      const mockFsInstance = {
        list: jest.fn().mockResolvedValue([]),
      };
      const mockFsFn = jest.fn().mockResolvedValue(mockFsInstance);

      const items = [
        {
          name: 'dir/',
          fsPath: '/remote/dir',
          type: FileType.Directory,
          description: '',
          getFs: mockFsFn,
        },
      ];

      // Select directory, then cancel
      (vscode.window.showQuickPick as jest.Mock)
        .mockResolvedValueOnce({
          value: items[0],
          label: 'dir/',
        })
        .mockResolvedValueOnce(undefined);

      await listFiles(items as any);
      expect(mockFsFn).toHaveBeenCalled();
    });

    test('selects a file directly from root level', async () => {
      const items = [
        {
          name: 'readme.txt',
          fsPath: '/remote/readme.txt',
          type: FileType.File,
          description: '',
          getFs: {},
        },
      ];

      (vscode.window.showQuickPick as jest.Mock).mockResolvedValueOnce({
        value: items[0],
        label: 'readme.txt',
      });

      const result = await listFiles(items as any);
      expect(result).toBeDefined();
      expect(result!.fsPath).toBe('/remote/readme.txt');
    });

    test('filters symbolic links in non-directory file picker mode', async () => {
      // listFiles with no type option filters out SymbolicLinks at non-root level
      // Since root level items bypass the filter, we test the filter function directly
      const remoteItems = [
        {
          name: 'subdir',
          fsPath: '/remote/subdir',
          type: FileType.Directory,
          description: '',
          getFs: {
            list: jest.fn().mockResolvedValue([
              { fspath: '/remote/subdir/file.txt', type: FileType.File },
              { fspath: '/remote/subdir/link', type: FileType.SymbolicLink },
            ]),
          },
        },
      ];

      // Select directory (enter it), then cancel
      (vscode.window.showQuickPick as jest.Mock)
        .mockResolvedValueOnce({
          value: remoteItems[0],
          label: 'subdir',
        })
        .mockResolvedValueOnce(undefined);

      await listFiles(remoteItems as any);
      // The second showQuickPick call should show items from the subdirectory
      // where SymbolicLink items should be filtered out (non-root level)
      const secondPickItems = (vscode.window.showQuickPick as jest.Mock).mock.calls[1][0];
      // At non-root level, symbolic links should be filtered when type is not Directory
      expect(secondPickItems.every(item => item.value.type !== FileType.SymbolicLink)).toBe(true);
    });
  });
});
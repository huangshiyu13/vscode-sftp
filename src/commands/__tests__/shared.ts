class UriMock {
  scheme: string;
  fsPath: string;

  constructor(fsPath: string) {
    this.scheme = 'file';
    this.fsPath = fsPath;
  }

  static file(path: string) {
    return new UriMock(path);
  }

  toString() {
    return `file://${this.fsPath}`;
  }
}

jest.mock('vscode', () => ({
  __esModule: true,
  Uri: UriMock,
  window: {
    showQuickPick: jest.fn().mockResolvedValue(undefined),
    showOpenDialog: jest.fn(),
    showInputBox: jest.fn(),
  },
}));

jest.mock('../../host', () => ({
  __esModule: true,
  getActiveTextEditor: jest.fn().mockReturnValue(null),
  showConfirmMessage: jest.fn(),
  openFolder: jest.fn(),
  addWorkspaceFolder: jest.fn(),
  getWorkspaceFolders: jest.fn().mockReturnValue([]),
}));

jest.mock('../../modules/serviceManager', () => ({
  __esModule: true,
  getAllFileService: jest.fn().mockReturnValue([]),
}));

jest.mock('../../modules/remoteExplorer', () => ({
  __esModule: true,
  default: {},
  ExplorerItem: class ExplorerItem {},
}));

jest.mock('../../helper', () => ({
  __esModule: true,
  listFiles: jest.fn(),
  toLocalPath: jest.fn().mockImplementation((p, rb, lb) => p.replace(rb, lb)),
  simplifyPath: jest.fn().mockReturnValue('simplified'),
}));

jest.mock('../../core', () => ({
  __esModule: true,
  FileType: { File: 1, Directory: 2, SymbolicLink: 64 },
}));

import {
  uriFromfspath,
  getActiveDocumentUri,
  getActiveFolder,
  applySelector,
  selectContext,
  uriFromExplorerContextOrEditorContext,
  selectFolderFallbackToConfigContext,
  selectFileFromAll,
  selectFile,
} from '../shared';
import { getActiveTextEditor } from '../../host';
import { getAllFileService } from '../../modules/serviceManager';
import { listFiles, toLocalPath, simplifyPath } from '../../helper';
import * as vscode from 'vscode';

describe('commands/shared', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('uriFromfspath', () => {
    test('returns undefined for null input', () => {
      expect(uriFromfspath(null as any)).toBeUndefined();
    });

    test('returns undefined for non-array input', () => {
      expect(uriFromfspath('string' as any)).toBeUndefined();
    });

    test('returns undefined for empty array', () => {
      expect(uriFromfspath([] as any)).toBeUndefined();
    });

    test('returns undefined for array with non-string first element', () => {
      expect(uriFromfspath([123] as any)).toBeUndefined();
    });

    test('converts array of file paths to Uri array', () => {
      const result = uriFromfspath(['/path/to/file1.txt', '/path/to/file2.txt']);
      expect(result).toHaveLength(2);
      expect(result![0].fsPath).toBe('/path/to/file1.txt');
      expect(result![1].fsPath).toBe('/path/to/file2.txt');
    });

    test('handles single file path', () => {
      const result = uriFromfspath(['/single/file.txt']);
      expect(result).toHaveLength(1);
      expect(result![0].fsPath).toBe('/single/file.txt');
    });
  });

  describe('getActiveDocumentUri', () => {
    test('returns undefined when no active editor', () => {
      (getActiveTextEditor as jest.Mock).mockReturnValue(null);
      expect(getActiveDocumentUri()).toBeUndefined();
    });

    test('returns undefined when active editor has no document', () => {
      (getActiveTextEditor as jest.Mock).mockReturnValue({});
      expect(getActiveDocumentUri()).toBeUndefined();
    });

    test('returns uri when active editor has document', () => {
      const mockUri = { fsPath: '/active/file.txt' };
      (getActiveTextEditor as jest.Mock).mockReturnValue({
        document: { uri: mockUri },
      });
      expect(getActiveDocumentUri()).toBe(mockUri);
    });
  });

  describe('getActiveFolder', () => {
    test('returns undefined when no active document', () => {
      (getActiveTextEditor as jest.Mock).mockReturnValue(null);
      expect(getActiveFolder()).toBeUndefined();
    });

    test('returns folder URI for active document', () => {
      (getActiveTextEditor as jest.Mock).mockReturnValue({
        document: { uri: { fsPath: '/workspace/src/file.txt' } },
      });
      const result = getActiveFolder();
      expect(result).toBeDefined();
      expect(result!.fsPath).toContain('/workspace/src');
    });
  });

  describe('applySelector', () => {
    test('returns result from first selector that returns truthy', () => {
      const sel1 = jest.fn().mockReturnValue(null);
      const sel2 = jest.fn().mockReturnValue('result');
      const sel3 = jest.fn().mockReturnValue('not reached');

      const combined = applySelector(sel1, sel2, sel3);
      const result = combined('arg1', 'arg2');

      expect(result).toBe('result');
      expect(sel1).toHaveBeenCalledWith('arg1', 'arg2');
      expect(sel2).toHaveBeenCalledWith('arg1', 'arg2');
      expect(sel3).not.toHaveBeenCalled();
    });

    test('returns first selector result if truthy', () => {
      const sel1 = jest.fn().mockReturnValue('first');
      const sel2 = jest.fn().mockReturnValue('second');

      const combined = applySelector(sel1, sel2);
      expect(combined()).toBe('first');
      expect(sel2).not.toHaveBeenCalled();
    });

    test('returns last result if all return falsy', () => {
      const sel1 = jest.fn().mockReturnValue(null);
      const sel2 = jest.fn().mockReturnValue(undefined);
      const sel3 = jest.fn().mockReturnValue(false);

      const combined = applySelector(sel1, sel2, sel3);
      expect(combined()).toBe(false);
    });

    test('works with single selector', () => {
      const sel = jest.fn().mockReturnValue('only');
      const combined = applySelector(sel);
      expect(combined()).toBe('only');
    });
  });

  describe('selectContext', () => {
    test('resolves undefined when no selection made', async () => {
      (getAllFileService as jest.Mock).mockReturnValue([]);
      const result = await selectContext();
      expect(result).toBeUndefined();
    });

    test('shows quick pick with file services', async () => {
      const mockService = {
        baseDir: '/workspace',
        name: 'test-service',
        getConfig: () => ({ host: 'example.com' }),
      };
      (getAllFileService as jest.Mock).mockReturnValue([mockService]);
      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue(undefined);

      await selectContext();
      expect(vscode.window.showQuickPick).toHaveBeenCalled();
    });

    test('sorts services by label and falls back to simplified path', async () => {
      (getAllFileService as jest.Mock).mockReturnValue([
        {
          baseDir: '/workspace/zeta',
          name: '',
        },
        {
          baseDir: '/workspace/alpha',
          name: 'Alpha',
        },
      ]);
      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue(undefined);

      await selectContext();

      const items = (vscode.window.showQuickPick as jest.Mock).mock.calls[0][0];
      expect(items.map(item => item.label)).toEqual(['Alpha', 'simplified']);
      expect(simplifyPath).toHaveBeenCalledWith('/workspace/zeta');
    });

    test('resolves to Uri when selection made', async () => {
      const mockService = {
        baseDir: '/workspace',
        name: 'test-service',
      };
      (getAllFileService as jest.Mock).mockReturnValue([mockService]);
      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({
        value: '/workspace',
      });

      const result = await selectContext();
      expect(result).toBeDefined();
      expect(result!.fsPath).toBe('/workspace');
    });
  });

  describe('uriFromExplorerContextOrEditorContext', () => {
    test('returns uri values for local explorer selections', () => {
      const uri1 = UriMock.file('/workspace/a.txt');
      const uri2 = UriMock.file('/workspace/b.txt');

      expect(uriFromExplorerContextOrEditorContext(uri1 as any, undefined as any)).toBe(uri1);
      expect(uriFromExplorerContextOrEditorContext(uri1 as any, [uri1, uri2] as any)).toEqual([
        uri1,
        uri2,
      ]);
    });

    test('returns remote explorer item uris for single and multi select', () => {
      const item1 = {
        resource: {
          uri: UriMock.file('/remote/a.txt'),
        },
      };
      const item2 = {
        resource: {
          uri: UriMock.file('/remote/b.txt'),
        },
      };

      expect(uriFromExplorerContextOrEditorContext(item1 as any, undefined as any)).toBe(
        item1.resource.uri
      );
      expect(uriFromExplorerContextOrEditorContext(item1 as any, [item1, item2] as any)).toEqual([
        item1.resource.uri,
        item2.resource.uri,
      ]);
      expect(uriFromExplorerContextOrEditorContext(undefined as any, undefined as any)).toBeUndefined();
    });
  });

  describe('selectFolderFallbackToConfigContext', () => {
    test('prefers explicit explorer selections', async () => {
      const folderUri = UriMock.file('/workspace/folder');
      const remoteItem = {
        resource: {
          uri: UriMock.file('/remote/folder'),
        },
      };

      await expect(
        selectFolderFallbackToConfigContext(folderUri as any, undefined as any)
      ).resolves.toBe(folderUri);
      await expect(
        selectFolderFallbackToConfigContext(folderUri as any, [folderUri] as any)
      ).resolves.toEqual([folderUri]);
      await expect(
        selectFolderFallbackToConfigContext(remoteItem as any, undefined as any)
      ).resolves.toBe(remoteItem.resource.uri);
    });

    test('falls back to the config picker when no item is provided', async () => {
      (getAllFileService as jest.Mock).mockReturnValue([
        {
          baseDir: '/workspace/project',
          name: 'Project',
        },
      ]);
      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({
        value: '/workspace/project',
      });

      const result = await selectFolderFallbackToConfigContext(undefined as any, undefined as any);

      expect(vscode.window.showQuickPick).toHaveBeenCalled();
      expect((result as any).fsPath).toBe('/workspace/project');
    });
  });

  describe('selectFile and selectFileFromAll', () => {
    test('maps selected remote files back to local uris', async () => {
      const getRemoteFileSystem = jest.fn();
      (getAllFileService as jest.Mock).mockReturnValue([
        {
          baseDir: '/workspace/project',
          getRemoteFileSystem,
          getConfig: () => ({
            name: 'Primary',
            host: 'target.internal',
            remotePath: '/remote/project',
          }),
        },
      ]);
      (listFiles as jest.Mock).mockImplementation(async remoteItems => {
        expect(remoteItems[0]).toEqual(
          expect.objectContaining({
            name: 'Primary',
            description: 'target.internal',
            remoteBaseDir: '/remote/project',
            baseDir: '/workspace/project',
          })
        );
        return {
          index: 0,
          fsPath: '/remote/project/src/index.ts',
        };
      });
      (toLocalPath as jest.Mock).mockReturnValue('/workspace/project/src/index.ts');

      const selected = await selectFileFromAll();

      expect(listFiles).toHaveBeenCalledTimes(1);
      expect(toLocalPath).toHaveBeenCalledWith(
        '/remote/project/src/index.ts',
        '/remote/project',
        '/workspace/project'
      );
      expect((selected as any).fsPath).toBe('/workspace/project/src/index.ts');
    });

    test('applies config ignore filters when selecting remote files', async () => {
      (getAllFileService as jest.Mock).mockReturnValue([
        {
          baseDir: '/workspace/project',
          getRemoteFileSystem: jest.fn(),
          getConfig: () => ({
            name: 'Primary',
            host: 'target.internal',
            remotePath: '/remote/project',
            ignore: (fsPath: string) => fsPath.endsWith('.skip'),
          }),
        },
      ]);
      (listFiles as jest.Mock).mockImplementation(async remoteItems => {
        expect(remoteItems[0].filter({ fsPath: '/workspace/project/file.ts' })).toBe(true);
        expect(remoteItems[0].filter({ fsPath: '/workspace/project/file.skip' })).toBe(false);
        return {
          index: 0,
          fsPath: '/remote/project/file.ts',
        };
      });
      (toLocalPath as jest.Mock).mockReturnValue('/workspace/project/file.ts');

      const selected = await selectFile();

      expect((selected as any).fsPath).toBe('/workspace/project/file.ts');
    });

    test('returns undefined when file selection is cancelled', async () => {
      (getAllFileService as jest.Mock).mockReturnValue([
        {
          baseDir: '/workspace/project',
          getRemoteFileSystem: jest.fn(),
          getConfig: () => ({
            name: 'Primary',
            host: 'target.internal',
            remotePath: '/remote/project',
          }),
        },
      ]);
      (listFiles as jest.Mock).mockResolvedValue(undefined);

      await expect(selectFileFromAll()).resolves.toBeUndefined();
    });
  });
});

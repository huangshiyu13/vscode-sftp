class UriMock {
  fsPath: string;

  constructor(fsPath: string) {
    this.fsPath = fsPath;
  }

  static file(fsPath: string) {
    return new UriMock(fsPath);
  }
}

const showQuickPick = jest.fn();
const getAllFileService = jest.fn();
const getActiveTextEditor = jest.fn();
const listFiles = jest.fn();
const toLocalPath = jest.fn();
const simplifyPath = jest.fn();

jest.mock('vscode', () => ({
  Uri: UriMock,
  window: {
    showQuickPick: (...args) => showQuickPick(...args),
  },
}));

jest.mock('../../modules/serviceManager', () => ({
  __esModule: true,
  getAllFileService: (...args) => getAllFileService(...args),
}));

jest.mock('../../host', () => ({
  __esModule: true,
  getActiveTextEditor: (...args) => getActiveTextEditor(...args),
}));

jest.mock('../../helper', () => ({
  __esModule: true,
  listFiles: (...args) => listFiles(...args),
  toLocalPath: (...args) => toLocalPath(...args),
  simplifyPath: (...args) => simplifyPath(...args),
}));

jest.mock('../../core', () => ({
  __esModule: true,
  FileType: {
    Directory: 'directory',
  },
}));

jest.mock('../../modules/remoteExplorer', () => ({
  __esModule: true,
}));

import {
  selectContext,
  applySelector,
  uriFromfspath,
  getActiveDocumentUri,
  getActiveFolder,
  uriFromExplorerContextOrEditorContext,
  selectFolderFallbackToConfigContext,
  selectFileFromAll,
  selectFile,
} from '../shared';

describe('commands/shared', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    simplifyPath.mockImplementation((target: string) => `short:${target}`);
  });

  test('selectContext shows workspace choices and returns the selected folder uri', async () => {
    getAllFileService.mockReturnValue([
      {
        baseDir: '/workspace/beta',
        name: '',
      },
      {
        baseDir: '/workspace/alpha',
        name: 'Primary',
      },
    ]);

    showQuickPick.mockImplementation(async choices => {
      expect(choices.map(choice => choice.label)).toEqual([
        'Primary',
        'short:/workspace/beta',
      ]);
      return choices[1];
    });

    const selected = await selectContext();

    expect(showQuickPick).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ placeHolder: 'Select a folder...' })
    );
    expect(selected).toBeInstanceOf(UriMock);
    expect(selected!.fsPath).toBe('/workspace/beta');
  });

  test('selectContext resolves undefined when the picker is cancelled', async () => {
    getAllFileService.mockReturnValue([]);
    showQuickPick.mockResolvedValue(undefined);

    await expect(selectContext()).resolves.toBeUndefined();
  });

  test('applySelector returns the first truthy selector result', () => {
    const first = jest.fn(() => undefined);
    const second = jest.fn((value: string) => `${value}-selected`);
    const third = jest.fn(() => 'should-not-run');

    const selector = applySelector(first, second, third);

    expect(selector('file')).toBe('file-selected');
    expect(first).toHaveBeenCalledWith('file');
    expect(second).toHaveBeenCalledWith('file');
    expect(third).not.toHaveBeenCalled();
  });

  test('uriFromfspath converts string arrays and rejects invalid values', () => {
    expect(uriFromfspath(['/tmp/a.txt', '/tmp/b.txt'])!.map(uri => uri.fsPath)).toEqual([
      '/tmp/a.txt',
      '/tmp/b.txt',
    ]);
    expect(uriFromfspath(undefined as any)).toBeUndefined();
    expect(uriFromfspath([42 as any])).toBeUndefined();
  });

  test('getActiveDocumentUri and getActiveFolder fall back cleanly when no editor exists', () => {
    getActiveTextEditor.mockReturnValue({
      document: {
        uri: UriMock.file('/workspace/project/src/index.ts'),
      },
    });

    expect(getActiveDocumentUri()!.fsPath).toBe('/workspace/project/src/index.ts');
    expect(getActiveFolder()!.fsPath).toBe('/workspace/project/src');

    getActiveTextEditor.mockReturnValue(undefined);
    expect(getActiveDocumentUri()).toBeUndefined();
    expect(getActiveFolder()).toBeUndefined();
  });

  test('uriFromExplorerContextOrEditorContext supports local and remote multi-selection', () => {
    const firstUri = UriMock.file('/workspace/project/a.ts');
    const secondUri = UriMock.file('/workspace/project/b.ts');
    const remoteItem = {
      resource: {
        uri: UriMock.file('/remote/project/a.ts'),
      },
    };
    const remoteItems = [
      remoteItem,
      {
        resource: {
          uri: UriMock.file('/remote/project/b.ts'),
        },
      },
    ];

    expect(uriFromExplorerContextOrEditorContext(firstUri as any, [firstUri, secondUri] as any)).toEqual([
      firstUri,
      secondUri,
    ]);
    expect(uriFromExplorerContextOrEditorContext(remoteItem as any, remoteItems as any)).toEqual([
      remoteItems[0].resource.uri,
      remoteItems[1].resource.uri,
    ]);
    expect(uriFromExplorerContextOrEditorContext(undefined as any, undefined as any)).toBeUndefined();
  });

  test('selectFolderFallbackToConfigContext prefers explicit items and falls back to the config picker', async () => {
    const firstUri = UriMock.file('/workspace/project/folder');
    const remoteItem = {
      resource: {
        uri: UriMock.file('/remote/project/folder'),
      },
    };

    expect(await selectFolderFallbackToConfigContext(firstUri as any, undefined as any)).toBe(firstUri);
    expect(await selectFolderFallbackToConfigContext(remoteItem as any, undefined as any)).toBe(
      remoteItem.resource.uri
    );

    getAllFileService.mockReturnValue([
      {
        baseDir: '/workspace/project',
        name: 'Project',
      },
    ]);
    showQuickPick.mockResolvedValue({
      value: '/workspace/project',
      label: 'Project',
    });

    const fallback = await selectFolderFallbackToConfigContext(undefined as any, undefined as any);

    expect(showQuickPick).toHaveBeenCalled();
    expect((fallback as any).fsPath).toBe('/workspace/project');
  });

  test('selectFileFromAll lists remote files and maps the selection back to a local uri', async () => {
    const getRemoteFileSystem = jest.fn();
    getAllFileService.mockReturnValue([
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
    listFiles.mockImplementation(async remoteItems => {
      expect(remoteItems[0]).toEqual(
        expect.objectContaining({
          name: 'Primary',
          description: 'target.internal',
          remoteBaseDir: '/remote/project',
          baseDir: '/workspace/project',
        })
      );
      expect(remoteItems[0].filter).toBeUndefined();
      return {
        index: 0,
        fsPath: '/remote/project/src/index.ts',
      };
    });
    toLocalPath.mockReturnValue('/workspace/project/src/index.ts');

    const selected = await selectFileFromAll();

    expect(listFiles).toHaveBeenCalledTimes(1);
    expect(toLocalPath).toHaveBeenCalledWith(
      '/remote/project/src/index.ts',
      '/remote/project',
      '/workspace/project'
    );
    expect(selected!.fsPath).toBe('/workspace/project/src/index.ts');
  });

  test('selectFile respects per-config ignore filters', async () => {
    getAllFileService.mockReturnValue([
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
    listFiles.mockImplementation(async remoteItems => {
      expect(remoteItems[0].filter({ fsPath: '/workspace/project/file.ts' })).toBe(true);
      expect(remoteItems[0].filter({ fsPath: '/workspace/project/file.skip' })).toBe(false);
      return {
        index: 0,
        fsPath: '/remote/project/file.ts',
      };
    });
    toLocalPath.mockReturnValue('/workspace/project/file.ts');

    const selected = await selectFile();

    expect((selected as any).fsPath).toBe('/workspace/project/file.ts');
  });
});

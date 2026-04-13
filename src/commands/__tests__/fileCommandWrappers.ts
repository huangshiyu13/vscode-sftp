const showInputBox = jest.fn();
const parseUri = jest.fn((raw: string) => ({
  parsed: raw,
  toString: () => raw,
}));
const createRemoteFile = jest.fn();
const createRemoteFolder = jest.fn();
const removeRemote = jest.fn();
const download = jest.fn();
const downloadFile = jest.fn();
const downloadFolder = jest.fn();
const diff = jest.fn();
const sync2Remote = jest.fn();
const sync2Local = jest.fn();
const upload = jest.fn();
const uploadFile = jest.fn();
const uploadFolder = jest.fn();
const executeCommand = jest.fn();
const showConfirmMessage = jest.fn();
const showTextDocument = jest.fn();
const reveal = jest.fn();
const makeResource = jest.fn((uri: any) => ({ from: uri }));
const basename = jest.fn((fsPath: string) => fsPath.split('/').pop());
const uriFromExplorerContextOrEditorContext = jest.fn();
const getActiveDocumentUri = jest.fn();
const getActiveFolder = jest.fn();
const selectContext = jest.fn();
const selectFile = jest.fn();
const selectFileFromAll = jest.fn();
const uriFromfspath = jest.fn();
const selectFolderFallbackToConfigContext = jest.fn();
const applySelector = jest.fn((...selectors) => {
  const combined = jest.fn();
  (combined as any).selectors = selectors;
  return combined;
});

jest.mock('vscode', () => ({
  __esModule: true,
  window: {
    showInputBox: (...args) => showInputBox(...args),
  },
  Uri: {
    parse: (...args) => parseUri(...args),
  },
}));

jest.mock('../../fileHandlers', () => ({
  __esModule: true,
  createRemoteFile,
  createRemoteFolder,
  removeRemote,
  download,
  downloadFile,
  downloadFolder,
  diff,
  sync2Remote,
  sync2Local,
  upload,
  uploadFile,
  uploadFolder,
}));

jest.mock('../../host', () => ({
  __esModule: true,
  executeCommand,
  showConfirmMessage,
  showTextDocument,
}));

jest.mock('../../app', () => ({
  __esModule: true,
  default: {
    remoteExplorer: {
      reveal,
    },
  },
}));

jest.mock('../../core', () => ({
  __esModule: true,
  FileType: {
    File: 1,
    Directory: 2,
  },
  UResource: {
    makeResource,
  },
  upath: {
    basename,
  },
}));

jest.mock('../abstract/createCommand', () => ({
  __esModule: true,
  checkFileCommand: (option: any) => option,
}));

jest.mock('../shared', () => ({
  __esModule: true,
  uriFromExplorerContextOrEditorContext,
  getActiveDocumentUri,
  getActiveFolder,
  selectContext,
  selectFile,
  selectFileFromAll,
  uriFromfspath,
  selectFolderFallbackToConfigContext,
  applySelector,
}));

import {
  COMMAND_CREATE_FILE,
  COMMAND_CREATE_FOLDER,
  COMMAND_DELETE_REMOTE,
  COMMAND_DOWNLOAD,
  COMMAND_DOWNLOAD_ACTIVEFILE,
  COMMAND_DOWNLOAD_PROJECT,
  COMMAND_DOWNLOAD_FOLDER,
  COMMAND_DOWNLOAD_ACTIVEFOLDER,
  COMMAND_FORCE_DOWNLOAD,
  COMMAND_REMOTEEXPLORER_EDITINLOCAL,
  COMMAND_LIST,
  COMMAND_LIST_ALL,
  COMMAND_REVEAL_IN_EXPLORER,
  COMMAND_REVEAL_IN_REMOTE_EXPLORER,
  COMMAND_SYNC_BOTH_DIRECTIONS,
  COMMAND_SYNC_LOCAL_TO_REMOTE,
  COMMAND_SYNC_REMOTE_TO_LOCAL,
  COMMAND_DIFF,
  COMMAND_DIFF_ACTIVEFILE,
  COMMAND_UPLOAD,
  COMMAND_UPLOAD_ACTIVEFILE,
  COMMAND_UPLOAD_FILE,
  COMMAND_FORCE_UPLOAD,
  COMMAND_UPLOAD_ACTIVEFOLDER,
  COMMAND_UPLOAD_ACTIVEFOLDER_TO_ALL_PROFILES,
} from '../../constants';
import fileCommandCreateFile from '../fileCommandCreateFile';
import fileCommandCreateFolder from '../fileCommandCreateFolder';
import fileCommandDeleteRemote from '../fileCommandDeleteRemote';
import fileCommandDownload from '../fileCommandDownload';
import fileCommandDownloadActiveFile from '../fileCommandDownloadActiveFile';
import fileCommandDownloadFile from '../fileCommandDownloadFile';
import fileCommandDownloadForce from '../fileCommandDownloadForce';
import fileCommandDownloadProject from '../fileCommandDownloadProject';
import fileCommandEditInLocal from '../fileCommandEditInLocal';
import fileCommandList from '../fileCommandList';
import fileCommandListAll from '../fileCommandListAll';
import fileCommandRevealInExplorer from '../fileCommandRevealInExplorer';
import fileCommandRevealInRemoteExplorer from '../fileCommandRevealInRemoteExplorer';
import fileCommandSyncBothDirections from '../fileCommandSyncBothDirections';
import fileCommandDownloadFolder from '../fileCommandDownloadFolder';
import fileCommandDownloadActiveFolder from '../fileCommandDownloadActiveFolder';
import fileCommandSyncLocalToRemote from '../fileCommandSyncLocalToRemote';
import fileCommandSyncRemoteToLocal from '../fileCommandSyncRemoteToLocal';
import fileCommandDiff from '../fileCommandDiff';
import fileCommandDiffActiveFile from '../fileCommandDiffActiveFile';
import fileCommandUpload from '../fileCommandUpload';
import fileCommandUploadActiveFile from '../fileCommandUploadActiveFile';
import fileCommandUploadFile from '../fileCommandUploadFile';
import fileCommandUploadForce from '../fileCommandUploadForce';
import fileCommandUploadActiveFolder from '../fileCommandUploadActiveFolder';
import fileMultiCommandUploadActiveFolderToAllProfiles from '../fileMultiCommandUploadActiveFolderToAllProfiles';

describe('file command wrappers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('creates remote file and folder targets from prompt input', async () => {
    const target = {
      toString: () => 'sftp://root/project',
    };
    uriFromExplorerContextOrEditorContext.mockResolvedValue(target);
    showInputBox.mockResolvedValueOnce('file.txt').mockResolvedValueOnce('folder');

    expect(fileCommandCreateFile.id).toBe(COMMAND_CREATE_FILE);
    expect(fileCommandCreateFolder.id).toBe(COMMAND_CREATE_FOLDER);
    await expect(fileCommandCreateFile.getFileTarget('item', 'items')).resolves.toEqual({
      parsed: 'sftp://root/project/file.txt',
      toString: expect.any(Function),
    });
    await expect(fileCommandCreateFolder.getFileTarget('item', 'items')).resolves.toEqual({
      parsed: 'sftp://root/project/folder',
      toString: expect.any(Function),
    });
    expect(parseUri).toHaveBeenNthCalledWith(1, 'sftp://root/project/file.txt');
    expect(parseUri).toHaveBeenNthCalledWith(2, 'sftp://root/project/folder');

    uriFromExplorerContextOrEditorContext.mockResolvedValueOnce(undefined);
    await expect(fileCommandCreateFile.getFileTarget('item', 'items')).resolves.toBeUndefined();
    expect(createRemoteFile).toBe(fileCommandCreateFile.handleFile);
    expect(createRemoteFolder).toBe(fileCommandCreateFolder.handleFile);
  });

  test('confirms destructive delete commands before returning targets', async () => {
    const target = { fsPath: '/remote/path/file.txt' };
    uriFromExplorerContextOrEditorContext.mockResolvedValue(target);
    showConfirmMessage.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await expect(fileCommandDeleteRemote.getFileTarget('item', 'items')).resolves.toBe(target);
    await expect(fileCommandDeleteRemote.getFileTarget('item', 'items')).resolves.toBeUndefined();

    expect(fileCommandDeleteRemote.id).toBe(COMMAND_DELETE_REMOTE);
    expect(showConfirmMessage).toHaveBeenCalledWith(
      "Are you sure you want to delete 'file.txt'?",
      'Delete',
      'Cancel'
    );
    expect(removeRemote).toBe(fileCommandDeleteRemote.handleFile);
  });

  test('delegates download and diff wrappers to the underlying file handlers', async () => {
    const ctx = { target: { localUri: { fsPath: '/workspace/file.txt' } } };

    expect(fileCommandDownload.id).toBe(COMMAND_DOWNLOAD);
    expect(fileCommandDownloadActiveFile.id).toBe(COMMAND_DOWNLOAD_ACTIVEFILE);
    expect(fileCommandDownloadProject.id).toBe(COMMAND_DOWNLOAD_PROJECT);
    expect(fileCommandDownloadFolder.id).toBe(COMMAND_DOWNLOAD_FOLDER);
    expect(fileCommandDownloadActiveFolder.id).toBe(COMMAND_DOWNLOAD_ACTIVEFOLDER);
    expect(fileCommandDownloadForce.id).toBe(COMMAND_FORCE_DOWNLOAD);
    expect(fileCommandEditInLocal.id).toBe(COMMAND_REMOTEEXPLORER_EDITINLOCAL);
    expect(fileCommandDiff.id).toBe(COMMAND_DIFF);
    expect(fileCommandDiffActiveFile.id).toBe(COMMAND_DIFF_ACTIVEFILE);

    await fileCommandDownload.handleFile(ctx);
    await fileCommandDownloadActiveFile.handleFile(ctx);
    await fileCommandDownloadFile.handleFile(ctx);
    await fileCommandDownloadForce.handleFile(ctx);
    await fileCommandDownloadProject.handleFile(ctx);
    await fileCommandEditInLocal.handleFile(ctx);

    expect(download).toHaveBeenNthCalledWith(1, ctx, { ignore: null });
    expect(downloadFile).toHaveBeenNthCalledWith(1, ctx, { ignore: null });
    expect(downloadFile).toHaveBeenNthCalledWith(2, ctx, { ignore: null });
    expect(download).toHaveBeenNthCalledWith(2, ctx, { ignore: null });
    expect(downloadFolder).toHaveBeenCalledWith(ctx);
    expect(showTextDocument).toHaveBeenCalledWith(ctx.target.localUri, { preview: true });
    expect(fileCommandDiff.handleFile).toBe(diff);
    expect(fileCommandDiffActiveFile.handleFile).toBe(diff);
    expect(fileCommandDownloadActiveFile.getFileTarget).toBe(getActiveDocumentUri);
    expect(fileCommandDownloadProject.getFileTarget).toBe(selectContext);
    expect(fileCommandDownloadFolder.getFileTarget).toBe(uriFromExplorerContextOrEditorContext);
    expect(fileCommandDownloadActiveFolder.getFileTarget).toBe(getActiveFolder);
  });

  test('handles list, reveal, and sync wrapper commands', async () => {
    const ctx = {
      target: {
        localUri: { fsPath: '/workspace/file.txt' },
        remoteUri: { path: '/remote/file.txt' },
        remoteFsPath: '/remote/file.txt',
      },
      fileService: {
        getRemoteFileSystem: jest.fn().mockResolvedValue({
          lstat: jest.fn().mockResolvedValue({ type: 1 }),
        }),
      },
      config: {},
    };
    const dirCtx = {
      ...ctx,
      fileService: {
        getRemoteFileSystem: jest.fn().mockResolvedValue({
          lstat: jest.fn().mockResolvedValue({ type: 2 }),
        }),
      },
    };

    expect(fileCommandList.id).toBe(COMMAND_LIST);
    expect(fileCommandListAll.id).toBe(COMMAND_LIST_ALL);
    expect(fileCommandRevealInExplorer.id).toBe(COMMAND_REVEAL_IN_EXPLORER);
    expect(fileCommandRevealInRemoteExplorer.id).toBe(COMMAND_REVEAL_IN_REMOTE_EXPLORER);
    expect(fileCommandSyncBothDirections.id).toBe(COMMAND_SYNC_BOTH_DIRECTIONS);
    expect(fileCommandSyncLocalToRemote.id).toBe(COMMAND_SYNC_LOCAL_TO_REMOTE);
    expect(fileCommandSyncRemoteToLocal.id).toBe(COMMAND_SYNC_REMOTE_TO_LOCAL);
    expect(fileCommandUploadActiveFolder.id).toBe(COMMAND_UPLOAD_ACTIVEFOLDER);

    await fileCommandList.handleFile(ctx);
    await fileCommandListAll.handleFile(dirCtx);
    await fileCommandRevealInExplorer.handleFile(ctx);
    await fileCommandRevealInRemoteExplorer.handleFile(ctx);
    await fileCommandSyncBothDirections.handleFile(ctx);
    await fileCommandSyncLocalToRemote.handleFile(ctx);
    await fileCommandSyncRemoteToLocal.handleFile(ctx);

    expect(downloadFile).toHaveBeenCalledWith(ctx);
    expect(showTextDocument).toHaveBeenCalledWith(ctx.target.localUri);
    expect(downloadFolder).toHaveBeenCalledWith(dirCtx, { ignore: null });
    expect(executeCommand).toHaveBeenCalledWith('revealInExplorer', ctx.target.localUri);
    expect(reveal).toHaveBeenCalledWith({
      resource: { from: ctx.target.remoteUri },
      isDirectory: false,
    });
    expect(makeResource).toHaveBeenCalledWith(ctx.target.remoteUri);
    expect(sync2Remote).toHaveBeenNthCalledWith(1, ctx, { bothDiretions: true });
    expect(sync2Remote).toHaveBeenNthCalledWith(2, ctx);
    expect(sync2Local).toHaveBeenCalledWith(ctx);
    expect(fileCommandUploadActiveFolder.getFileTarget).toBe(getActiveFolder);
    expect(fileCommandUploadActiveFolder.handleFile).toBe(uploadFolder);
    expect((fileCommandSyncBothDirections.getFileTarget as any).selectors).toEqual([
      uriFromfspath,
      expect.any(Function),
    ]);
    expect((fileCommandSyncLocalToRemote.getFileTarget as any).selectors).toEqual([
      uriFromfspath,
      expect.any(Function),
    ]);
    expect((fileCommandSyncRemoteToLocal.getFileTarget as any).selectors).toEqual([
      uriFromfspath,
      expect.any(Function),
    ]);
  });

  test('downloads files from list-all and ignores editor open failures', async () => {
    const ctx = {
      target: {
        localUri: { fsPath: '/workspace/file.txt' },
        remoteUri: { path: '/remote/file.txt' },
        remoteFsPath: '/remote/file.txt',
      },
      fileService: {
        getRemoteFileSystem: jest.fn().mockResolvedValue({
          lstat: jest.fn().mockResolvedValue({ type: 1 }),
        }),
      },
      config: {},
    };

    showTextDocument.mockRejectedValueOnce(new Error('editor closed'));

    await expect(fileCommandListAll.handleFile(ctx)).resolves.toBeUndefined();

    expect(downloadFile).toHaveBeenCalledWith(ctx, { ignore: null });
    expect(showTextDocument).toHaveBeenCalledWith(ctx.target.localUri);
  });

  test('delegates upload wrappers to the expected file handlers', async () => {
    const ctx = { target: { localUri: { fsPath: '/workspace/file.txt' } } };

    expect(fileCommandUpload.id).toBe(COMMAND_UPLOAD);
    expect(fileCommandUploadActiveFile.id).toBe(COMMAND_UPLOAD_ACTIVEFILE);
    expect(fileCommandUploadFile.id).toBe(COMMAND_UPLOAD_FILE);
    expect(fileCommandUploadForce.id).toBe(COMMAND_FORCE_UPLOAD);
    expect(fileCommandUploadActiveFolder.id).toBe(COMMAND_UPLOAD_ACTIVEFOLDER);
    expect(fileMultiCommandUploadActiveFolderToAllProfiles.id).toBe(
      COMMAND_UPLOAD_ACTIVEFOLDER_TO_ALL_PROFILES
    );

    await fileCommandUpload.handleFile(ctx);
    await fileCommandUploadActiveFile.handleFile(ctx);
    await fileCommandUploadFile.handleFile(ctx);
    await fileCommandUploadForce.handleFile(ctx);

    expect(upload).toHaveBeenNthCalledWith(1, ctx, { ignore: null });
    expect(uploadFile).toHaveBeenNthCalledWith(1, ctx, { ignore: null });
    expect(uploadFile).toHaveBeenNthCalledWith(2, ctx, { ignore: null });
    expect(upload).toHaveBeenNthCalledWith(2, ctx, { ignore: null });
    expect(fileCommandUpload.getFileTarget).toBe(uriFromfspath);
    expect(fileCommandUploadActiveFile.getFileTarget).toBe(getActiveDocumentUri);
    expect(fileCommandUploadFile.getFileTarget).toBe(uriFromExplorerContextOrEditorContext);
    expect(fileCommandUploadForce.getFileTarget).toBe(uriFromExplorerContextOrEditorContext);
    expect(fileMultiCommandUploadActiveFolderToAllProfiles.handleFile).toBe(
      fileCommandUploadActiveFolder.handleFile
    );
    expect(fileMultiCommandUploadActiveFolderToAllProfiles.getFileTarget).toBe(
      fileCommandUploadActiveFolder.getFileTarget
    );
  });
});

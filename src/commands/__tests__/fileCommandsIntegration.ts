// Integration tests for fileCommand modules that cover the real export default lines
// These tests DON'T mock checkFileCommand, so the real module-level code executes

jest.mock('vscode', () => ({
  __esModule: true,
  window: {
    showInputBox: jest.fn(),
    showInformationMessage: jest.fn().mockResolvedValue(undefined),
  },
  Uri: {
    file: (p: string) => ({ scheme: 'file', fsPath: p }),
    parse: (s: string) => ({ parsed: s, toString: () => s }),
  },
}));

jest.mock('../../logger', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    trace: jest.fn(),
    critical: jest.fn(),
    log: jest.fn(),
  },
}));

jest.mock('../../helper', () => ({
  __esModule: true,
  reportError: jest.fn(),
}));

const downloadMock = jest.fn().mockResolvedValue(undefined);
const downloadFileMock = jest.fn().mockResolvedValue(undefined);
const downloadFolderMock = jest.fn().mockResolvedValue(undefined);
const uploadMock = jest.fn().mockResolvedValue(undefined);
const uploadFileMock = jest.fn().mockResolvedValue(undefined);
const sync2RemoteMock = jest.fn().mockResolvedValue(undefined);
const sync2LocalMock = jest.fn().mockResolvedValue(undefined);
const removeRemoteMock = jest.fn().mockResolvedValue(undefined);
const createRemoteFileMock = jest.fn().mockResolvedValue(undefined);
const createRemoteFolderMock = jest.fn().mockResolvedValue(undefined);
const diffMock = jest.fn().mockResolvedValue(undefined);
const handleCtxFromUriMock = jest.fn().mockReturnValue({});
const allHandleCtxFromUriMock = jest.fn().mockReturnValue([]);

jest.mock('../../fileHandlers', () => ({
  __esModule: true,
  download: downloadMock,
  downloadFile: downloadFileMock,
  downloadFolder: downloadFolderMock,
  upload: uploadMock,
  uploadFile: uploadFileMock,
  removeRemote: removeRemoteMock,
  createRemoteFile: createRemoteFileMock,
  createRemoteFolder: createRemoteFolderMock,
  diff: diffMock,
  handleCtxFromUri: handleCtxFromUriMock,
  allHandleCtxFromUri: allHandleCtxFromUriMock,
  sync2Remote: sync2RemoteMock,
  sync2Local: sync2LocalMock,
}));

jest.mock('../../host', () => ({
  __esModule: true,
  showConfirmMessage: jest.fn().mockResolvedValue(true),
  showTextDocument: jest.fn().mockResolvedValue(undefined),
  executeCommand: jest.fn().mockResolvedValue(undefined),
  getActiveTextEditor: jest.fn().mockReturnValue(null),
  getOpenTextDocuments: jest.fn().mockReturnValue([]),
}));

jest.mock('../../core', () => ({
  __esModule: true,
  UResource: {
    makeResource: jest.fn().mockReturnValue({}),
  },
  upath: {
    basename: jest.fn((p: string) => p.split('/').pop()),
  },
  FileType: { File: 1, Directory: 2, SymbolicLink: 64 },
}));

jest.mock('../../app', () => ({
  __esModule: true,
  default: {
    remoteExplorer: { reveal: jest.fn() },
    sftpBarItem: { showMsg: jest.fn(), reset: jest.fn() },
  },
}));

// Import command modules - real checkFileCommand runs, covering export default lines
import fileCommandDownload from '../fileCommandDownload';
import fileCommandDownloadActiveFile from '../fileCommandDownloadActiveFile';
import fileCommandDownloadFile from '../fileCommandDownloadFile';
import fileCommandDownloadForce from '../fileCommandDownloadForce';
import fileCommandDownloadProject from '../fileCommandDownloadProject';
import fileCommandUpload from '../fileCommandUpload';
import fileCommandUploadActiveFile from '../fileCommandUploadActiveFile';
import fileCommandUploadFile from '../fileCommandUploadFile';
import fileCommandUploadForce from '../fileCommandUploadForce';
import fileCommandEditInLocal from '../fileCommandEditInLocal';
import fileCommandRevealInExplorer from '../fileCommandRevealInExplorer';
import fileCommandRevealInRemoteExplorer from '../fileCommandRevealInRemoteExplorer';

describe('fileCommands - integration tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('fileCommandDownload has id and calls download in handleFile', async () => {
    expect(fileCommandDownload.id).toBe('sftp.download');
    const ctx = { target: { localUri: { fsPath: '/test' } } };
    await fileCommandDownload.handleFile(ctx);
    expect(downloadMock).toHaveBeenCalledWith(ctx, { ignore: null });
  });

  test('fileCommandDownloadActiveFile has correct id', () => {
    expect(fileCommandDownloadActiveFile.id).toBe('sftp.download.activeFile');
  });

  test('fileCommandDownloadFile has correct id', () => {
    expect(fileCommandDownloadFile.id).toBe('sftp.download.file');
  });

  test('fileCommandDownloadForce has correct id', () => {
    expect(fileCommandDownloadForce.id).toBe('sftp.forceDownload');
  });

  test('fileCommandDownloadProject has correct id', () => {
    expect(fileCommandDownloadProject.id).toBe('sftp.download.project');
  });

  test('fileCommandUpload has id and calls upload in handleFile', async () => {
    expect(fileCommandUpload.id).toBe('sftp.upload');
    const ctx = { target: { localUri: { fsPath: '/test' } } };
    await fileCommandUpload.handleFile(ctx);
    expect(uploadMock).toHaveBeenCalledWith(ctx, { ignore: null });
  });

  test('fileCommandUploadActiveFile has correct id', () => {
    expect(fileCommandUploadActiveFile.id).toBe('sftp.upload.activeFile');
  });

  test('fileCommandUploadFile has correct id', () => {
    expect(fileCommandUploadFile.id).toBe('sftp.upload.file');
  });

  test('fileCommandUploadForce has correct id', () => {
    expect(fileCommandUploadForce.id).toBe('sftp.forceUpload');
  });

  test('fileCommandEditInLocal calls downloadFile then showTextDocument', async () => {
    expect(fileCommandEditInLocal.id).toBe('sftp.remoteExplorer.editInLocal');
    const ctx = { target: { localUri: { fsPath: '/local/file.txt' } } };
    await fileCommandEditInLocal.handleFile(ctx);
    expect(downloadFileMock).toHaveBeenCalledWith(ctx, { ignore: null });
    const { showTextDocument } = require('../../host');
    expect(showTextDocument).toHaveBeenCalledWith(ctx.target.localUri, { preview: true });
  });

  test('fileCommandRevealInExplorer calls executeCommand', async () => {
    expect(fileCommandRevealInExplorer.id).toBe('sftp.revealInExplorer');
    const ctx = { target: { localUri: { fsPath: '/local/file.txt' } } };
    await fileCommandRevealInExplorer.handleFile(ctx);
    const { executeCommand } = require('../../host');
    expect(executeCommand).toHaveBeenCalledWith('revealInExplorer', ctx.target.localUri);
  });

  test('fileCommandRevealInRemoteExplorer calls reveal', async () => {
    expect(fileCommandRevealInRemoteExplorer.id).toBe('sftp.revealInRemoteExplorer');
    const ctx = { target: { remoteUri: { fsPath: '/remote/file.txt' } } };
    await fileCommandRevealInRemoteExplorer.handleFile(ctx);
    const { UResource } = require('../../core');
    const app = require('../../app').default;
    expect(UResource.makeResource).toHaveBeenCalledWith(ctx.target.remoteUri);
    expect(app.remoteExplorer.reveal).toHaveBeenCalled();
  });
});

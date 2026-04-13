import * as fileHandlers from '../index';
import * as transfer from '../transfer';
import * as remove from '../remove';
import * as diff from '../diff';
import * as rename from '../rename';
import * as create from '../create';
import {
  handleCtxFromUri,
  allHandleCtxFromUri,
} from '../createFileHandler';

describe('fileHandlers/index', () => {
  test('re-exports file handler modules and createFileHandler helpers', () => {
    expect(fileHandlers.upload).toBe(transfer.upload);
    expect(fileHandlers.uploadFile).toBe(transfer.uploadFile);
    expect(fileHandlers.uploadFolder).toBe(transfer.uploadFolder);
    expect(fileHandlers.download).toBe(transfer.download);
    expect(fileHandlers.downloadFile).toBe(transfer.downloadFile);
    expect(fileHandlers.downloadFolder).toBe(transfer.downloadFolder);
    expect(fileHandlers.sync2Remote).toBe(transfer.sync2Remote);
    expect(fileHandlers.sync2Local).toBe(transfer.sync2Local);
    expect(fileHandlers.removeRemote).toBe(remove.removeRemote);
    expect(fileHandlers.diff).toBe(diff.diff);
    expect(fileHandlers.renameRemote).toBe(rename.renameRemote);
    expect(fileHandlers.createRemoteFile).toBe(create.createRemoteFile);
    expect(fileHandlers.createRemoteFolder).toBe(create.createRemoteFolder);
    expect(fileHandlers.handleCtxFromUri).toBe(handleCtxFromUri);
    expect(fileHandlers.allHandleCtxFromUri).toBe(allHandleCtxFromUri);
  });
});

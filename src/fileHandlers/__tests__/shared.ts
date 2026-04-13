const refreshMock = jest.fn();

jest.mock('../../app', () => ({
  __esModule: true,
  default: {
    remoteExplorer: {
      refresh: refreshMock,
    },
  },
}));

jest.mock('../../core', () => ({
  __esModule: true,
  UResource: {
    makeResource: jest.fn().mockReturnValue('mock-resource'),
  },
  FileService: class FileService {},
  FileType: {
    Directory: 1,
    File: 2,
    SymbolicLink: 3,
    Unknown: 4,
  },
}));

import { refreshRemoteExplorer } from '../shared';
import { UResource, FileType } from '../../core';

describe('fileHandlers/shared', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('refreshRemoteExplorer with boolean isDirectory=true', () => {
    const target = {
      localFsPath: '/local/file.txt',
      remoteUri: 'remote-uri',
    };

    refreshRemoteExplorer(target, true);

    expect(UResource.makeResource).toHaveBeenCalledWith(target.remoteUri);
    expect(refreshMock).toHaveBeenCalledWith({
      resource: 'mock-resource',
      isDirectory: true,
    });
  });

  test('refreshRemoteExplorer with boolean isDirectory=false', () => {
    const target = {
      localFsPath: '/local/file.txt',
      remoteUri: 'remote-uri',
    };

    refreshRemoteExplorer(target, false);

    expect(refreshMock).toHaveBeenCalledWith({
      resource: 'mock-resource',
      isDirectory: false,
    });
  });

  test('refreshRemoteExplorer with FileService and directory type', async () => {
    const lstatMock = jest.fn().mockResolvedValue({ type: FileType.Directory });
    const localFsMock = { lstat: lstatMock };
    const FileService = require('../../core').FileService;
    const fileService = new FileService();
    fileService.getLocalFileSystem = jest.fn().mockReturnValue(localFsMock);

    const target = {
      localFsPath: '/local/dir',
      remoteUri: 'remote-uri',
    };

    await refreshRemoteExplorer(target, fileService);

    expect(fileService.getLocalFileSystem).toHaveBeenCalled();
    expect(lstatMock).toHaveBeenCalledWith('/local/dir');
    expect(refreshMock).toHaveBeenCalledWith({
      resource: 'mock-resource',
      isDirectory: true,
    });
  });

  test('refreshRemoteExplorer with FileService and file type', async () => {
    const lstatMock = jest.fn().mockResolvedValue({ type: FileType.File });
    const localFsMock = { lstat: lstatMock };
    const FileService = require('../../core').FileService;
    const fileService = new FileService();
    fileService.getLocalFileSystem = jest.fn().mockReturnValue(localFsMock);

    const target = {
      localFsPath: '/local/file.txt',
      remoteUri: 'remote-uri',
    };

    await refreshRemoteExplorer(target, fileService);

    expect(refreshMock).toHaveBeenCalledWith({
      resource: 'mock-resource',
      isDirectory: false,
    });
  });
});
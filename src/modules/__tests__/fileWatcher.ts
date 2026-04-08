const createFileSystemWatcher = jest.fn();
const relativePattern = jest.fn((base, pattern) => ({ base, pattern }));
const info = jest.fn();
const error = jest.fn();
const isValidFile = jest.fn();
const fileDepth = jest.fn();
const upload = jest.fn();
const removeRemote = jest.fn();
const getRunningTransformTasks = jest.fn();
const updateStatus = jest.fn();
const RELATIVE_PATTERN_MOCK: any = class RelativePattern {
  constructor(base, pattern) {
    return relativePattern(base, pattern);
  }
};

jest.mock('lodash.debounce', () => {
  return (fn: any) => {
    let scheduled = false;
    const debounced: any = () => {
      if (scheduled) {
        return;
      }
      scheduled = true;
      Promise.resolve().then(() => {
        scheduled = false;
        return fn();
      });
    };
    debounced.cancel = jest.fn();
    debounced.flush = jest.fn(() => fn());
    return debounced;
  };
});

jest.mock('vscode', () => ({
  workspace: {
    createFileSystemWatcher: (...args) => createFileSystemWatcher(...args),
  },
  RelativePattern: RELATIVE_PATTERN_MOCK,
}));

jest.mock('../../logger', () => ({
  __esModule: true,
  default: {
    info: (...args) => info(...args),
    error: (...args) => error(...args),
  },
}));

jest.mock('../../helper', () => ({
  __esModule: true,
  isValidFile: (...args) => isValidFile(...args),
  fileDepth: (...args) => fileDepth(...args),
}));

jest.mock('../../fileHandlers', () => ({
  __esModule: true,
  upload: (...args) => upload(...args),
  removeRemote: (...args) => removeRemote(...args),
}));

jest.mock('../../app', () => ({
  __esModule: true,
  default: {
    sftpBarItem: {
      updateStatus: (...args) => updateStatus(...args),
    },
  },
}));

jest.mock('../../ui/statusBarItem', () => ({
  __esModule: true,
  default: {
    Status: {
      error: 'error',
    },
  },
}));

jest.mock('../serviceManager', () => ({
  __esModule: true,
  getRunningTransformTasks: (...args) => getRunningTransformTasks(...args),
}));

import watcherService from '../fileWatcher';
import { TransferDirection } from '../../core';

describe('modules/fileWatcher', () => {
  const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise(resolve => setImmediate(resolve));
    await Promise.resolve();
  };

  const makeWatcher = () => {
    const handlers: any = {};
    const watcher = {
      dispose: jest.fn(),
      onDidCreate: jest.fn(listener => {
        handlers.create = listener;
      }),
      onDidChange: jest.fn(listener => {
        handlers.change = listener;
      }),
      onDidDelete: jest.fn(listener => {
        handlers.delete = listener;
      }),
    };
    createFileSystemWatcher.mockReturnValueOnce(watcher);
    return { watcher, handlers };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    isValidFile.mockReturnValue(true);
    fileDepth.mockImplementation((target: string) => target.split('/').length);
    getRunningTransformTasks.mockReturnValue([]);
  });

  afterEach(() => {
    watcherService.dispose('/workspace/project');
    watcherService.dispose('/workspace/delete-project');
  });

  test('creates upload and delete watchers, batches events, and skips files being downloaded', async () => {
    const { watcher, handlers } = makeWatcher();
    const deepUri = { fsPath: '/workspace/project/src/deep/file.ts' };
    const blockedUri = { fsPath: '/workspace/project/src/skip.ts' };

    watcherService.create('/workspace/project', {
      files: '**/*',
      autoUpload: true,
      autoDelete: true,
    });

    expect(relativePattern).toHaveBeenCalledWith('/workspace/project', '**/*');
    expect(createFileSystemWatcher).toHaveBeenCalledWith(
      { base: '/workspace/project', pattern: '**/*' },
      false,
      false,
      false
    );
    expect(watcher.onDidCreate).toHaveBeenCalled();
    expect(watcher.onDidChange).toHaveBeenCalled();
    expect(watcher.onDidDelete).toHaveBeenCalled();

    getRunningTransformTasks.mockReturnValue([
      {
        transferType: TransferDirection.REMOTE_TO_LOCAL,
        localFsPath: blockedUri.fsPath,
      },
    ]);

    handlers.change(blockedUri);
    handlers.create(deepUri);
    await flush();

    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledWith(deepUri);
    expect(upload.mock.calls[0][0].fsPath).toBe('/workspace/project/src/deep/file.ts');
    expect(info).toHaveBeenCalledWith('[watcher/updated] /workspace/project/src/deep/file.ts');
  });

  test('recreating a watcher disposes the previous one and invalid files are ignored', async () => {
    const first = makeWatcher();
    const second = makeWatcher();

    watcherService.create('/workspace/project', {
      files: '**/*',
      autoUpload: true,
      autoDelete: false,
    });
    watcherService.create('/workspace/project', {
      files: '**/*',
      autoUpload: true,
      autoDelete: false,
    });

    expect(first.watcher.dispose).toHaveBeenCalledTimes(1);

    isValidFile.mockReturnValue(false);
    second.handlers.change({ fsPath: '/workspace/project/ignored.ts' });
    await flush();

    expect(upload).not.toHaveBeenCalled();
  });

  test('upload and delete failures update the status bar with an error state', async () => {
    const uploadWatcher = makeWatcher();
    const deleteWatcher = makeWatcher();
    const uploadUri = { fsPath: '/workspace/project/file.ts' };
    const deleteUri = { fsPath: '/workspace/delete-project/file.ts' };
    const uploadError = new Error('upload failed');
    const deleteError = new Error('delete failed');

    upload.mockRejectedValue(uploadError);
    removeRemote.mockRejectedValue(deleteError);

    watcherService.create('/workspace/project', {
      files: '**/*',
      autoUpload: true,
      autoDelete: false,
    });
    watcherService.create('/workspace/delete-project', {
      files: '**/*',
      autoUpload: false,
      autoDelete: true,
    });

    uploadWatcher.handlers.create(uploadUri);
    deleteWatcher.handlers.delete(deleteUri);
    await flush();

    expect(error).toHaveBeenCalledWith(uploadError, 'upload /workspace/project/file.ts');
    expect(error).toHaveBeenCalledWith(deleteError, 'remove /workspace/delete-project/file.ts');
    expect(updateStatus).toHaveBeenCalledTimes(2);
    expect(updateStatus).toHaveBeenNthCalledWith(1, 'error');
    expect(updateStatus).toHaveBeenNthCalledWith(2, 'error');
  });

  test('does not create a watcher when config is disabled and dispose is safe for unknown watchers', () => {
    watcherService.create('/workspace/project', {
      files: false,
      autoUpload: true,
      autoDelete: true,
    });
    watcherService.create('/workspace/project', {
      files: '**/*',
      autoUpload: false,
      autoDelete: false,
    });
    watcherService.create('/workspace/project', undefined as any);
    watcherService.dispose('/workspace/project');

    expect(createFileSystemWatcher).not.toHaveBeenCalled();
  });
});

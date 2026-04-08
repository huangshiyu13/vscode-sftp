const pathRelativeToWorkspace: any = jest.fn();
const getWorkspaceFolders: any = jest.fn();

jest.mock('../../host', () => ({
  __esModule: true,
  pathRelativeToWorkspace,
  getWorkspaceFolders,
}));

jest.mock('../../core', () => ({
  __esModule: true,
  upath: require('../../core/upath').default,
}));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  simplifyPath,
  toRemotePath,
  toLocalPath,
  isSubpathOf,
  replaceHomePath,
  resolvePath,
  isInWorkspace,
} from '../paths';

describe('helper/paths', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(fs.realpathSync, 'native').mockImplementation((target: any) => target);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('simplifyPath delegates to the workspace helper', () => {
    pathRelativeToWorkspace.mockReturnValue('src/index.ts');

    expect(simplifyPath('/workspace/project/src/index.ts')).toBe('src/index.ts');
    expect(pathRelativeToWorkspace).toHaveBeenCalledWith('/workspace/project/src/index.ts');
  });

  test('converts between local and remote paths', () => {
    expect(
      toRemotePath('/workspace/project/src/index.ts', '/workspace/project', '/remote/app')
    ).toBe('/remote/app/src/index.ts');
    expect(
      toLocalPath('/remote/app/src/index.ts', '/remote/app', '/workspace/project')
    ).toBe(path.join('/workspace/project', 'src/index.ts'));
  });

  test('checks subpaths after normalization', () => {
    expect(isSubpathOf('/workspace/project', '/workspace/project/src/index.ts')).toBe(true);
    expect(isSubpathOf('/workspace/project', '/workspace/other/index.ts')).toBe(false);
  });

  test('replaces the home shortcut and resolves relative paths', () => {
    expect(replaceHomePath('~/keys/id_ed25519')).toBe(
      path.join(os.homedir(), 'keys/id_ed25519')
    );
    expect(replaceHomePath('/tmp/value')).toBe('/tmp/value');
    expect(resolvePath('/workspace/project', './src/index.ts')).toBe(
      path.resolve('/workspace/project', './src/index.ts')
    );
  });

  test('matches workspace paths case-insensitively', () => {
    getWorkspaceFolders.mockReturnValue([
      {
        uri: {
          fsPath: '/Workspace/Project',
        },
      },
    ]);

    expect(isInWorkspace('/workspace/project/src/index.ts')).toBe(true);
    expect(isInWorkspace('/workspace/other/src/index.ts')).toBe(false);
  });
});

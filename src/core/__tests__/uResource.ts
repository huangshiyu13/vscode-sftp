// Create a proper Uri class that supports instanceof
class MockUri {
  scheme: string;
  fsPath: string;
  authority: string;
  query: string;
  path: string;

  constructor(scheme: string, fsPath: string, authority: string, query: string, path: string) {
    this.scheme = scheme;
    this.fsPath = fsPath;
    this.authority = authority;
    this.query = query;
    this.path = path;
  }

  toString() {
    return `${this.scheme}://${this.authority}${this.path}${this.query ? '?' + this.query : ''}`;
  }

  static file(path: string) {
    return new MockUri('file', path, '', '', path);
  }

  static parse(str: string) {
    const match = str.match(/^(\w+):\/\/([^/]*)(\/[^?]*)\??(.*)$/);
    if (!match) {
      return new MockUri('file', str, '', '', str);
    }
    const [, scheme, authority, pathPart, queryPart] = match;
    let decodedQuery = queryPart;
    try {
      decodedQuery = decodeURIComponent(queryPart);
    } catch (e) {
      // keep original
    }
    let fsPath;
    if (scheme !== 'file' && decodedQuery) {
      const params = new URLSearchParams(decodedQuery);
      fsPath = params.get('fsPath') || '';
    }
    return new MockUri(
      scheme,
      scheme === 'file' ? pathPart : (fsPath || pathPart),
      authority,
      decodedQuery,
      pathPart,
    );
  }
}

jest.mock('vscode', () => ({
  __esModule: true,
  Uri: MockUri,
}));

jest.mock('querystring', () => ({
  __esModule: true,
  stringify: (obj: any) => {
    return Object.entries(obj)
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
  },
  parse: (str: string) => {
    const result: any = {};
    if (!str) return result;
    str.split('&').forEach(pair => {
      const [key, value] = pair.split('=');
      result[key] = value;
    });
    return result;
  },
}));

jest.mock('../../constants', () => ({
  __esModule: true,
  REMOTE_SCHEME: 'remote',
}));

jest.mock('../../helper', () => ({
  __esModule: true,
  toLocalPath: jest.fn().mockImplementation((remotePath: string, remoteBase: string, localBase: string) => {
    return remotePath.replace(remoteBase, localBase);
  }),
  toRemotePath: jest.fn().mockImplementation((localPath: string, localBase: string, remoteBase: string) => {
    return localPath.replace(localBase, remoteBase);
  }),
}));

import UResource from '../uResource';

describe('core/uResource', () => {
  describe('UResource.isRemote', () => {
    test('returns true for remote scheme URI', () => {
      const uri = { scheme: 'remote', fsPath: '/path', authority: '', query: '' };
      expect(UResource.isRemote(uri as any)).toBe(true);
    });

    test('returns false for file scheme URI', () => {
      const uri = { scheme: 'file', fsPath: '/path', authority: '', query: '' };
      expect(UResource.isRemote(uri as any)).toBe(false);
    });

    test('returns false for other scheme URI', () => {
      const uri = { scheme: 'http', fsPath: '/path', authority: '', query: '' };
      expect(UResource.isRemote(uri as any)).toBe(false);
    });
  });

  describe('UResource.makeResource', () => {
    test('creates resource from a file URI', () => {
      const uri = { scheme: 'file', fsPath: '/local/path/file.txt', authority: '', query: '' };
      const resource = UResource.makeResource(uri as any);

      expect(resource.fsPath).toBe('/local/path/file.txt');
      expect(resource.uri.fsPath).toBe('/local/path/file.txt');
      expect(resource.uri.scheme).toBe('file');
    });

    test('creates resource from config with remote info', () => {
      const config = {
        remote: { host: 'example.com', port: 22 },
        remoteId: 1,
        fsPath: '/remote/path/file.txt',
      };
      const resource = UResource.makeResource(config as any);

      expect(resource.fsPath).toBe('/remote/path/file.txt');
      expect(resource.remoteId).toBe(1);
    });

    test('creates resource from config without remote', () => {
      const config = {
        fsPath: '/local/path/file.txt',
        remote: undefined,
      };
      const resource = UResource.makeResource(config as any);

      expect(resource.fsPath).toBe('/local/path/file.txt');
    });

    test('creates resource from config with remote but no port', () => {
      const config = {
        remote: { host: 'example.com', port: 0 },
        remoteId: 2,
        fsPath: '/remote/file.txt',
      };
      const resource = UResource.makeResource(config as any);

      expect(resource.fsPath).toBe('/remote/file.txt');
      expect(resource.remoteId).toBe(2);
    });
  });

  describe('UResource.updateResource', () => {
    test('updates the remote path of a resource', () => {
      const config = {
        remote: { host: 'example.com', port: 22 },
        remoteId: 1,
        fsPath: '/remote/old.txt',
      };
      const resource = UResource.makeResource(config as any);

      const updated = UResource.updateResource(resource, { remotePath: '/remote/new.txt' });

      expect(updated.fsPath).toBe('/remote/new.txt');
    });
  });

  describe('UResource.from', () => {
    test('creates UResource from local URI with ResourceConfig', () => {
      const uri = { scheme: 'file', fsPath: '/workspace/src/file.txt', authority: '', query: '' };
      const root = {
        localBasePath: '/workspace',
        remoteBasePath: '/var/www',
        remote: { host: 'example.com', port: 22 },
        remoteId: 1,
      };

      const uresource = UResource.from(uri as any, root as any);

      expect(uresource.localFsPath).toBe('/workspace/src/file.txt');
      expect(uresource.remoteFsPath).toBe('/var/www/src/file.txt');
    });

    test('creates UResource from remote URI with ResourceConfig', () => {
      const remoteUri = {
        scheme: 'remote',
        fsPath: '/var/www/src/file.txt',
        authority: 'example.com:22',
        query: 'remoteId=1&fsPath=/var/www/src/file.txt',
        path: '/var%2Fwww%2Fsrc%2Ffile.txt',
        toString: () => 'remote://example.com:22/var%2Fwww%2Fsrc%2Ffile.txt?remoteId=1&fsPath=/var/www/src/file.txt',
      };
      const root = {
        localBasePath: '/workspace',
        remoteBasePath: '/var/www',
        remote: { host: 'example.com', port: 22 },
        remoteId: 1,
      };

      const uresource = UResource.from(remoteUri as any, root as any);

      expect(uresource.localFsPath).toContain('src/file.txt');
      expect(uresource.remoteFsPath).toContain('src/file.txt');
    });

    test('creates UResource from local URI with Resource root', () => {
      const uri = { scheme: 'file', fsPath: '/workspace/file.txt', authority: '', query: '' };
      const rootResource = UResource.makeResource({
        remote: { host: 'example.com', port: 22 },
        remoteId: 1,
        fsPath: '/remote/file.txt',
      });

      const uresource = UResource.from(uri as any, rootResource as any);

      expect(uresource.localFsPath).toBe('/workspace/file.txt');
    });
  });

  describe('Resource properties', () => {
    test('local resource has correct fsPath', () => {
      const uri = { scheme: 'file', fsPath: '/local/file.txt', authority: '', query: '' };
      const resource = UResource.makeResource(uri as any);

      expect(resource.fsPath).toBe('/local/file.txt');
      expect(resource.uri.fsPath).toBe('/local/file.txt');
    });

    test('remote resource has remoteId', () => {
      const config = {
        remote: { host: 'example.com', port: 22 },
        remoteId: 42,
        fsPath: '/remote/file.txt',
      };
      const resource = UResource.makeResource(config as any);

      expect(resource.remoteId).toBe(42);
    });

    test('UResource has localUri and remoteUri', () => {
      const uri = { scheme: 'file', fsPath: '/workspace/file.txt', authority: '', query: '' };
      const root = {
        localBasePath: '/workspace',
        remoteBasePath: '/var/www',
        remote: { host: 'example.com', port: 22 },
        remoteId: 1,
      };

      const uresource = UResource.from(uri as any, root as any);

      expect(uresource.localUri).toBeDefined();
      expect(uresource.remoteUri).toBeDefined();
    });
  });
});
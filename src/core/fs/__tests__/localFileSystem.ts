import * as fs from 'fs';
import * as fse from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { Readable } from 'stream';
import LocalFileSystem from '../localFileSystem';
import { FileType } from '../fileSystem';

function readStream(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', chunk => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    stream.on('error', reject);
    stream.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
  });
}

function createReadable(content: string): Readable {
  let emitted = false;
  return new Readable({
    read() {
      if (emitted) {
        this.push(null);
        return;
      }

      emitted = true;
      this.push(content);
    },
  });
}

describe('core/fs/localFileSystem', () => {
  let tempDir: string;
  let fileSystem: LocalFileSystem;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'local-fs-'));
    fileSystem = new LocalFileSystem(path);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fse.removeSync(tempDir);
  });

  test('reads file stats, file contents, streams, and file descriptor metadata', async () => {
    const filePath = path.join(tempDir, 'input.txt');
    const dirPath = path.join(tempDir, 'folder');
    const linkPath = path.join(tempDir, 'input-link');

    fs.writeFileSync(filePath, 'hello world');
    fs.mkdirSync(dirPath);
    fs.symlinkSync(filePath, linkPath);

    await expect(fileSystem.readFile(filePath, 'utf8')).resolves.toBe('hello world');
    await expect(fileSystem.readFile(filePath)).resolves.toEqual(Buffer.from('hello world'));

    await expect(fileSystem.lstat(filePath)).resolves.toEqual(
      expect.objectContaining({
        type: FileType.File,
        size: 11,
      })
    );
    await expect(fileSystem.lstat(dirPath)).resolves.toEqual(
      expect.objectContaining({
        type: FileType.Directory,
      })
    );
    await expect(fileSystem.lstat(linkPath)).resolves.toEqual(
      expect.objectContaining({
        type: FileType.SymbolicLink,
      })
    );

    const fd = await fileSystem.open(filePath, 'r');
    await expect(fileSystem.fstat(fd)).resolves.toEqual(
      expect.objectContaining({
        size: 11,
        type: FileType.File,
      })
    );
    await expect(fileSystem.futimes(fd, 11, 22)).resolves.toBeUndefined();
    await expect(fileSystem.close(fd)).resolves.toBeUndefined();

    await expect(fileSystem.readlink(linkPath)).resolves.toBe(filePath);

    const stream = await fileSystem.get(filePath);
    await expect(readStream(stream)).resolves.toEqual(Buffer.from('hello world'));

    await fileSystem.chmod(filePath, 0o640);
    // tslint:disable-next-line:no-bitwise
    expect(fs.statSync(filePath).mode & 0o777).toBe(0o640);
  });

  test('writes, renames, lists, and removes files and directories', async () => {
    const nestedDir = path.join(tempDir, 'deep', 'nested');
    const createdDir = path.join(tempDir, 'created');
    const recursiveDir = path.join(tempDir, 'recursive');

    await expect(fileSystem.ensureDir(nestedDir)).resolves.toBeDefined();
    expect(fs.existsSync(nestedDir)).toBe(true);
    await expect(fileSystem.mkdir(createdDir)).resolves.toBeUndefined();

    const writtenPath = path.join(createdDir, 'written.txt');
    await expect(
      fileSystem.put(createReadable('payload') as any, writtenPath)
    ).resolves.toBeUndefined();
    expect(fs.readFileSync(writtenPath, 'utf8')).toBe('payload');

    await expect(
      fileSystem.put(createReadable('bad') as any, path.join(createdDir, 'bad.txt'), {
        fd: 'invalid',
      } as any)
    ).rejects.toThrow('fd is not a number');

    const renamedPath = path.join(createdDir, 'renamed.txt');
    const atomicPath = path.join(createdDir, 'atomic.txt');
    await expect(fileSystem.rename(writtenPath, renamedPath)).resolves.toBeUndefined();
    await expect(fileSystem.renameAtomic(renamedPath, atomicPath)).resolves.toBeUndefined();

    const linkPath = path.join(createdDir, 'atomic-link');
    await expect(fileSystem.symlink(atomicPath, linkPath)).resolves.toBeUndefined();
    await expect(fileSystem.readlink(linkPath)).resolves.toBe(atomicPath);

    const entries = await fileSystem.list(createdDir);
    expect(entries.map(entry => entry.name).sort()).toEqual(['atomic-link', 'atomic.txt']);

    const childDir = path.join(createdDir, 'child');
    await expect(fileSystem.mkdir(childDir)).resolves.toBeUndefined();
    await expect(fileSystem.rmdir(childDir, false)).resolves.toBeUndefined();

    fs.mkdirSync(recursiveDir);
    fs.mkdirSync(path.join(recursiveDir, 'a'));
    fs.writeFileSync(path.join(recursiveDir, 'a', 'nested.txt'), 'nested');
    await expect(fileSystem.rmdir(recursiveDir, true)).resolves.toBeUndefined();
    expect(fs.existsSync(recursiveDir)).toBe(false);

    await expect(fileSystem.unlink(linkPath)).resolves.toBeUndefined();
    await expect(fileSystem.unlink(atomicPath)).resolves.toBeUndefined();
    expect(fs.existsSync(linkPath)).toBe(false);
    expect(fs.existsSync(atomicPath)).toBe(false);
  });

  test('surfaces filesystem errors from wrapped node callbacks', async () => {
    const expected = new Error('boom');

    jest
      .spyOn(fs, 'lstat')
      .mockImplementationOnce(((targetPath, callback) => callback(expected)) as any);
    await expect(fileSystem.lstat('/missing')).rejects.toBe(expected);

    jest
      .spyOn(fs, 'readFile')
      .mockImplementationOnce(((targetPath, option, callback) => callback(expected)) as any);
    await expect(fileSystem.readFile('/missing')).rejects.toBe(expected);

    jest.spyOn(fs, 'createReadStream').mockImplementationOnce(() => {
      throw expected;
    });
    await expect(fileSystem.get('/missing')).rejects.toBe(expected);

    jest
      .spyOn(fs, 'chmod')
      .mockImplementationOnce(((targetPath, mode, callback) => callback(expected)) as any);
    await expect(fileSystem.chmod('/missing', 0o644)).rejects.toBe(expected);

    jest
      .spyOn(fs, 'readlink')
      .mockImplementationOnce(((targetPath, callback) => callback(expected)) as any);
    await expect(fileSystem.readlink('/missing')).rejects.toBe(expected);

    jest
      .spyOn(fs, 'symlink')
      .mockImplementationOnce(((targetPath, linkPath, type, callback) => callback(expected)) as any);
    await expect(fileSystem.symlink('/target', '/link')).rejects.toBe(expected);

    jest
      .spyOn(fs, 'mkdir')
      .mockImplementationOnce(((dirPath, callback) => callback(expected)) as any);
    await expect(fileSystem.mkdir('/missing')).rejects.toBe(expected);

    jest
      .spyOn(fs, 'readdir')
      .mockImplementationOnce(((dirPath, callback) => callback(expected)) as any);
    await expect(fileSystem.list('/missing')).rejects.toBe(expected);

    jest
      .spyOn(fs, 'unlink')
      .mockImplementationOnce(((targetPath, callback) => callback(expected)) as any);
    await expect(fileSystem.unlink('/missing')).rejects.toBe(expected);

    jest
      .spyOn(fs, 'rmdir')
      .mockImplementationOnce(((targetPath, callback) => callback(expected)) as any);
    await expect(fileSystem.rmdir('/missing', false)).rejects.toBe(expected);
  });

  test('rejects put when the input stream errors after piping starts', async () => {
    const expected = new Error('stream failed');
    const writer = {
      once: jest.fn(function() {
        return this;
      }),
      end: jest.fn(),
    };
    const input = {
      once: jest.fn(function() {
        return this;
      }),
      pipe: jest.fn(),
    };
    jest.spyOn(fs, 'createWriteStream').mockReturnValue(writer as any);

    const promise = fileSystem.put(input as any, path.join(tempDir, 'broken.txt'));
    const errorHandler = (input.once as jest.Mock).mock.calls.find(
      ([event]) => event === 'error'
    )![1];
    errorHandler(expected);

    await expect(promise).rejects.toBe(expected);
    expect(input.pipe).toHaveBeenCalledWith(writer);
    expect(writer.end).toHaveBeenCalled();
  });
});

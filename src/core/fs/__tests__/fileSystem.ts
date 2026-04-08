import { PassThrough } from 'stream';
import FileSystem, { ERROR_MSG_STREAM_INTERRUPT, FileType } from '../fileSystem';

describe('core/fs/fileSystem', () => {
  test('detects file types from stat-like objects', () => {
    expect(
      FileSystem.getFileTypecharacter({
        isDirectory: () => true,
        isFile: () => false,
        isSymbolicLink: () => false,
      } as any)
    ).toBe(FileType.Directory);

    expect(
      FileSystem.getFileTypecharacter({
        isDirectory: () => false,
        isFile: () => true,
        isSymbolicLink: () => false,
      } as any)
    ).toBe(FileType.File);

    expect(
      FileSystem.getFileTypecharacter({
        isDirectory: () => false,
        isFile: () => false,
        isSymbolicLink: () => true,
      } as any)
    ).toBe(FileType.SymbolicLink);

    expect(
      FileSystem.getFileTypecharacter({
        isDirectory: () => false,
        isFile: () => false,
        isSymbolicLink: () => false,
      } as any)
    ).toBe(FileType.Unknown);
  });

  test('aborts readable streams with the expected error code', async () => {
    const stream = new PassThrough();
    const destroySpy = jest.spyOn(stream, 'destroy');
    const errorPromise = new Promise<Error>(resolve => {
      stream.once('error', resolve);
    });

    FileSystem.abortReadableStream(stream);

    const error = await errorPromise;

    expect((error as any).code).toBe(ERROR_MSG_STREAM_INTERRUPT);
    expect(FileSystem.isAbortedError(error as any)).toBe(true);
    expect(FileSystem.isAbortedError(new Error('other') as any)).toBe(false);
    expect(destroySpy).toHaveBeenCalledTimes(1);
  });
});

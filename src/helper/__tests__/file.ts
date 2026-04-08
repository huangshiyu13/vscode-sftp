const tmpFile = jest.fn();

jest.mock('tmp', () => ({
  __esModule: true,
  file: (...args) => tmpFile(...args),
}));

import { CONGIF_FILENAME } from '../../constants';
import { fileDepth, isConfigFile, isValidFile, makeTmpFile } from '../file';

describe('helper/file', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('detects local files, config files, and normalized path depth', () => {
    expect(
      isValidFile({
        scheme: 'file',
      } as any)
    ).toBe(true);
    expect(
      isValidFile({
        scheme: 'remote',
      } as any)
    ).toBe(false);

    expect(
      isConfigFile({
        fsPath: `/workspace/project/.vscode/${CONGIF_FILENAME}`,
      } as any)
    ).toBe(true);
    expect(
      isConfigFile({
        fsPath: '/workspace/project/README.md',
      } as any)
    ).toBe(false);

    expect(fileDepth('folder/sub/file.txt')).toBe(3);
    expect(fileDepth('folder//nested/../file.txt')).toBe(2);
  });

  test('creates temp files and surfaces tmp errors', async () => {
    tmpFile.mockImplementationOnce((option, cb) => {
      cb(null, `/tmp/${option.prefix}-demo`);
    });
    await expect(
      makeTmpFile({
        prefix: 'sftp',
      })
    ).resolves.toBe('/tmp/sftp-demo');

    tmpFile.mockImplementationOnce((_option, cb) => {
      cb(new Error('tmp failed'));
    });
    await expect(makeTmpFile({})).rejects.toThrow('tmp failed');
  });
});

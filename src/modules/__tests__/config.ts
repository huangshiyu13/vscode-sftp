const readJson: any = jest.fn();
const pathExists: any = jest.fn();
const outputJson: any = jest.fn();
const showTextDocument: any = jest.fn();
const reportError: any = jest.fn();
const uriFile: any = jest.fn((fsPath: string) => ({ fsPath, scheme: 'file' }));

jest.mock('vscode', () => ({
  Uri: {
    file: uriFile,
  },
}));

jest.mock('fs-extra', () => ({
  readJson,
  pathExists,
  outputJson,
}));

jest.mock('../../host', () => ({
  __esModule: true,
  showTextDocument,
}));

jest.mock('../../helper', () => ({
  __esModule: true,
  reportError,
}));

import * as path from 'path';
import {
  validateConfig,
  readConfigsFromFile,
  tryLoadConfigs,
  newConfig,
} from '../config';

describe('modules/config', () => {
  const workspace = '/workspace/project';
  const configPath = path.join(workspace, '.vscode/sftp.json');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('validateConfig accepts a minimal valid config', () => {
    const error = validateConfig({
      host: 'target.internal',
      username: 'root',
      remotePath: '/workspace/project',
      protocol: 'sftp',
    });

    expect(error).toBeNull();
  });

  test('validateConfig returns an error for invalid config values', () => {
    const error = validateConfig({
      host: 'target.internal',
      username: 'root',
      remotePath: '/workspace/project',
      protocol: 'http',
    });

    expect(error).toBeDefined();
    expect(error!.message).toContain('protocol');
  });

  test('readConfigsFromFile applies default values to single config files', async () => {
    readJson.mockResolvedValue({
      host: 'target.internal',
      username: 'root',
      remotePath: '/remote/project',
    });

    const configs = await readConfigsFromFile(configPath);

    expect(readJson).toHaveBeenCalledWith(configPath);
    expect(configs).toEqual([
      expect.objectContaining({
        host: 'target.internal',
        username: 'root',
        remotePath: '/remote/project',
        protocol: 'sftp',
        uploadOnSave: false,
        concurrency: 4,
      }),
    ]);
  });

  test('tryLoadConfigs returns configs when the workspace file exists', async () => {
    pathExists.mockResolvedValue(true);
    readJson.mockResolvedValue([
      {
        host: 'target.internal',
        username: 'root',
        remotePath: '/remote/project',
      },
    ]);

    const configs = await tryLoadConfigs(workspace);

    expect(pathExists).toHaveBeenCalledWith(configPath);
    expect(configs).toHaveLength(1);
    expect(configs[0]).toEqual(
      expect.objectContaining({
        host: 'target.internal',
        protocol: 'sftp',
      })
    );
  });

  test('tryLoadConfigs returns an empty list when the config file is missing or inaccessible', async () => {
    pathExists.mockResolvedValueOnce(false);
    pathExists.mockRejectedValueOnce(new Error('fs error'));

    await expect(tryLoadConfigs(workspace)).resolves.toEqual([]);
    await expect(tryLoadConfigs(workspace)).resolves.toEqual([]);
  });

  test('newConfig opens the existing config file directly', async () => {
    pathExists.mockResolvedValue(true);
    showTextDocument.mockResolvedValue('opened');

    const result = await newConfig(workspace);

    expect(outputJson).not.toHaveBeenCalled();
    expect(uriFile).toHaveBeenCalledWith(configPath);
    expect(showTextDocument).toHaveBeenCalledWith({
      fsPath: configPath,
      scheme: 'file',
    });
    expect(result).toBe('opened');
  });

  test('newConfig creates a starter config when one does not exist', async () => {
    pathExists.mockResolvedValue(false);
    outputJson.mockResolvedValue(undefined);
    showTextDocument.mockResolvedValue('created');

    const result = await newConfig(workspace);

    expect(outputJson).toHaveBeenCalledWith(
      configPath,
      {
        name: 'My Server',
        host: 'localhost',
        protocol: 'sftp',
        port: 22,
        username: 'username',
        remotePath: '/',
        uploadOnSave: false,
        useTempFile: false,
        openSsh: false,
      },
      { spaces: 4 }
    );
    expect(showTextDocument).toHaveBeenCalled();
    expect(result).toBe('created');
  });

  test('newConfig reports errors through reportError', async () => {
    const error = new Error('write failed');
    pathExists.mockResolvedValue(false);
    outputJson.mockRejectedValue(error);

    await newConfig(workspace);

    expect(reportError).toHaveBeenCalledWith(error);
  });
});

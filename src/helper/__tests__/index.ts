import * as helpers from '../index';
import * as paths from '../paths';
import * as file from '../file';
import * as error from '../error';
import * as select from '../select';

describe('helper/index', () => {
  test('re-exports paths module', () => {
    expect(helpers.toRemotePath).toBe(paths.toRemotePath);
    expect(helpers.toLocalPath).toBe(paths.toLocalPath);
    expect(helpers.simplifyPath).toBe(paths.simplifyPath);
  });

  test('re-exports file module', () => {
    expect(helpers.isValidFile).toBe(file.isValidFile);
    expect(helpers.isConfigFile).toBe(file.isConfigFile);
  });

  test('re-exports error module', () => {
    expect(helpers.reportError).toBe(error.reportError);
  });

  test('re-exports select module', () => {
    expect(helpers.listFiles).toBe(select.listFiles);
  });
});

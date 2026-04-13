const getExtension = jest.fn();
const getAPI = jest.fn();

jest.mock('../git/git', () => ({}), { virtual: true });

jest.mock('vscode', () => ({
  __esModule: true,
  extensions: {
    getExtension,
  },
}));

import { getGitService } from '../git';

describe('modules/git', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('retrieves the vscode git api from the built-in extension', () => {
    const api = {
      repositories: [],
    };
    getAPI.mockReturnValue(api);
    getExtension.mockReturnValue({
      exports: {
        getAPI,
      },
    });

    expect(getGitService()).toBe(api);
    expect(getExtension).toHaveBeenCalledWith('vscode.git');
    expect(getAPI).toHaveBeenCalledWith(1);
  });
});

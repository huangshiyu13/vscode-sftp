jest.mock('vscode', () => ({
  __esModule: true,
  window: {
    createStatusBarItem: jest.fn().mockReturnValue({
      command: null,
      text: '',
      tooltip: '',
      show: jest.fn(),
    }),
  },
  StatusBarAlignment: { Left: 1 },
}));

jest.mock('../modules/appState', () => ({
  __esModule: true,
  default: class AppState {
    profile: string | null = null;
  },
}));

jest.mock('../modules/remoteExplorer', () => ({
  __esModule: true,
  default: class RemoteExplorer {
    refresh = jest.fn();
    reveal = jest.fn();
    findRoot = jest.fn();
  },
}));

jest.mock('../constants', () => ({
  __esModule: true,
  COMMAND_TOGGLE_OUTPUT: 'sftp.toggleOutput',
}));

import app from '../app';

describe('app', () => {
  test('initializes with default state', () => {
    expect(app.state).toBeDefined();
    expect(app.state.profile).toBeNull();
  });

  test('sftpBarItem uses profile name when set', () => {
    app.state.profile = 'prod';
    const nameFn = (app.sftpBarItem as any)._name;
    expect(typeof nameFn === 'function' ? nameFn() : nameFn).toBe('SFTP: prod');
  });

  test('sftpBarItem uses SFTP when no profile', () => {
    app.state.profile = null;
    const nameFn = (app.sftpBarItem as any)._name;
    expect(typeof nameFn === 'function' ? nameFn() : nameFn).toBe('SFTP');
  });

  test('has fsCache', () => {
    expect(app.fsCache).toBeDefined();
  });

  test('remoteExplorer is undefined until activation', () => {
    expect(app.remoteExplorer).toBeUndefined();
  });
});

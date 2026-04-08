const show = jest.fn();
const hide = jest.fn();
const appendLine = jest.fn();
const updateStatus = jest.fn();

jest.mock('vscode', () => ({
  window: {
    createOutputChannel: jest.fn(() => ({
      show: (...args) => show(...args),
      hide: (...args) => hide(...args),
      appendLine: (...args) => appendLine(...args),
    })),
  },
}));

jest.mock('../../app', () => ({
  __esModule: true,
  default: {
    sftpBarItem: {
      updateStatus: (...args) => updateStatus(...args),
    },
  },
}));

jest.mock('../statusBarItem', () => ({
  __esModule: true,
  default: {
    Status: {
      ok: 'ok',
    },
  },
}));

describe('ui/output', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('shows, hides, and toggles the output channel', () => {
    const output = require('../output');

    output.show();
    output.toggle();
    output.toggle();
    output.hide();

    expect(updateStatus).toHaveBeenCalledWith('ok');
    expect(show).toHaveBeenCalledTimes(2);
    expect(hide).toHaveBeenCalledTimes(2);
  });

  test('prints errors, objects, and falsey values to the channel', () => {
    const output = require('../output');

    output.print('prefix', new Error('boom'), { answer: 42 }, 0, null);

    expect(appendLine).toHaveBeenCalledWith(
      expect.stringContaining('prefix Error: boom')
    );
    expect(appendLine).toHaveBeenCalledWith(expect.stringContaining('{"answer":42}'));
    expect(appendLine).toHaveBeenCalledWith(expect.stringContaining(' 0 '));
  });
});

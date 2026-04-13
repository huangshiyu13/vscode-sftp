const reportErrorMock = jest.fn();
const loggerTraceMock = jest.fn();

jest.mock('../../../helper', () => ({
  __esModule: true,
  reportError: reportErrorMock,
}));

jest.mock('../../../logger', () => ({
  __esModule: true,
  default: {
    trace: loggerTraceMock,
  },
}));

import Command from '../command';

class TestCommand extends Command {
  public doCommandRunResult: any;
  public doCommandRunError: Error | null = null;

  constructor() {
    super();
    this.id = 'test.command';
    this.name = 'TestCommand';
  }

  protected async doCommandRun(...args: any[]) {
    if (this.doCommandRunError) {
      throw this.doCommandRunError;
    }
    this.doCommandRunResult = args;
  }
}

describe('commands/abstract/command', () => {
  let cmd: TestCommand;

  beforeEach(() => {
    jest.clearAllMocks();
    cmd = new TestCommand();
  });

  test('run calls doCommandRun with args', async () => {
    await cmd.run('arg1', 'arg2');

    expect(cmd.doCommandRunResult).toEqual(['arg1', 'arg2']);
    expect(loggerTraceMock).toHaveBeenCalledWith("run command 'TestCommand'");
  });

  test('run reports error when doCommandRun throws', async () => {
    const error = new Error('test error');
    cmd.doCommandRunError = error;

    await cmd.run('arg1');

    expect(reportErrorMock).toHaveBeenCalledWith(error);
  });

  test('run calls commitCommandDone even when doCommandRun throws', async () => {
    const listener = jest.fn();
    cmd.onCommandDone(listener);
    cmd.doCommandRunError = new Error('test error');

    await cmd.run('arg1');

    expect(listener).toHaveBeenCalledWith('arg1');
  });

  test('onCommandDone listener is called after run', async () => {
    const listener = jest.fn();
    cmd.onCommandDone(listener);

    await cmd.run('arg1', 'arg2');

    expect(listener).toHaveBeenCalledWith('arg1', 'arg2');
  });

  test('onCommandDone returns unsubscribe function', async () => {
    const listener = jest.fn();
    const unsubscribe = cmd.onCommandDone(listener);

    unsubscribe();

    await cmd.run('arg1');

    expect(listener).not.toHaveBeenCalled();
  });

  test('multiple onCommandDone listeners are called', async () => {
    const listener1 = jest.fn();
    const listener2 = jest.fn();
    cmd.onCommandDone(listener1);
    cmd.onCommandDone(listener2);

    await cmd.run('arg1');

    expect(listener1).toHaveBeenCalledWith('arg1');
    expect(listener2).toHaveBeenCalledWith('arg1');
  });

  test('unsubscribe only removes the specific listener', async () => {
    const listener1 = jest.fn();
    const listener2 = jest.fn();
    const unsub1 = cmd.onCommandDone(listener1);
    cmd.onCommandDone(listener2);

    unsub1();

    await cmd.run('arg1');

    expect(listener1).not.toHaveBeenCalled();
    expect(listener2).toHaveBeenCalledWith('arg1');
  });
});
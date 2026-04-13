describe('logger', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('prints info, warn, error, and critical messages with a timestamp prefix', () => {
    const print = jest.fn();
    jest.doMock('../ui/output', () => ({
      __esModule: true,
      print,
    }));
    jest.doMock('../modules/ext', () => ({
      __esModule: true,
      getExtensionSetting: jest.fn().mockReturnValue({}),
    }));

    const logger = require('../logger').default;

    logger.info('hello');
    logger.warn('careful');
    logger.error('boom');
    logger.critical('bad');

    expect(print).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(/^\[\d{2}-\d{2} \d{2}:\d{2}:\d{2}\]$/),
      '[info]',
      'hello'
    );
    expect(print).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/^\[\d{2}-\d{2} \d{2}:\d{2}:\d{2}\]$/),
      '[warn]',
      'careful'
    );
    expect(print).toHaveBeenNthCalledWith(
      3,
      expect.stringMatching(/^\[\d{2}-\d{2} \d{2}:\d{2}:\d{2}\]$/),
      '[error]',
      'boom'
    );
    expect(print).toHaveBeenNthCalledWith(
      4,
      expect.stringMatching(/^\[\d{2}-\d{2} \d{2}:\d{2}:\d{2}\]$/),
      '[critical]',
      'bad'
    );
  });

  test('only prints trace and debug messages when debug logging is enabled', () => {
    const print = jest.fn();
    jest.doMock('../ui/output', () => ({
      __esModule: true,
      print,
    }));
    jest.doMock('../modules/ext', () => ({
      __esModule: true,
      getExtensionSetting: jest.fn().mockReturnValue({
        debug: true,
      }),
    }));

    let logger = require('../logger').default;
    logger.trace('trace');
    logger.debug('debug');
    expect(print).toHaveBeenCalledTimes(2);
    expect(print.mock.calls[0][1]).toBe('[trace]');
    expect(print.mock.calls[1][1]).toBe('[debug]');

    jest.resetModules();
    print.mockClear();

    jest.doMock('../ui/output', () => ({
      __esModule: true,
      print,
    }));
    jest.doMock('../modules/ext', () => ({
      __esModule: true,
      getExtensionSetting: jest.fn().mockReturnValue({
        printDebugLog: false,
      }),
    }));

    logger = require('../logger').default;
    logger.trace('trace');
    logger.debug('debug');
    expect(print).not.toHaveBeenCalled();
  });
});

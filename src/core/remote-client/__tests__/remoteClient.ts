import RemoteClient, { ErrorCode } from '../remoteClient';

const initClient = jest.fn();
const doConnect = jest.fn();
const hasProvideAuth = jest.fn();

class TestRemoteClient extends RemoteClient {
  end() {
    return;
  }

  getFsClient() {
    return 'fs-client';
  }

  protected _doConnect(connectOption, config) {
    return doConnect(connectOption, config);
  }

  protected _hasProvideAuth(connectOption) {
    return hasProvideAuth(connectOption);
  }

  protected _initClient() {
    return initClient();
  }
}

describe('core/remote-client/remoteClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('connect uses provided auth without prompting and injects prompted passwords otherwise', async () => {
    const askForPasswd = jest.fn();

    initClient.mockReturnValue({
      on: jest.fn(),
    });
    hasProvideAuth.mockReturnValueOnce(true);
    doConnect.mockResolvedValueOnce(undefined);

    const client = new TestRemoteClient({
      host: 'target.internal',
      port: 22,
      debug: jest.fn(),
    } as any);

    await expect(
      client.connect(
        {
          host: 'target.internal',
          port: 22,
          password: 'preset',
          debug: jest.fn(),
        } as any,
        {
          askForPasswd,
        }
      )
    ).resolves.toBeUndefined();

    expect(askForPasswd).not.toHaveBeenCalled();
    expect(doConnect).toHaveBeenCalledWith(
      expect.objectContaining({
        password: 'preset',
      }),
      expect.any(Object)
    );

    hasProvideAuth.mockReturnValueOnce(false);
    doConnect.mockResolvedValueOnce(undefined);
    askForPasswd.mockResolvedValueOnce('prompt-secret');

    await expect(
      client.connect(
        {
          host: 'prompt.internal',
          port: 22,
          debug: jest.fn(),
        } as any,
        {
          askForPasswd,
        }
      )
    ).resolves.toBeUndefined();

    expect(askForPasswd).toHaveBeenCalledWith('[prompt.internal]: Enter your password');
    expect(doConnect).toHaveBeenLastCalledWith(
      expect.objectContaining({
        host: 'prompt.internal',
        password: 'prompt-secret',
      }),
      expect.any(Object)
    );
  });

  test('connect throws a cancel error when password input is cancelled', async () => {
    initClient.mockReturnValue({
      on: jest.fn(),
    });
    hasProvideAuth.mockReturnValue(false);

    const client = new TestRemoteClient({
      host: 'target.internal',
      port: 22,
      debug: jest.fn(),
    } as any);

    await expect(
      client.connect(
        {
          host: 'target.internal',
          port: 22,
          debug: jest.fn(),
        } as any,
        {
          askForPasswd: jest.fn().mockResolvedValue(undefined),
        }
      )
    ).rejects.toMatchObject({
      code: ErrorCode.CONNECT_CANCELLED,
      message: 'cancelled',
    });
    expect(doConnect).not.toHaveBeenCalled();
  });

  test('onDisconnected wires end, close, and error events back to the callback', () => {
    const handlers = {};
    const transport = {
      on: jest.fn(function(event, cb) {
        handlers[event] = cb;
        return this;
      }),
    };
    const disconnected = jest.fn();

    initClient.mockReturnValue(transport);

    const client = new TestRemoteClient({
      host: 'target.internal',
      port: 22,
      debug: jest.fn(),
    } as any);

    client.onDisconnected(disconnected);

    const eventHandlers = handlers as {
      end: () => void;
      close: () => void;
      error: (err: Error) => void;
    };

    eventHandlers.end();
    eventHandlers.close();
    eventHandlers.error(new Error('boom'));

    expect(disconnected).toHaveBeenNthCalledWith(1, 'end');
    expect(disconnected).toHaveBeenNthCalledWith(2, 'close');
    expect(disconnected).toHaveBeenNthCalledWith(3, 'error');
  });
});

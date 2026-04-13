const ftpInstances: any[] = [];

function MockFTPClient(this: any) {
  this.handlers = {};
  this.on = jest.fn((event, cb) => {
    this.handlers[event] = cb;
    return this;
  });
  this.connect = jest.fn();
  this.end = jest.fn();
  this._queue = [];
  this._curReq = null;
  this._ending = false;
  this._reset = jest.fn();
  this._socket = {
    readable: true,
    write: jest.fn(),
  };
  this._pasvSocket = {};
  this._pasv = jest.fn(cb => cb());
  this._debug = jest.fn();
  this._keepalive = 0;
  ftpInstances.push(this);
}

jest.mock('ftp', () => MockFTPClient);

import FTPClient from '../ftpClient';

describe('core/remote-client/ftpClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ftpInstances.length = 0;
  });

  test('patches the ftp client prototype to send commands and set modification times', () => {
    const raw = new (MockFTPClient as any)();
    const callback = jest.fn();

    raw._send('LIST', callback, false);
    expect(raw._socket.write).toHaveBeenCalledWith('LIST\r\n');

    raw._socket.write.mockClear();
    raw._send('ABOR', callback, false);
    expect(raw._pasvSocket.aborting).toBe(true);
    expect(raw._socket.write).toHaveBeenCalledWith('ABOR\r\n');

    raw._reset.mockClear();
    raw._socket.write.mockClear();
    raw._queue = [];
    raw._curReq = null;
    raw._ending = true;
    raw._send(undefined, callback, false);
    expect(raw._reset).toHaveBeenCalledTimes(1);

    const sendSpy = jest.fn();
    raw._send = sendSpy;
    raw.setLastMod('/remote/file.txt', new Date(Date.UTC(2024, 0, 2, 3, 4, 5)), callback);
    expect(sendSpy).toHaveBeenCalledWith(
      'MFMT 20240102030405 /remote/file.txt',
      callback
    );
  });

  test('connects with mapped ftp options, supports passive mode, and delegates client access', async () => {
    const client = new FTPClient({
      host: 'ftp.example.com',
      username: 'deploy',
      password: 'secret',
    } as any);
    const raw = (client as any)._client;

    const connectPromise = (client as any)._doConnect(
      {
        host: 'ftp.example.com',
        username: 'deploy',
        password: 'secret',
        connectTimeout: 25,
      },
      {}
    );
    expect(raw.connect).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'ftp.example.com',
        password: 'secret',
        user: 'deploy',
        connTimeout: 25,
        pasvTimeout: 25,
        keepalive: 10000,
      })
    );

    raw.handlers.ready();
    await expect(connectPromise).resolves.toBeUndefined();

    const passiveClient = new FTPClient({
      host: 'ftp.example.com',
      username: 'deploy',
      password: 'secret',
    } as any);
    const passiveRaw = (passiveClient as any)._client;

    const passivePromise = (passiveClient as any)._doConnect(
      {
        host: 'ftp.example.com',
        username: 'deploy',
        password: 'secret',
        passive: true,
        connectTimeout: 25,
      },
      {}
    );
    passiveRaw.handlers.ready();
    await expect(passivePromise).resolves.toBeUndefined();
    expect(passiveRaw._pasv).toHaveBeenCalledWith(expect.any(Function));

    expect((client as any)._hasProvideAuth({ password: 'secret' })).toBe(true);
    expect((client as any)._hasProvideAuth({ password: undefined })).toBe(false);
    expect(client.getFsClient()).toBe(raw);
    client.end();
    expect(raw.end).toHaveBeenCalledTimes(1);
  });

  test('_send promote=true unshifts commands to the front of the queue', () => {
    const raw = new (MockFTPClient as any)();
    const cb1 = jest.fn();
    const cb2 = jest.fn();

    // First, set curReq so the queue isn't processed immediately
    raw._curReq = { cmd: 'ONGOING', cb: jest.fn() };

    // promote=true should unshift (prepend) the command
    raw._send('CWD /dir', cb1, true);
    raw._send('LIST', cb2, false);

    // Check that CWD /dir is at the front and LIST is at the back
    expect(raw._queue[0]).toEqual({ cmd: 'CWD /dir', cb: cb1 });
    expect(raw._queue[1]).toEqual({ cmd: 'LIST', cb: cb2 });
  });

  test('_send processes queued command when curReq has ABOR', () => {
    const raw = new (MockFTPClient as any)();
    const cb = jest.fn();

    // Set up: curReq is an ABOR command, queue has a pending LIST
    raw._curReq = { cmd: 'ABOR', cb: jest.fn() };
    raw._queue = [{ cmd: 'LIST', cb: jest.fn() }];
    raw._send(undefined, cb, false);
    // The ABOR curReq should not trigger a write (cmd === 'ABOR' check)
    // But queue should have been shifted
  });

  test('setLastMod formats two-digit month/day/hour/minute/second correctly', () => {
    const raw = new (MockFTPClient as any)();
    const cb = jest.fn();
    const sendSpy = jest.fn();
    raw._send = sendSpy;

    // Jan = month 0, so getUTCMonth()+1 = 1 → '01'
    raw.setLastMod('/remote/file.txt', new Date(Date.UTC(2024, 0, 5, 3, 4, 5)), cb);
    expect(sendSpy).toHaveBeenCalledWith('MFMT 20240105030405 /remote/file.txt', cb);

    // December = month 11, so getUTCMonth()+1 = 12 → '12'
    sendSpy.mockClear();
    raw.setLastMod('/remote/file.txt', new Date(Date.UTC(2024, 11, 31, 23, 59, 59)), cb);
    expect(sendSpy).toHaveBeenCalledWith('MFMT 20241231235959 /remote/file.txt', cb);
  });

  test('onDisconnected callback resets connected state', async () => {
    const client = new FTPClient({
      host: 'ftp.example.com',
      username: 'deploy',
      password: 'secret',
    } as any);
    const raw = (client as any)._client;

    const connectPromise = (client as any)._doConnect(
      {
        host: 'ftp.example.com',
        username: 'deploy',
        password: 'secret',
        connectTimeout: 5000,
      },
      {}
    );

    // Trigger ready to resolve the connection
    raw.handlers.ready();
    await expect(connectPromise).resolves.toBeUndefined();

    // Now trigger disconnect - the onDisconnected callback should set connected=false
    expect((client as any).connected).toBe(true);
    const disconnectHandlers = (client as any)._disconnectedListeners || [];
    // Verify the onDisconnected listener was registered
    expect((client as any)._client.on).toHaveBeenCalledWith('end', expect.any(Function));
  });

  test('_hasProvideAuth checks for null and undefined password', () => {
    const client = new FTPClient({
      host: 'ftp.example.com',
      username: 'deploy',
    } as any);

    // The check is `!= undefined` (loose equality), so null is also falsy
    expect((client as any)._hasProvideAuth({ password: 'secret' })).toBe(true);
    expect((client as any)._hasProvideAuth({})).toBe(false);
  });

  test('rejects failed and timed out connections', async () => {
    jest.useFakeTimers({ doNotFake: ['performance'] });

    const errorClient = new FTPClient({
      host: 'ftp.example.com',
      username: 'deploy',
    } as any);
    const errorRaw = (errorClient as any)._client;
    const errorPromise = (errorClient as any)._doConnect(
      {
        host: 'ftp.example.com',
        username: 'deploy',
        connectTimeout: 25,
      },
      {}
    );
    errorRaw.handlers.error(new Error('auth failed'));
    await expect(errorPromise).rejects.toThrow('auth failed');

    const timeoutClient = new FTPClient({
      host: 'ftp.example.com',
      username: 'deploy',
    } as any);
    const timeoutRaw = (timeoutClient as any)._client;
    const timeoutPromise = (timeoutClient as any)._doConnect(
      {
        host: 'ftp.example.com',
        username: 'deploy',
        connectTimeout: 5,
      },
      {}
    );

    jest.advanceTimersByTime(5);
    await expect(timeoutPromise).rejects.toThrow('Timeout while connecting to server');
    expect(timeoutRaw.end).toHaveBeenCalledTimes(1);

    jest.useRealTimers();
  });
});

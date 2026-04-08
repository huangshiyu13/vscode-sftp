import maskConfig from '../maskConfig';

describe('maskConfig', () => {
  test('masks nested credentials in hop and proxyJump config', () => {
    const masked = maskConfig({
      username: 'root',
      password: 'top-secret',
      interactiveAuth: ['one', 'two'],
      hop: {
        username: 'jump-user',
        password: 'jump-pass',
      },
      proxyJump: [
        {
          username: 'proxy-user',
          password: 'proxy-pass',
        },
      ],
    });

    expect(masked).toEqual({
      username: '******',
      password: '******',
      interactiveAuth: ['******', '******'],
      hop: {
        username: '******',
        password: '******',
      },
      proxyJump: [
        {
          username: '******',
          password: '******',
        },
      ],
    });
  });
});

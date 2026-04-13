import maskConfig from '../maskConfig';

describe('maskConfig', () => {
  test('masks secret keys', () => {
    const config = {
      username: 'myuser',
      password: 'mypassword',
      passphrase: 'mypassphrase',
      host: 'example.com',
    };

    const result = maskConfig(config);
    expect(result.username).toBe('******');
    expect(result.password).toBe('******');
    expect(result.passphrase).toBe('******');
    expect(result.host).toBe('example.com');
  });

  test('masks interactiveAuth array values', () => {
    const config = {
      interactiveAuth: ['value1', 'value2'],
    };

    const result = maskConfig(config);
    expect(result.interactiveAuth).toEqual(['******', '******']);
  });

  test('preserves interactiveAuth non-array values', () => {
    const config = {
      interactiveAuth: 'someValue',
    };

    const result = maskConfig(config);
    expect(result.interactiveAuth).toBe('someValue');
  });

  test('masks nested object secret keys', () => {
    const config = {
      remote: {
        username: 'nestedUser',
        host: 'nested.example.com',
      },
    };

    const result = maskConfig(config);
    expect(result.remote.username).toBe('******');
    expect(result.remote.host).toBe('nested.example.com');
  });

  test('masks values in arrays', () => {
    const config = {
      profiles: [{ username: 'user1' }, { host: 'host1' }],
    };

    const result = maskConfig(config);
    expect(result.profiles[0].username).toBe('******');
    expect(result.profiles[1].host).toBe('host1');
  });

  test('preserves non-secret values', () => {
    const config = {
      host: 'example.com',
      port: 22,
      remotePath: '/var/www',
    };

    const result = maskConfig(config);
    expect(result.host).toBe('example.com');
    expect(result.port).toBe(22);
    expect(result.remotePath).toBe('/var/www');
  });

  test('handles empty config', () => {
    const result = maskConfig({});
    expect(result).toEqual({});
  });

  test('does not mutate original config', () => {
    const config = { password: 'secret', host: 'example.com' };
    const result = maskConfig(config);
    expect(config.password).toBe('secret');
    expect(result.password).toBe('******');
  });
});
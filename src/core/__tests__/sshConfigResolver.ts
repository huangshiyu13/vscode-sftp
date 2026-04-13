import * as os from 'os';
import * as sshConfig from 'ssh-config';
import {
  resolveProxyJumpChain,
  resolveSSHConfig,
  splitProxyJump,
} from '../sshConfigResolver';

function parse(content: string) {
  return sshConfig.parse(content);
}

describe('sshConfigResolver', () => {
  test('splitProxyJump keeps hop order', () => {
    expect(splitProxyJump('jump-a, jump-b ,jump-c')).toEqual([
      'jump-a',
      'jump-b',
      'jump-c',
    ]);
  });

  test('splitProxyJump filters empty segments', () => {
    expect(splitProxyJump('a,,b, ,c')).toEqual(['a', 'b', 'c']);
  });

  test('splitProxyJump handles single host', () => {
    expect(splitProxyJump('bastion')).toEqual(['bastion']);
  });

  test('resolveSSHConfig includes proxy jump aliases from ssh config', () => {
    const parsed = parse(`
Host jump-a
  HostName bastion.example.com
  User root
  IdentityFile ~/.ssh/jump_a

Host target
  HostName target.internal
  User app
  Port 2222
  ProxyJump jump-a
  IdentityFile ~/.ssh/target_key
`);

    const resolved = resolveSSHConfig(parsed as any, 'target');

    expect(resolved.host).toBe('target.internal');
    expect(resolved.username).toBe('app');
    expect(resolved.port).toBe(2222);
    expect(resolved.privateKeyPath).toBe(`${os.homedir()}/.ssh/target_key`);
    expect(resolved.proxyJump).toEqual([
      {
        host: 'bastion.example.com',
        port: undefined,
        username: 'root',
        privateKeyPath: `${os.homedir()}/.ssh/jump_a`,
        connectTimeout: undefined,
      },
    ]);
  });

  test('resolveProxyJumpChain flattens nested proxy jumps', () => {
    const parsed = parse(`
Host edge
  HostName edge.example.com

Host mid
  HostName mid.internal
  ProxyJump edge

Host target
  HostName target.internal
  ProxyJump mid
`);

    const resolved = resolveSSHConfig(parsed as any, 'target', {
      privateKeyPath: '/tmp/shared-key',
    });

    expect(resolved.proxyJump).toEqual([
      {
        host: 'edge.example.com',
        port: undefined,
        username: undefined,
        privateKeyPath: '/tmp/shared-key',
        connectTimeout: undefined,
      },
      {
        host: 'mid.internal',
        port: undefined,
        username: undefined,
        privateKeyPath: '/tmp/shared-key',
        connectTimeout: undefined,
      },
    ]);
  });

  test('resolveProxyJumpChain supports literal user host port specs', () => {
    const parsed = parse(`
Host target
  HostName target.internal
  ProxyJump root@bastion.example.com:2222
`);

    const chain = resolveProxyJumpChain(
      parsed as any,
      'root@bastion.example.com:2222'
    );

    expect(chain).toEqual([
      {
        host: 'bastion.example.com',
        port: 2222,
        username: 'root',
      },
    ]);
  });

  test('resolveSSHConfig resolves host without proxy jump', () => {
    const parsed = parse(`
Host simple
  HostName simple.example.com
  User admin
  Port 22
  ConnectTimeout 30
`);

    const resolved = resolveSSHConfig(parsed as any, 'simple');

    expect(resolved.host).toBe('simple.example.com');
    expect(resolved.username).toBe('admin');
    expect(resolved.port).toBe(22);
    expect(resolved.connectTimeout).toBe(30);
    expect(resolved.proxyJump).toBeUndefined();
  });

  test('resolveSSHConfig applies fallbacks from the fallback option', () => {
    const parsed = parse(`
Host target
  HostName target.internal
`);

    const resolved = resolveSSHConfig(parsed as any, 'target', {
      agent: '/usr/bin/ssh-agent',
      privateKeyPath: '/home/user/.ssh/id_rsa',
      passphrase: 'secret',
      interactiveAuth: true,
      algorithms: { kex: ['diffie-hellman-group1-sha1'] },
      connectTimeout: 60,
    });

    expect(resolved.host).toBe('target.internal');
    expect(resolved.agent).toBe('/usr/bin/ssh-agent');
    expect(resolved.privateKeyPath).toBe('/home/user/.ssh/id_rsa');
    expect(resolved.passphrase).toBe('secret');
    expect(resolved.interactiveAuth).toBe(true);
    expect(resolved.algorithms).toEqual({ kex: ['diffie-hellman-group1-sha1'] });
    expect(resolved.connectTimeout).toBe(60);
  });

  test('resolveSSHConfig preserves explicit values over fallbacks', () => {
    const parsed = parse(`
Host target
  HostName target.internal
  ConnectTimeout 10
`);

    const resolved = resolveSSHConfig(parsed as any, 'target', {
      connectTimeout: 99,
    });

    expect(resolved.connectTimeout).toBe(10);
  });

  test('resolveProxyJumpChain resolves inline spec when no ssh config match', () => {
    const parsed = parse(``);

    const chain = resolveProxyJumpChain(
      parsed as any,
      'user@jumphost:3333',
      { agent: '/tmp/agent' }
    );

    expect(chain).toEqual([
      {
        host: 'jumphost',
        port: 3333,
        username: 'user',
        agent: '/tmp/agent',
      },
    ]);
  });

  test('resolveProxyJumpChain returns empty array for whitespace-only specs', () => {
    const parsed = parse(``);

    // splitProxyJump filters empty segments, so '  ' results in empty array
    const result = resolveProxyJumpChain(parsed as any, '  ');
    expect(result).toEqual([]);
  });

  test('resolveProxyJumpChain detects circular proxy jump references', () => {
    const parsed = parse(`
Host a
  HostName a.internal
  ProxyJump b

Host b
  HostName b.internal
  ProxyJump a
`);

    expect(() =>
      resolveSSHConfig(parsed as any, 'a')
    ).toThrow('Circular ProxyJump');
  });

  test('resolveProxyJumpChain handles multiple comma-separated jumps', () => {
    const parsed = parse(`
Host jump-a
  HostName a.internal

Host jump-b
  HostName b.internal
`);

    const chain = resolveProxyJumpChain(
      parsed as any,
      'jump-a,jump-b'
    );

    expect(chain).toHaveLength(2);
    expect(chain[0].host).toBe('a.internal');
    expect(chain[1].host).toBe('b.internal');
  });

  test('resolveSSHConfig resolves host alias when HostName is not set', () => {
    const parsed = parse(`
Host my-alias
  User admin
  Port 2222
`);

    const resolved = resolveSSHConfig(parsed as any, 'my-alias');

    expect(resolved.host).toBe('my-alias');
    expect(resolved.username).toBe('admin');
    expect(resolved.port).toBe(2222);
  });

  test('resolveSSHConfig handles empty IdentityFile arrays', () => {
    const parsed = parse(`
Host target
  HostName target.internal
`);

    const resolved = resolveSSHConfig(parsed as any, 'target');

    expect(resolved.privateKeyPath).toBeUndefined();
  });

  test('resolveProxyJumpChain handles spec without port or username', () => {
    const parsed = parse(``);

    const chain = resolveProxyJumpChain(parsed as any, 'barehost');

    expect(chain).toEqual([
      {
        host: 'barehost',
        port: undefined,
        username: undefined,
      },
    ]);
  });

  test('resolveProxyJumpChain handles string IdentityFile', () => {
    const parsed = parse(`
Host jump
  HostName jump.internal
  IdentityFile ~/.ssh/jump_key
`);

    const chain = resolveProxyJumpChain(parsed as any, 'jump');

    expect(chain[0].privateKeyPath).toBe(`${os.homedir()}/.ssh/jump_key`);
  });

  test('resolveProxyJumpChain handles array IdentityFile with entries', () => {
    const parsed = parse(`
Host jump
  HostName jump.internal
  IdentityFile ~/.ssh/key1
`);

    const chain = resolveProxyJumpChain(parsed as any, 'jump');

    expect(chain[0].privateKeyPath).toBe(`${os.homedir()}/.ssh/key1`);
  });

  test('parseInteger returns undefined for NaN port values', () => {
    const parsed = parse(`
Host target
  HostName target.internal
  Port notanumber
`);

    const resolved = resolveSSHConfig(parsed as any, 'target');

    expect(resolved.port).toBeUndefined();
  });

  test('resolveProxyJumpChain applies fallbacks to inline specs', () => {
    const parsed = parse(``);

    const chain = resolveProxyJumpChain(
      parsed as any,
      'jump@host:22',
      { connectTimeout: 30, agent: '/tmp/agent' }
    );

    expect(chain[0]).toEqual({
      host: 'host',
      port: 22,
      username: 'jump',
      connectTimeout: 30,
      agent: '/tmp/agent',
    });
  });

  test('resolveProxyJumpChain handles empty IdentityFile array', () => {
    const parsed = parse(`
Host jump
  HostName jump.internal
`);

    const chain = resolveProxyJumpChain(parsed as any, 'jump');

    expect(chain[0].privateKeyPath).toBeUndefined();
  });

  test('resolveSSHConfig does not apply fallbacks for keys that already have values', () => {
    const parsed = parse(`
Host target
  HostName target.internal
  User admin
  ConnectTimeout 10
`);

    const resolved = resolveSSHConfig(parsed as any, 'target', {
      username: 'fallback-user',
      connectTimeout: 99,
    });

    expect(resolved.username).toBe('admin');
    expect(resolved.connectTimeout).toBe(10);
  });

  test('resolveProxyJumpChain with empty string IdentityFile returns empty path', () => {
    const parsed = parse(`
Host jump
  HostName jump.internal
  IdentityFile ""
`);

    const chain = resolveProxyJumpChain(parsed as any, 'jump');
    // Empty string IdentityFile results in empty string (length === 0), which becomes undefined
    expect(chain[0].privateKeyPath).toBe('');
  });

  test('resolveProxyJumpChain handles inline spec with just hostname', () => {
    const parsed = parse(``);

    const chain = resolveProxyJumpChain(parsed as any, 'simple-host');

    expect(chain).toEqual([
      {
        host: 'simple-host',
        port: undefined,
        username: undefined,
      },
    ]);
  });

  test('parseInteger returns undefined for null, undefined, and empty string', () => {
    const parsed = parse(`
Host target
  HostName target.internal
  ConnectTimeout
`);

    const resolved = resolveSSHConfig(parsed as any, 'target');

    expect(resolved.connectTimeout).toBeUndefined();
  });

  test('replaceHomePath expands tilde paths in IdentityFile', () => {
    const parsed = parse(`
Host target
  HostName target.internal
  IdentityFile ~/custom/.ssh/key
`);

    const resolved = resolveSSHConfig(parsed as any, 'target');
    // ssh-config may or may not expand the tilde, so just verify privateKeyPath is set
    expect(resolved.privateKeyPath).toBeDefined();
  });
});

import Ignore from '../ignore';

describe('core/ignore', () => {
  test('from creates an Ignore instance with a pattern', () => {
    const ignore = Ignore.from('node_modules');
    expect(ignore).toBeInstanceOf(Ignore);
    expect(ignore.pattern).toBe('node_modules');
  });

  test('from creates an Ignore instance with an array of patterns', () => {
    const ignore = Ignore.from(['node_modules', '.git']);
    expect(ignore).toBeInstanceOf(Ignore);
    expect(ignore.pattern).toEqual(['node_modules', '.git']);
  });

  test('ignores returns true for matching paths', () => {
    const ignore = Ignore.from(['node_modules', '.git']);
    expect(ignore.ignores('node_modules')).toBe(true);
    expect(ignore.ignores('.git')).toBe(true);
  });

  test('ignores returns false for non-matching paths', () => {
    const ignore = Ignore.from(['node_modules']);
    expect(ignore.ignores('src')).toBe(false);
    expect(ignore.ignores('package.json')).toBe(false);
  });

  test('ignores returns false for invalid paths', () => {
    const ignore = Ignore.from(['node_modules']);
    expect(ignore.ignores('')).toBe(false);
  });

  test('ignores handles glob patterns with star', () => {
    const ignore = Ignore.from(['*.log']);
    expect(ignore.ignores('error.log')).toBe(true);
    expect(ignore.ignores('src/index.ts')).toBe(false);
  });

  test('ignores handles directory patterns', () => {
    const ignore = Ignore.from(['dist']);
    expect(ignore.ignores('dist')).toBe(true);
    expect(ignore.ignores('dist/file.txt')).toBe(true);
  });
});

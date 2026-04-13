import Trie from '../trie';

describe('Trie', () => {
  test('creates empty trie', () => {
    const trie = new Trie({});
    expect(trie.isEmpty()).toBe(true);
  });

  test('creates trie with initial data', () => {
    const trie = new Trie({ '/path/a': 'valueA' });
    expect(trie.isEmpty()).toBe(false);
    expect(trie.findPrefix('/path/a')).toBe('valueA');
  });

  test('creates trie with custom delimiter', () => {
    const trie = new Trie({}, { delimiter: '\\' });
    trie.add('\\path\\to\\file', 'fileValue');
    expect(trie.findPrefix('\\path\\to\\file')).toBe('fileValue');
  });

  describe('add', () => {
    test('adds value at path', () => {
      const trie = new Trie({});
      trie.add('/path/to/file', 'fileValue');
      expect(trie.findPrefix('/path/to/file')).toBe('fileValue');
    });

    test('adds value with array path', () => {
      const trie = new Trie({});
      trie.add(['path', 'to', 'file'], 'fileValue');
      expect(trie.findPrefix(['path', 'to', 'file'])).toBe('fileValue');
    });

    test('overwrites existing value', () => {
      const trie = new Trie({});
      trie.add('/path', 'old');
      trie.add('/path', 'new');
      expect(trie.findPrefix('/path')).toBe('new');
    });
  });

  describe('remove', () => {
    test('removes value at path', () => {
      const trie = new Trie({});
      trie.add('/path/to/file', 'value');
      expect(trie.remove('/path/to/file')).toBe(true);
      expect(trie.findPrefix('/path/to/file')).toBeNull();
    });

    test('removes value with array path', () => {
      const trie = new Trie({});
      trie.add(['path', 'to', 'file'], 'value');
      expect(trie.remove(['path', 'to', 'file'])).toBe(true);
    });

    test('returns false for non-existent path', () => {
      const trie = new Trie({});
      expect(trie.remove('/nonexistent')).toBe(false);
    });

    test('removes node with children by clearing value', () => {
      const trie = new Trie({});
      trie.add('/path', 'parent');
      trie.add('/path/child', 'child');
      expect(trie.remove('/path')).toBe(true);
      // Child should still be accessible
      expect(trie.findPrefix('/path/child')).toBe('child');
    });

    test('cleans up empty parent nodes after removal', () => {
      const trie = new Trie({});
      trie.add('/a/b/c', 'deep');
      trie.remove('/a/b/c');
      expect(trie.findPrefix('/a/b/c')).toBeNull();
      expect(trie.isEmpty()).toBe(true);
    });
  });

  describe('findPrefix', () => {
    test('finds exact match', () => {
      const trie = new Trie({});
      trie.add('/path/to/file', 'value');
      expect(trie.findPrefix('/path/to/file')).toBe('value');
    });

    test('finds closest prefix', () => {
      const trie = new Trie({});
      trie.add('/path', 'prefix');
      expect(trie.findPrefix('/path/to/file')).toBe('prefix');
    });

    test('returns null for no match', () => {
      const trie = new Trie({});
      trie.add('/other', 'value');
      expect(trie.findPrefix('/path')).toBeNull();
    });

    test('finds prefix with array path', () => {
      const trie = new Trie({});
      trie.add('/path/to', 'value');
      expect(trie.findPrefix(['path', 'to', 'file'])).toBe('value');
    });

    test('returns null when no prefix matches and root has no value', () => {
      const trie = new Trie({});
      trie.add('/other', 'value');
      expect(trie.findPrefix('/path')).toBeNull();
    });
  });

  describe('clearPrefix', () => {
    test('clears value at prefix node', () => {
      const trie = new Trie({});
      trie.add('/path/to', 'value');
      trie.clearPrefix('/path/to');
      expect(trie.findPrefix('/path/to')).toBeNull();
    });
  });

  describe('getAllValues', () => {
    test('returns all values', () => {
      const trie = new Trie({});
      trie.add('/a', 'valA');
      trie.add('/b', 'valB');
      trie.add('/c', 'valC');
      expect(trie.getAllValues().sort()).toEqual(['valA', 'valB', 'valC']);
    });

    test('returns empty array for empty trie', () => {
      const trie = new Trie({});
      expect(trie.getAllValues()).toEqual([]);
    });
  });

  describe('findValuesWithShortestBranch', () => {
    test('finds values at shortest branches', () => {
      const trie = new Trie({});
      trie.add('/a', 'shortA');
      trie.add('/a/b/c', 'deepC');
      const result = trie.findValuesWithShortestBranch();
      expect(result).toContain('shortA');
      // Deep value should not be included since shortA is on the path
      expect(result).not.toContain('deepC');
    });

    test('returns deep values when no short branch', () => {
      const trie = new Trie({});
      trie.add('/a/b/c', 'deep');
      const result = trie.findValuesWithShortestBranch();
      expect(result).toContain('deep');
    });
  });

  describe('empty', () => {
    test('empties the trie', () => {
      const trie = new Trie({ '/path': 'value' });
      trie.empty();
      expect(trie.isEmpty()).toBe(true);
    });
  });

  describe('hasChild', () => {
    test('returns true when child exists', () => {
      const trie = new Trie({});
      trie.add('/path/to/file', 'value');
      expect(trie.isEmpty()).toBe(false);
    });

    test('returns false when child does not exist', () => {
      const trie = new Trie({});
      // Empty trie - root has no children
      expect(trie.isEmpty()).toBe(true);
    });
  });

  describe('splitPath', () => {
    test('splits path with leading delimiter', () => {
      const trie = new Trie({});
      trie.add('/a/b/c', 'value');
      expect(trie.findPrefix('/a/b/c')).toBe('value');
    });

    test('splits path with trailing delimiter', () => {
      const trie = new Trie({});
      trie.add('/a/b/', 'value');
      expect(trie.findPrefix('/a/b/')).toBe('value');
    });

    test('splits path with both leading and trailing delimiter', () => {
      const trie = new Trie({});
      trie.add('/a/b/c/', 'value');
      expect(trie.findPrefix('/a/b/c/')).toBe('value');
    });
  });

  describe('remove with array path', () => {
    test('removes value at array path and cleans up parents', () => {
      const trie = new Trie({});
      trie.add(['a', 'b', 'c'], 'deep');
      expect(trie.remove(['a', 'b', 'c'])).toBe(true);
      expect(trie.findPrefix(['a', 'b', 'c'])).toBeNull();
      expect(trie.isEmpty()).toBe(true);
    });
  });

  describe('findPrefixNode edge cases', () => {
    test('finds prefix when root node is empty', () => {
      const trie = new Trie({});
      expect(trie.findPrefix('/nonexistent')).toBeNull();
    });

    test('finds the most specific prefix among multiple matches', () => {
      const trie = new Trie({});
      trie.add('/a', 'level1');
      trie.add('/a/b', 'level2');
      trie.add('/a/b/c', 'level3');
      expect(trie.findPrefix('/a/b/c/d')).toBe('level3');
    });
  });

  describe('clearPrefix with array path', () => {
    test('clears value at array path prefix', () => {
      const trie = new Trie({});
      trie.add(['a', 'b'], 'value');
      trie.clearPrefix(['a', 'b']);
      expect(trie.findPrefix(['a', 'b'])).toBeNull();
    });
  });

  describe('remove with node that has loaded children', () => {
    test('removes parent but keeps children accessible via their own paths', () => {
      const trie = new Trie({});
      trie.add('/a', 'parent');
      trie.add('/a/b', 'child');
      trie.add('/a/c', 'sibling');
      expect(trie.remove('/a')).toBe(true);
      // Parent cleared but children still exist
      expect(trie.findPrefix('/a')).toBeNull();
      expect(trie.findPrefix('/a/b')).toBe('child');
      expect(trie.findPrefix('/a/c')).toBe('sibling');
    });
  });
});
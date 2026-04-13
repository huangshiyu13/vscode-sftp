import { flatten, interpolate } from '../utils';

describe('utils', () => {
  test('flattens nested arrays into a single list', () => {
    expect(flatten([[1, 2], [], [3]])).toEqual([1, 2, 3]);
  });

  test('interpolates strings and leaves missing placeholders intact', () => {
    expect(
      interpolate('Hello ${name}, you have ${count} tasks and ${missing}.', {
        name: 'Codex',
        count: 3 as any,
      })
    ).toBe('Hello Codex, you have 3 tasks and ${missing}.');
  });
});

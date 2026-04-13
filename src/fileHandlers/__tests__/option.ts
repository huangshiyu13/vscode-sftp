// Test the option interface - it's a type-only file but we can verify the module loads
import { FileHandleOption } from '../option';

describe('fileHandlers/option', () => {
  test('FileHandleOption interface is exported', () => {
    // Type-only exports can't be tested at runtime
    // But we can verify the module is importable
    const option: FileHandleOption = { ignore: null };
    expect(option).toBeDefined();
    expect(option.ignore).toBeNull();
  });

  test('FileHandleOption with ignore function', () => {
    const option: FileHandleOption = {
      ignore: (filepath: string) => filepath.includes('node_modules'),
    };
    expect(option.ignore).toBeDefined();
    expect(option.ignore!('src/node_modules/file.ts')).toBe(true);
    expect(option.ignore!('src/index.ts')).toBe(false);
  });
});

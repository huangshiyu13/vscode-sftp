import CustomError from '../customError';

describe('core/customError', () => {
  test('creates error with code and message', () => {
    const error = new CustomError('TEST_CODE', 'test message');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(CustomError);
    expect(error.code).toBe('TEST_CODE');
    expect(error.message).toBe('test message');
  });

  test('creates error with numeric code', () => {
    const error = new CustomError(0, 'cancelled');
    expect(error.code).toBe(0);
    expect(error.message).toBe('cancelled');
  });

  test('has proper stack trace', () => {
    const error = new CustomError('ERR', 'stack test');
    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('stack test');
  });

  test('covers the captureStackTrace branch when available', () => {
    // Error.captureStackTrace exists in Node.js environments
    const originalCapture = Error.captureStackTrace;
    const captureSpy = jest.fn();
    Error.captureStackTrace = captureSpy;

    const error = new CustomError('CAPTURE', 'captured');
    expect(captureSpy).toHaveBeenCalledWith(error, CustomError);
    expect(error.code).toBe('CAPTURE');

    Error.captureStackTrace = originalCapture;
  });

  test('handles missing captureStackTrace gracefully', () => {
    const originalCapture = Error.captureStackTrace;
    (Error as any).captureStackTrace = undefined;

    const error = new CustomError('NO_CAPTURE', 'no capture');
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('NO_CAPTURE');
    expect(error.message).toBe('no capture');

    (Error as any).captureStackTrace = originalCapture;
  });
});

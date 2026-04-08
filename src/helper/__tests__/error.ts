const show = jest.fn();
const error = jest.fn();
const showErrorMessage = jest.fn();

jest.mock('../../ui/output', () => ({
  __esModule: true,
  show: (...args) => show(...args),
}));

jest.mock('../../logger', () => ({
  __esModule: true,
  default: {
    error: (...args) => error(...args),
  },
}));

jest.mock('../../host', () => ({
  __esModule: true,
  showErrorMessage: (...args) => showErrorMessage(...args),
}));

import { reportError } from '../error';

describe('helper/error', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('reports Error instances and opens the output panel when detail is requested', async () => {
    showErrorMessage.mockResolvedValue('Detail');

    reportError(new Error('boom'), 'while uploading');
    await Promise.resolve();

    expect(error).toHaveBeenCalledWith(expect.stringContaining('Error: boom'), 'while uploading');
    expect(showErrorMessage).toHaveBeenCalledWith('boom', 'Detail');
    expect(show).toHaveBeenCalledTimes(1);
  });

  test('reports string errors without opening the output panel when detail is dismissed', async () => {
    showErrorMessage.mockResolvedValue(undefined);

    reportError('plain failure', 'while downloading');
    await Promise.resolve();

    expect(error).toHaveBeenCalledWith('plain failure', 'while downloading');
    expect(showErrorMessage).toHaveBeenCalledWith('plain failure', 'Detail');
    expect(show).not.toHaveBeenCalled();
  });
});

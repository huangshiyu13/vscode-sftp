const createStatusBarItemMock = jest.fn().mockReturnValue({
  command: null,
  text: '',
  tooltip: '',
  show: jest.fn(),
});

jest.mock('vscode', () => ({
  __esModule: true,
  window: {
    createStatusBarItem: createStatusBarItemMock,
  },
  StatusBarAlignment: {
    Left: 1,
  },
}));

import StatusBarItem from '../statusBarItem';

describe('StatusBarItem', () => {
  let bar: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ doNotFake: ['performance'] });
    const item = createStatusBarItemMock();
    bar = new StatusBarItem('SFTP', 'SFTP tooltip', 'sftp.command');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('constructor initializes the status bar item', () => {
    expect(createStatusBarItemMock).toHaveBeenCalled();
    expect(bar.getText()).toBe('SFTP');
  });

  test('constructor with function name', () => {
    const fnBar = new StatusBarItem(() => 'SFTP: profile', 'tooltip', 'cmd');
    expect(fnBar.getText()).toBe('SFTP: profile');
  });

  test('updateStatus sets status and re-renders', () => {
    bar.updateStatus(StatusBarItem.Status.ok);
    expect(bar.getText()).toBe('SFTP');

    bar.updateStatus(StatusBarItem.Status.warn);
    expect(bar.getText()).toBe('$(alert) SFTP');

    bar.updateStatus(StatusBarItem.Status.error);
    expect(bar.getText()).toBe('$(issue-opened) SFTP');
  });

  test('show delegates to statusBarItem.show', () => {
    bar.show();
    expect(bar.statusBarItem.show).toHaveBeenCalled();
  });

  test('isSpinning returns false when not spinning', () => {
    expect(bar.isSpinning()).toBe(false);
  });

  test('startSpinner begins spinning and updates text', () => {
    bar.startSpinner();
    expect(bar.isSpinning()).toBe(true);
    expect(bar.getText()).toMatch(/⠋/);
  });

  test('startSpinner does not restart if already spinning', () => {
    bar.startSpinner();
    const timer1 = bar.spinnerTimer;
    bar.startSpinner();
    expect(bar.spinnerTimer).toBe(timer1);
  });

  test('stopSpinner stops and resets', () => {
    bar.startSpinner();
    expect(bar.isSpinning()).toBe(true);

    bar.stopSpinner();
    expect(bar.isSpinning()).toBe(false);
    expect(bar.getText()).toBe('SFTP');
  });

  test('spinner advances frames on interval', () => {
    bar.startSpinner();
    const initialText = bar.getText();

    jest.advanceTimersByTime(80);
    expect(bar.getText()).not.toBe(initialText);
  });

  test('showMsg with text and no timeout', () => {
    bar.showMsg('Uploading...');
    expect(bar.getText()).toBe('Uploading...');
  });

  test('showMsg with text and timeout resets after timeout', () => {
    bar.showMsg('Uploading...', 1000);
    expect(bar.getText()).toBe('Uploading...');

    jest.advanceTimersByTime(1000);
    expect(bar.getText()).toBe('SFTP');
  });

  test('showMsg with text, tooltip and timeout', () => {
    bar.showMsg('Uploading...', 'Upload progress', 2000);
    expect(bar.getText()).toBe('Uploading...');
    expect(bar.statusBarItem.tooltip).toBe('Upload progress');

    jest.advanceTimersByTime(2000);
    expect(bar.getText()).toBe('SFTP');
  });

  test('showMsg cancels previous reset timer', () => {
    bar.showMsg('First...', 1000);
    bar.showMsg('Second...', 2000);

    jest.advanceTimersByTime(1000);
    expect(bar.getText()).toBe('Second...');

    jest.advanceTimersByTime(1000);
    expect(bar.getText()).toBe('SFTP');
  });

  test('reset restores name and tooltip', () => {
    bar.showMsg('Uploading...');
    bar.reset();
    expect(bar.getText()).toBe('SFTP');
    expect(bar.statusBarItem.tooltip).toBe('SFTP tooltip');
  });

  test('showMsg with spinning spinner includes spinner frame', () => {
    bar.startSpinner();
    bar.showMsg('Uploading...');
    expect(bar.getText()).toMatch(/⠋ Uploading\.\.\./);
  });

  test('stopSpinner after showMsg resets to text correctly', () => {
    bar.showMsg('Custom');
    bar.stopSpinner();
    expect(bar.getText()).toBe('Custom');
  });

  test('updateStatus with warn after showMsg shows plain text (name !== text)', () => {
    bar.showMsg('Custom');
    bar.updateStatus(StatusBarItem.Status.warn);
    // When name !== text, status icon is not shown
    expect(bar.getText()).toBe('Custom');
  });

  test('updateStatus with warn after reset shows alert icon', () => {
    bar.showMsg('Custom');
    bar.reset();
    bar.updateStatus(StatusBarItem.Status.warn);
    // After reset, name === text, so status icon is shown
    expect(bar.getText()).toBe('$(alert) SFTP');
  });
});
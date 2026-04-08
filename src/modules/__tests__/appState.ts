import AppState from '../appState';

describe('modules/appState', () => {
  test('tracks the active profile and notifies observers only on change', () => {
    const state = new AppState();
    const observer = jest.fn();

    state.subscribe(observer);

    expect(state.profile).toBe(null);
    expect(state.getStateSnapshot()).toEqual({
      profile: null,
    });

    state.profile = 'prod';
    state.profile = 'prod';
    state.profile = 'staging';
    state.profile = null;

    expect(observer).toHaveBeenCalledTimes(3);
    expect(observer).toHaveBeenNthCalledWith(1, {
      profile: 'prod',
    });
    expect(observer).toHaveBeenNthCalledWith(2, {
      profile: 'staging',
    });
    expect(observer).toHaveBeenNthCalledWith(3, {
      profile: null,
    });
    expect(state.profile).toBe(null);
  });
});

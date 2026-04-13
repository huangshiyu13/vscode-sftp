import Scheduler from '../scheduler';

describe('core/scheduler', () => {
  test('runs tasks with concurrency 1 sequentially', async () => {
    const scheduler = new Scheduler({ concurrency: 1 });
    const results: number[] = [];

    const p1 = scheduler.add({ run: () => { results.push(1); return Promise.resolve(); } });
    scheduler.add({ run: () => { results.push(2); return Promise.resolve(); } });
    scheduler.add({ run: () => { results.push(3); return Promise.resolve(); } });

    expect(results[0]).toBe(1);

    // Wait for all tasks to complete
    await new Promise(resolve => scheduler.onIdle(resolve));

    expect(results).toEqual([1, 2, 3]);
  });

  test('throws for invalid concurrency', () => {
    expect(() => new Scheduler({ concurrency: 0 })).toThrow('Expected `concurrency`');
    expect(() => new Scheduler({ concurrency: -1 })).toThrow('Expected `concurrency`');
    expect(() => new Scheduler({ concurrency: 'abc' as any })).toThrow('Expected `concurrency`');
  });

  test('pause and start control task execution', async () => {
    const scheduler = new Scheduler({ concurrency: 1, autoStart: false });
    const results: number[] = [];

    scheduler.add({ run: () => { results.push(1); return Promise.resolve(); } });

    expect(results).toEqual([]);
    expect(scheduler.isRunning).toBe(false);

    scheduler.start();
    expect(results).toEqual([1]);

    scheduler.pause();
    expect(scheduler.isRunning).toBe(false);

    scheduler.start();
    expect(scheduler.isRunning).toBe(true);
  });

  test('start does nothing when already running', () => {
    const scheduler = new Scheduler({ concurrency: 1, autoStart: true });
    const results: number[] = [];

    scheduler.start(); // Should be a no-op
    scheduler.add({ run: () => { results.push(1); return Promise.resolve(); } });

    expect(results).toEqual([1]);
  });

  test('empty clears the queue', () => {
    const scheduler = new Scheduler({ concurrency: 1, autoStart: false });

    scheduler.add({ run: () => Promise.resolve() });
    scheduler.add({ run: () => Promise.resolve() });

    expect(scheduler.size).toBe(2);
    scheduler.empty();
    expect(scheduler.size).toBe(0);
  });

  test('emits task start and done events', async () => {
    const scheduler = new Scheduler({ concurrency: 1 });
    const startEvents: any[] = [];
    const doneEvents: any[] = [];

    scheduler.onTaskStart(task => startEvents.push(task));
    scheduler.onTaskDone((err, task) => doneEvents.push([err, task]));

    const task = { run: () => Promise.resolve('done') };
    scheduler.add(task);

    expect(startEvents).toHaveLength(1);
    expect(startEvents[0]).toBe(task);

    await new Promise(resolve => scheduler.onIdle(resolve));

    expect(doneEvents).toHaveLength(1);
    expect(doneEvents[0][0]).toBeNull();
    expect(doneEvents[0][1]).toBe(task);
  });

  test('emits error on task failure', async () => {
    const scheduler = new Scheduler({ concurrency: 1 });
    const doneEvents: any[] = [];
    scheduler.onTaskDone((err, task) => doneEvents.push([err, task]));

    const error = new Error('task failed');
    scheduler.add({ run: () => Promise.reject(error) });

    await new Promise(resolve => scheduler.onIdle(resolve));

    expect(doneEvents).toHaveLength(1);
    expect(doneEvents[0][0]).toBe(error);
  });

  test('add accepts function tasks', () => {
    const scheduler = new Scheduler({ concurrency: 1 });
    const results: number[] = [];

    scheduler.add(() => { results.push(1); });

    expect(results).toEqual([1]);
  });

  test('setConcurrency updates the concurrency', async () => {
    const scheduler = new Scheduler({ concurrency: 1 });
    const results: number[] = [];

    scheduler.add({ run: () => { results.push(1); return Promise.resolve(); } });
    scheduler.setConcurrency(3);

    expect(results).toEqual([1]);
  });

  test('pendingCount tracks running tasks', () => {
    const scheduler = new Scheduler({ concurrency: 2 });

    scheduler.add({ run: () => new Promise(() => {}) });
    scheduler.add({ run: () => new Promise(() => {}) });

    expect(scheduler.pendingCount).toBe(2);
  });

  test('idle event fires when all tasks complete', async () => {
    const scheduler = new Scheduler({ concurrency: 1, autoStart: false });
    let idleCount = 0;
    scheduler.onIdle(() => idleCount++);

    scheduler.add({ run: () => Promise.resolve() });
    scheduler.add({ run: () => Promise.resolve() });
    scheduler.start();

    await new Promise(resolve => scheduler.onIdle(resolve));

    expect(idleCount).toBe(1);
  });

  test('addAll adds multiple tasks', async () => {
    const scheduler = new Scheduler({ concurrency: 3 });
    const results: number[] = [];

    scheduler.addAll([
      { run: () => { results.push(1); return Promise.resolve(); } },
      { run: () => { results.push(2); return Promise.resolve(); } },
      { run: () => { results.push(3); return Promise.resolve(); } },
    ]);

    await new Promise(resolve => scheduler.onIdle(resolve));

    expect(results.sort()).toEqual([1, 2, 3]);
  });
});

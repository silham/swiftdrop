import {
  ATTEMPT_HEADER,
  attemptOf,
  formatDelay,
  nextDelay,
  retryQueueName,
  stringHeader,
} from './retry';

describe('backoff schedule', () => {
  const delays = [10_000, 60_000, 300_000];

  it('walks the schedule one retry at a time, then runs out', () => {
    expect([0, 1, 2, 3, 4].map((attempt) => nextDelay(delays, attempt))).toEqual([
      10_000,
      60_000,
      300_000,
      null,
      null,
    ]);
  });

  it('has no retries for an empty schedule', () => {
    expect(nextDelay([], 0)).toBeNull();
  });
});

describe('retry queue naming', () => {
  it('formats whole seconds as Ns and other delays as Nms', () => {
    expect(formatDelay(10_000)).toBe('10s');
    expect(formatDelay(300_000)).toBe('300s');
    expect(formatDelay(1500)).toBe('1500ms');
  });

  it('builds <queue>.retry.<delay>', () => {
    expect(retryQueueName('webhooks.parcel-events', 60_000)).toBe(
      'webhooks.parcel-events.retry.60s',
    );
  });
});

describe('header helpers', () => {
  it('reads the attempt, defaulting to 0 for missing or invalid values', () => {
    expect(attemptOf({ [ATTEMPT_HEADER]: 2 })).toBe(2);
    expect(attemptOf({ [ATTEMPT_HEADER]: '3' })).toBe(3);
    expect(attemptOf({})).toBe(0);
    expect(attemptOf(undefined)).toBe(0);
    expect(attemptOf({ [ATTEMPT_HEADER]: -1 })).toBe(0);
    expect(attemptOf({ [ATTEMPT_HEADER]: 'abc' })).toBe(0);
  });

  it('reads only non-empty string headers', () => {
    expect(stringHeader({ a: 'x' }, 'a')).toBe('x');
    expect(stringHeader({ a: '' }, 'a')).toBeUndefined();
    expect(stringHeader({ a: 1 }, 'a')).toBeUndefined();
  });
});

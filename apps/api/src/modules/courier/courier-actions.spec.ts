import { nextCourierActions } from './courier-actions';

describe('nextCourierActions', () => {
  it.each([
    ['CREATED', ['PICKED_UP'], false],
    ['PICKED_UP', ['IN_TRANSIT'], false],
    ['IN_TRANSIT', ['OUT_FOR_DELIVERY'], false],
    ['OUT_FOR_DELIVERY', ['FAILED'], true],
    ['DELIVERED', [], false],
  ] as const)('%s → %j (deliver: %s)', (status, statuses, canDeliver) => {
    expect(nextCourierActions(status, 1)).toEqual({ statuses, canDeliver });
  });

  it('offers a re-attempt after a failure while attempts are left', () => {
    expect(nextCourierActions('FAILED', 1)).toEqual({
      statuses: ['OUT_FOR_DELIVERY'],
      canDeliver: false,
    });
    expect(nextCourierActions('FAILED', 2).statuses).toEqual(['OUT_FOR_DELIVERY']);
  });

  it('offers nothing once the attempt cap is reached', () => {
    expect(nextCourierActions('FAILED', 3)).toEqual({ statuses: [], canDeliver: false });
  });
});

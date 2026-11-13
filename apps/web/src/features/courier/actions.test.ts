import assert from 'node:assert/strict';
import test from 'node:test';
import { planCourierActions } from './actions';

test('CREATED offers only "Mark picked up"', () => {
  assert.deepEqual(planCourierActions('CREATED', ['PICKED_UP'], false), {
    primary: { kind: 'status', to: 'PICKED_UP', label: 'Mark picked up' },
    canFail: false,
  });
});

test('IN_TRANSIT offers "Out for delivery"', () => {
  const plan = planCourierActions('IN_TRANSIT', ['OUT_FOR_DELIVERY'], false);
  assert.deepEqual(plan.primary, {
    kind: 'status',
    to: 'OUT_FOR_DELIVERY',
    label: 'Out for delivery',
  });
});

test('OUT_FOR_DELIVERY offers delivering plus reporting a problem', () => {
  assert.deepEqual(planCourierActions('OUT_FOR_DELIVERY', ['FAILED'], true), {
    primary: { kind: 'deliver' },
    canFail: true,
  });
});

test('FAILED with attempts left offers a re-attempt', () => {
  const plan = planCourierActions('FAILED', ['OUT_FOR_DELIVERY'], false);
  assert.deepEqual(plan.primary, {
    kind: 'status',
    to: 'OUT_FOR_DELIVERY',
    label: 'Re-attempt delivery',
  });
  assert.equal(plan.canFail, false);
});

test('nothing is offered when the API allows nothing', () => {
  assert.deepEqual(planCourierActions('FAILED', [], false), { primary: null, canFail: false });
  assert.deepEqual(planCourierActions('DELIVERED', [], false), { primary: null, canFail: false });
});

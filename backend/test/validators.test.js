import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureFields } from '../src/utils/validators.js';

test('ensureFields reports undefined, null and empty string fields', () => {
  const missing = ensureFields(
    {
      order_code: 'ORD-001',
      pickup_location: '',
      delivery_location: null
    },
    ['order_code', 'pickup_location', 'delivery_location', 'weight_tons']
  );

  assert.deepEqual(missing, ['pickup_location', 'delivery_location', 'weight_tons']);
});

test('ensureFields accepts zero and false as provided values', () => {
  const missing = ensureFields(
    {
      capacity_tons: 0,
      active: false
    },
    ['capacity_tons', 'active']
  );

  assert.deepEqual(missing, []);
});


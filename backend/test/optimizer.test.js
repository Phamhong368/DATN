import test from 'node:test';
import assert from 'node:assert/strict';
import { optimizeRoutes, resolveCoordinate } from '../src/utils/optimizer.js';

test('resolveCoordinate handles Vietnamese diacritics and the letter đ', () => {
  assert.deepEqual(resolveCoordinate('Đà Nẵng'), { lat: 16.0544, lng: 108.2022 });
  assert.deepEqual(resolveCoordinate('Nam Từ Liêm, Hà Nội, Việt Nam'), { lat: 21.0285, lng: 105.8542 });
  assert.deepEqual(resolveCoordinate('TP.HCM'), { lat: 10.7769, lng: 106.7009 });
});

test('optimizeRoutes assigns orders without exceeding truck capacity', () => {
  const result = optimizeRoutes({
    depot: { location: 'TP.HCM' },
    trucks: [{ id: 1, license_plate: '51C-12345', capacity_tons: 10 }],
    orders: [
      {
        id: 101,
        order_code: 'ORD-101',
        delivery_location: 'Bình Dương',
        weight_tons: 4,
        serviceMinutes: 20
      },
      {
        id: 102,
        order_code: 'ORD-102',
        delivery_location: 'Đồng Nai',
        weight_tons: 5,
        serviceMinutes: 20
      }
    ]
  });

  assert.equal(result.meta.totalRoutes, 1);
  assert.equal(result.meta.totalAssignedOrders, 2);
  assert.equal(result.meta.totalUnassignedOrders, 0);
  assert.equal(result.routes[0].totalLoadTons, 9);
  assert.ok(result.routes[0].totalLoadTons <= result.routes[0].capacityTons);
});

test('optimizeRoutes leaves overweight orders unassigned', () => {
  const result = optimizeRoutes({
    depot: { location: 'TP.HCM' },
    trucks: [{ id: 1, license_plate: '51C-12345', capacity_tons: 8 }],
    orders: [
      {
        id: 201,
        order_code: 'ORD-201',
        delivery_location: 'Hà Nội',
        weight_tons: 12,
        serviceMinutes: 20
      }
    ]
  });

  assert.equal(result.meta.totalAssignedOrders, 0);
  assert.equal(result.meta.totalUnassignedOrders, 1);
  assert.equal(result.unassignedOrders[0].orderCode, 'ORD-201');
});


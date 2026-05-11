import { performance } from 'perf_hooks';
import { optimizeRoutesWithOrTools } from '../src/utils/optimizerService.js';

const orderCount = Number(process.env.VRP_BENCHMARK_ORDERS || process.argv[2] || 1000);
const truckCount = Number(process.env.VRP_BENCHMARK_TRUCKS || process.argv[3] || 80);

function round(value, digits = 2) {
  return Number(Number(value || 0).toFixed(digits));
}

function buildOrders(count) {
  const basePoints = [
    { name: 'Hà Nội', lat: 21.0285, lng: 105.8542 },
    { name: 'Hải Phòng', lat: 20.8449, lng: 106.6881 },
    { name: 'Đà Nẵng', lat: 16.0544, lng: 108.2022 },
    { name: 'Nha Trang', lat: 12.2388, lng: 109.1967 },
    { name: 'TP.HCM', lat: 10.7769, lng: 106.7009 },
    { name: 'Cần Thơ', lat: 10.0452, lng: 105.7469 }
  ];

  return Array.from({ length: count }, (_, index) => {
    const point = basePoints[index % basePoints.length];
    const spread = ((index % 17) - 8) * 0.015;
    return {
      id: index + 1,
      order_code: `BENCH-${String(index + 1).padStart(5, '0')}`,
      customer_name: `Khách hàng ${index + 1}`,
      delivery_location: `${point.name} benchmark ${index + 1}`,
      cargo_type: 'Hàng tổng hợp',
      weight_tons: round(0.8 + (index % 9) * 0.35, 2),
      serviceMinutes: 12 + (index % 4) * 4,
      windowStart: '00:00',
      windowEnd: '72:00',
      coordinate: {
        lat: round(point.lat + spread, 7),
        lng: round(point.lng - spread, 7)
      }
    };
  });
}

function buildTrucks(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    license_plate: `BENCH-${String(index + 1).padStart(3, '0')}`,
    truck_type: index % 3 === 0 ? 'Container' : 'Thùng kín',
    capacity_tons: 20 + (index % 5) * 4,
    shiftStart: '00:00'
  }));
}

const payload = {
  depot: {
    name: 'Kho benchmark',
    location: 'TP.HCM',
    coordinate: { lat: 10.7769, lng: 106.7009 }
  },
  trucks: buildTrucks(truckCount),
  orders: buildOrders(orderCount)
};

const startedAt = performance.now();
const result = optimizeRoutesWithOrTools(payload);
const durationMs = performance.now() - startedAt;

const summary = {
  orderCount,
  truckCount,
  durationMs: round(durationMs, 2),
  durationSeconds: round(durationMs / 1000, 2),
  totalRoutes: result.meta.totalRoutes,
  totalAssignedOrders: result.meta.totalAssignedOrders,
  totalUnassignedOrders: result.meta.totalUnassignedOrders,
  totalDistanceKm: result.meta.totalDistanceKm,
  assignmentRatePercent: round((result.meta.totalAssignedOrders / Math.max(orderCount, 1)) * 100, 2),
  algorithm: result.meta.algorithm
};

console.log(JSON.stringify(summary, null, 2));

import { performance } from 'perf_hooks';
import { optimizeRoutesWithOrTools } from '../src/utils/optimizerService.js';

function round(value, digits = 2) {
  return Number(Number(value || 0).toFixed(digits));
}

function haversineDistanceKm(origin, destination) {
  const radiusKm = 6371;
  const toRad = (degrees) => (degrees * Math.PI) / 180;
  const latDelta = toRad(destination.lat - origin.lat);
  const lngDelta = toRad(destination.lng - origin.lng);
  const a =
    Math.sin(latDelta / 2) * Math.sin(latDelta / 2) +
    Math.cos(toRad(origin.lat)) * Math.cos(toRad(destination.lat)) * Math.sin(lngDelta / 2) * Math.sin(lngDelta / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return radiusKm * c;
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

function calculateFifoBaseline({ depot, trucks, orders }) {
  const remainingOrders = [...orders];
  const routes = [];
  let totalAssignedOrders = 0;
  let totalDistanceKm = 0;

  for (const truck of trucks) {
    let remainingCapacity = Number(truck.capacity_tons);
    let currentPoint = depot.coordinate;
    let routeDistanceKm = 0;
    const stops = [];

    while (remainingOrders.length) {
      const nextOrder = remainingOrders[0];
      const weight = Number(nextOrder.weight_tons);
      if (weight > remainingCapacity) {
        break;
      }

      routeDistanceKm += haversineDistanceKm(currentPoint, nextOrder.coordinate);
      currentPoint = nextOrder.coordinate;
      remainingCapacity -= weight;
      stops.push(nextOrder);
      remainingOrders.shift();
    }

    if (stops.length) {
      routeDistanceKm += haversineDistanceKm(currentPoint, depot.coordinate);
      totalDistanceKm += routeDistanceKm;
      totalAssignedOrders += stops.length;
      routes.push({
        truckId: truck.id,
        totalStops: stops.length,
        totalDistanceKm: round(routeDistanceKm, 1)
      });
    }
  }

  return {
    totalRoutes: routes.length,
    totalAssignedOrders,
    totalUnassignedOrders: remainingOrders.length,
    totalDistanceKm: round(totalDistanceKm, 1)
  };
}

function runScenario(orderCount, truckCount) {
  const payload = {
    depot: {
      name: 'Kho benchmark',
      location: 'TP.HCM',
      coordinate: { lat: 10.7769, lng: 106.7009 }
    },
    trucks: buildTrucks(truckCount),
    orders: buildOrders(orderCount)
  };

  const baseline = calculateFifoBaseline(payload);
  const startedAt = performance.now();
  const optimized = optimizeRoutesWithOrTools(payload);
  const durationMs = performance.now() - startedAt;
  const optimizedDistanceKm = Number(optimized.meta.totalDistanceKm);
  const savedKm = baseline.totalDistanceKm - optimizedDistanceKm;

  return {
    orderCount,
    truckCount,
    baselineDistanceKm: baseline.totalDistanceKm,
    optimizedDistanceKm,
    savedKm: round(savedKm, 1),
    reductionPercent: round((savedKm / Math.max(baseline.totalDistanceKm, 1)) * 100, 2),
    durationSeconds: round(durationMs / 1000, 2),
    baselineAssignedOrders: baseline.totalAssignedOrders,
    optimizedAssignedOrders: optimized.meta.totalAssignedOrders,
    optimizedUnassignedOrders: optimized.meta.totalUnassignedOrders
  };
}

const scenarios = [
  [20, 5],
  [100, 20],
  [1000, 80]
];

console.log(JSON.stringify(scenarios.map(([orders, trucks]) => runScenario(orders, trucks)), null, 2));

const CITY_COORDINATES = {
  'ha noi': { lat: 21.0285, lng: 105.8542 },
  'hai phong': { lat: 20.8449, lng: 106.6881 },
  'bac ninh': { lat: 21.1861, lng: 106.0763 },
  'thanh hoa': { lat: 19.8067, lng: 105.7852 },
  'nghe an': { lat: 18.6796, lng: 105.6813 },
  hue: { lat: 16.4637, lng: 107.5909 },
  'da nang': { lat: 16.0544, lng: 108.2022 },
  'quang ngai': { lat: 15.1214, lng: 108.8044 },
  'nha trang': { lat: 12.2388, lng: 109.1967 },
  'khanh hoa': { lat: 12.2585, lng: 109.0526 },
  'lam dong': { lat: 11.9404, lng: 108.4583 },
  'dong nai': { lat: 10.9574, lng: 106.8426 },
  'binh duong': { lat: 11.3254, lng: 106.477 },
  'vung tau': { lat: 10.4114, lng: 107.1362 },
  'thu duc': { lat: 10.8491, lng: 106.7537 },
  'tp.hcm': { lat: 10.7769, lng: 106.7009 },
  'tp. hcm': { lat: 10.7769, lng: 106.7009 },
  'ho chi minh': { lat: 10.7769, lng: 106.7009 },
  'hcm': { lat: 10.7769, lng: 106.7009 },
  'long an': { lat: 10.6956, lng: 106.2431 },
  'can tho': { lat: 10.0452, lng: 105.7469 }
};

function normalizeLocation(input) {
  return String(input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9.\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function resolveCoordinate(location) {
  const normalized = normalizeLocation(location);
  if (!normalized) {
    return null;
  }

  for (const [key, value] of Object.entries(CITY_COORDINATES)) {
    if (normalized.includes(key)) {
      return value;
    }
  }

  return null;
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

function distanceToMinutes(distanceKm) {
  const averageSpeedKmPerHour = 48;
  return Math.round((distanceKm / averageSpeedKmPerHour) * 60);
}

function parseTimeWindow(value, fallbackMinutes) {
  if (!value) {
    return fallbackMinutes;
  }

  if (typeof value === 'number') {
    return value;
  }

  const [hours, minutes] = String(value).split(':').map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return fallbackMinutes;
  }

  return hours * 60 + minutes;
}

function buildNode(order) {
  const coordinate = resolveCoordinate(order.delivery_location || order.location || order.address);
  return {
    ...order,
    coordinate,
    serviceMinutes: Number(order.serviceMinutes || 20),
    windowStartMinutes: parseTimeWindow(order.windowStart, 0),
    windowEndMinutes: parseTimeWindow(order.windowEnd, 24 * 60)
  };
}

function calculateDistance(originNode, destinationNode) {
  if (!originNode.coordinate || !destinationNode.coordinate) {
    return null;
  }
  const distanceKm = haversineDistanceKm(originNode.coordinate, destinationNode.coordinate);
  return {
    distanceKm,
    durationMinutes: distanceToMinutes(distanceKm)
  };
}

function formatClock(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60)
    .toString()
    .padStart(2, '0');
  const minutes = Math.floor(totalMinutes % 60)
    .toString()
    .padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function optimizeRoutes({ depot, trucks, orders }) {
  const depotNode = {
    id: 'depot',
    label: depot?.name || depot?.location || 'Kho trung tâm',
    coordinate: resolveCoordinate(depot?.location || depot?.name)
  };

  if (!depotNode.coordinate) {
    throw new Error('Không xác định được tọa độ kho. Hãy nhập địa điểm phổ biến như Hà Nội, Đà Nẵng, TP.HCM.');
  }

  const preparedOrders = orders.map(buildNode);
  const invalidOrders = preparedOrders.filter((order) => !order.coordinate);
  if (invalidOrders.length) {
    throw new Error(`Không xác định được tọa độ cho điểm giao: ${invalidOrders.map((order) => order.delivery_location).join(', ')}`);
  }

  const remainingOrders = [...preparedOrders].sort((left, right) => right.weight_tons - left.weight_tons);
  const routes = [];
  const unassignedOrders = [];

  for (const truck of trucks) {
    const route = {
      truckId: truck.id,
      truckLabel: truck.license_plate || truck.name || `Xe ${truck.id}`,
      capacityTons: Number(truck.capacity_tons),
      stops: [],
      totalDistanceKm: 0,
      totalDurationMinutes: 0,
      totalLoadTons: 0
    };

    let currentNode = depotNode;
    let currentClock = parseTimeWindow(truck.shiftStart, 7 * 60);
    let remainingCapacity = Number(truck.capacity_tons);

    while (true) {
      let bestCandidateIndex = -1;
      let bestCandidateScore = Number.POSITIVE_INFINITY;
      let bestCandidateMetrics = null;

      for (let index = 0; index < remainingOrders.length; index += 1) {
        const order = remainingOrders[index];
        const weight = Number(order.weight_tons);
        if (weight > remainingCapacity) {
          continue;
        }

        const metrics = calculateDistance(currentNode, order);
        if (!metrics) {
          continue;
        }

        const arrivalMinutes = currentClock + metrics.durationMinutes;
        const serviceStart = Math.max(arrivalMinutes, order.windowStartMinutes);
        if (serviceStart > order.windowEndMinutes) {
          continue;
        }

        const score = metrics.distanceKm + Math.max(0, order.windowStartMinutes - arrivalMinutes) * 0.15;
        if (score < bestCandidateScore) {
          bestCandidateScore = score;
          bestCandidateIndex = index;
          bestCandidateMetrics = {
            ...metrics,
            arrivalMinutes,
            serviceStart,
            departureMinutes: serviceStart + order.serviceMinutes
          };
        }
      }

      if (bestCandidateIndex === -1) {
        break;
      }

      const [selectedOrder] = remainingOrders.splice(bestCandidateIndex, 1);
      route.stops.push({
        orderId: selectedOrder.id,
        orderCode: selectedOrder.order_code,
        customerName: selectedOrder.customer_name,
        destination: selectedOrder.delivery_location,
        cargoType: selectedOrder.cargo_type,
        weightTons: Number(selectedOrder.weight_tons),
        distanceFromPreviousKm: Number(bestCandidateMetrics.distanceKm.toFixed(1)),
        durationFromPreviousMinutes: bestCandidateMetrics.durationMinutes,
        arrivalTime: formatClock(bestCandidateMetrics.arrivalMinutes),
        serviceStartTime: formatClock(bestCandidateMetrics.serviceStart),
        departureTime: formatClock(bestCandidateMetrics.departureMinutes),
        windowLabel: `${formatClock(selectedOrder.windowStartMinutes)} - ${formatClock(selectedOrder.windowEndMinutes)}`
      });

      route.totalDistanceKm += bestCandidateMetrics.distanceKm;
      route.totalDurationMinutes = bestCandidateMetrics.departureMinutes - parseTimeWindow(truck.shiftStart, 7 * 60);
      route.totalLoadTons += Number(selectedOrder.weight_tons);
      remainingCapacity -= Number(selectedOrder.weight_tons);
      currentClock = bestCandidateMetrics.departureMinutes;
      currentNode = selectedOrder;
    }

    if (route.stops.length) {
      const returnMetrics = calculateDistance(currentNode, depotNode);
      if (returnMetrics) {
        route.returnToDepot = {
          distanceKm: Number(returnMetrics.distanceKm.toFixed(1)),
          durationMinutes: returnMetrics.durationMinutes
        };
        route.totalDistanceKm += returnMetrics.distanceKm;
        route.totalDurationMinutes += returnMetrics.durationMinutes;
      }

      route.totalDistanceKm = Number(route.totalDistanceKm.toFixed(1));
      route.totalDurationMinutes = Math.round(route.totalDurationMinutes);
      route.utilizationPercent = Math.round((route.totalLoadTons / route.capacityTons) * 100);
      routes.push(route);
    }
  }

  if (remainingOrders.length) {
    unassignedOrders.push(
      ...remainingOrders.map((order) => ({
        orderId: order.id,
        orderCode: order.order_code,
        destination: order.delivery_location,
        weightTons: Number(order.weight_tons),
        reason: 'Không còn xe phù hợp về tải trọng hoặc khung giờ giao hàng.'
      }))
    );
  }

  return {
    meta: {
      algorithm: 'VRP heuristic với ràng buộc tải trọng và time window cơ bản',
      totalRoutes: routes.length,
      totalAssignedOrders: routes.reduce((sum, route) => sum + route.stops.length, 0),
      totalUnassignedOrders: unassignedOrders.length,
      totalDistanceKm: Number(routes.reduce((sum, route) => sum + route.totalDistanceKm, 0).toFixed(1))
    },
    routes,
    unassignedOrders
  };
}

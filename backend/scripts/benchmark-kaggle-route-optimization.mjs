import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';

const defaultDataDir = '/Users/phamhong/Downloads/archive';
const dataDir = process.env.KAGGLE_ROUTE_DATA_DIR || process.argv[2] || defaultDataDir;
const ordersFile = path.join(dataDir, process.env.KAGGLE_ROUTE_ORDERS_FILE || 'order_large.csv');
const distanceFile = path.join(dataDir, 'distance.csv');

const truckTypes = [
  { type: '16.5', areaCapacityM2: 16.1 * 2.5, weightCapacityKg: 10000, costPerKm: 3, speedKmph: 40 },
  { type: '12.5', areaCapacityM2: 12.1 * 2.5, weightCapacityKg: 5000, costPerKm: 2, speedKmph: 40 },
  { type: '9.6', areaCapacityM2: 9.1 * 2.3, weightCapacityKg: 2000, costPerKm: 1, speedKmph: 40 }
];

function round(value, digits = 2) {
  return Number(Number(value || 0).toFixed(digits));
}

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let insideQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      insideQuotes = !insideQuotes;
      continue;
    }
    if (character === ',' && !insideQuotes) {
      result.push(current);
      current = '';
      continue;
    }
    current += character;
  }
  result.push(current);
  return result;
}

function readCsv(filePath) {
  const [headerLine, ...lines] = fs.readFileSync(filePath, 'utf8').trim().split(/\r?\n/);
  const headers = parseCsvLine(headerLine);
  return lines
    .filter(Boolean)
    .map((line) => {
      const values = parseCsvLine(line);
      return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
    });
}

function readDistances(filePath) {
  const distances = new Map();
  const rows = readCsv(filePath);

  for (const row of rows) {
    const source = row.Source;
    const destination = row.Destination;
    const distanceKm = Number(row['Distance(M)'] || 0) / 1000;
    distances.set(`${source}|${destination}`, distanceKm);
    distances.set(`${destination}|${source}`, distanceKm);
  }

  return distances;
}

function getDistanceKm(distances, source, destination) {
  if (source === destination) {
    return 0;
  }
  return distances.get(`${source}|${destination}`) ?? Number.POSITIVE_INFINITY;
}

function normalizeOrder(row, index) {
  return {
    id: index + 1,
    orderId: row.Order_ID,
    materialId: row.Material_ID,
    itemId: row.Item_ID,
    source: row.Source,
    destination: row.Destination,
    availableTime: row.Available_Time,
    deadline: row.Deadline,
    dangerType: row.Danger_Type,
    areaM2: Number(row.Area || 0) / 10000,
    weightKg: Number(row.Weight || 0) / 10000
  };
}

function chooseSmallestTruck(order) {
  return [...truckTypes]
    .reverse()
    .find((truck) => order.weightKg <= truck.weightCapacityKg && order.areaM2 <= truck.areaCapacityM2);
}

function chooseTruckForLoad(weightKg, areaM2) {
  return [...truckTypes]
    .reverse()
    .find((truck) => weightKg <= truck.weightCapacityKg && areaM2 <= truck.areaCapacityM2);
}

function calculateRouteDistanceKm(distances, source, stops) {
  let current = source;
  let total = 0;
  for (const stop of stops) {
    const distance = getDistanceKm(distances, current, stop.destination);
    if (!Number.isFinite(distance)) {
      return Number.POSITIVE_INFINITY;
    }
    total += distance;
    current = stop.destination;
  }
  return total;
}

function calculateRouteCost(distances, source, stops, truck) {
  return calculateRouteDistanceKm(distances, source, stops) * truck.costPerKm;
}

function buildOneItemBaseline(orders, distances) {
  const routes = [];
  const unassigned = [];

  for (const order of orders) {
    const truck = chooseSmallestTruck(order);
    const distanceKm = getDistanceKm(distances, order.source, order.destination);
    if (!truck || !Number.isFinite(distanceKm)) {
      unassigned.push(order);
      continue;
    }
    routes.push({
      source: order.source,
      stops: [order],
      truck,
      distanceKm,
      cost: distanceKm * truck.costPerKm
    });
  }

  return summarize(routes, unassigned);
}

function buildFifoPackingBaseline(orders, distances) {
  return buildPackedRoutes(orders, distances, false);
}

function buildNearestNeighborRoutes(orders, distances) {
  return buildPackedRoutes(orders, distances, true);
}

function buildPackedRoutes(orders, distances, nearestNeighbor) {
  const remainingBySource = new Map();
  const unassigned = [];

  for (const order of orders) {
    if (!chooseSmallestTruck(order) || !Number.isFinite(getDistanceKm(distances, order.source, order.destination))) {
      unassigned.push(order);
      continue;
    }
    const key = order.source;
    remainingBySource.set(key, [...(remainingBySource.get(key) || []), order]);
  }

  const routes = [];

  for (const [source, sourceOrders] of remainingBySource.entries()) {
    const remaining = [...sourceOrders].sort((left, right) =>
      left.availableTime.localeCompare(right.availableTime) || left.deadline.localeCompare(right.deadline)
    );

    while (remaining.length) {
      const seed = remaining.shift();
      const routeStops = [seed];
      let loadWeight = seed.weightKg;
      let loadArea = seed.areaM2;
      let currentCity = seed.destination;
      let routeTruck = chooseTruckForLoad(loadWeight, loadArea);

      while (routeTruck) {
        let bestIndex = -1;
        let bestScore = Number.POSITIVE_INFINITY;

        for (let index = 0; index < remaining.length; index += 1) {
          const candidate = remaining[index];
          const nextTruck = chooseTruckForLoad(loadWeight + candidate.weightKg, loadArea + candidate.areaM2);
          if (!nextTruck) {
            continue;
          }

          const distance = nearestNeighbor ? getDistanceKm(distances, currentCity, candidate.destination) : index;
          if (Number.isFinite(distance) && distance < bestScore) {
            bestScore = distance;
            bestIndex = index;
          }
        }

        if (bestIndex === -1) {
          break;
        }

        const [candidate] = remaining.splice(bestIndex, 1);
        routeStops.push(candidate);
        loadWeight += candidate.weightKg;
        loadArea += candidate.areaM2;
        currentCity = candidate.destination;
        routeTruck = chooseTruckForLoad(loadWeight, loadArea);
      }

      const truck = chooseTruckForLoad(loadWeight, loadArea);
      const distanceKm = calculateRouteDistanceKm(distances, source, routeStops);
      if (!truck || !Number.isFinite(distanceKm)) {
        unassigned.push(...routeStops);
        continue;
      }

      routes.push({
        source,
        stops: routeStops,
        truck,
        distanceKm,
        cost: distanceKm * truck.costPerKm,
        loadWeightKg: loadWeight,
        loadAreaM2: loadArea
      });
    }
  }

  return summarize(routes, unassigned);
}

function summarize(routes, unassigned) {
  const assignedItems = routes.reduce((sum, route) => sum + route.stops.length, 0);
  const totalDistanceKm = routes.reduce((sum, route) => sum + route.distanceKm, 0);
  const totalCost = routes.reduce((sum, route) => sum + route.cost, 0);
  const averageStopsPerRoute = routes.length ? assignedItems / routes.length : 0;
  const averageUtilizationPercent = routes.length
    ? routes.reduce((sum, route) => sum + (route.loadWeightKg || route.stops[0].weightKg) / route.truck.weightCapacityKg, 0) /
      routes.length *
      100
    : 0;

  return {
    routes: routes.length,
    assignedItems,
    unassignedItems: unassigned.length,
    totalDistanceKm: round(totalDistanceKm, 1),
    totalCost: round(totalCost, 1),
    averageStopsPerRoute: round(averageStopsPerRoute, 2),
    averageWeightUtilizationPercent: round(averageUtilizationPercent, 2)
  };
}

function improvement(from, to) {
  return {
    savedDistanceKm: round(from.totalDistanceKm - to.totalDistanceKm, 1),
    distanceReductionPercent: round(((from.totalDistanceKm - to.totalDistanceKm) / Math.max(from.totalDistanceKm, 1)) * 100, 2),
    savedCost: round(from.totalCost - to.totalCost, 1),
    costReductionPercent: round(((from.totalCost - to.totalCost) / Math.max(from.totalCost, 1)) * 100, 2)
  };
}

const startedAt = performance.now();
const orders = readCsv(ordersFile).map(normalizeOrder);
const distances = readDistances(distanceFile);
const oneItemBaseline = buildOneItemBaseline(orders, distances);
const fifoPackingBaseline = buildFifoPackingBaseline(orders, distances);
const nearestNeighbor = buildNearestNeighborRoutes(orders, distances);
const durationMs = performance.now() - startedAt;

const cityCount = new Set(orders.flatMap((order) => [order.source, order.destination])).size;
const summary = {
  source: 'Kaggle: mexwell/large-scale-route-optimization',
  files: {
    ordersFile,
    distanceFile
  },
  input: {
    itemCount: orders.length,
    cityCount,
    distancePairs: distances.size / 2,
    truckTypes: truckTypes.length
  },
  oneItemBaseline,
  fifoPackingBaseline,
  nearestNeighbor,
  improvementVsOneItem: improvement(oneItemBaseline, nearestNeighbor),
  improvementVsFifoPacking: improvement(fifoPackingBaseline, nearestNeighbor),
  durationSeconds: round(durationMs / 1000, 2)
};

console.log(JSON.stringify(summary, null, 2));

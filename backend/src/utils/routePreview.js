const TRAVEL_MODE_SPEEDS = {
  DRIVING: 48,
  BICYCLING: 16,
  WALKING: 5,
  TRANSIT: 32
};

const MAPBOX_PROFILES = {
  DRIVING: 'driving',
  BICYCLING: 'cycling',
  WALKING: 'walking',
  TRANSIT: 'driving'
};

function getMapboxAccessToken() {
  return process.env.MAPBOX_ACCESS_TOKEN || process.env.VITE_MAPBOX_ACCESS_TOKEN || '';
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

function durationFromDistanceKm(distanceKm, travelMode) {
  const speedKmh = TRAVEL_MODE_SPEEDS[travelMode] || TRAVEL_MODE_SPEEDS.DRIVING;
  return Math.max(1, Math.round((distanceKm / speedKmh) * 60));
}

function formatDistance(distanceKm) {
  return `${distanceKm.toFixed(1)} km`;
}

function formatDuration(durationMinutes) {
  if (durationMinutes < 60) {
    return `${durationMinutes} phút`;
  }

  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;
  return minutes ? `${hours} giờ ${minutes} phút` : `${hours} giờ`;
}

function buildFallbackRoutePreview({ origin, destination, waypoints = [], travelMode = 'DRIVING' }) {
  const nodes = [origin, ...waypoints, destination];
  const legs = [];
  let totalDistanceKm = 0;
  let totalDurationMinutes = 0;

  for (let index = 0; index < nodes.length - 1; index += 1) {
    const startNode = nodes[index];
    const endNode = nodes[index + 1];
    const distanceKm = haversineDistanceKm(startNode.coordinate, endNode.coordinate);
    const durationMinutes = durationFromDistanceKm(distanceKm, travelMode);

    totalDistanceKm += distanceKm;
    totalDurationMinutes += durationMinutes;

    legs.push({
      segmentNo: index + 1,
      startAddress: startNode.address,
      endAddress: endNode.address,
      distanceKm: Number(distanceKm.toFixed(1)),
      durationMinutes,
      distanceText: formatDistance(distanceKm),
      durationText: formatDuration(durationMinutes),
      startCoordinate: startNode.coordinate,
      endCoordinate: endNode.coordinate
    });
  }

  return {
    startAddress: origin.address,
    endAddress: destination.address,
    travelMode,
    distanceKm: Number(totalDistanceKm.toFixed(1)),
    durationMinutes: totalDurationMinutes,
    distanceText: formatDistance(totalDistanceKm),
    durationText: formatDuration(totalDurationMinutes),
    stops: nodes.map((node) => ({
      address: node.address,
      coordinate: node.coordinate
    })),
    path: nodes.map((node) => node.coordinate),
    legs
  };
}

async function buildMapboxRoutePreview({ origin, destination, waypoints = [], travelMode = 'DRIVING' }) {
  const accessToken = getMapboxAccessToken();
  if (!accessToken) {
    throw new Error('Thiếu MAPBOX_ACCESS_TOKEN trên backend.');
  }

  const nodes = [origin, ...waypoints, destination];
  const profile = MAPBOX_PROFILES[travelMode] || MAPBOX_PROFILES.DRIVING;
  const coordinates = nodes.map((node) => `${node.coordinate.lng},${node.coordinate.lat}`).join(';');
  const url = new URL(`https://api.mapbox.com/directions/v5/mapbox/${profile}/${coordinates}`);
  url.searchParams.set('access_token', accessToken);
  url.searchParams.set('geometries', 'geojson');
  url.searchParams.set('overview', 'full');
  url.searchParams.set('steps', 'false');

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Mapbox Directions API trả về HTTP ${response.status}.`);
  }

  const payload = await response.json();
  const route = payload.routes?.[0];
  if (!route) {
    throw new Error('Mapbox không tìm thấy tuyến đường phù hợp.');
  }

  const totalDistanceKm = Number((route.distance / 1000).toFixed(1));
  const totalDurationMinutes = Math.max(1, Math.round(route.duration / 60));
  const path = (route.geometry?.coordinates || []).map(([lng, lat]) => ({ lat, lng }));
  const legs = (route.legs || []).map((leg, index) => ({
    segmentNo: index + 1,
    startAddress: nodes[index].address,
    endAddress: nodes[index + 1].address,
    distanceKm: Number((leg.distance / 1000).toFixed(1)),
    durationMinutes: Math.max(1, Math.round(leg.duration / 60)),
    distanceText: formatDistance(leg.distance / 1000),
    durationText: formatDuration(Math.max(1, Math.round(leg.duration / 60))),
    startCoordinate: nodes[index].coordinate,
    endCoordinate: nodes[index + 1].coordinate
  }));

  return {
    startAddress: origin.address,
    endAddress: destination.address,
    travelMode,
    distanceKm: totalDistanceKm,
    durationMinutes: totalDurationMinutes,
    distanceText: formatDistance(totalDistanceKm),
    durationText: formatDuration(totalDurationMinutes),
    stops: nodes.map((node) => ({
      address: node.address,
      coordinate: node.coordinate
    })),
    path,
    legs
  };
}

export async function buildRoutePreview({ origin, destination, waypoints = [], travelMode = 'DRIVING' }) {
  try {
    return await buildMapboxRoutePreview({ origin, destination, waypoints, travelMode });
  } catch {
    return buildFallbackRoutePreview({ origin, destination, waypoints, travelMode });
  }
}

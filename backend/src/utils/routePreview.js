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

function getGoogleMapsApiKey() {
  return process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY || '';
}

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

function decodeGooglePolyline(encoded) {
  if (!encoded) {
    return [];
  }

  const coordinates = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte = null;

    do {
      byte = encoded.charCodeAt(index) - 63;
      index += 1;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;

    do {
      byte = encoded.charCodeAt(index) - 63;
      index += 1;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    lng += result & 1 ? ~(result >> 1) : result >> 1;
    coordinates.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }

  return coordinates;
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

async function buildGoogleRoutePreview({ origin, destination, waypoints = [], travelMode = 'DRIVING' }) {
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) {
    throw new Error('Thiếu GOOGLE_MAPS_API_KEY trên backend.');
  }

  const url = new URL('https://maps.googleapis.com/maps/api/directions/json');
  url.searchParams.set('origin', `${origin.coordinate.lat},${origin.coordinate.lng}`);
  url.searchParams.set('destination', `${destination.coordinate.lat},${destination.coordinate.lng}`);
  url.searchParams.set('mode', String(travelMode || 'DRIVING').toLowerCase());
  url.searchParams.set('language', 'vi');
  url.searchParams.set('region', 'vn');
  url.searchParams.set('key', apiKey);

  if (waypoints.length) {
    url.searchParams.set(
      'waypoints',
      waypoints.map((stop) => `${stop.coordinate.lat},${stop.coordinate.lng}`).join('|')
    );
  }

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Google Directions API trả về HTTP ${response.status}.`);
  }

  const payload = await response.json();
  if (payload.status !== 'OK' || !payload.routes?.length) {
    const details = payload.error_message ? ` ${payload.error_message}` : '';
    throw new Error(`Google Directions thất bại với trạng thái ${payload.status}.${details}`.trim());
  }

  const nodes = [origin, ...waypoints, destination];
  const route = payload.routes[0];
  const legs = (route.legs || []).map((leg, index) => ({
    segmentNo: index + 1,
    startAddress: leg.start_address || nodes[index]?.address || '',
    endAddress: leg.end_address || nodes[index + 1]?.address || '',
    distanceKm: Number(((leg.distance?.value || 0) / 1000).toFixed(1)),
    durationMinutes: Math.max(1, Math.round((leg.duration?.value || 0) / 60)),
    distanceText: leg.distance?.text || formatDistance((leg.distance?.value || 0) / 1000),
    durationText: leg.duration?.text || formatDuration(Math.max(1, Math.round((leg.duration?.value || 0) / 60))),
    startCoordinate: nodes[index]?.coordinate,
    endCoordinate: nodes[index + 1]?.coordinate
  }));

  const totalDistanceKm = Number(((legs.reduce((sum, leg) => sum + leg.distanceKm, 0)) || 0).toFixed(1));
  const totalDurationMinutes = legs.reduce((sum, leg) => sum + leg.durationMinutes, 0);

  return {
    startAddress: route.legs?.[0]?.start_address || origin.address,
    endAddress: route.legs?.[route.legs.length - 1]?.end_address || destination.address,
    travelMode,
    distanceKm: totalDistanceKm,
    durationMinutes: totalDurationMinutes,
    distanceText: formatDistance(totalDistanceKm),
    durationText: formatDuration(totalDurationMinutes),
    stops: nodes.map((node) => ({
      address: node.address,
      coordinate: node.coordinate
    })),
    path: decodeGooglePolyline(route.overview_polyline?.points),
    legs
  };
}

export async function buildRoutePreview({ origin, destination, waypoints = [], travelMode = 'DRIVING' }) {
  try {
    return await buildGoogleRoutePreview({ origin, destination, waypoints, travelMode });
  } catch {
    try {
      return await buildMapboxRoutePreview({ origin, destination, waypoints, travelMode });
    } catch {
      return buildFallbackRoutePreview({ origin, destination, waypoints, travelMode });
    }
  }
}

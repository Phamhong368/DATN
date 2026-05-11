import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveCoordinate } from './optimizer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.resolve(__dirname, '../../.env')
});

const geocodeCache = new Map();

function getGoogleMapsApiKey() {
  return process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY || '';
}

function getMapboxAccessToken() {
  return process.env.MAPBOX_ACCESS_TOKEN || process.env.VITE_MAPBOX_ACCESS_TOKEN || '';
}

function normalizeAddress(address) {
  return String(address || '').trim();
}

function getCacheKey(address) {
  return normalizeAddress(address).toLowerCase();
}

export function hasGeocodingEnabled() {
  return Boolean(getGoogleMapsApiKey() || getMapboxAccessToken());
}

async function geocodeWithGoogle(normalizedAddress) {
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) {
    throw new Error('Thiếu GOOGLE_MAPS_API_KEY trên backend.');
  }

  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', normalizedAddress);
  url.searchParams.set('key', apiKey);

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Google Geocoding API trả về HTTP ${response.status}.`);
  }

  const payload = await response.json();
  if (payload.status !== 'OK' || !payload.results?.length) {
    const details = payload.error_message ? ` ${payload.error_message}` : '';
    throw new Error(`Geocode thất bại cho "${normalizedAddress}" với trạng thái ${payload.status}.${details}`.trim());
  }

  const [firstResult] = payload.results;
  return {
    address: firstResult.formatted_address || normalizedAddress,
    coordinate: {
      lat: Number(firstResult.geometry.location.lat),
      lng: Number(firstResult.geometry.location.lng)
    }
  };
}

async function geocodeWithMapbox(normalizedAddress) {
  const accessToken = getMapboxAccessToken();
  if (!accessToken) {
    throw new Error('Thiếu MAPBOX_ACCESS_TOKEN trên backend.');
  }

  const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(normalizedAddress)}.json`);
  url.searchParams.set('access_token', accessToken);
  url.searchParams.set('limit', '1');
  url.searchParams.set('country', 'vn');
  url.searchParams.set('language', 'vi');

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Mapbox Geocoding API trả về HTTP ${response.status}.`);
  }

  const payload = await response.json();
  const [feature] = payload.features || [];
  if (!feature?.center) {
    throw new Error(`Mapbox không tìm thấy tọa độ cho "${normalizedAddress}".`);
  }

  return {
    address: feature.place_name || normalizedAddress,
    coordinate: {
      lng: Number(feature.center[0]),
      lat: Number(feature.center[1])
    }
  };
}

export async function reverseGeocodeCoordinate({ lat, lng }) {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error('Tọa độ không hợp lệ.');
  }

  const accessToken = getMapboxAccessToken();
  if (!accessToken) {
    return {
      address: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
      coordinate: { lat: latitude, lng: longitude }
    };
  }

  const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json`);
  url.searchParams.set('access_token', accessToken);
  url.searchParams.set('limit', '1');
  url.searchParams.set('language', 'vi');

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Mapbox Reverse Geocoding API trả về HTTP ${response.status}.`);
  }

  const payload = await response.json();
  const [feature] = payload.features || [];
  return {
    address: feature?.place_name || `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
    coordinate: { lat: latitude, lng: longitude }
  };
}

export async function geocodeAddress(address) {
  const normalizedAddress = normalizeAddress(address);
  if (!normalizedAddress) {
    throw new Error('Địa chỉ trống, không thể geocode.');
  }

  const cacheKey = getCacheKey(normalizedAddress);
  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey);
  }

  let result = null;
  try {
    result = await geocodeWithGoogle(normalizedAddress);
  } catch {
    result = await geocodeWithMapbox(normalizedAddress);
  }

  geocodeCache.set(cacheKey, result.coordinate);
  return result.coordinate;
}

export async function resolveAddressCoordinate(address) {
  const normalizedAddress = normalizeAddress(address);
  if (!normalizedAddress) {
    throw new Error('Địa chỉ trống, không thể xác định tọa độ.');
  }

  try {
    if (hasGeocodingEnabled()) {
      return await geocodeAddress(normalizedAddress);
    }
  } catch {
    // Fallback to internal coordinates below when Google geocoding is unavailable.
  }

  const fallbackCoordinate = resolveCoordinate(normalizedAddress);
  if (fallbackCoordinate) {
    return fallbackCoordinate;
  }

  throw new Error(`Không xác định được tọa độ cho địa chỉ "${normalizedAddress}".`);
}

export async function attachCoordinatesToOptimizationInput({ depot, orders }) {
  const depotCoordinate = await resolveAddressCoordinate(depot.location || depot.name);
  const enrichedOrders = await Promise.all(
    orders.map(async (order) => ({
      ...order,
      coordinate: await resolveAddressCoordinate(order.delivery_location || order.location || order.address)
    }))
  );

  return {
    depot: {
      ...depot,
      coordinate: depotCoordinate
    },
    orders: enrichedOrders
  };
}

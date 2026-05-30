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
const geminiRewriteCache = new Map();
const VIETNAM_ADMIN_ALIASES = new Map([
  ['ha noi', 'Thành phố Hà Nội, Việt Nam'],
  ['hai phong', 'Thành phố Hải Phòng, Việt Nam'],
  ['da nang', 'Thành phố Đà Nẵng, Việt Nam'],
  ['hue', 'Thành phố Huế, Việt Nam'],
  ['quang ngai', 'Tỉnh Quảng Ngãi, Việt Nam'],
  ['quang nam', 'Tỉnh Quảng Nam, Việt Nam'],
  ['nghe an', 'Tỉnh Nghệ An, Việt Nam'],
  ['ha tinh', 'Tỉnh Hà Tĩnh, Việt Nam'],
  ['long an', 'Tỉnh Long An, Việt Nam'],
  ['quang ninh', 'Tỉnh Quảng Ninh, Việt Nam'],
  ['thai binh', 'Tỉnh Thái Bình, Việt Nam'],
  ['hung yen', 'Tỉnh Hưng Yên, Việt Nam'],
  ['bac ninh', 'Tỉnh Bắc Ninh, Việt Nam'],
  ['bac giang', 'Tỉnh Bắc Giang, Việt Nam'],
  ['thai nguyen', 'Tỉnh Thái Nguyên, Việt Nam'],
  ['nam dinh', 'Tỉnh Nam Định, Việt Nam'],
  ['ninh binh', 'Tỉnh Ninh Bình, Việt Nam'],
  ['can tho', 'Thành phố Cần Thơ, Việt Nam'],
  ['kien giang', 'Tỉnh Kiên Giang, Việt Nam'],
  ['an giang', 'Tỉnh An Giang, Việt Nam'],
  ['vinh long', 'Tỉnh Vĩnh Long, Việt Nam'],
  ['soc trang', 'Tỉnh Sóc Trăng, Việt Nam'],
  ['binh duong', 'Tỉnh Bình Dương, Việt Nam'],
  ['dong nai', 'Tỉnh Đồng Nai, Việt Nam'],
  ['tay ninh', 'Tỉnh Tây Ninh, Việt Nam'],
  ['binh phuoc', 'Tỉnh Bình Phước, Việt Nam'],
  ['phu yen', 'Tỉnh Phú Yên, Việt Nam'],
  ['binh dinh', 'Tỉnh Bình Định, Việt Nam'],
  ['tphcm', 'Thành phố Hồ Chí Minh, Việt Nam'],
  ['tp hcm', 'Thành phố Hồ Chí Minh, Việt Nam'],
  ['tp.hcm', 'Thành phố Hồ Chí Minh, Việt Nam'],
  ['ho chi minh', 'Thành phố Hồ Chí Minh, Việt Nam'],
  ['sai gon', 'Thành phố Hồ Chí Minh, Việt Nam']
]);

function getGoogleMapsApiKey() {
  return process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY || '';
}

function getMapboxAccessToken() {
  return process.env.MAPBOX_ACCESS_TOKEN || process.env.VITE_MAPBOX_ACCESS_TOKEN || '';
}

function getGeminiApiKey() {
  return process.env.GEMINI_API_KEY || '';
}

function normalizeAddress(address) {
  return String(address || '').trim();
}

function normalizeLooseVietnamese(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function rewriteKnownLandmark(address) {
  const normalized = normalizeLooseVietnamese(address);

  if (
    normalized.includes('dai hoc thuy loi') ||
    normalized.includes('truong dai hoc thuy loi') ||
    normalized.includes('thuy loi ha noi') ||
    normalized.includes('175 tay son')
  ) {
    return 'Trường Đại học Thủy Lợi, 175 Tây Sơn, Đống Đa, Hà Nội, Việt Nam';
  }

  const normalizedWithoutVietnam = normalized.replace(/\bviet nam\b/g, '').trim();
  if (VIETNAM_ADMIN_ALIASES.has(normalizedWithoutVietnam)) {
    return VIETNAM_ADMIN_ALIASES.get(normalizedWithoutVietnam);
  }

  if (
    normalized &&
    !normalized.includes('viet nam') &&
    !normalized.includes('vietnam') &&
    /^(tp|thanh pho|quan|huyen|thi xa|thi tran|phuong|xa|\d|\w)/.test(normalized)
  ) {
    return `${normalizeAddress(address)}, Việt Nam`;
  }

  return normalizeAddress(address);
}

function getCacheKey(address) {
  return normalizeAddress(address).toLowerCase();
}

export function hasGeocodingEnabled() {
  return Boolean(getGoogleMapsApiKey() || getMapboxAccessToken() || getGeminiApiKey());
}

function extractJsonObject(text) {
  const source = String(text || '').trim();
  if (!source) {
    return null;
  }

  const fencedMatch = source.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch?.[1] || source;
  const objectMatch = candidate.match(/\{[\s\S]*\}/);
  if (!objectMatch) {
    return null;
  }

  try {
    return JSON.parse(objectMatch[0]);
  } catch {
    return null;
  }
}

async function rewriteAddressWithGemini(normalizedAddress) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    return {
      searchQuery: normalizedAddress,
      normalizedAddress
    };
  }

  const cacheKey = getCacheKey(normalizedAddress);
  if (geminiRewriteCache.has(cacheKey)) {
    return geminiRewriteCache.get(cacheKey);
  }

  const prompt = [
    'Bạn là bộ chuẩn hóa địa chỉ giao vận tại Việt Nam.',
    'Hãy chuẩn hóa địa chỉ để dễ geocode trên bản đồ.',
    'Chỉ trả về JSON hợp lệ, không giải thích.',
    'JSON schema:',
    '{"normalized_address":"...", "search_query":"...", "city_hint":"...", "country":"Vietnam"}',
    `Địa chỉ đầu vào: ${normalizedAddress}`
  ].join('\n');

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json'
        }
      })
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini API trả về HTTP ${response.status}.`);
  }

  const payload = await response.json();
  const text =
    payload.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || '')
      .join('\n') || '';

  const parsed = extractJsonObject(text);
  const result = {
    normalizedAddress: parsed?.normalized_address || normalizedAddress,
    searchQuery: parsed?.search_query || parsed?.normalized_address || normalizedAddress,
    cityHint: parsed?.city_hint || '',
    country: parsed?.country || 'Vietnam'
  };

  geminiRewriteCache.set(cacheKey, result);
  return result;
}

async function geocodeWithGoogle(normalizedAddress) {
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) {
    throw new Error('Thiếu GOOGLE_MAPS_API_KEY trên backend.');
  }

  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', normalizedAddress);
  url.searchParams.set('language', 'vi');
  url.searchParams.set('region', 'vn');
  url.searchParams.set('components', 'country:VN');
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
  const countryComponent = firstResult.address_components?.find((component) =>
    Array.isArray(component.types) && component.types.includes('country')
  );
  if (countryComponent?.short_name && countryComponent.short_name !== 'VN') {
    throw new Error(`Google Geocoding trả về ngoài Việt Nam cho "${normalizedAddress}".`);
  }
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

async function geocodeWithGeminiAndMapbox(normalizedAddress) {
  const rewrite = await rewriteAddressWithGemini(normalizedAddress);
  const queries = [
    rewrite.searchQuery,
    rewrite.normalizedAddress,
    rewrite.cityHint ? `${rewrite.normalizedAddress}, ${rewrite.cityHint}, Vietnam` : '',
    `${normalizedAddress}, Vietnam`,
    normalizedAddress
  ].filter(Boolean);

  let lastError = null;
  for (const query of [...new Set(queries)]) {
    try {
      const result = await geocodeWithMapbox(query);
      return {
        ...result,
        address: rewrite.normalizedAddress || result.address
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error(`Không thể geocode bằng Gemini + Mapbox cho "${normalizedAddress}".`);
}

async function reverseGeocodeWithGoogle({ lat, lng }) {
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) {
    throw new Error('Thiếu GOOGLE_MAPS_API_KEY trên backend.');
  }

  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('latlng', `${lat},${lng}`);
  url.searchParams.set('language', 'vi');
  url.searchParams.set('region', 'vn');
  url.searchParams.set('key', apiKey);

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Google Reverse Geocoding API trả về HTTP ${response.status}.`);
  }

  const payload = await response.json();
  if (payload.status !== 'OK' || !payload.results?.length) {
    const details = payload.error_message ? ` ${payload.error_message}` : '';
    throw new Error(`Reverse geocode thất bại với trạng thái ${payload.status}.${details}`.trim());
  }

  return {
    address: payload.results[0].formatted_address || `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
    coordinate: { lat, lng }
  };
}

export async function reverseGeocodeCoordinate({ lat, lng }) {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error('Tọa độ không hợp lệ.');
  }

  try {
    return await reverseGeocodeWithGoogle({ lat: latitude, lng: longitude });
  } catch {
    // fallback to Mapbox below
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
  const normalizedAddress = rewriteKnownLandmark(address);
  if (!normalizedAddress) {
    throw new Error('Địa chỉ trống, không thể geocode.');
  }

  const cacheKey = getCacheKey(normalizedAddress);
  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey);
  }

  let result = null;
  const googleQueries = [
    normalizedAddress,
    normalizedAddress.includes('Việt Nam') || normalizedAddress.includes('Vietnam')
      ? normalizedAddress
      : `${normalizedAddress}, Việt Nam`
  ].filter(Boolean);

  for (const query of [...new Set(googleQueries)]) {
    try {
      result = await geocodeWithGoogle(query);
      break;
    } catch {
      result = null;
    }
  }

  if (!result) {
    try {
      result = await geocodeWithGeminiAndMapbox(normalizedAddress);
    } catch {
      result = await geocodeWithMapbox(normalizedAddress);
    }
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

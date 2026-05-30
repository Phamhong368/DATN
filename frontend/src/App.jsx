import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { GoogleMap, Marker, Polyline, useJsApiLoader } from '@react-google-maps/api';
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { apiRequest, downloadApiFile, login } from './api.js';

const navItems = [
  { key: 'dashboard', label: 'Bảng điều khiển', path: '/', roles: ['ADMIN', 'DISPATCHER'] },
  { key: 'users', label: 'Người dùng', path: '/users', roles: ['ADMIN'] },
  { key: 'depots', label: 'Kho vận hành', path: '/depots', roles: ['ADMIN'] },
  { key: 'trucks', label: 'Xe', path: '/trucks', roles: ['ADMIN'] },
  { key: 'drivers', label: 'Tài xế', path: '/drivers', roles: ['ADMIN'] },
  { key: 'customers', label: 'Khách hàng', path: '/customers', roles: ['ADMIN'] },
  { key: 'orders', label: 'Đơn hàng', path: '/orders', roles: ['DISPATCHER'] },
  { key: 'dispatch', label: 'Điều phối', path: '/dispatch', roles: ['DISPATCHER'] },
  { key: 'trips', label: 'Chuyến hàng', path: '/trips', roles: ['DISPATCHER'] },
  { key: 'optimizer', label: 'Tối ưu lộ trình', path: '/optimizer', roles: ['DISPATCHER'] },
  { key: 'optimizer-history', label: 'Lịch sử tối ưu', path: '/optimizer-history', roles: ['DISPATCHER'] },
  { key: 'route-map', label: 'Bản đồ lộ trình', path: '/route-map', roles: ['DISPATCHER'] },
  { key: 'tracking', label: 'GPS thời gian thực', path: '/tracking', roles: ['DISPATCHER'] },
  { key: 'reports', label: 'Báo cáo', path: '/reports', roles: ['ADMIN', 'DISPATCHER'] },
  { key: 'forecasting', label: 'Dự báo nhiên liệu', path: '/forecasting', roles: ['ADMIN', 'DISPATCHER'] },
  { key: 'customer-orders', label: 'Đơn hàng của tôi', path: '/customer/orders', roles: ['CUSTOMER'] }
];

const orderStatusOptions = ['PENDING_DISPATCH', 'ASSIGNED', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED'];
const tripStatusOptions = ['PLANNED', 'ASSIGNED', 'IN_TRANSIT', 'COMPLETED', 'INCIDENT'];
const mapboxAccessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || '';
const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
const googleMapsLibraries = ['places'];
const roleById = {
  1: 'ADMIN',
  2: 'DISPATCHER',
  3: 'DRIVER',
  4: 'CUSTOMER'
};
const DEFAULT_ROUTE_MAP_CENTER = [105.8032, 21.0074];
const DEFAULT_ROUTE_MAP_ZOOM = 12;

function useAuthState() {
  function normalizeStoredAuth(rawAuth) {
    if (!rawAuth || !rawAuth.user) {
      return { token: '', user: null };
    }

    return {
      ...rawAuth,
      user: {
        ...rawAuth.user,
        role: rawAuth.user.role || roleById[rawAuth.user.role_id] || 'DISPATCHER',
        fullName: rawAuth.user.fullName || rawAuth.user.full_name || rawAuth.user.username
      }
    };
  }

  const [auth, setAuth] = useState(() => {
    const raw = localStorage.getItem('tms-auth');
    return raw ? normalizeStoredAuth(JSON.parse(raw)) : { token: '', user: null };
  });

  useEffect(() => {
    localStorage.setItem('tms-auth', JSON.stringify(auth));
  }, [auth]);

  return [auth, setAuth];
}

function formatCurrency(value) {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function formatNumber(value, digits = 1) {
  return new Intl.NumberFormat('vi-VN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(Number(value || 0));
}

function formatMinutesAsDuration(totalMinutes) {
  const minutes = Number(totalMinutes || 0);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return '--';
  }

  const days = Math.floor(minutes / (24 * 60));
  const hours = Math.floor((minutes % (24 * 60)) / 60);
  const remainMinutes = minutes % 60;
  if (days > 0) {
    return `${days} ngày ${hours} giờ ${remainMinutes} phút`;
  }
  if (hours > 0) {
    return `${hours} giờ ${remainMinutes} phút`;
  }
  return `${remainMinutes} phút`;
}

function formatPlanningClockLabel(clockValue) {
  const raw = String(clockValue || '').trim();
  const match = raw.match(/^(\d+):(\d{2})$/);
  if (!match) {
    return raw || '--';
  }

  const hours = Number(match[1]);
  const minutes = match[2];
  if (hours < 24) {
    return `${String(hours).padStart(2, '0')}:${minutes}`;
  }

  const day = Math.floor(hours / 24) + 1;
  const remainHours = hours % 24;
  return `Ngày ${day} · ${String(remainHours).padStart(2, '0')}:${minutes}`;
}

function stripVietnamese(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function normalizeAddressLabel(address) {
  const raw = String(address || '').trim();
  if (!raw) {
    return '';
  }

  const normalizedKey = stripVietnamese(raw).replace(/[.,]/g, '').replace(/\s+/g, ' ').trim();
  const aliases = {
    'ha noi': 'Hà Nội',
    'hanoi': 'Hà Nội',
    'hai phong': 'Hải Phòng',
    'hue': 'Huế',
    'da nang': 'Đà Nẵng',
    'nghe an': 'Nghệ An',
    'quang ngai': 'Quảng Ngãi',
    'tp hcm': 'TP.HCM',
    'tphcm': 'TP.HCM',
    'ho chi minh': 'TP.HCM',
    'binh duong': 'Bình Dương',
    'quang nam': 'Quảng Nam'
  };

  return aliases[normalizedKey] || raw;
}

function formatRouteLabel(start, end) {
  const pickup = normalizeAddressLabel(start);
  const delivery = normalizeAddressLabel(end);
  if (!pickup && !delivery) {
    return '--';
  }
  if (!pickup) {
    return delivery;
  }
  if (!delivery) {
    return pickup;
  }
  return `${pickup} - ${delivery}`;
}

function buildAddressKey(address) {
  return stripVietnamese(address)
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildDistinctWaypointAddresses(addresses, excluded = []) {
  const seen = new Set(excluded.map((item) => buildAddressKey(item)).filter(Boolean));
  return addresses.reduce((result, address) => {
    const normalized = normalizeAddressLabel(address);
    const key = buildAddressKey(normalized);
    if (!normalized || !key || seen.has(key)) {
      return result;
    }
    seen.add(key);
    result.push(normalized);
    return result;
  }, []);
}

function buildTripWaypointAddresses(trip) {
  if (!trip?.orders?.length) {
    return [];
  }

  const rawStops = [];
  trip.orders.forEach((order) => {
    rawStops.push(order.pickup_location, order.delivery_location);
  });

  return buildDistinctWaypointAddresses(rawStops, [trip.origin, trip.destination]);
}

function deriveOptimizerArea(address) {
  const raw = String(address || '').trim();
  if (!raw) {
    return '';
  }

  const normalized = buildAddressKey(normalizeAddressLabel(raw));
  const aliases = [
    ['ha noi', 'Hà Nội'],
    ['tp hcm', 'TP.HCM'],
    ['ho chi minh', 'TP.HCM'],
    ['binh duong', 'Bình Dương'],
    ['da nang', 'Đà Nẵng'],
    ['nha trang', 'Nha Trang'],
    ['khanh hoa', 'Nha Trang'],
    ['hue', 'Huế'],
    ['quang ngai', 'Quảng Ngãi'],
    ['quang nam', 'Quảng Nam'],
    ['hai phong', 'Hải Phòng'],
    ['nghe an', 'Nghệ An'],
    ['can tho', 'Cần Thơ'],
    ['long an', 'Long An'],
    ['dong nai', 'Đồng Nai']
  ];

  const matched = aliases.find(([needle]) => normalized.includes(needle));
  if (matched) {
    return matched[1];
  }

  const segments = raw
    .split(',')
    .map((segment) => normalizeAddressLabel(segment))
    .filter(Boolean);
  return segments[segments.length - 1] || normalizeAddressLabel(raw);
}

function buildOptimizerProposal(candidateOrders, candidateTrucks, depotSuggestions = []) {
  if (!candidateOrders.length || !candidateTrucks.length) {
    return {
      depot: depotSuggestions[0] || 'TP.HCM',
      selectedTruckIds: candidateTrucks.slice(0, 1).map((truck) => truck.id),
      selectedOrderIds: candidateOrders.slice(0, 5).map((order) => order.id),
      totalWeightTons: 0,
      totalCapacityTons: 0
    };
  }

  const prioritizedOrders = [...candidateOrders].sort((left, right) => {
    const leftPriority = left.status === 'PENDING_DISPATCH' ? 0 : 1;
    const rightPriority = right.status === 'PENDING_DISPATCH' ? 0 : 1;
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }
    return Number(right.planned_revenue || 0) - Number(left.planned_revenue || 0) || right.id - left.id;
  });

  const proposedOrders = prioritizedOrders.slice(0, Math.min(prioritizedOrders.length, 8));
  const selectedOrderIds = proposedOrders.map((order) => order.id);
  const totalWeightTons = proposedOrders.reduce((sum, order) => sum + Number(order.weight_tons || 0), 0);

  const sortedTrucks = [...candidateTrucks].sort(
    (left, right) => Number(right.capacity_tons || 0) - Number(left.capacity_tons || 0) || left.id - right.id
  );

  let selectedTrucks = [];
  let accumulatedCapacity = 0;
  const targetCapacity = totalWeightTons * 1.12;
  for (const truck of sortedTrucks) {
    selectedTrucks.push(truck);
    accumulatedCapacity += Number(truck.capacity_tons || 0);
    if (accumulatedCapacity >= targetCapacity) {
      break;
    }
  }
  if (!selectedTrucks.length && sortedTrucks[0]) {
    selectedTrucks = [sortedTrucks[0]];
    accumulatedCapacity = Number(sortedTrucks[0].capacity_tons || 0);
  }

  const pickupFrequency = new Map();
  proposedOrders.forEach((order) => {
    const area = deriveOptimizerArea(order.pickup_location || order.delivery_location);
    if (!area) {
      return;
    }
    pickupFrequency.set(area, (pickupFrequency.get(area) || 0) + 1);
  });

  const preferredDepot = [...pickupFrequency.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
  const matchedDepotSuggestion = depotSuggestions.find(
    (suggestion) => buildAddressKey(suggestion) === buildAddressKey(preferredDepot)
  );

  return {
    depot: matchedDepotSuggestion || preferredDepot || depotSuggestions[0] || 'TP.HCM',
    selectedTruckIds: selectedTrucks.map((truck) => truck.id),
    selectedOrderIds,
    totalWeightTons,
    totalCapacityTons: accumulatedCapacity
  };
}

function formatCoordinateLabel(location) {
  if (!location?.latitude || !location?.longitude) {
    return 'Chưa có';
  }
  return `${formatNumber(location.latitude, 5)}, ${formatNumber(location.longitude, 5)}`;
}

function formatRecordedAt(value) {
  if (!value) {
    return 'Chưa có';
  }
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit'
  }).format(new Date(value));
}

function calculateAirDistanceKm(pointA, pointB) {
  if (!pointA?.lat || !pointA?.lng || !pointB?.lat || !pointB?.lng) {
    return null;
  }

  const toRadians = (value) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const latitudeDelta = toRadians(pointB.lat - pointA.lat);
  const longitudeDelta = toRadians(pointB.lng - pointA.lng);
  const latitudeA = toRadians(pointA.lat);
  const latitudeB = toRadians(pointB.lat);

  const haversine =
    Math.sin(latitudeDelta / 2) * Math.sin(latitudeDelta / 2) +
    Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) * Math.sin(longitudeDelta / 2);

  const angularDistance = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  return earthRadiusKm * angularDistance;
}

function getRoleLabel(role) {
  const labels = {
    ADMIN: 'Quản trị viên',
    DISPATCHER: 'Điều phối viên',
    DRIVER: 'Tài xế',
    CUSTOMER: 'Khách hàng'
  };
  return labels[role] || role;
}

function getStatusLabel(status) {
  const labels = {
    AVAILABLE: 'Sẵn sàng',
    IN_USE: 'Đang sử dụng',
    MAINTENANCE: 'Bảo trì',
    ON_TRIP: 'Đang chạy chuyến',
    INACTIVE: 'Ngưng hoạt động',
    PENDING_DISPATCH: 'Chờ điều phối',
    ASSIGNED: 'Đã phân công',
    IN_TRANSIT: 'Đang vận chuyển',
    COMPLETED: 'Hoàn thành',
    CANCELLED: 'Đã hủy',
    PLANNED: 'Đã lên kế hoạch',
    INCIDENT: 'Sự cố',
    ACTIVE: 'Đang hoạt động',
    CRITICAL: 'Quá hạn',
    HIGH: 'Rất gấp',
    MEDIUM: 'Sắp tới hạn',
    LOW: 'Bình thường'
  };
  return labels[status] || status;
}

function getSeverityColor(severity) {
  const palette = {
    CRITICAL: '#b91c1c',
    HIGH: '#ea580c',
    MEDIUM: '#d97706',
    LOW: '#15803d'
  };
  return palette[severity] || '#334155';
}

function renderFieldValue(fieldName, value) {
  if (fieldName === 'status') {
    return getStatusLabel(value);
  }
  return value;
}

function getVisibleNavItems(role) {
  return navItems.filter((item) => item.roles.includes(role));
}

function getGoogleMapsRouteErrorMessage(error) {
  const rawMessage =
    (typeof error === 'string' && error) ||
    error?.message ||
    error?.status ||
    error?.code ||
    '';

  if (rawMessage === 'REQUEST_DENIED' || rawMessage === 'Permission Denied.') {
    return 'Google Maps đã từ chối tính tuyến đường. Kiểm tra billing và quyền dùng Directions/Routes cho API key hiện tại.';
  }

  if (rawMessage === 'OVER_QUERY_LIMIT') {
    return 'Google Maps đã vượt hạn mức truy vấn cho API key hiện tại.';
  }

  if (rawMessage === 'ZERO_RESULTS') {
    return 'Không tìm thấy tuyến đường phù hợp giữa các địa điểm đã nhập.';
  }

  if (rawMessage === 'NOT_FOUND') {
    return 'Google Maps không xác định được một trong các địa chỉ đã nhập.';
  }

  return rawMessage || 'Không thể tính toán lộ trình.';
}

function buildRoutePreviewPoints(stops) {
  if (!stops?.length) {
    return [];
  }

  const coordinates = stops.map((stop) => stop.coordinate).filter(Boolean);
  if (!coordinates.length) {
    return [];
  }

  const lats = coordinates.map((point) => point.lat);
  const lngs = coordinates.map((point) => point.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latSpan = Math.max(maxLat - minLat, 0.01);
  const lngSpan = Math.max(maxLng - minLng, 0.01);

  return stops.map((stop, index) => {
    const x = 70 + ((stop.coordinate.lng - minLng) / lngSpan) * 560;
    const y = 320 - ((stop.coordinate.lat - minLat) / latSpan) * 220;
    return {
      ...stop,
      index,
      x,
      y
    };
  });
}

function buildSmoothPath(points) {
  if (!points.length) {
    return '';
  }

  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y}`;
  }

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const controlX = (previous.x + current.x) / 2;
    path += ` C ${controlX} ${previous.y}, ${controlX} ${current.y}, ${current.x} ${current.y}`;
  }
  return path;
}

async function fetchMapboxSuggestions(query) {
  if (!mapboxAccessToken || query.trim().length < 3) {
    return [];
  }

  const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`);
  url.searchParams.set('access_token', mapboxAccessToken);
  url.searchParams.set('autocomplete', 'true');
  url.searchParams.set('limit', '5');
  url.searchParams.set('country', 'vn');
  url.searchParams.set('language', 'vi');

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Không tải được gợi ý địa chỉ từ Mapbox.');
  }

  const payload = await response.json();
  return (payload.features || []).map((feature) => ({
    id: feature.id,
    label: feature.place_name,
    coordinate: {
      lng: feature.center?.[0],
      lat: feature.center?.[1]
    }
  }));
}

function fetchGoogleSuggestions(query) {
  return new Promise((resolve, reject) => {
    if (!window.google?.maps?.places?.AutocompleteService) {
      resolve([]);
      return;
    }

    const service = new window.google.maps.places.AutocompleteService();
    service.getPlacePredictions(
      {
        input: query,
        componentRestrictions: { country: 'vn' }
      },
      (predictions, status) => {
        if (
          status === window.google.maps.places.PlacesServiceStatus.ZERO_RESULTS ||
          !predictions?.length
        ) {
          resolve([]);
          return;
        }

        if (status !== window.google.maps.places.PlacesServiceStatus.OK) {
          reject(new Error(`Google Places Autocomplete lỗi: ${status}`));
          return;
        }

        resolve(
          predictions.map((prediction) => ({
            id: prediction.place_id,
            label: prediction.description,
            placeId: prediction.place_id
          }))
        );
      }
    );
  });
}

function geocodeGooglePlaceId(placeId) {
  return new Promise((resolve, reject) => {
    if (!window.google?.maps?.Geocoder) {
      reject(new Error('Google Geocoder chưa sẵn sàng.'));
      return;
    }

    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ placeId }, (results, status) => {
      if (status !== 'OK' || !results?.length) {
        reject(new Error(`Không lấy được tọa độ từ Google Places: ${status}`));
        return;
      }

      const result = results[0];
      const location = result.geometry?.location;
      resolve({
        address: result.formatted_address || '',
        coordinate: {
          lat: location.lat(),
          lng: location.lng()
        }
      });
    });
  });
}

function Layout({ auth, onLogout, children }) {
  const location = useLocation();
  const driverMode = auth.user?.role === 'DRIVER';
  const visibleNavItems = getVisibleNavItems(auth.user?.role);

  if (driverMode) {
    return (
      <div className="driver-shell">
        <header className="driver-header">
          <div>
            <p className="eyebrow">Tài xế</p>
            <h1>{auth.user.fullName}</h1>
          </div>
          <button className="ghost-button" onClick={onLogout}>Đăng xuất</button>
        </header>
        <main className="driver-main">{children}</main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">TMS Demo</p>
          <h1>Vận hành xe tải</h1>
          <p className="sidebar-user">{auth.user.fullName}</p>
          <p className="sidebar-role">{getRoleLabel(auth.user.role)}</p>
        </div>
        <nav>
          {visibleNavItems.map((item) => (
            <a
              key={item.key}
              href={item.path}
              className={location.pathname === item.path ? 'active' : ''}
            >
              {item.label}
            </a>
          ))}
        </nav>
        <button className="ghost-button" onClick={onLogout}>Đăng xuất</button>
      </aside>
      <main className="page-content">{children}</main>
    </div>
  );
}

export function LoginPage({ onLogin, loading, error }) {
  const [form, setForm] = useState({ username: 'dispatcher', password: 'password123' });

  return (
    <div className="login-page">
      <div className="login-card">
        <p className="eyebrow">Hệ thống quản lý xe tải</p>
        <h1>Đăng nhập hệ thống</h1>
        <p className="muted">Tài khoản demo: admin / dispatcher / driver1</p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onLogin(form);
          }}
        >
          <label>
            Tên đăng nhập
            <input
              value={form.username}
              onChange={(event) => setForm((prev) => ({ ...prev, username: event.target.value }))}
            />
          </label>
          <label>
            Mật khẩu
            <input
              type="password"
              value={form.password}
              onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
            />
          </label>
          {error ? <p className="error-text">{error}</p> : null}
          <button className="primary-button" disabled={loading}>
            {loading ? 'Đang xử lý...' : 'Đăng nhập'}
          </button>
        </form>
      </div>
    </div>
  );
}

function DashboardPage({ summary }) {
  const totals = summary?.totals || {};
  const monthly = summary?.monthly || [];
  const statusBreakdown = summary?.statusBreakdown || [];

  return (
    <section className="stack">
      <div className="page-header">
        <div>
          <p className="eyebrow">Tổng quan</p>
          <h2>Bảng điều khiển vận hành</h2>
        </div>
      </div>

      <div className="stats-grid">
        <StatCard label="Tổng đơn hàng" value={totals.totalOrders || 0} />
        <StatCard label="Tổng chuyến" value={totals.totalTrips || 0} />
        <StatCard label="Xe sẵn sàng" value={totals.availableTrucks || 0} />
        <StatCard label="Doanh thu dự kiến" value={formatCurrency(totals.expectedRevenue || 0)} />
      </div>

      <div className="charts-grid">
        <div className="panel">
          <h3>Đơn hàng theo tháng</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={monthly}>
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="total_orders" fill="#1f6feb" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="panel">
          <h3>Trạng thái đơn hàng</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={statusBreakdown} dataKey="total" nameKey="status" innerRadius={65} outerRadius={95}>
                {statusBreakdown.map((entry) => (
                  <Cell key={entry.status} fill={statusColor(entry.status)} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}

function ReportExportsPage({ token }) {
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState('');
  const reports = [
    { key: 'orders', label: 'Đơn hàng' },
    { key: 'trips', label: 'Chuyến hàng' },
    { key: 'fuel', label: 'Nhiên liệu' },
    { key: 'maintenance', label: 'Bảo trì' }
  ];

  async function handleDownload(report, format) {
    setError('');
    setDownloading(`${report}-${format}`);
    try {
      await downloadApiFile(`/reports/export?report=${report}&format=${format}`, {
        token,
        filename: `${report}-report.${format === 'pdf' ? 'pdf' : 'xls'}`
      });
    } catch (downloadError) {
      setError(downloadError.message);
    } finally {
      setDownloading('');
    }
  }

  return (
    <section className="stack">
      <div className="page-header">
        <div>
          <p className="eyebrow">Báo cáo</p>
          <h2>Xuất Excel/PDF vận hành</h2>
        </div>
      </div>
      {error ? <p className="error-text">{error}</p> : null}
      <div className="cards-grid">
        {reports.map((report) => (
          <div key={report.key} className="panel stack">
            <div>
              <h3>Báo cáo {report.label}</h3>
              <p className="muted">Xuất dữ liệu hiện có trong hệ thống để nộp minh chứng hoặc gửi điều hành.</p>
            </div>
            <div className="action-row">
              <button className="primary-button" onClick={() => handleDownload(report.key, 'xlsx')} disabled={Boolean(downloading)}>
                {downloading === `${report.key}-xlsx` ? 'Đang xuất...' : 'Tải Excel'}
              </button>
              <button className="inline-button" onClick={() => handleDownload(report.key, 'pdf')} disabled={Boolean(downloading)}>
                {downloading === `${report.key}-pdf` ? 'Đang xuất...' : 'Tải PDF'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ForecastingPage({ token, trucks, refreshTrucks }) {
  const [overview, setOverview] = useState(null);
  const [fuelLogs, setFuelLogs] = useState([]);
  const [selectedTruckId, setSelectedTruckId] = useState('');
  const [trainingResult, setTrainingResult] = useState(null);
  const [predictionResult, setPredictionResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [fuelLogForm, setFuelLogForm] = useState({
    truck_id: '',
    log_date: '',
    distance_km: '',
    fuel_liters: '',
    payload_tons: '',
    idle_minutes: '',
    avg_speed_kmh: '45',
    cumulative_km_after: '',
    notes: ''
  });
  const [predictionForm, setPredictionForm] = useState({
    distance_km: '',
    payload_tons: '',
    idle_minutes: '',
    avg_speed_kmh: '45'
  });

  useEffect(() => {
    refreshTrucks('trucks').catch((loadError) => {
      console.error(loadError);
    });
  }, [refreshTrucks]);

  async function loadAnalytics(truckId = selectedTruckId) {
    setLoading(true);
    setError('');
    try {
      const [overviewData, logData] = await Promise.all([
        apiRequest('/analytics/overview', { token }),
        apiRequest(`/analytics/fuel-logs${truckId ? `?truckId=${truckId}` : ''}`, { token })
      ]);
      setOverview(overviewData);
      setFuelLogs(logData);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAnalytics().catch((loadError) => {
      setError(loadError.message);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (trucks.length > 0 && !fuelLogForm.truck_id) {
      setFuelLogForm((prev) => ({ ...prev, truck_id: String(trucks[0].id) }));
    }
  }, [trucks, fuelLogForm.truck_id]);

  async function handleAddFuelLog(event) {
    event.preventDefault();
    setError('');
    try {
      await apiRequest('/analytics/fuel-logs', {
        token,
        method: 'POST',
        body: {
          ...fuelLogForm,
          truck_id: Number(fuelLogForm.truck_id),
          distance_km: Number(fuelLogForm.distance_km),
          fuel_liters: Number(fuelLogForm.fuel_liters),
          payload_tons: Number(fuelLogForm.payload_tons || 0),
          idle_minutes: Number(fuelLogForm.idle_minutes || 0),
          avg_speed_kmh: Number(fuelLogForm.avg_speed_kmh || 45),
          cumulative_km_after: Number(fuelLogForm.cumulative_km_after)
        }
      });
      setFuelLogForm({
        truck_id: '',
        log_date: '',
        distance_km: '',
        fuel_liters: '',
        payload_tons: '',
        idle_minutes: '',
        avg_speed_kmh: '45',
        cumulative_km_after: '',
        notes: ''
      });
      await Promise.all([loadAnalytics(selectedTruckId), refreshTrucks('trucks')]);
    } catch (submitError) {
      setError(submitError.message);
    }
  }

  async function handleTrain(scopeTruckId = selectedTruckId) {
    setError('');
    try {
      const result = await apiRequest('/analytics/train', {
        token,
        method: 'POST',
        body: scopeTruckId ? { truckId: Number(scopeTruckId) } : {}
      });
      setTrainingResult(result);
    } catch (trainError) {
      setError(trainError.message);
    }
  }

  async function handlePredict(event) {
    event.preventDefault();
    setError('');
    try {
      const result = await apiRequest('/analytics/predict', {
        token,
        method: 'POST',
        body: {
          ...(selectedTruckId ? { truckId: Number(selectedTruckId) } : {}),
          distance_km: Number(predictionForm.distance_km),
          payload_tons: Number(predictionForm.payload_tons || 0),
          idle_minutes: Number(predictionForm.idle_minutes || 0),
          avg_speed_kmh: Number(predictionForm.avg_speed_kmh || 45)
        }
      });
      setPredictionResult(result);
    } catch (predictError) {
      setError(predictError.message);
    }
  }

  async function handleMaintenanceReset(truckId) {
    setError('');
    try {
      await apiRequest(`/analytics/trucks/${truckId}/maintenance-reset`, {
        token,
        method: 'POST'
      });
      await Promise.all([loadAnalytics(selectedTruckId), refreshTrucks('trucks')]);
    } catch (resetError) {
      setError(resetError.message);
    }
  }

  const summary = overview?.summary || {};
  const alerts = overview?.alerts || [];
  const truckOverview = overview?.trucks || [];

  return (
    <section className="stack">
      <div className="page-header">
        <div>
          <p className="eyebrow">Phân tích</p>
          <h2>Dự báo tiêu thụ nhiên liệu và cảnh báo bảo trì</h2>
        </div>
        <div className="action-row">
          <select
            value={selectedTruckId}
            onChange={(event) => {
              const nextTruckId = event.target.value;
              setSelectedTruckId(nextTruckId);
              loadAnalytics(nextTruckId).catch((loadError) => setError(loadError.message));
            }}
          >
            <option value="">Toàn đội xe</option>
            {trucks.map((truck) => (
              <option key={truck.id} value={truck.id}>{truck.license_plate}</option>
            ))}
          </select>
          <button className="inline-button" onClick={() => loadAnalytics(selectedTruckId)}>Tải lại dữ liệu</button>
          <button className="primary-button" onClick={() => handleTrain(selectedTruckId)}>Train Regression</button>
        </div>
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      <div className="stats-grid">
        <StatCard label="Tổng số xe" value={summary.totalTrucks || 0} />
        <StatCard label="Cảnh báo quá hạn" value={summary.criticalAlerts || 0} />
        <StatCard label="Cảnh báo gấp" value={summary.highAlerts || 0} />
        <StatCard label="TB tiêu hao /100km" value={`${formatNumber(summary.averageConsumption || 0, 2)} L`} />
      </div>

      <div className="forecast-grid">
        <div className="panel stack">
          <div>
            <h3>Ghi nhận dữ liệu huấn luyện</h3>
            <p className="muted">Thêm log nhiên liệu mới để mô hình học từ quãng đường, tải trọng, thời gian chờ và tốc độ trung bình.</p>
          </div>
          <form className="stack" onSubmit={handleAddFuelLog}>
            <label>
              Xe
              <select value={fuelLogForm.truck_id} onChange={(event) => setFuelLogForm((prev) => ({ ...prev, truck_id: event.target.value }))}>
                <option value="">Chọn xe</option>
                {trucks.map((truck) => (
                  <option key={truck.id} value={truck.id}>{truck.license_plate}</option>
                ))}
              </select>
            </label>
            <label>
              Ngày ghi nhận
              <input type="date" value={fuelLogForm.log_date} onChange={(event) => setFuelLogForm((prev) => ({ ...prev, log_date: event.target.value }))} />
            </label>
            <div className="time-window-grid">
              <label>
                Quãng đường (km)
                <input type="number" step="0.1" value={fuelLogForm.distance_km} onChange={(event) => setFuelLogForm((prev) => ({ ...prev, distance_km: event.target.value }))} />
              </label>
              <label>
                Nhiên liệu (lít)
                <input type="number" step="0.1" value={fuelLogForm.fuel_liters} onChange={(event) => setFuelLogForm((prev) => ({ ...prev, fuel_liters: event.target.value }))} />
              </label>
              <label>
                Tải trọng (tấn)
                <input type="number" step="0.1" value={fuelLogForm.payload_tons} onChange={(event) => setFuelLogForm((prev) => ({ ...prev, payload_tons: event.target.value }))} />
              </label>
            </div>
            <div className="time-window-grid">
              <label>
                Chờ nổ máy (phút)
                <input type="number" value={fuelLogForm.idle_minutes} onChange={(event) => setFuelLogForm((prev) => ({ ...prev, idle_minutes: event.target.value }))} />
              </label>
              <label>
                Tốc độ TB (km/h)
                <input type="number" step="0.1" value={fuelLogForm.avg_speed_kmh} onChange={(event) => setFuelLogForm((prev) => ({ ...prev, avg_speed_kmh: event.target.value }))} />
              </label>
              <label>
                Odometer sau chuyến
                <input type="number" step="0.1" value={fuelLogForm.cumulative_km_after} onChange={(event) => setFuelLogForm((prev) => ({ ...prev, cumulative_km_after: event.target.value }))} />
              </label>
            </div>
            <label>
              Ghi chú
              <textarea value={fuelLogForm.notes} onChange={(event) => setFuelLogForm((prev) => ({ ...prev, notes: event.target.value }))} />
            </label>
            <button className="primary-button">Lưu log nhiên liệu</button>
          </form>
        </div>

        <div className="panel stack">
          <div>
            <h3>Dự báo nhiên liệu</h3>
            <p className="muted">Dùng mô hình hồi quy đã train để ước tính số lít nhiên liệu cho chuyến sắp chạy.</p>
          </div>
          <form className="stack" onSubmit={handlePredict}>
            <div className="time-window-grid">
              <label>
                Quãng đường (km)
                <input type="number" step="0.1" value={predictionForm.distance_km} onChange={(event) => setPredictionForm((prev) => ({ ...prev, distance_km: event.target.value }))} />
              </label>
              <label>
                Tải trọng (tấn)
                <input type="number" step="0.1" value={predictionForm.payload_tons} onChange={(event) => setPredictionForm((prev) => ({ ...prev, payload_tons: event.target.value }))} />
              </label>
              <label>
                Chờ nổ máy (phút)
                <input type="number" value={predictionForm.idle_minutes} onChange={(event) => setPredictionForm((prev) => ({ ...prev, idle_minutes: event.target.value }))} />
              </label>
            </div>
            <label>
              Tốc độ TB (km/h)
              <input type="number" step="0.1" value={predictionForm.avg_speed_kmh} onChange={(event) => setPredictionForm((prev) => ({ ...prev, avg_speed_kmh: event.target.value }))} />
            </label>
            <button className="primary-button">Dự báo tiêu hao</button>
          </form>

          {predictionResult ? (
            <div className="forecast-result-card">
              <strong>{formatNumber(predictionResult.predictedFuelLiters, 2)} lít</strong>
              <p className="muted">Mức tiêu hao dự báo: {formatNumber(predictionResult.predictedConsumptionPer100Km, 2)} L / 100 km</p>
            </div>
          ) : null}

          {trainingResult ? (
            <div className="stack">
              <div>
                <h3>Kết quả train</h3>
                <p className="muted">{trainingResult.targetLabel} | Mẫu train: {trainingResult.model.metrics.sampleSize}</p>
              </div>
              <div className="route-summary-grid">
                <StatCard label="R²" value={formatNumber(trainingResult.model.metrics.r2, 4)} />
                <StatCard label="MAE" value={`${formatNumber(trainingResult.model.metrics.mae, 3)} L`} />
                <StatCard label="RMSE" value={`${formatNumber(trainingResult.model.metrics.rmse, 3)} L`} />
                <StatCard label="MAPE" value={`${formatNumber(trainingResult.model.metrics.mape, 2)}%`} />
              </div>
              {trainingResult.model.metrics.test ? (
                <div className="route-summary-grid">
                  <StatCard label="Test MAE" value={`${formatNumber(trainingResult.model.metrics.test.mae, 3)} L`} />
                  <StatCard label="Test RMSE" value={`${formatNumber(trainingResult.model.metrics.test.rmse, 3)} L`} />
                  <StatCard label="Test MAPE" value={`${formatNumber(trainingResult.model.metrics.test.mape, 2)}%`} />
                  <StatCard label="Mẫu test" value={trainingResult.model.metrics.test.sampleSize} />
                </div>
              ) : null}
              <p className="muted">{trainingResult.model.evaluationNote || trainingResult.evaluationNote}</p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Biến</th>
                      <th>Hệ số</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(trainingResult.model.coefficients).map(([feature, value]) => (
                      <tr key={feature}>
                        <td>{feature}</td>
                        <td>{formatNumber(value, 6)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="muted">Chưa train mô hình trong phiên làm việc này.</p>
          )}
        </div>
      </div>

      <div className="forecast-grid">
        <div className="panel">
          <h3>Cảnh báo bảo trì theo km tích lũy</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Xe</th>
                  <th>Km tích lũy</th>
                  <th>Km từ lần bảo trì gần nhất</th>
                  <th>Km còn lại</th>
                  <th>Mức cảnh báo</th>
                  <th>Khuyến nghị</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((alert) => (
                  <tr key={alert.truckId}>
                    <td>{alert.licensePlate}</td>
                    <td>{formatNumber(alert.cumulativeKm, 0)}</td>
                    <td>{formatNumber(alert.kmSinceMaintenance, 0)}</td>
                    <td>{formatNumber(alert.remainingKm, 0)}</td>
                    <td>
                      <span className="status-badge" style={{ background: getSeverityColor(alert.severity) }}>
                        {getStatusLabel(alert.severity)}
                      </span>
                    </td>
                    <td>{alert.recommendedAction}</td>
                    <td>
                      <button className="inline-button" onClick={() => handleMaintenanceReset(alert.truckId)}>
                        Reset bảo trì
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <h3>Lịch sử train</h3>
          {loading ? <p className="muted">Đang tải dữ liệu...</p> : null}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Xe</th>
                  <th>Số log</th>
                  <th>TB tiêu hao/100km</th>
                  <th>TB tải trọng</th>
                  <th>Log gần nhất</th>
                </tr>
              </thead>
              <tbody>
                {truckOverview.map((truck) => (
                  <tr key={truck.id}>
                    <td>{truck.license_plate}</td>
                    <td>{truck.fuel_log_count}</td>
                    <td>{truck.avg_consumption_per_100km ? `${formatNumber(truck.avg_consumption_per_100km, 2)} L` : '--'}</td>
                    <td>{truck.avg_payload_tons ? `${formatNumber(truck.avg_payload_tons, 2)} tấn` : '--'}</td>
                    <td>{truck.latest_fuel_log_date || '--'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="panel">
        <h3>Log nhiên liệu gần đây</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Ngày</th>
                <th>Xe</th>
                <th>Km</th>
                <th>Lít</th>
                <th>Tải (tấn)</th>
                <th>Chờ (phút)</th>
                <th>TB km/h</th>
                <th>Odometer</th>
              </tr>
            </thead>
            <tbody>
              {fuelLogs.map((row) => (
                <tr key={row.id}>
                  <td>{row.log_date}</td>
                  <td>{row.license_plate}</td>
                  <td>{formatNumber(row.distance_km, 1)}</td>
                  <td>{formatNumber(row.fuel_liters, 1)}</td>
                  <td>{formatNumber(row.payload_tons, 1)}</td>
                  <td>{row.idle_minutes}</td>
                  <td>{formatNumber(row.avg_speed_kmh, 1)}</td>
                  <td>{formatNumber(row.cumulative_km_after, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function RouteMapPage({ orders, trips, token, apiNamespace = 'optimizer' }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const googleMapRef = useRef(null);
  const autoPreviewKeyRef = useRef('');
  const requestKeyRef = useRef('');
  const [form, setForm] = useState({
    origin: '',
    destination: '',
    travelMode: 'DRIVING',
    waypoints: []
  });
  const [mapError, setMapError] = useState('');
  const [mapRenderError, setMapRenderError] = useState('');
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeResult, setRouteResult] = useState(null);
  const [addressSuggestions, setAddressSuggestions] = useState({ origin: [], destination: [] });
  const [activeSuggestionField, setActiveSuggestionField] = useState('');
  const [selectedLocations, setSelectedLocations] = useState({ origin: null, destination: null });
  const [mapPickTarget, setMapPickTarget] = useState('destination');
  const [reverseLoading, setReverseLoading] = useState(false);
  const {
    isLoaded: isGoogleMapLoaded,
    loadError: googleMapsLoadError
  } = useJsApiLoader({
    id: 'tms-google-maps',
    googleMapsApiKey,
    libraries: googleMapsLibraries
  });
  const isCustomerTrackingMode = apiNamespace === 'customer-portal';
  const previewPoints = useMemo(() => buildRoutePreviewPoints(routeResult?.stops || []), [routeResult]);
  const selectedOrder = useMemo(() => {
    const orderId = Number(searchParams.get('orderId'));
    return orderId ? orders.find((order) => Number(order.id) === orderId) || null : null;
  }, [orders, searchParams]);
  const selectedTrip = useMemo(() => {
    const tripId = Number(searchParams.get('tripId'));
    return tripId ? trips.find((trip) => Number(trip.id) === tripId) || null : null;
  }, [trips, searchParams]);
  const activeContext = useMemo(() => {
    if (selectedTrip) {
      return {
        type: 'trip',
        title: `Theo dõi chuyến ${selectedTrip.trip_code}`,
        subtitle: `${normalizeAddressLabel(selectedTrip.origin)} → ${normalizeAddressLabel(selectedTrip.destination)}`,
        origin: normalizeAddressLabel(selectedTrip.origin),
        destination: normalizeAddressLabel(selectedTrip.destination),
        waypoints: buildTripWaypointAddresses(selectedTrip),
        travelMode: 'DRIVING',
        key: `trip-${selectedTrip.id}`
      };
    }

    if (selectedOrder) {
      return {
        type: 'order',
        title: `Bản đồ đơn ${selectedOrder.order_code}`,
        subtitle: `${normalizeAddressLabel(selectedOrder.pickup_location)} → ${normalizeAddressLabel(selectedOrder.delivery_location)}`,
        origin: normalizeAddressLabel(selectedOrder.pickup_location),
        destination: normalizeAddressLabel(selectedOrder.delivery_location),
        waypoints: [],
        travelMode: 'DRIVING',
        key: `order-${selectedOrder.id}`
      };
    }

    const origin = searchParams.get('origin');
    const destination = searchParams.get('destination');
    const waypointsParam = searchParams.get('waypoints');
    let parsedWaypoints = [];
    if (waypointsParam) {
      try {
        parsedWaypoints = JSON.parse(waypointsParam);
      } catch {
        parsedWaypoints = [];
      }
    }
    if (origin && destination) {
      return {
        type: 'manual',
        title: 'Bản đồ lộ trình',
        subtitle: 'Tuyến nhập thủ công',
        origin,
        destination,
        waypoints: parsedWaypoints,
        travelMode: searchParams.get('travelMode') || 'DRIVING',
        key: `manual-${origin}-${destination}-${parsedWaypoints.join('|')}`
      };
    }
    return null;
  }, [orders, searchParams, selectedOrder, selectedTrip, trips]);

  useEffect(() => {
    if (!activeContext) {
      return;
    }

    setForm({
      origin: activeContext.origin,
      destination: activeContext.destination,
      travelMode: activeContext.travelMode,
      waypoints: activeContext.waypoints
    });
    setSelectedLocations({ origin: null, destination: null });
    requestKeyRef.current = '';
    setRouteResult(null);
    setMapError('');
  }, [activeContext]);

  useEffect(() => {
    if (!activeSuggestionField) {
      return;
    }

    const query = form[activeSuggestionField];
    if (!query || query.trim().length < 3) {
      setAddressSuggestions((prev) => ({ ...prev, [activeSuggestionField]: [] }));
      return;
    }

    const timer = setTimeout(() => {
      const fetchSuggestions = isGoogleMapLoaded ? fetchGoogleSuggestions : fetchMapboxSuggestions;
      fetchSuggestions(query)
        .then((items) => {
          setAddressSuggestions((prev) => ({ ...prev, [activeSuggestionField]: items }));
        })
        .catch(() => {
          setAddressSuggestions((prev) => ({ ...prev, [activeSuggestionField]: [] }));
        });
    }, 250);

    return () => clearTimeout(timer);
  }, [activeSuggestionField, form, isGoogleMapLoaded]);

  async function requestRoutePreview(payload) {
    const requestKey = JSON.stringify({
      namespace: apiNamespace,
      travelMode: payload.travelMode || 'DRIVING',
      origin:
        typeof payload.origin === 'string'
          ? payload.origin
          : payload.origin?.address || JSON.stringify(payload.origin || null),
      destination:
        typeof payload.destination === 'string'
          ? payload.destination
          : payload.destination?.address || JSON.stringify(payload.destination || null),
      waypoints: Array.isArray(payload.waypoints) ? payload.waypoints : []
    });
    requestKeyRef.current = requestKey;
    const preview = await apiRequest(`/${apiNamespace}/route-preview`, {
      token,
      method: 'POST',
      body: payload
    });
    if (requestKeyRef.current === requestKey) {
      setRouteResult(preview);
    }
    return preview;
  }

  async function handleCalculateRoute(event) {
    event.preventDefault();
    setMapError('');
    setActiveSuggestionField('');
    setRouteLoading(true);

    try {
      await requestRoutePreview({
        origin: selectedLocations.origin
          ? { address: form.origin, coordinate: selectedLocations.origin.coordinate }
          : form.origin,
        destination: selectedLocations.destination
          ? { address: form.destination, coordinate: selectedLocations.destination.coordinate }
          : form.destination,
        waypoints: form.waypoints,
        travelMode: form.travelMode
      });
    } catch (error) {
      setMapError(error.message || getGoogleMapsRouteErrorMessage(error));
      setRouteResult(null);
    } finally {
      setRouteLoading(false);
    }
  }

  function applyOrderRoute(order) {
    setForm({
      origin: order.pickup_location,
      destination: order.delivery_location,
      travelMode: 'DRIVING',
      waypoints: []
    });
    setSelectedLocations({ origin: null, destination: null });
    setRouteResult(null);
    setMapError('');
  }

  function handleAddressInputChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSelectedLocations((prev) => ({ ...prev, [field]: null }));
    setAddressSuggestions((prev) => ({ ...prev, [field]: [] }));
  }

  async function selectSuggestion(field, suggestion) {
    try {
      const resolvedLocation = suggestion.placeId ? await geocodeGooglePlaceId(suggestion.placeId) : suggestion;
      setForm((prev) => ({ ...prev, [field]: resolvedLocation.address || suggestion.label }));
      setSelectedLocations((prev) => ({ ...prev, [field]: resolvedLocation }));
    } catch (error) {
      setMapError(error.message || 'Không lấy được tọa độ từ địa chỉ đã chọn.');
    } finally {
      setAddressSuggestions((prev) => ({ ...prev, [field]: [] }));
      setActiveSuggestionField('');
    }
  }

  function updateWaypoint(index, value) {
    setForm((prev) => ({
      ...prev,
      waypoints: prev.waypoints.map((waypoint, waypointIndex) => (waypointIndex === index ? value : waypoint))
    }));
  }

  function addWaypoint() {
    setForm((prev) => ({ ...prev, waypoints: [...prev.waypoints, ''] }));
  }

  function removeWaypoint(index) {
    setForm((prev) => ({
      ...prev,
      waypoints: prev.waypoints.filter((_, waypointIndex) => waypointIndex !== index)
    }));
  }

  useEffect(() => {
    if (!activeContext?.origin || !activeContext?.destination || !token) {
      return;
    }

    const autoKey = JSON.stringify({
      key: activeContext.key,
      origin: activeContext.origin,
      destination: activeContext.destination,
      waypoints: activeContext.waypoints,
      travelMode: activeContext.travelMode
    });

    if (autoPreviewKeyRef.current === autoKey) {
      return;
    }

    autoPreviewKeyRef.current = autoKey;
    setRouteLoading(true);
    setMapError('');

    requestRoutePreview({
      origin: activeContext.origin,
      destination: activeContext.destination,
      waypoints: activeContext.waypoints,
      travelMode: activeContext.travelMode
    })
      .catch((error) => {
        setMapError(error.message || getGoogleMapsRouteErrorMessage(error));
        setRouteResult(null);
      })
      .finally(() => {
        setRouteLoading(false);
      });
  }, [activeContext, token]);

  useEffect(() => {
    if (!googleMapsLoadError) {
      setMapRenderError('');
      return;
    }

    setMapRenderError('Không tải được Google Maps. Hệ thống sẽ dùng sơ đồ tuyến nội bộ để hiển thị hành trình.');
  }, [googleMapsLoadError]);

  const routePath = routeResult?.path?.length
    ? routeResult.path
    : routeResult?.stops?.map((stop) => stop.coordinate) || [];
  const activeGpsLocation = selectedTrip?.latest_location
    ? selectedTrip.latest_location
    : selectedOrder?.latest_latitude && selectedOrder?.latest_longitude
      ? {
          latitude: Number(selectedOrder.latest_latitude),
          longitude: Number(selectedOrder.latest_longitude),
          recorded_at: selectedOrder.latest_recorded_at
        }
      : null;
  const activeGpsMarker = activeGpsLocation
    ? {
        lat: Number(activeGpsLocation.latitude),
        lng: Number(activeGpsLocation.longitude)
      }
    : null;
  const googleMapCenter =
    routeResult?.stops?.[0]?.coordinate ||
    activeGpsMarker ||
    selectedLocations.origin?.coordinate ||
    selectedLocations.destination?.coordinate ||
    { lat: DEFAULT_ROUTE_MAP_CENTER[1], lng: DEFAULT_ROUTE_MAP_CENTER[0] };
  const selectedTripWeight = selectedTrip?.orders?.reduce((sum, order) => sum + Number(order.weight_tons || 0), 0) || 0;
  const selectedTripRevenue = selectedTrip?.orders?.reduce((sum, order) => sum + Number(order.planned_revenue || 0), 0) || 0;
  const orderTripStatus = selectedOrder?.trip_status ? getStatusLabel(selectedOrder.trip_status) : 'Chưa gán chuyến';
  const orderGpsLocationLabel = activeGpsLocation ? formatCoordinateLabel(activeGpsLocation) : 'Chưa có';
  const orderGpsRecordedAt = activeGpsLocation?.recorded_at ? formatRecordedAt(activeGpsLocation.recorded_at) : 'Chưa có';
  const orderRouteProgress = useMemo(() => {
    if (!selectedOrder || !routeResult?.stops?.length || !activeGpsMarker) {
      return null;
    }

    const origin = routeResult.stops[0]?.coordinate;
    const destination = routeResult.stops[routeResult.stops.length - 1]?.coordinate;
    const totalKm = calculateAirDistanceKm(origin, destination);
    const remainingKm = calculateAirDistanceKm(activeGpsMarker, destination);

    if (!totalKm || !remainingKm) {
      return null;
    }

    const progressedKm = Math.max(0, totalKm - remainingKm);
    const percent = Math.min(100, Math.max(0, (progressedKm / totalKm) * 100));
    return {
      remainingKm,
      percent
    };
  }, [activeGpsMarker, routeResult, selectedOrder]);
  const customerOrders = useMemo(() => orders.slice(0, 12), [orders]);
  const orderedCustomerOrders = useMemo(() => {
    if (!selectedOrder) {
      return customerOrders;
    }
    return [...customerOrders].sort((left, right) => {
      if (Number(left.id) === Number(selectedOrder.id)) {
        return -1;
      }
      if (Number(right.id) === Number(selectedOrder.id)) {
        return 1;
      }
      return 0;
    });
  }, [customerOrders, selectedOrder]);
  const customerDestinationLabel = selectedOrder
    ? normalizeAddressLabel(selectedOrder.delivery_location).replace(/, Việt Nam$/i, '')
    : '';
  const customerRouteIsLive = Boolean(selectedOrder?.trip_code);
  const customerTrackingMessage = selectedOrder?.trip_code
    ? `Đang trên đường đến ${customerDestinationLabel || 'điểm giao hàng'}`
    : 'Tuyến ước tính của đơn hàng';
  const customerTrackingSubline = selectedOrder?.trip_code
    ? `${routeResult?.distanceText || '--'} · ETA ${routeResult?.durationText || '--'}`
    : 'Đơn chưa được gán chuyến. Đường màu xanh là lộ trình dự kiến từ điểm lấy đến điểm giao.';
  const customerEtaLabel = customerRouteIsLive ? routeResult?.durationText || '--' : 'Chờ điều phối';
  const customerDistanceLabel = routeResult?.distanceText || '--';
  const routePolylineOptions =
    isCustomerTrackingMode && !customerRouteIsLive
      ? {
          strokeColor: '#0ea5e9',
          strokeOpacity: 0.58,
          strokeWeight: 4
        }
      : {
          strokeColor: '#2563eb',
          strokeOpacity: 0.92,
          strokeWeight: 6
        };

  useEffect(() => {
    const map = googleMapRef.current;
    if (!isGoogleMapLoaded || !map || !routeResult?.stops?.length || !window.google?.maps) {
      return;
    }

    try {
      const bounds = new window.google.maps.LatLngBounds();
      routeResult.stops.forEach((stop) => bounds.extend(stop.coordinate));
      if (activeGpsMarker) {
        bounds.extend(activeGpsMarker);
      }
      map.fitBounds(bounds, 60);
    } catch (error) {
      setMapRenderError(error.message || 'Không thể căn chỉnh bản đồ Google theo lộ trình.');
    }
  }, [activeGpsMarker, isGoogleMapLoaded, routeResult]);

  async function handleGoogleMapClick(event) {
    if (!mapPickTarget || !event.latLng) {
      return;
    }

    setReverseLoading(true);
    setMapError('');

    try {
      const location = await apiRequest(`/${apiNamespace}/reverse-geocode`, {
        token,
        method: 'POST',
        body: {
          lat: event.latLng.lat(),
          lng: event.latLng.lng()
        }
      });

      setForm((prev) => ({ ...prev, [mapPickTarget]: location.address }));
      setSelectedLocations((prev) => ({ ...prev, [mapPickTarget]: location }));
    } catch (error) {
      setMapError(error.message || 'Không xác định được địa chỉ tại vị trí đã chọn.');
    } finally {
      setReverseLoading(false);
    }
  }

  return (
    <section className="stack">
      <div className="page-header">
        <div>
          <p className="eyebrow">Bản đồ</p>
          <h2>{isCustomerTrackingMode ? 'Theo dõi đơn hàng của bạn' : 'Công cụ tính toán lộ trình tối ưu'}</h2>
          {activeContext ? <p className="muted">{activeContext.title}: {activeContext.subtitle}</p> : null}
        </div>
      </div>

      <div className={isCustomerTrackingMode ? 'route-grid customer-route-grid' : 'route-grid'}>
        <div className="panel stack">
          {isCustomerTrackingMode ? (
            <>
              <div>
                <h3>Đơn hàng của bạn</h3>
                <p className="muted">Chọn một đơn để xem lộ trình, ETA và vị trí vận chuyển hiện tại.</p>
              </div>
              {selectedOrder ? (
                <div className={customerRouteIsLive ? 'customer-order-hero live' : 'customer-order-hero estimate'}>
                  <div className="customer-order-hero-top">
                    <div>
                      <strong>{selectedOrder.order_code}</strong>
                      <p>{formatRouteLabel(selectedOrder.pickup_location, selectedOrder.delivery_location)}</p>
                    </div>
                    <span className="status-badge" style={{ background: statusColor(selectedOrder.status) }}>
                      {getStatusLabel(selectedOrder.status)}
                    </span>
                  </div>
                  <div className="customer-order-hero-metrics">
                    <div>
                      <small>Giá cước</small>
                      <span>{formatCurrency(selectedOrder.planned_revenue)}</span>
                    </div>
                    <div>
                      <small>Quãng đường</small>
                      <span>{customerDistanceLabel}</span>
                    </div>
                    <div>
                      <small>ETA</small>
                      <span>{customerEtaLabel}</span>
                    </div>
                  </div>
                </div>
              ) : null}
              <div className="customer-order-list">
                {orderedCustomerOrders.map((order) => {
                  const isActive = selectedOrder && Number(selectedOrder.id) === Number(order.id);
                  return (
                    <button
                      key={order.id}
                      className={isActive ? 'customer-order-card active' : 'customer-order-card'}
                      onClick={() => navigate(`/customer/route-map?mode=order&orderId=${order.id}`)}
                    >
                      <div className="customer-order-card-head">
                        <strong>{order.order_code}</strong>
                        <span className="status-badge" style={{ background: statusColor(order.status) }}>
                          {getStatusLabel(order.status)}
                        </span>
                      </div>
                      <span>{formatRouteLabel(order.pickup_location, order.delivery_location)}</span>
                      <small>{formatCurrency(order.planned_revenue)}</small>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <div>
                <h3>Tính tuyến đường</h3>
                <p className="muted">Nhập điểm đi, điểm đến hoặc chọn nhanh từ đơn hàng đã có trong hệ thống.</p>
                {form.waypoints.length ? (
                  <p className="muted">Tuyến đang có {form.waypoints.length} điểm dừng trung gian từ lịch sử tối ưu.</p>
                ) : null}
              </div>

              <form className="stack" onSubmit={handleCalculateRoute}>
                {isGoogleMapLoaded ? (
                  <div className="map-pick-controls">
                    <button
                      type="button"
                      className={mapPickTarget === 'origin' ? 'inline-button active' : 'inline-button'}
                      onClick={() => setMapPickTarget('origin')}
                    >
                      Đặt điểm đi trên bản đồ
                    </button>
                    <button
                      type="button"
                      className={mapPickTarget === 'destination' ? 'inline-button active' : 'inline-button'}
                      onClick={() => setMapPickTarget('destination')}
                    >
                      Đặt điểm đến trên bản đồ
                    </button>
                    {reverseLoading ? <span className="muted">Đang định vị...</span> : null}
                  </div>
                ) : null}

                <label>
                  Điểm đi
                  <div className="address-autocomplete">
                    <input
                      value={form.origin}
                      onFocus={() => setActiveSuggestionField('origin')}
                      onBlur={() => setTimeout(() => setActiveSuggestionField(''), 150)}
                      onChange={(event) => handleAddressInputChange('origin', event.target.value)}
                      placeholder="Ví dụ: TP. Hồ Chí Minh"
                    />
                    {activeSuggestionField === 'origin' && addressSuggestions.origin.length ? (
                      <div className="address-suggestion-list">
                        {addressSuggestions.origin.map((suggestion) => (
                          <button
                            key={suggestion.id}
                            type="button"
                            className="address-suggestion-item"
                            onClick={() => selectSuggestion('origin', suggestion)}
                          >
                            {suggestion.label}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </label>

                <label>
                  Điểm đến
                  <div className="address-autocomplete">
                    <input
                      value={form.destination}
                      onFocus={() => setActiveSuggestionField('destination')}
                      onBlur={() => setTimeout(() => setActiveSuggestionField(''), 150)}
                      onChange={(event) => handleAddressInputChange('destination', event.target.value)}
                      placeholder="Ví dụ: Hà Nội"
                    />
                    {activeSuggestionField === 'destination' && addressSuggestions.destination.length ? (
                      <div className="address-suggestion-list">
                        {addressSuggestions.destination.map((suggestion) => (
                          <button
                            key={suggestion.id}
                            type="button"
                            className="address-suggestion-item"
                            onClick={() => selectSuggestion('destination', suggestion)}
                          >
                            {suggestion.label}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </label>

                <div className="stack">
                  <div className="section-row">
                    <strong>Điểm dừng trung gian</strong>
                    <button type="button" className="inline-button" onClick={addWaypoint}>Thêm điểm</button>
                  </div>
                  {form.waypoints.map((waypoint, index) => (
                    <div key={`waypoint-${index}`} className="waypoint-row">
                      <input
                        value={waypoint}
                        onChange={(event) => updateWaypoint(index, event.target.value)}
                        placeholder={`Điểm dừng ${index + 1}`}
                      />
                      <button type="button" className="inline-button danger" onClick={() => removeWaypoint(index)}>Xóa</button>
                    </div>
                  ))}
                </div>

                <label>
                  Phương thức di chuyển
                  <select
                    value={form.travelMode}
                    onChange={(event) => setForm((prev) => ({ ...prev, travelMode: event.target.value }))}
                  >
                    <option value="DRIVING">Xe ô tô</option>
                    <option value="BICYCLING">Xe đạp</option>
                    <option value="WALKING">Đi bộ</option>
                    <option value="TRANSIT">Phương tiện công cộng</option>
                  </select>
                </label>

                <button className="primary-button" disabled={routeLoading}>
                  {routeLoading ? 'Đang tính toán...' : 'Tính lộ trình'}
                </button>
              </form>

              <div className="stack">
                <h3>Chọn nhanh từ đơn hàng</h3>
                <div className="quick-order-list">
                  {orders.slice(0, 6).map((order) => (
                    <button key={order.id} className="quick-order-button" onClick={() => applyOrderRoute(order)}>
                      <strong>{order.order_code}</strong>
                      <span>{order.pickup_location} {'->'} {order.delivery_location}</span>
                    </button>
                  ))}
                </div>
              </div>

              {trips.length ? (
                <div className="stack">
                  <h3>Chọn nhanh từ chuyến hàng</h3>
                  <div className="quick-order-list">
                    {trips.slice(0, 4).map((trip) => (
                      <button
                        key={trip.id}
                        className="quick-order-button"
                        onClick={() => {
                          setForm({
                            origin: normalizeAddressLabel(trip.origin),
                            destination: normalizeAddressLabel(trip.destination),
                            travelMode: 'DRIVING',
                            waypoints: buildTripWaypointAddresses(trip)
                          });
                          setSelectedLocations({ origin: null, destination: null });
                          setRouteResult(null);
                          setMapError('');
                        }}
                      >
                        <strong>{trip.trip_code}</strong>
                        <span>{formatRouteLabel(trip.origin, trip.destination)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="stack">
          <div className="panel route-map-panel">
            {routeResult && routeResult.stops?.length && isGoogleMapLoaded && !mapRenderError ? (
              <div className="route-map-shell">
                <div className="route-map-overlay">
                  <strong>
                    {isCustomerTrackingMode
                      ? customerTrackingMessage
                      : selectedTrip
                        ? `Theo dõi ${selectedTrip.trip_code}`
                        : routeResult.distanceText}
                  </strong>
                  <span>
                    {isCustomerTrackingMode
                      ? customerTrackingSubline
                      : selectedTrip
                        ? `${routeResult.distanceText} · ${routeResult.durationText}`
                        : routeResult.durationText}
                  </span>
                </div>
                <GoogleMap
                  mapContainerClassName="route-map-canvas"
                  center={googleMapCenter}
                  zoom={DEFAULT_ROUTE_MAP_ZOOM}
                  onLoad={(map) => {
                    googleMapRef.current = map;
                  }}
                  onUnmount={() => {
                    googleMapRef.current = null;
                  }}
                  onClick={handleGoogleMapClick}
                  options={{
                    streetViewControl: false,
                    mapTypeControl: false,
                    fullscreenControl: false
                  }}
                >
                  {routePath.length > 1 ? (
                    <Polyline
                      path={routePath}
                      options={routePolylineOptions}
                    />
                  ) : null}
                  {routeResult.stops.map((stop, index) => (
                    <Marker
                      key={`${stop.address}-${index}`}
                      position={stop.coordinate}
                      label={{
                        text: index === 0 ? 'A' : index === routeResult.stops.length - 1 ? 'B' : String(index + 1),
                        color: '#ffffff',
                        fontWeight: '700'
                      }}
                      title={stop.address}
                    />
                  ))}
                  {activeGpsMarker ? (
                    <Marker
                      position={activeGpsMarker}
                      title={`GPS hiện tại · ${formatRecordedAt(activeGpsLocation?.recorded_at)}`}
                      icon={{
                        path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                        scale: 6,
                        fillColor: '#16a34a',
                        fillOpacity: 1,
                        strokeColor: '#ffffff',
                        strokeWeight: 3
                      }}
                      label={{
                        text: 'Xe',
                        color: '#ffffff',
                        fontWeight: '700'
                      }}
                    />
                  ) : null}
                </GoogleMap>
                {isCustomerTrackingMode && selectedOrder ? (
                  <div className={customerRouteIsLive ? 'customer-map-status-card live' : 'customer-map-status-card estimate'}>
                    <strong>{customerTrackingMessage}</strong>
                    <span>{selectedOrder.trip_code ? customerTrackingSubline : orderTripStatus}</span>
                    <div className="customer-map-status-meta">
                      <span>Xe: {selectedOrder.license_plate || '--'}</span>
                      <span>Tài xế: {selectedOrder.driver_name || '--'}</span>
                      <span>GPS: {orderGpsRecordedAt}</span>
                      <span>Còn lại: {orderRouteProgress ? `${formatNumber(orderRouteProgress.remainingKm, 1)} km` : '--'}</span>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : routeResult && previewPoints.length ? (
              <div className="route-map-shell route-map-fallback">
                <div className="route-map-overlay">
                  <strong>{routeResult.distanceText}</strong>
                  <span>{routeResult.durationText}</span>
                </div>
                <svg className="route-map-canvas" viewBox="0 0 700 360" preserveAspectRatio="xMidYMid meet">
                  <defs>
                    <linearGradient id="routePreviewStroke" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#2563eb" />
                      <stop offset="100%" stopColor="#f97316" />
                    </linearGradient>
                  </defs>
                  <path
                    d={buildSmoothPath(previewPoints)}
                    fill="none"
                    stroke="url(#routePreviewStroke)"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {previewPoints.map((point, index) => (
                    <g key={`${point.address}-${index}`} transform={`translate(${point.x}, ${point.y})`}>
                      <circle r="20" fill={index === 0 ? '#2563eb' : index === previewPoints.length - 1 ? '#f97316' : '#0f172a'} />
                      <circle r="24" fill="none" stroke="rgba(37,99,235,0.16)" strokeWidth="10" />
                      <text textAnchor="middle" dominantBaseline="central" fill="#fff" fontSize="14" fontWeight="700">
                        {index + 1}
                      </text>
                    </g>
                  ))}
                </svg>
                <div className="route-map-fallback-stops">
                  {previewPoints.map((point, index) => (
                    <div key={`${point.address}-legend-${index}`} className="route-stop-chip">
                      {index + 1}. {point.address}
                    </div>
                  ))}
                </div>
              </div>
            ) : isGoogleMapLoaded ? (
              <div className="route-map-shell">
                <div className="route-map-overlay">
                  <strong>{mapPickTarget === 'origin' ? 'Đang chọn điểm đi' : 'Đang chọn điểm đến'}</strong>
                  <span>Bấm trực tiếp trên bản đồ</span>
                </div>
                <GoogleMap
                  mapContainerClassName="route-map-canvas"
                  center={googleMapCenter}
                  zoom={DEFAULT_ROUTE_MAP_ZOOM}
                  onLoad={(map) => {
                    googleMapRef.current = map;
                  }}
                  onUnmount={() => {
                    googleMapRef.current = null;
                  }}
                  onClick={handleGoogleMapClick}
                  options={{
                    streetViewControl: false,
                    mapTypeControl: false,
                    fullscreenControl: false
                  }}
                />
              </div>
            ) : (
              <div className="route-map-canvas route-map-empty">
                <p className="muted">Nhập tuyến đường rồi bấm "Tính lộ trình" để xem hành trình.</p>
              </div>
            )}
          </div>

          <div className="panel stack">
            <h3>{isCustomerTrackingMode ? 'Tình trạng giao vận' : 'Panel nghiệp vụ'}</h3>
            {selectedTrip ? (
              <>
                <div className="route-summary-grid">
                  <StatCard label="Tổng quãng đường" value={routeResult?.distanceText || '--'} />
                  <StatCard label="ETA" value={routeResult?.durationText || '--'} />
                  <StatCard label="Tổng tải trọng" value={selectedTripWeight ? `${formatNumber(selectedTripWeight, 2)} tấn` : '--'} />
                  <StatCard label="Chi phí đơn hàng" value={selectedTripRevenue ? formatCurrency(selectedTripRevenue) : '--'} />
                </div>
                <div className="route-business-grid">
                  <div className="route-business-item"><strong>Mã chuyến</strong><span>{selectedTrip.trip_code}</span></div>
                  <div className="route-business-item"><strong>Xe phụ trách</strong><span>{selectedTrip.license_plate || '--'}</span></div>
                  <div className="route-business-item"><strong>Tài xế</strong><span>{selectedTrip.driver_name || '--'}</span></div>
                  <div className="route-business-item"><strong>Trạng thái</strong><span>{getStatusLabel(selectedTrip.status)}</span></div>
                  <div className="route-business-item"><strong>Số đơn trong chuyến</strong><span>{selectedTrip.orders?.length || 0}</span></div>
                  <div className="route-business-item"><strong>GPS hiện tại</strong><span>{formatCoordinateLabel(selectedTrip.latest_location)}</span></div>
                </div>
              </>
            ) : selectedOrder ? (
              <>
                <div className="route-summary-grid">
                  <StatCard label="Quãng đường" value={routeResult?.distanceText || '--'} />
                  <StatCard label="ETA" value={routeResult?.durationText || '--'} />
                  <StatCard label="Tải trọng" value={selectedOrder.weight_tons ? `${formatNumber(selectedOrder.weight_tons, 2)} tấn` : '--'} />
                  <StatCard label="Giá cước" value={selectedOrder.planned_revenue ? formatCurrency(selectedOrder.planned_revenue) : '--'} />
                </div>
                <div className="route-business-grid">
                  <div className="route-business-item"><strong>Mã đơn</strong><span>{selectedOrder.order_code}</span></div>
                  <div className="route-business-item"><strong>Khách hàng</strong><span>{selectedOrder.customer_name || '--'}</span></div>
                  <div className="route-business-item"><strong>Loại hàng</strong><span>{selectedOrder.cargo_type || '--'}</span></div>
                  <div className="route-business-item"><strong>Trạng thái đơn</strong><span>{getStatusLabel(selectedOrder.status)}</span></div>
                  <div className="route-business-item"><strong>Chuyến đang gán</strong><span>{selectedOrder.trip_code || '--'}</span></div>
                  <div className="route-business-item"><strong>Trạng thái chuyến</strong><span>{orderTripStatus}</span></div>
                  <div className="route-business-item"><strong>Xe phụ trách</strong><span>{selectedOrder.license_plate || '--'}</span></div>
                  <div className="route-business-item"><strong>Tài xế</strong><span>{selectedOrder.driver_name || '--'}</span></div>
                  <div className="route-business-item"><strong>Vị trí xe hiện tại</strong><span>{orderGpsLocationLabel}</span></div>
                  <div className="route-business-item"><strong>Cập nhật GPS</strong><span>{orderGpsRecordedAt}</span></div>
                  <div className="route-business-item"><strong>Quãng đường còn lại</strong><span>{orderRouteProgress ? `${formatNumber(orderRouteProgress.remainingKm, 1)} km` : '--'}</span></div>
                  <div className="route-business-item"><strong>Tiến độ ước tính</strong><span>{orderRouteProgress ? `${formatNumber(orderRouteProgress.percent, 0)}%` : '--'}</span></div>
                </div>
              </>
            ) : (
              <p className="muted">Chọn một đơn hàng hoặc chuyến hàng để xem nhanh thông tin nghiệp vụ và lộ trình tương ứng.</p>
            )}
          </div>

          <div className="panel stack">
            <h3>Kết quả lộ trình</h3>
            {mapError ? <p className="error-text">{mapError}</p> : null}
            {mapRenderError ? <p className="error-text">{mapRenderError}</p> : null}
            {routeResult ? (
              <>
                <div className="route-summary-grid">
                  <StatCard label="Quãng đường" value={routeResult.distanceText} />
                  <StatCard label="Thời gian dự kiến" value={routeResult.durationText} />
                </div>
                <div className="route-meta">
                  <p><strong>Điểm đi:</strong> {routeResult.startAddress}</p>
                  <p><strong>Điểm đến:</strong> {routeResult.endAddress}</p>
                </div>
                {routeResult.stops?.length ? (
                  <div className="route-stops-list">
                    {routeResult.stops.map((stop, index) => (
                      <div key={`${stop.address}-${index}`} className="route-stop-chip">
                        Chặng {index + 1}: {stop.address}
                      </div>
                    ))}
                  </div>
                ) : null}
                <div className="route-steps">
                  {routeResult.legs.map((leg) => (
                    <div key={`${leg.segmentNo}-${leg.startAddress}`} className="panel route-leg-panel">
                      <h4>Chặng {leg.segmentNo}</h4>
                      <p className="muted">{leg.startAddress} {'->'} {leg.endAddress}</p>
                      <p className="muted">{leg.distanceText} | {leg.durationText}</p>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="muted">Nhập tuyến đường rồi bấm "Tính lộ trình" để xem bản đồ và thời gian dự kiến từ dữ liệu định vị của hệ thống.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function OptimizerPage({ orders, trucks, token }) {
  const [optimizerInputs, setOptimizerInputs] = useState({ orders: [], trucks: [] });
  const sourceOrders = optimizerInputs.orders.length ? optimizerInputs.orders : orders;
  const sourceTrucks = optimizerInputs.trucks.length ? optimizerInputs.trucks : trucks;
  const depotSuggestions = optimizerInputs.depotSuggestions?.length ? optimizerInputs.depotSuggestions : ['TP.HCM', 'Đà Nẵng', 'Hà Nội', 'Bình Dương', 'Nha Trang'];
  const candidateOrders = useMemo(
    () => sourceOrders.filter((order) => ['PENDING_DISPATCH', 'ASSIGNED'].includes(order.status)),
    [sourceOrders]
  );
  const candidateTrucks = useMemo(
    () => sourceTrucks.filter((truck) => ['AVAILABLE', 'IN_USE'].includes(truck.status)),
    [sourceTrucks]
  );
  const [depot, setDepot] = useState('TP.HCM');
  const [selectedTruckIds, setSelectedTruckIds] = useState(candidateTrucks.slice(0, 2).map((truck) => truck.id));
  const [selectedOrderIds, setSelectedOrderIds] = useState(candidateOrders.slice(0, 5).map((order) => order.id));
  const [timeWindowMap, setTimeWindowMap] = useState(() =>
    Object.fromEntries(
      candidateOrders.map((order) => [
        order.id,
        { useTimeWindow: false, windowStart: '08:00', windowEnd: '18:00', serviceMinutes: 20 }
      ])
    )
  );
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [inputLoading, setInputLoading] = useState(false);
  const [error, setError] = useState('');
  const [proposalMeta, setProposalMeta] = useState(null);
  const [hasManualSelection, setHasManualSelection] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadOptimizerInputs() {
      setInputLoading(true);
      setError('');
      try {
        const data = await apiRequest('/optimizer/inputs', { token });
        if (!active) {
          return;
        }
        setOptimizerInputs({
          depotSuggestions: data.depotSuggestions || [],
          orders: data.orders || [],
          trucks: data.trucks || []
        });
      } catch (requestError) {
        if (active) {
          setError(requestError.message);
        }
      } finally {
        if (active) {
          setInputLoading(false);
        }
      }
    }

    if (token) {
      loadOptimizerInputs();
    }

    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    setSelectedTruckIds((previous) => {
      const availableIds = new Set(candidateTrucks.map((truck) => truck.id));
      const kept = previous.filter((id) => availableIds.has(id));
      return kept.length ? kept : candidateTrucks.slice(0, 2).map((truck) => truck.id);
    });
  }, [candidateTrucks]);

  useEffect(() => {
    setSelectedOrderIds((previous) => {
      const availableIds = new Set(candidateOrders.map((order) => order.id));
      const kept = previous.filter((id) => availableIds.has(id));
      return kept.length ? kept : candidateOrders.slice(0, 5).map((order) => order.id);
    });
  }, [candidateOrders]);

  useEffect(() => {
    setTimeWindowMap((previous) => {
      const next = { ...previous };
      for (const order of candidateOrders) {
        if (!next[order.id]) {
          next[order.id] = { useTimeWindow: false, windowStart: '08:00', windowEnd: '18:00', serviceMinutes: 20 };
        }
      }
      return next;
    });
  }, [candidateOrders]);

  useEffect(() => {
    if (!candidateOrders.length || !candidateTrucks.length) {
      return;
    }

    if (hasManualSelection) {
      return;
    }

    const proposal = buildOptimizerProposal(candidateOrders, candidateTrucks, depotSuggestions);
    setDepot(proposal.depot);
    setSelectedTruckIds(proposal.selectedTruckIds);
    setSelectedOrderIds(proposal.selectedOrderIds);
    setProposalMeta(proposal);
  }, [candidateOrders, candidateTrucks, depotSuggestions, hasManualSelection]);

  function applyOptimizerProposal() {
    const proposal = buildOptimizerProposal(candidateOrders, candidateTrucks, depotSuggestions);
    setDepot(proposal.depot);
    setSelectedTruckIds(proposal.selectedTruckIds);
    setSelectedOrderIds(proposal.selectedOrderIds);
    setProposalMeta(proposal);
    setHasManualSelection(false);
  }

  function toggleSelection(id, setter, values) {
    setHasManualSelection(true);
    setter(values.includes(id) ? values.filter((value) => value !== id) : [...values, id]);
  }

  function updateDepot(value) {
    setHasManualSelection(true);
    setDepot(value);
  }

  async function handleOptimize(event) {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const payloadOrders = candidateOrders
        .filter((order) => selectedOrderIds.includes(order.id))
        .map((order) => {
          const config = timeWindowMap[order.id] || {};
          return {
            ...order,
            serviceMinutes: config.serviceMinutes || 20,
            ...(config.useTimeWindow
              ? {
                  windowStart: config.windowStart,
                  windowEnd: config.windowEnd
                }
              : {})
          };
        });

      const payload = {
        depot: { location: depot, name: 'Kho điều phối' },
        selectedTruckIds,
        orders: payloadOrders
      };

      const data = await apiRequest('/optimizer/vrp', {
        token,
        method: 'POST',
        body: payload
      });
      setResult(data);
    } catch (requestError) {
      setError(requestError.message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleAutoOptimize() {
    applyOptimizerProposal();
    setTimeout(() => {
      const form = document.getElementById('optimizer-form');
      form?.requestSubmit();
    }, 0);
  }

  return (
    <section className="stack">
      <div className="page-header">
        <div>
          <p className="eyebrow">Tối ưu</p>
          <h2>Phân tuyến giao hàng theo VRP</h2>
        </div>
      </div>

      <div className="optimizer-grid">
        <div className="panel stack">
          <div>
            <h3>Dữ liệu đầu vào</h3>
            <p className="muted">Hệ thống tự đề xuất kho, đội xe và nhóm đơn phù hợp theo tải trọng. Bạn có thể chạy ngay hoặc chỉnh tay trước khi tối ưu.</p>
          </div>

          {proposalMeta ? (
            <div className="panel route-leg-panel">
              <h4>Đề xuất tự động</h4>
              <p className="muted">
                Kho xuất phát <strong>{proposalMeta.depot}</strong>, {proposalMeta.selectedTruckIds.length} xe,
                {' '}{proposalMeta.selectedOrderIds.length} đơn, tổng tải {formatNumber(proposalMeta.totalWeightTons, 1)} tấn /
                {' '}sức chở {formatNumber(proposalMeta.totalCapacityTons, 1)} tấn.
              </p>
              <div className="form-actions">
                <button type="button" className="secondary-button" onClick={applyOptimizerProposal}>
                  Áp dụng đề xuất
                </button>
                <button type="button" className="primary-button" onClick={handleAutoOptimize} disabled={loading}>
                  {loading ? 'Đang tối ưu...' : 'Đề xuất và chạy tối ưu'}
                </button>
              </div>
            </div>
          ) : null}

          <form className="stack" id="optimizer-form" onSubmit={handleOptimize}>
            <label>
              Kho xuất phát
              <input value={depot} onChange={(event) => updateDepot(event.target.value)} placeholder="Ví dụ: TP.HCM" list="optimizer-depot-suggestions" />
              <datalist id="optimizer-depot-suggestions">
                {depotSuggestions.map((suggestion) => (
                  <option key={suggestion} value={suggestion} />
                ))}
              </datalist>
            </label>

            <div className="stack">
              <h3>Chọn xe</h3>
              <div className="selection-list">
                {inputLoading ? <p className="muted">Đang tải danh sách xe...</p> : null}
                {!inputLoading && !candidateTrucks.length ? <p className="muted">Chưa có xe sẵn sàng để tối ưu.</p> : null}
                {candidateTrucks.map((truck) => (
                  <label key={truck.id} className="selection-card">
                    <input
                      type="checkbox"
                      checked={selectedTruckIds.includes(truck.id)}
                      onChange={() => toggleSelection(truck.id, setSelectedTruckIds, selectedTruckIds)}
                    />
                    <div>
                      <strong>{truck.license_plate}</strong>
                      <p>{truck.truck_type} | {truck.capacity_tons} tấn | {getStatusLabel(truck.status)}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="stack">
              <h3>Chọn đơn hàng</h3>
              <div className="selection-list">
                {inputLoading ? <p className="muted">Đang tải danh sách đơn hàng...</p> : null}
                {!inputLoading && !candidateOrders.length ? <p className="muted">Chưa có đơn hàng chờ điều phối.</p> : null}
                {candidateOrders.map((order) => (
                  <div key={order.id} className="selection-card selection-card-wide">
                    <label className="selection-card-main">
                      <input
                        type="checkbox"
                        checked={selectedOrderIds.includes(order.id)}
                        onChange={() => toggleSelection(order.id, setSelectedOrderIds, selectedOrderIds)}
                      />
                      <div>
                        <strong>{order.order_code}</strong>
                        <p>{order.customer_name}</p>
                        <small>{formatRouteLabel(order.pickup_location, order.delivery_location)}</small>
                        <p>{order.weight_tons} tấn | {formatCurrency(order.planned_revenue)} | {getStatusLabel(order.status)}</p>
                      </div>
                    </label>
                    <div className="time-window-grid">
                      <label className="checkbox-inline">
                      <input
                        type="checkbox"
                        checked={Boolean(timeWindowMap[order.id]?.useTimeWindow)}
                        onChange={(event) =>
                          {
                            setHasManualSelection(true);
                            setTimeWindowMap((prev) => ({
                              ...prev,
                              [order.id]: { ...prev[order.id], useTimeWindow: event.target.checked }
                            }));
                          }
                        }
                      />
                        <span>Ràng buộc giờ giao</span>
                      </label>
                      <label>
                        Từ
                        <input
                          type="time"
                          value={timeWindowMap[order.id]?.windowStart || '08:00'}
                          disabled={!timeWindowMap[order.id]?.useTimeWindow}
                          onChange={(event) =>
                            {
                              setHasManualSelection(true);
                              setTimeWindowMap((prev) => ({
                                ...prev,
                                [order.id]: { ...prev[order.id], windowStart: event.target.value }
                              }));
                            }
                          }
                        />
                      </label>
                      <label>
                        Đến
                        <input
                          type="time"
                          value={timeWindowMap[order.id]?.windowEnd || '18:00'}
                          disabled={!timeWindowMap[order.id]?.useTimeWindow}
                          onChange={(event) =>
                            {
                              setHasManualSelection(true);
                              setTimeWindowMap((prev) => ({
                                ...prev,
                                [order.id]: { ...prev[order.id], windowEnd: event.target.value }
                              }));
                            }
                          }
                        />
                      </label>
                      <label>
                        Dịch vụ (phút)
                        <input
                          type="number"
                          min="5"
                          step="5"
                          value={timeWindowMap[order.id]?.serviceMinutes || 20}
                          onChange={(event) =>
                            {
                              setHasManualSelection(true);
                              setTimeWindowMap((prev) => ({
                                ...prev,
                                [order.id]: { ...prev[order.id], serviceMinutes: Number(event.target.value) }
                              }));
                            }
                          }
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button className="primary-button" disabled={loading}>
              {loading ? 'Đang tối ưu...' : 'Chạy tối ưu VRP'}
            </button>
          </form>
        </div>

        <div className="stack">
          <div className="panel">
            <h3>Kết quả tối ưu</h3>
            {error ? <p className="error-text">{error}</p> : null}
            {result?.meta ? (
              <div className="route-summary-grid">
                <StatCard label="Số tuyến" value={result.meta.totalRoutes} />
                <StatCard label="Đơn đã gán" value={result.meta.totalAssignedOrders} />
                <StatCard label="Đơn chưa gán" value={result.meta.totalUnassignedOrders} />
                <StatCard label="Tổng quãng đường" value={`${result.meta.totalDistanceKm} km`} />
              </div>
            ) : (
              <p className="muted">Chưa có dữ liệu tối ưu. Hãy chọn xe, đơn hàng và bấm "Chạy tối ưu VRP".</p>
            )}
          </div>

          {result?.routes?.map((route) => (
            <div key={route.truckId} className="panel stack">
              <div className="dispatch-header">
                <div>
                  <h3>{route.truckLabel}</h3>
                  <p>Tải sử dụng {route.totalLoadTons} / {route.capacityTons} tấn</p>
                </div>
                <span className="status-badge" style={{ background: '#1f6feb' }}>{route.utilizationPercent}% tải</span>
              </div>
              <div className="route-meta">
                <p><strong>Tổng quãng đường:</strong> {formatNumber(route.totalDistanceKm, 1)} km</p>
                <p><strong>Tổng thời gian:</strong> {formatMinutesAsDuration(route.totalDurationMinutes)}</p>
              </div>
              <div className="route-steps">
                {route.stops.map((stop, index) => (
                  <div key={stop.orderId} className="route-step">
                    <div className="route-step-index">{index + 1}</div>
                    <div>
                      <p><strong>{stop.orderCode}</strong> - {normalizeAddressLabel(stop.destination)}</p>
                      <small>
                        {stop.pickupLocation ? `Lấy: ${normalizeAddressLabel(stop.pickupLocation)} → Giao: ${normalizeAddressLabel(stop.destination)}` : `Giao: ${normalizeAddressLabel(stop.destination)}`}
                      </small>
                      <small>
                        {formatNumber(stop.weightTons, 1)} tấn | ETA {formatPlanningClockLabel(stop.arrivalTime)} | Cửa giao {formatPlanningClockLabel(stop.windowLabel.split(' - ')[0])} - {formatPlanningClockLabel(stop.windowLabel.split(' - ')[1])} | Chặng trước {formatNumber(stop.distanceFromPreviousKm, 1)} km
                      </small>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {result?.unassignedOrders?.length ? (
            <div className="panel stack">
              <h3>Đơn chưa được phân tuyến</h3>
              {result.unassignedOrders.map((order) => (
                <div key={order.orderId} className="unassigned-item">
                  <strong>{order.orderCode}</strong>
                  <p>{order.destination} | {order.weightTons} tấn</p>
                  <small>{order.reason}</small>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function OptimizerHistoryPage({ token }) {
  const navigate = useNavigate();
  const [history, setHistory] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionMessage, setActionMessage] = useState('');

  useEffect(() => {
    async function loadHistory() {
      try {
        setError('');
        setLoading(true);
        const rows = await apiRequest('/optimizer/history', { token });
        setHistory(rows);
        if (rows[0]) {
          setSelectedId(rows[0].id);
        }
      } catch (requestError) {
        setError(requestError.message);
      } finally {
        setLoading(false);
      }
    }

    loadHistory();
  }, [token]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }

    async function loadDetail() {
      try {
        setDetailLoading(true);
        const data = await apiRequest(`/optimizer/history/${selectedId}`, { token });
        setDetail(data);
      } catch (requestError) {
        setError(requestError.message);
      } finally {
        setDetailLoading(false);
      }
    }

    loadDetail();
  }, [selectedId, token]);

  async function handleDeleteHistory(id) {
    try {
      setActionMessage('');
      await apiRequest(`/optimizer/history/${id}`, { token, method: 'DELETE' });
      const rows = await apiRequest('/optimizer/history', { token });
      setHistory(rows);
      setSelectedId(rows[0]?.id || null);
      setActionMessage('Đã xóa lịch sử tối ưu.');
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function handleMaterialize(id) {
    try {
      setActionMessage('');
      const data = await apiRequest(`/optimizer/history/${id}/materialize`, {
        token,
        method: 'POST'
      });
      setActionMessage(`${data.message} Tạo ${data.createdTrips.length} chuyến.`);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  return (
    <section className="stack">
      <div className="page-header">
        <div>
          <p className="eyebrow">Lưu vết</p>
          <h2>Lịch sử tối ưu lộ trình</h2>
        </div>
      </div>

      {error ? <p className="error-text">{error}</p> : null}
      {actionMessage ? <p className="success-text">{actionMessage}</p> : null}

      <div className="optimizer-grid">
        <div className="panel stack">
          <h3>Danh sách lần chạy</h3>
          {loading ? <p className="muted">Đang tải lịch sử...</p> : null}
          <div className="selection-list">
            {history.map((item) => (
              <button
                key={item.id}
                className={`history-card${selectedId === item.id ? ' history-card-active' : ''}`}
                onClick={() => setSelectedId(item.id)}
              >
                <strong>{item.optimization_code}</strong>
                <p>{item.depot_location || item.depot_name} | {item.algorithm_name}</p>
                <small>
                  {item.total_routes} tuyến | {item.total_assigned_orders} đơn | {item.total_distance_km} km
                </small>
              </button>
            ))}
          </div>
        </div>

        <div className="stack">
          <div className="panel">
            <h3>Chi tiết lần chạy</h3>
            {detailLoading ? <p className="muted">Đang tải chi tiết...</p> : null}
            {!detail && !detailLoading ? <p className="muted">Chưa có dữ liệu lịch sử.</p> : null}
            {detail?.optimization ? (
              <>
                <div className="route-summary-grid">
                  <StatCard label="Mã tối ưu" value={detail.optimization.optimization_code} />
                  <StatCard label="Kho xuất phát" value={detail.optimization.depot_location || '--'} />
                  <StatCard label="Tổng tuyến" value={detail.optimization.total_routes} />
                  <StatCard label="Tổng quãng đường" value={`${detail.optimization.total_distance_km} km`} />
                </div>
                <div className="action-row history-actions">
                  <button className="primary-button" onClick={() => handleMaterialize(detail.optimization.id)}>Tạo chuyến hàng</button>
                  <button className="inline-button danger" onClick={() => handleDeleteHistory(detail.optimization.id)}>Xóa lịch sử</button>
                </div>
              </>
            ) : null}
          </div>

          {detail?.routes?.map((route) => (
            <div key={route.id} className="panel stack">
              <div className="dispatch-header">
                <div>
                  <h3>{route.license_plate}</h3>
                  <p>Tuyến số {route.route_no} | Tải sử dụng {route.total_load_tons} tấn</p>
                </div>
                <span className="status-badge" style={{ background: '#1f6feb' }}>{route.utilization_percent}% tải</span>
              </div>
              <div className="action-row">
                <button
                  className="inline-button"
                  onClick={() =>
                    navigate(
                      `/route-map?origin=${encodeURIComponent(detail.optimization.depot_location || '')}&destination=${encodeURIComponent(
                        route.stops[route.stops.length - 1]?.delivery_location || ''
                      )}&waypoints=${encodeURIComponent(
                        JSON.stringify(route.stops.slice(0, -1).map((stop) => stop.delivery_location))
                      )}`
                    )
                  }
                >
                  Xem trên bản đồ
                </button>
              </div>
              <div className="route-meta">
                <p><strong>Số điểm dừng:</strong> {route.total_stops}</p>
                <p><strong>Quãng đường:</strong> {route.total_distance_km} km</p>
                <p><strong>Thời gian:</strong> {route.total_duration_minutes} phút</p>
              </div>
              <div className="route-steps">
                {route.stops.map((stop) => (
                  <div key={stop.id} className="route-step">
                    <div className="route-step-index">{stop.stop_sequence}</div>
                    <div>
                      <p><strong>{stop.order_code}</strong> - {stop.delivery_location}</p>
                      <small>
                        ETA {stop.arrival_time || '--'} | Rời điểm {stop.departure_time || '--'} | {stop.distance_from_previous_km} km
                      </small>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {detail?.orders?.some((item) => !item.is_assigned) ? (
            <div className="panel stack">
              <h3>Đơn chưa gán</h3>
              {detail.orders
                .filter((item) => !item.is_assigned)
                .map((item) => (
                  <div key={item.id} className="unassigned-item">
                    <strong>{item.order_code}</strong>
                    <p>{item.delivery_location}</p>
                    <small>{item.unassigned_reason || 'Không có lý do chi tiết.'}</small>
                  </div>
                ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="panel stat-card">
      <p>{label}</p>
      <strong>{value}</strong>
    </div>
  );
}

function ResourcePage({
  title,
  fields,
  rows,
  form,
  setForm,
  onSave,
  onEdit,
  onDelete,
  showDelete = true
}) {
  return (
    <section className="stack">
      <div className="page-header">
        <div>
          <p className="eyebrow">Danh mục</p>
          <h2>{title}</h2>
        </div>
      </div>

      <div className="resource-grid">
        <div className="panel">
          <h3>{form.id ? 'Cập nhật' : 'Thêm mới'}</h3>
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              onSave();
            }}
          >
            {fields.map((field) => (
              <label key={field.name}>
                {field.label}
                {field.type === 'select' ? (
                  <select
                    value={form[field.name] ?? ''}
                    onChange={(event) => setForm((prev) => ({ ...prev, [field.name]: event.target.value }))}
                  >
                    {field.options.map((option) => (
                      <option key={option} value={option}>{getStatusLabel(option)}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={field.type || 'text'}
                    value={form[field.name] ?? ''}
                    onChange={(event) => setForm((prev) => ({ ...prev, [field.name]: event.target.value }))}
                  />
                )}
              </label>
            ))}
            <button className="primary-button">{form.id ? 'Lưu thay đổi' : 'Tạo mới'}</button>
          </form>
        </div>

        <div className="panel">
          <h3>Danh sách</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {fields.map((field) => (
                    <th key={field.name}>{field.label}</th>
                  ))}
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    {fields.map((field) => (
                      <td key={field.name}>{renderFieldValue(field.name, row[field.name])}</td>
                    ))}
                    <td className="action-row">
                      <button className="inline-button" onClick={() => onEdit(row)}>Sửa</button>
                      {showDelete ? <button className="inline-button danger" onClick={() => onDelete(row.id)}>Xóa</button> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

function UsersPage({ rows, form, setForm, onSave, onEdit, onDelete }) {
  return (
    <section className="stack">
      <div className="page-header">
        <div>
          <p className="eyebrow">Quản trị</p>
          <h2>Quản lý người dùng</h2>
        </div>
      </div>
      <div className="resource-grid">
        <div className="panel">
          <h3>{form.id ? 'Cập nhật người dùng' : 'Tạo người dùng mới'}</h3>
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              onSave();
            }}
          >
            <label>
              Tên đăng nhập
              <input value={form.username} onChange={(event) => setForm((prev) => ({ ...prev, username: event.target.value }))} />
            </label>
            <label>
              Họ tên
              <input value={form.full_name} onChange={(event) => setForm((prev) => ({ ...prev, full_name: event.target.value }))} />
            </label>
            <label>
              Vai trò
              <select value={form.role} onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value }))}>
                <option value="ADMIN">Quản trị viên</option>
                <option value="DISPATCHER">Điều phối viên</option>
                <option value="DRIVER">Tài xế</option>
                <option value="CUSTOMER">Khách hàng</option>
              </select>
            </label>
            <label>
              Mật khẩu {form.id ? '(để trống nếu không đổi)' : ''}
              <input type="password" value={form.password} onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))} />
            </label>
            <button className="primary-button">{form.id ? 'Lưu người dùng' : 'Tạo người dùng'}</button>
          </form>
        </div>
        <div className="panel">
          <h3>Danh sách người dùng</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tên đăng nhập</th>
                  <th>Họ tên</th>
                  <th>Vai trò</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.username}</td>
                    <td>{row.full_name}</td>
                    <td>{getRoleLabel(row.role)}</td>
                    <td className="action-row">
                      <button className="inline-button" onClick={() => onEdit({ ...row, password: '' })}>Sửa</button>
                      <button className="inline-button danger" onClick={() => onDelete(row.id)}>Xóa</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

function OrdersPage({ rows, customers, form, setForm, onSave, onEdit }) {
  const navigate = useNavigate();

  return (
    <section className="stack">
      <div className="page-header">
        <div>
          <p className="eyebrow">Nghiệp vụ</p>
          <h2>Quản lý đơn hàng</h2>
        </div>
      </div>
      <div className="resource-grid">
        <div className="panel">
          <h3>{form.id ? 'Cập nhật đơn hàng' : 'Quyền tạo đơn thuộc khách hàng'}</h3>
          {form.id ? (
            <form
              className="stack"
              onSubmit={(event) => {
                event.preventDefault();
                onSave();
              }}
            >
              <label>
                Khách hàng
                <select value={form.customer_id} onChange={(event) => setForm((prev) => ({ ...prev, customer_id: event.target.value }))}>
                  <option value="">Chọn khách hàng</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>{customer.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Mã đơn
                <input value={form.order_code} onChange={(event) => setForm((prev) => ({ ...prev, order_code: event.target.value }))} />
              </label>
              <label>
                Điểm lấy hàng
                <input value={form.pickup_location} onChange={(event) => setForm((prev) => ({ ...prev, pickup_location: event.target.value }))} />
              </label>
              <label>
                Điểm giao hàng
                <input value={form.delivery_location} onChange={(event) => setForm((prev) => ({ ...prev, delivery_location: event.target.value }))} />
              </label>
              <label>
                Loại hàng
                <input value={form.cargo_type} onChange={(event) => setForm((prev) => ({ ...prev, cargo_type: event.target.value }))} />
              </label>
              <label>
                Trọng tải (tấn)
                <input type="number" step="0.1" value={form.weight_tons} onChange={(event) => setForm((prev) => ({ ...prev, weight_tons: event.target.value }))} />
              </label>
              <label>
                Doanh thu dự kiến
                <input type="number" value={form.planned_revenue} onChange={(event) => setForm((prev) => ({ ...prev, planned_revenue: event.target.value }))} />
              </label>
              <label>
                Trạng thái
                <select value={form.status} onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}>
                  {orderStatusOptions.map((status) => <option key={status} value={status}>{getStatusLabel(status)}</option>)}
                </select>
              </label>
              <div className="section-row">
                <button className="primary-button">Lưu đơn hàng</button>
                <button type="button" className="inline-button" onClick={() => setForm(defaultOrderForm())}>Hủy chọn</button>
              </div>
            </form>
          ) : (
            <div className="stack">
              <p className="muted">
                Khách hàng tự tạo đơn từ cổng khách hàng. Điều phối chỉ tiếp nhận, cập nhật trạng thái và phân công đơn đã được gửi lên hệ thống.
              </p>
              <p className="muted">
                Chọn một đơn ở danh sách bên phải để chỉnh sửa hoặc xử lý nghiệp vụ tiếp theo.
              </p>
            </div>
          )}
        </div>
        <div className="panel">
          <h3>Danh sách đơn hàng</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Mã đơn</th>
                  <th>Khách hàng</th>
                  <th>Tuyến</th>
                  <th>Hàng hóa</th>
                  <th>Trạng thái</th>
                  <th>Doanh thu</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.order_code}</td>
                    <td>{row.customer_name}</td>
                    <td>{formatRouteLabel(row.pickup_location, row.delivery_location)}</td>
                    <td>{row.cargo_type}</td>
                    <td><span className="status-badge" style={{ background: statusColor(row.status) }}>{getStatusLabel(row.status)}</span></td>
                    <td>{formatCurrency(row.planned_revenue)}</td>
                    <td className="action-cell">
                      <div className="action-row">
                        <button
                          className="inline-button action-button"
                          onClick={() =>
                            onEdit({
                              ...row,
                              pickup_location: normalizeAddressLabel(row.pickup_location),
                              delivery_location: normalizeAddressLabel(row.delivery_location)
                            })
                          }
                        >
                          Sửa đơn
                        </button>
                        <button
                          className="inline-button action-button"
                          onClick={() => navigate(`/route-map?mode=order&orderId=${row.id}`)}
                        >
                          Xem bản đồ
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

function CustomerOrdersPage({ profile, rows, form, setForm, quote, quoteLoading, quoteError, onSave }) {
  const navigate = useNavigate();

  return (
    <section className="stack">
      <div className="page-header">
        <div>
          <p className="eyebrow">Khách hàng</p>
          <h2>Đơn hàng của tôi</h2>
        </div>
      </div>
      <div className="resource-grid">
        <div className="panel stack">
          <h3>Thông tin tài khoản</h3>
          {profile ? (
            <>
              <div><strong>Tên khách hàng:</strong> {profile.name}</div>
              <div><strong>Số điện thoại:</strong> {profile.phone || '--'}</div>
              <div><strong>Email:</strong> {profile.email || '--'}</div>
              <div><strong>Địa chỉ:</strong> {profile.address || '--'}</div>
            </>
          ) : (
            <p className="muted">Chưa tìm thấy hồ sơ khách hàng gắn với tài khoản này.</p>
          )}
        </div>
        <div className="panel stack">
          <h3>Tạo đơn hàng mới</h3>
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              onSave();
            }}
          >
            <label>
              Điểm lấy hàng
              <input value={form.pickup_location} onChange={(event) => setForm((prev) => ({ ...prev, pickup_location: event.target.value }))} />
            </label>
            <label>
              Điểm giao hàng
              <input value={form.delivery_location} onChange={(event) => setForm((prev) => ({ ...prev, delivery_location: event.target.value }))} />
            </label>
            <label>
              Loại hàng
              <input value={form.cargo_type} onChange={(event) => setForm((prev) => ({ ...prev, cargo_type: event.target.value }))} />
            </label>
            <label>
              Trọng lượng (tấn)
              <input type="number" step="0.1" value={form.weight_tons} onChange={(event) => setForm((prev) => ({ ...prev, weight_tons: event.target.value }))} />
            </label>
            <label>
              Giá cước dự kiến
              <input type="text" value={form.planned_revenue ? formatCurrency(form.planned_revenue) : quoteLoading ? 'Đang tính...' : ''} readOnly />
            </label>
            {quote ? (
              <p className="muted">
                Quãng đường ước tính: <strong>{quote.distanceText}</strong> · Thời gian dự kiến: <strong>{quote.durationText}</strong>
              </p>
            ) : null}
            {quoteError ? <p className="error-message">{quoteError}</p> : null}
            <button className="primary-button">Gửi yêu cầu đặt đơn</button>
          </form>
        </div>
      </div>
      <div className="panel">
        <h3>Danh sách đơn hàng</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Mã đơn</th>
                <th>Tuyến</th>
                <th>Hàng hóa</th>
                <th>Giá cước</th>
                <th>Trạng thái đơn</th>
                <th>Chuyến</th>
                <th>Trạng thái chuyến</th>
                <th>Vị trí gần nhất</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.order_code}</td>
                  <td>{formatRouteLabel(row.pickup_location, row.delivery_location)}</td>
                  <td>{row.cargo_type}</td>
                  <td>{formatCurrency(row.planned_revenue)}</td>
                  <td><span className="status-badge" style={{ background: statusColor(row.status) }}>{getStatusLabel(row.status)}</span></td>
                  <td>{row.trip_code || '--'}</td>
                  <td>{row.trip_status ? <span className="status-badge" style={{ background: statusColor(row.trip_status) }}>{getStatusLabel(row.trip_status)}</span> : '--'}</td>
                  <td>
                    {row.latest_latitude && row.latest_longitude
                      ? `${formatNumber(row.latest_latitude, 5)}, ${formatNumber(row.latest_longitude, 5)}`
                      : 'Chưa có'}
                  </td>
                  <td className="action-cell">
                    <button className="inline-button" onClick={() => navigate(`/customer/route-map?mode=order&orderId=${row.id}`)}>
                      Xem bản đồ
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function TrackingPage({ token, trips }) {
  const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000';
  const [latest, setLatest] = useState([]);
  const [devices, setDevices] = useState([]);
  const [selectedTripId, setSelectedTripId] = useState('');
  const [history, setHistory] = useState([]);
  const [form, setForm] = useState({ latitude: '', longitude: '', speed_kmh: '', heading: '', note: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const sseRef = useRef(null);

  async function loadTracking(tripId = selectedTripId) {
    setLoading(true);
    setError('');
    try {
      const [latestRows, deviceRows] = await Promise.all([
        apiRequest('/tracking/latest', { token }),
        apiRequest('/tracking/devices', { token })
      ]);
      setLatest(latestRows);
      setDevices(deviceRows);
      if (tripId) {
        setHistory(await apiRequest(`/tracking/trips/${tripId}/locations`, { token }));
      } else {
        setHistory([]);
      }
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTracking().catch((loadError) => {
      setError(loadError.message);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!token) {
      return undefined;
    }

    const streamUrl = `${apiBaseUrl}/tracking/stream?token=${encodeURIComponent(token)}${selectedTripId ? `&tripId=${encodeURIComponent(selectedTripId)}` : ''}`;
    const source = new EventSource(streamUrl);
    sseRef.current = source;

    source.addEventListener('location', (event) => {
      try {
        const payload = JSON.parse(event.data);
        setLatest((prev) => {
          const next = prev.filter((item) => item.trip_id !== payload.trip_id);
          return [payload, ...next].sort((a, b) => new Date(b.recorded_at) - new Date(a.recorded_at));
        });
        if (selectedTripId && Number(selectedTripId) === Number(payload.trip_id)) {
          setHistory((prev) => [...prev, payload].sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at)));
        }
        setDevices((prev) =>
          prev.map((device) =>
            payload.gps_device_id && Number(device.id) === Number(payload.gps_device_id)
              ? { ...device, last_seen_at: payload.recorded_at }
              : device
          )
        );
      } catch (streamError) {
        console.error(streamError);
      }
    });

    source.onerror = () => {
      source.close();
      sseRef.current = null;
    };

    return () => {
      source.close();
      sseRef.current = null;
    };
  }, [apiBaseUrl, selectedTripId, token]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!selectedTripId) {
      setError('Cần chọn chuyến để ghi tọa độ.');
      return;
    }
    setError('');
    try {
      await apiRequest(`/tracking/trips/${selectedTripId}/locations`, {
        token,
        method: 'POST',
        body: {
          latitude: Number(form.latitude),
          longitude: Number(form.longitude),
          speed_kmh: form.speed_kmh === '' ? null : Number(form.speed_kmh),
          heading: form.heading === '' ? null : Number(form.heading),
          note: form.note
        }
      });
      setForm({ latitude: '', longitude: '', speed_kmh: '', heading: '', note: '' });
      await loadTracking(selectedTripId);
    } catch (submitError) {
      setError(submitError.message);
    }
  }

  function useBrowserLocation() {
    if (!navigator.geolocation) {
      setError('Trình duyệt không hỗ trợ lấy vị trí.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setForm((prev) => ({
          ...prev,
          latitude: String(position.coords.latitude.toFixed(7)),
          longitude: String(position.coords.longitude.toFixed(7)),
          speed_kmh: position.coords.speed ? String((position.coords.speed * 3.6).toFixed(1)) : prev.speed_kmh
        }));
      },
      (locationError) => setError(locationError.message)
    );
  }

  return (
    <section className="stack">
      <div className="page-header">
        <div>
          <p className="eyebrow">Giám sát</p>
          <h2>GPS thời gian thực đội xe</h2>
        </div>
        <button className="inline-button" onClick={() => loadTracking(selectedTripId)}>
          {loading ? 'Đang tải...' : 'Làm mới'}
        </button>
      </div>
      {error ? <p className="error-text">{error}</p> : null}

      <div className="forecast-grid">
        <div className="panel stack">
          <div>
            <h3>Ghi tọa độ xe</h3>
            <p className="muted">Dispatcher có thể nhập tọa độ test; tài xế có thể dùng nút lấy vị trí trên màn chuyến được giao; thiết bị GPS thật có thể đẩy dữ liệu qua token riêng.</p>
          </div>
          <div className="panel stack" style={{ padding: '16px', background: '#f8fafc' }}>
            <div>
              <strong>Thiết bị GPS đang kết nối</strong>
              <p className="muted">Dùng endpoint công khai <code>/tracking/device/ingest</code> với header <code>x-device-token</code> để mô phỏng thiết bị thật gửi tọa độ.</p>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Mã thiết bị</th>
                    <th>Token</th>
                    <th>Chuyến</th>
                    <th>Xe</th>
                    <th>Tài xế</th>
                    <th>Lần cuối gửi</th>
                  </tr>
                </thead>
                <tbody>
                  {devices.map((device) => (
                    <tr key={device.id}>
                      <td>{device.device_code}</td>
                      <td><code>{device.device_token}</code></td>
                      <td>{device.trip_code || '--'}</td>
                      <td>{device.license_plate || '--'}</td>
                      <td>{device.driver_name || '--'}</td>
                      <td>{device.last_seen_at || 'Chưa có tín hiệu'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <form className="stack" onSubmit={handleSubmit}>
            <label>
              Chuyến
              <select
                value={selectedTripId}
                onChange={(event) => {
                  const tripId = event.target.value;
                  setSelectedTripId(tripId);
                  loadTracking(tripId).catch((loadError) => setError(loadError.message));
                }}
              >
                <option value="">Chọn chuyến</option>
                {trips.map((trip) => (
                  <option key={trip.id} value={trip.id}>{trip.trip_code} - {trip.license_plate}</option>
                ))}
              </select>
            </label>
            <div className="time-window-grid">
              <label>
                Latitude
                <input type="number" step="0.0000001" value={form.latitude} onChange={(event) => setForm((prev) => ({ ...prev, latitude: event.target.value }))} />
              </label>
              <label>
                Longitude
                <input type="number" step="0.0000001" value={form.longitude} onChange={(event) => setForm((prev) => ({ ...prev, longitude: event.target.value }))} />
              </label>
            </div>
            <div className="time-window-grid">
              <label>
                Tốc độ km/h
                <input type="number" step="0.1" value={form.speed_kmh} onChange={(event) => setForm((prev) => ({ ...prev, speed_kmh: event.target.value }))} />
              </label>
              <label>
                Hướng
                <input type="number" step="0.1" value={form.heading} onChange={(event) => setForm((prev) => ({ ...prev, heading: event.target.value }))} />
              </label>
            </div>
            <label>
              Ghi chú
              <textarea value={form.note} onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))} />
            </label>
            <div className="action-row">
              <button className="primary-button">Lưu tọa độ</button>
              <button className="inline-button" type="button" onClick={useBrowserLocation}>Lấy vị trí trình duyệt</button>
            </div>
          </form>
        </div>

        <div className="panel">
          <h3>Vị trí mới nhất</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Chuyến</th>
                  <th>Nguồn</th>
                  <th>Thiết bị</th>
                  <th>Xe</th>
                  <th>Tài xế</th>
                  <th>Tọa độ</th>
                  <th>Tốc độ</th>
                  <th>Thời gian</th>
                </tr>
              </thead>
              <tbody>
                {latest.map((row) => (
                  <tr key={row.id}>
                    <td>{row.trip_code}</td>
                    <td>{row.source === 'GPS_DEVICE' ? 'Thiết bị GPS' : row.source === 'DISPATCHER' ? 'Điều phối' : 'Trình duyệt'}</td>
                    <td>{row.device_code || '--'}</td>
                    <td>{row.license_plate}</td>
                    <td>{row.driver_name}</td>
                    <td>{formatNumber(row.latitude, 6)}, {formatNumber(row.longitude, 6)}</td>
                    <td>{row.speed_kmh ?? '--'}</td>
                    <td>{row.recorded_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="panel">
        <h3>Lịch sử tọa độ chuyến đang chọn</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Nguồn</th>
                <th>Thiết bị</th>
                <th>Latitude</th>
                <th>Longitude</th>
                <th>Tốc độ</th>
                <th>Ghi chú</th>
                <th>Thời gian</th>
              </tr>
            </thead>
            <tbody>
              {history.map((row, index) => (
                <tr key={row.id}>
                  <td>{index + 1}</td>
                  <td>{row.source === 'GPS_DEVICE' ? 'Thiết bị GPS' : row.source === 'DISPATCHER' ? 'Điều phối' : 'Trình duyệt'}</td>
                  <td>{row.device_code || '--'}</td>
                  <td>{formatNumber(row.latitude, 7)}</td>
                  <td>{formatNumber(row.longitude, 7)}</td>
                  <td>{row.speed_kmh ?? '--'}</td>
                  <td>{row.note || '--'}</td>
                  <td>{row.recorded_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function DispatchPage({ trips, orders, trucks, drivers, tripForm, setTripForm, onSaveTrip, onAssignOrders, refresh }) {
  const availableOrders = orders.filter((order) => order.status === 'PENDING_DISPATCH' || order.status === 'ASSIGNED');

  return (
    <section className="stack">
      <div className="page-header">
        <div>
          <p className="eyebrow">Điều độ</p>
          <h2>Tạo và điều phối chuyến</h2>
        </div>
      </div>
      <div className="resource-grid">
        <div className="panel">
          <h3>Tạo chuyến mới</h3>
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              onSaveTrip();
            }}
          >
            <label>
              Mã chuyến
              <input value={tripForm.trip_code} onChange={(event) => setTripForm((prev) => ({ ...prev, trip_code: event.target.value }))} />
            </label>
            <label>
              Xe
              <select value={tripForm.truck_id} onChange={(event) => setTripForm((prev) => ({ ...prev, truck_id: event.target.value }))}>
                <option value="">Chọn xe</option>
                {trucks.map((truck) => <option key={truck.id} value={truck.id}>{truck.license_plate}</option>)}
              </select>
            </label>
            <label>
              Tài xế
              <select value={tripForm.driver_id} onChange={(event) => setTripForm((prev) => ({ ...prev, driver_id: event.target.value }))}>
                <option value="">Chọn tài xế</option>
                {drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.full_name}</option>)}
              </select>
            </label>
            <label>
              Ngày bắt đầu
              <input type="datetime-local" value={tripForm.start_date} onChange={(event) => setTripForm((prev) => ({ ...prev, start_date: event.target.value }))} />
            </label>
            <label>
              Nơi đi
              <input value={tripForm.origin} onChange={(event) => setTripForm((prev) => ({ ...prev, origin: event.target.value }))} />
            </label>
            <label>
              Nơi đến
              <input value={tripForm.destination} onChange={(event) => setTripForm((prev) => ({ ...prev, destination: event.target.value }))} />
            </label>
            <label>
              Ghi chú
              <textarea value={tripForm.notes} onChange={(event) => setTripForm((prev) => ({ ...prev, notes: event.target.value }))} />
            </label>
            <button className="primary-button">Tạo chuyến</button>
          </form>
        </div>
        <div className="panel">
          <h3>Gán đơn vào chuyến</h3>
          <div className="stack">
            {trips.map((trip) => (
              <DispatchCard
                key={trip.id}
                trip={trip}
                availableOrders={availableOrders}
                onAssignOrders={onAssignOrders}
                refresh={refresh}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function DispatchCard({ trip, availableOrders, onAssignOrders, refresh }) {
  const [selected, setSelected] = useState([]);

  return (
    <div className="dispatch-card">
      <div className="dispatch-header">
        <div>
          <strong>{trip.trip_code}</strong>
          <p>{trip.origin} - {trip.destination}</p>
          <small>{trip.license_plate} / {trip.driver_name}</small>
        </div>
        <span className="status-badge" style={{ background: statusColor(trip.status) }}>{getStatusLabel(trip.status)}</span>
      </div>
      <label>
        Đơn hàng
        <select
          multiple
          value={selected}
          onChange={(event) => setSelected(Array.from(event.target.selectedOptions, (option) => Number(option.value)))}
        >
          {availableOrders.map((order) => (
            <option key={order.id} value={order.id}>
              {order.order_code} - {order.pickup_location} - {order.delivery_location}
            </option>
          ))}
        </select>
      </label>
      <div className="action-row">
        <button className="primary-button" onClick={() => onAssignOrders(trip.id, selected)}>Gán đơn</button>
        <button className="inline-button" onClick={() => refresh('dispatch')}>Tải lại</button>
      </div>
    </div>
  );
}

function DriverLocationControls({ trip, token }) {
  const [status, setStatus] = useState('');

  function submitLocation() {
    setStatus('Đang lấy vị trí...');
    if (!navigator.geolocation) {
      setStatus('Trình duyệt không hỗ trợ GPS.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          await apiRequest(`/tracking/trips/${trip.id}/locations`, {
            token,
            method: 'POST',
            body: {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              speed_kmh: position.coords.speed ? Number((position.coords.speed * 3.6).toFixed(1)) : null,
              heading: position.coords.heading,
              note: 'Cập nhật từ trình duyệt tài xế'
            }
          });
          setStatus('Đã gửi vị trí GPS.');
        } catch (error) {
          setStatus(error.message);
        }
      },
      (error) => setStatus(error.message),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  return (
    <div className="stack driver-location-box">
      <button className="inline-button" type="button" onClick={submitLocation}>
        Gửi vị trí GPS hiện tại
      </button>
      {status ? <p className="muted">{status}</p> : null}
    </div>
  );
}

function TripsPage({ trips, auth, onTripStatus, refresh, token }) {
  const navigate = useNavigate();

  useEffect(() => {
    refresh('trips').catch((error) => {
      console.error(error);
    });
  }, [refresh]);

  return (
    <section className="stack">
      <div className="page-header">
        <div>
          <p className="eyebrow">{auth.user.role === 'DRIVER' ? 'Tài xế' : 'Điều hành'}</p>
          <h2>{auth.user.role === 'DRIVER' ? 'Chuyến được giao' : 'Danh sách chuyến hàng'}</h2>
        </div>
      </div>
      {!trips.length ? <p className="muted">Chưa có chuyến hàng nào hoặc dữ liệu đang được tải lại.</p> : null}
      <div className={auth.user.role === 'DRIVER' ? 'driver-trip-grid' : 'stack'}>
        {trips.map((trip) => (
          <div key={trip.id} className="panel trip-card">
            <div className="dispatch-header">
              <div>
                <h3>{trip.trip_code}</h3>
                <p>{trip.origin} - {trip.destination}</p>
                <small>{trip.license_plate} / {trip.driver_name}</small>
              </div>
              <span className="status-badge" style={{ background: statusColor(trip.status) }}>{getStatusLabel(trip.status)}</span>
            </div>
            <div className="trip-orders">
              <strong>Đơn trong chuyến</strong>
              {trip.orders?.length ? (
                trip.orders.map((order) => (
                  <div key={order.id} className="trip-order-row">
                    <span>{order.order_code}</span>
                    <span>{order.pickup_location} - {order.delivery_location}</span>
                  </div>
                ))
              ) : (
                <p className="muted">Chưa có đơn hàng</p>
              )}
            </div>
            <div className="action-row">
              <button className="inline-button" onClick={() => navigate(`/route-map?mode=trip&tripId=${trip.id}`)}>
                Theo dõi chuyến
              </button>
              {trip.status !== 'IN_TRANSIT' ? (
                <button className="primary-button" onClick={() => onTripStatus(trip.id, 'IN_TRANSIT')}>
                  Bắt đầu vận chuyển
                </button>
              ) : null}
              {trip.status !== 'COMPLETED' ? (
                <button className="inline-button" onClick={() => onTripStatus(trip.id, 'COMPLETED')}>
                  Xác nhận hoàn tất
                </button>
              ) : null}
            </div>
            {auth.user.role === 'DRIVER' ? <DriverLocationControls trip={trip} token={token} /> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function statusColor(status) {
  const palette = {
    PENDING_DISPATCH: '#f59e0b',
    ASSIGNED: '#2563eb',
    IN_TRANSIT: '#0f766e',
    COMPLETED: '#16a34a',
    CANCELLED: '#dc2626',
    PLANNED: '#64748b',
    INCIDENT: '#b91c1c'
  };
  return palette[status] || '#334155';
}

function defaultTruckForm() {
  return {
    license_plate: '',
    truck_type: '',
    capacity_tons: '',
    status: 'AVAILABLE',
    cumulative_km: '',
    maintenance_interval_km: '10000',
    last_maintenance_km: '0',
    last_maintenance_date: ''
  };
}

function defaultDriverForm() {
  return { user_id: '', full_name: '', phone: '', license_number: '', license_class: 'FC', status: 'AVAILABLE' };
}

function defaultCustomerForm() {
  return { name: '', phone: '', email: '', address: '' };
}

function defaultOrderForm() {
  return {
    customer_id: '',
    order_code: '',
    pickup_location: '',
    delivery_location: '',
    cargo_type: '',
    weight_tons: '',
    planned_revenue: '',
    status: 'PENDING_DISPATCH'
  };
}

function defaultCustomerPortalOrderForm() {
  return {
    pickup_location: '',
    delivery_location: '',
    cargo_type: '',
    weight_tons: '',
    planned_revenue: ''
  };
}

function defaultTripForm() {
  return {
    trip_code: '',
    truck_id: '',
    driver_id: '',
    start_date: '',
    origin: '',
    destination: '',
    notes: ''
  };
}

export default function App() {
  const [auth, setAuth] = useAuthState();
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [summary, setSummary] = useState(null);
  const [trucks, setTrucks] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [customerProfile, setCustomerProfile] = useState(null);
  const [trips, setTrips] = useState([]);
  const [users, setUsers] = useState([]);
  const [depots, setDepots] = useState([]);
  const [truckForm, setTruckForm] = useState(defaultTruckForm());
  const [driverForm, setDriverForm] = useState(defaultDriverForm());
  const [customerForm, setCustomerForm] = useState(defaultCustomerForm());
  const [orderForm, setOrderForm] = useState(defaultOrderForm());
  const [customerPortalOrderForm, setCustomerPortalOrderForm] = useState(defaultCustomerPortalOrderForm());
  const [customerQuote, setCustomerQuote] = useState(null);
  const [customerQuoteLoading, setCustomerQuoteLoading] = useState(false);
  const [customerQuoteError, setCustomerQuoteError] = useState('');
  const [tripForm, setTripForm] = useState(defaultTripForm());
  const [userForm, setUserForm] = useState({ username: '', full_name: '', role: 'DISPATCHER', password: '' });
  const [depotForm, setDepotForm] = useState({ depot_code: '', name: '', location: '', latitude: '', longitude: '', status: 'ACTIVE' });
  const navigate = useNavigate();
  const location = useLocation();

  const isAuthenticated = Boolean(auth.token);

  const token = auth.token;
  const role = auth.user?.role;
  const isBackoffice = role === 'ADMIN' || role === 'DISPATCHER';
  const isDriver = role === 'DRIVER';
  const isCustomer = role === 'CUSTOMER';

  const loadAll = useMemo(
    () => async (target = 'all') => {
      if (!token) {
        return;
      }

      if (isBackoffice && (target === 'all' || target === 'dashboard')) {
        const summaryData = await apiRequest('/reports/summary', { token });
        setSummary(summaryData);
      }
      if (role === 'ADMIN' && (target === 'all' || target === 'users')) {
        setUsers(await apiRequest('/users', { token }));
      }
      if (isBackoffice && (target === 'all' || target === 'depots')) {
        setDepots(await apiRequest('/depots', { token }));
      }
      if (isBackoffice && (target === 'all' || target === 'trucks')) {
        setTrucks(await apiRequest('/trucks', { token }));
      }
      if (isBackoffice && (target === 'all' || target === 'drivers')) {
        setDrivers(await apiRequest('/drivers', { token }));
      }
      if (isBackoffice && (target === 'all' || target === 'customers')) {
        setCustomers(await apiRequest('/customers', { token }));
      }
      if (isBackoffice && (target === 'all' || target === 'orders' || target === 'dispatch')) {
        setOrders(await apiRequest('/orders', { token }));
      }
      if (isCustomer && (target === 'all' || target === 'customer-orders')) {
        const [profile, ownOrders] = await Promise.all([
          apiRequest('/customer-portal/profile', { token }),
          apiRequest('/customer-portal/orders', { token })
        ]);
        setCustomerProfile(profile);
        setOrders(ownOrders);
      }
      if (!isCustomer && (target === 'all' || target === 'trips' || target === 'dispatch')) {
        setTrips(await apiRequest('/trips', { token }));
      }
    },
    [isBackoffice, isCustomer, token, role]
  );

  useEffect(() => {
    loadAll().catch((error) => {
      console.error(error);
    });
  }, [loadAll]);

  useEffect(() => {
    function handleAuthExpired(event) {
      const message = event?.detail || 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
      setAuth({ token: '', user: null });
      setLoginError(message);
      navigate('/login');
    }

    window.addEventListener('tms-auth-expired', handleAuthExpired);
    return () => window.removeEventListener('tms-auth-expired', handleAuthExpired);
  }, [navigate, setAuth]);

  useEffect(() => {
    if (!token) {
      return;
    }

    let target = 'all';
    if (location.pathname === '/') {
      target = 'dashboard';
    } else if (location.pathname.startsWith('/users')) {
      target = 'users';
    } else if (location.pathname.startsWith('/depots')) {
      target = 'depots';
    } else if (location.pathname.startsWith('/trucks')) {
      target = 'trucks';
    } else if (location.pathname.startsWith('/drivers')) {
      target = 'drivers';
    } else if (location.pathname.startsWith('/customers')) {
      target = 'customers';
    } else if (location.pathname.startsWith('/customer/orders') || location.pathname.startsWith('/customer/route-map')) {
      target = 'customer-orders';
    } else if (location.pathname.startsWith('/orders')) {
      target = 'orders';
    } else if (location.pathname.startsWith('/route-map')) {
      target = 'dispatch';
    } else if (location.pathname.startsWith('/dispatch') || location.pathname.startsWith('/tracking')) {
      target = 'dispatch';
    } else if (location.pathname.startsWith('/trips') || location.pathname.startsWith('/driver/trips')) {
      target = 'trips';
    }

    loadAll(target).catch((error) => {
      console.error(error);
    });
  }, [location.pathname, loadAll, token]);

  useEffect(() => {
    if (!isCustomer || !token) {
      return undefined;
    }

    const pickupLocation = customerPortalOrderForm.pickup_location.trim();
    const deliveryLocation = customerPortalOrderForm.delivery_location.trim();
    const weightTons = Number(customerPortalOrderForm.weight_tons);

    if (!pickupLocation || !deliveryLocation || !Number.isFinite(weightTons) || weightTons <= 0) {
      setCustomerQuote(null);
      setCustomerQuoteError('');
      setCustomerPortalOrderForm((prev) => (prev.planned_revenue ? { ...prev, planned_revenue: '' } : prev));
      return undefined;
    }

    let active = true;
    const timer = setTimeout(async () => {
      setCustomerQuoteLoading(true);
      setCustomerQuoteError('');
      try {
        const quote = await apiRequest('/customer-portal/orders/quote', {
          token,
          method: 'POST',
          body: {
            pickup_location: pickupLocation,
            delivery_location: deliveryLocation,
            weight_tons: weightTons
          }
        });
        if (!active) {
          return;
        }
        setCustomerQuote(quote);
        setCustomerPortalOrderForm((prev) => {
          if (
            prev.pickup_location.trim() !== pickupLocation ||
            prev.delivery_location.trim() !== deliveryLocation ||
            Number(prev.weight_tons) !== weightTons
          ) {
            return prev;
          }
          return {
            ...prev,
            pickup_location: quote.pickupLocationNormalized || prev.pickup_location,
            delivery_location: quote.deliveryLocationNormalized || prev.delivery_location,
            planned_revenue: String(quote.estimatedPrice || '')
          };
        });
      } catch (error) {
        if (!active) {
          return;
        }
        setCustomerQuote(null);
        setCustomerQuoteError(error.message);
        setCustomerPortalOrderForm((prev) => (prev.planned_revenue ? { ...prev, planned_revenue: '' } : prev));
      } finally {
        if (active) {
          setCustomerQuoteLoading(false);
        }
      }
    }, 500);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [
    customerPortalOrderForm.delivery_location,
    customerPortalOrderForm.pickup_location,
    customerPortalOrderForm.weight_tons,
    isCustomer,
    token
  ]);

  async function handleLogin(credentials) {
    setLoginLoading(true);
    setLoginError('');
    try {
      const data = await login(credentials.username, credentials.password);
      const normalizedAuth = {
        ...data,
        user: {
          ...data.user,
          role: data.user.role || roleById[data.user.role_id] || 'DISPATCHER',
          fullName: data.user.fullName || data.user.full_name || data.user.username
        }
      };
      setAuth(normalizedAuth);
      navigate(normalizedAuth.user.role === 'DRIVER' ? '/driver/trips' : normalizedAuth.user.role === 'CUSTOMER' ? '/customer/orders' : '/');
    } catch (error) {
      setLoginError(error.message);
    } finally {
      setLoginLoading(false);
    }
  }

  function handleLogout() {
    setAuth({ token: '', user: null });
    navigate('/login');
  }

  async function saveResource(endpoint, form, reset, reloadTarget, setter) {
    const method = form.id ? 'PUT' : 'POST';
    const path = form.id ? `${endpoint}/${form.id}` : endpoint;
    const payload = Object.fromEntries(Object.entries(form).filter(([, value]) => value !== ''));
    await apiRequest(path, { token, method, body: payload });
    setter(reset());
    await loadAll(reloadTarget);
  }

  async function deleteResource(endpoint, id, reloadTarget) {
    await apiRequest(`${endpoint}/${id}`, { token, method: 'DELETE' });
    await loadAll(reloadTarget);
  }

  async function saveTrip() {
    await apiRequest('/trips', {
      token,
      method: 'POST',
      body: {
        ...tripForm,
        truck_id: Number(tripForm.truck_id),
        driver_id: Number(tripForm.driver_id),
        start_date: tripForm.start_date.replace('T', ' ') + ':00'
      }
    });
    setTripForm(defaultTripForm());
    await loadAll('dispatch');
  }

  async function saveCustomerPortalOrder() {
    if (!customerPortalOrderForm.planned_revenue) {
      throw new Error('Chưa tính được giá cước cho đơn hàng này.');
    }
    await apiRequest('/customer-portal/orders', {
      token,
      method: 'POST',
      body: {
        ...customerPortalOrderForm,
        weight_tons: Number(customerPortalOrderForm.weight_tons)
      }
    });
    setCustomerPortalOrderForm(defaultCustomerPortalOrderForm());
    setCustomerQuote(null);
    setCustomerQuoteError('');
    await loadAll('customer-orders');
  }

  async function assignOrders(tripId, orderIds) {
    if (!orderIds.length) return;
    await apiRequest(`/trips/${tripId}/assign-orders`, {
      token,
      method: 'POST',
      body: { orderIds }
    });
    await loadAll('dispatch');
  }

  async function updateTripStatus(tripId, status) {
    await apiRequest(`/trips/${tripId}/status`, {
      token,
      method: 'POST',
      body: { status, note: `Cập nhật bởi ${auth.user.fullName}` }
    });
    await loadAll('trips');
    if (role !== 'DRIVER') {
      await loadAll('dashboard');
      await loadAll('orders');
    }
  }

  if (!isAuthenticated) {
    return <LoginPage onLogin={handleLogin} loading={loginLoading} error={loginError} />;
  }

  return (
    <Layout auth={auth} onLogout={handleLogout}>
      <Routes>
        {isBackoffice ? (
          <>
            <Route path="/" element={<DashboardPage summary={summary} />} />
            <Route path="/forecasting" element={<ForecastingPage token={token} trucks={trucks} refreshTrucks={loadAll} />} />
            <Route path="/reports" element={<ReportExportsPage token={token} />} />
            {role === 'ADMIN' ? (
              <>
                <Route
                  path="/users"
                  element={
                    <UsersPage
                      rows={users}
                      form={userForm}
                      setForm={setUserForm}
                      onSave={() =>
                        saveResource('/users', userForm, () => ({ username: '', full_name: '', role: 'DISPATCHER', password: '' }), 'users', setUserForm)
                      }
                      onEdit={(row) => setUserForm(row)}
                      onDelete={(id) => deleteResource('/users', id, 'users')}
                    />
                  }
                />
                <Route
                  path="/depots"
                  element={
                    <ResourcePage
                      title="Quản lý kho vận hành"
                      fields={[
                        { name: 'depot_code', label: 'Mã kho' },
                        { name: 'name', label: 'Tên kho' },
                        { name: 'location', label: 'Địa điểm' },
                        { name: 'latitude', label: 'Vĩ độ', type: 'number' },
                        { name: 'longitude', label: 'Kinh độ', type: 'number' },
                        { name: 'status', label: 'Trạng thái', type: 'select', options: ['ACTIVE', 'INACTIVE'] }
                      ]}
                      rows={depots}
                      form={depotForm}
                      setForm={setDepotForm}
                      onSave={() => saveResource('/depots', depotForm, () => ({ depot_code: '', name: '', location: '', latitude: '', longitude: '', status: 'ACTIVE' }), 'depots', setDepotForm)}
                      onEdit={(row) => setDepotForm(row)}
                      onDelete={(id) => deleteResource('/depots', id, 'depots')}
                    />
                  }
                />
            <Route
              path="/trucks"
              element={
                <ResourcePage
                  title="Quản lý xe"
                  fields={[
                    { name: 'license_plate', label: 'Biển số' },
                    { name: 'truck_type', label: 'Loại xe' },
                    { name: 'capacity_tons', label: 'Tải trọng', type: 'number' },
                    { name: 'status', label: 'Trạng thái', type: 'select', options: ['AVAILABLE', 'IN_USE', 'MAINTENANCE'] },
                    { name: 'cumulative_km', label: 'Km tích lũy', type: 'number' },
                    { name: 'maintenance_interval_km', label: 'Chu kỳ bảo trì (km)', type: 'number' },
                    { name: 'last_maintenance_km', label: 'Mốc bảo trì gần nhất', type: 'number' },
                    { name: 'last_maintenance_date', label: 'Ngày bảo trì gần nhất', type: 'date' }
                  ]}
                  rows={trucks}
                  form={truckForm}
                  setForm={setTruckForm}
                  onSave={() => saveResource('/trucks', truckForm, defaultTruckForm, 'trucks', setTruckForm)}
                  onEdit={(row) => setTruckForm(row)}
                  onDelete={(id) => deleteResource('/trucks', id, 'trucks')}
                />
              }
            />
            <Route
              path="/drivers"
              element={
                <ResourcePage
                  title="Quản lý tài xế"
                  fields={[
                    { name: 'full_name', label: 'Họ tên' },
                    { name: 'phone', label: 'Số điện thoại' },
                    { name: 'license_number', label: 'Số bằng lái' },
                    { name: 'license_class', label: 'Hạng bằng' },
                    { name: 'status', label: 'Trạng thái', type: 'select', options: ['AVAILABLE', 'ON_TRIP', 'INACTIVE'] }
                  ]}
                  rows={drivers}
                  form={driverForm}
                  setForm={setDriverForm}
                  onSave={() => saveResource('/drivers', driverForm, defaultDriverForm, 'drivers', setDriverForm)}
                  onEdit={(row) => setDriverForm(row)}
                  onDelete={(id) => deleteResource('/drivers', id, 'drivers')}
                />
              }
            />
            <Route
              path="/customers"
              element={
                <ResourcePage
                  title="Quản lý khách hàng"
                  fields={[
                    { name: 'name', label: 'Tên khách hàng' },
                    { name: 'phone', label: 'Số điện thoại' },
                    { name: 'email', label: 'Email' },
                    { name: 'address', label: 'Địa chỉ' }
                  ]}
                  rows={customers}
                  form={customerForm}
                  setForm={setCustomerForm}
                  onSave={() => saveResource('/customers', customerForm, defaultCustomerForm, 'customers', setCustomerForm)}
                  onEdit={(row) => setCustomerForm(row)}
                  onDelete={(id) => deleteResource('/customers', id, 'customers')}
                />
              }
            />
              </>
            ) : null}
            {role === 'DISPATCHER' ? (
              <>
            <Route path="/route-map" element={<RouteMapPage orders={orders} trips={trips} token={token} />} />
            <Route path="/tracking" element={<TrackingPage token={token} trips={trips} />} />
            <Route path="/optimizer" element={<OptimizerPage orders={orders} trucks={trucks} token={token} />} />
            <Route path="/optimizer-history" element={<OptimizerHistoryPage token={token} />} />
            <Route
              path="/orders"
              element={
                <OrdersPage
                  rows={orders}
                  customers={customers}
                  form={orderForm}
                  setForm={setOrderForm}
                  onSave={() => saveResource('/orders', orderForm, defaultOrderForm, 'orders', setOrderForm)}
                  onEdit={(row) => setOrderForm(row)}
                />
              }
            />
            <Route
              path="/dispatch"
              element={
                <DispatchPage
                  trips={trips}
                  orders={orders}
                  trucks={trucks}
                  drivers={drivers}
                  tripForm={tripForm}
                  setTripForm={setTripForm}
                  onSaveTrip={saveTrip}
                  onAssignOrders={assignOrders}
                  refresh={loadAll}
                />
              }
            />
            <Route path="/trips" element={<TripsPage trips={trips} auth={auth} onTripStatus={updateTripStatus} refresh={loadAll} token={token} />} />
              </>
            ) : null}
          </>
        ) : isDriver ? (
          <>
            <Route path="/driver/trips" element={<TripsPage trips={trips} auth={auth} onTripStatus={updateTripStatus} refresh={loadAll} token={token} />} />
            <Route path="*" element={<Navigate to="/driver/trips" replace />} />
          </>
        ) : (
          <>
            <Route
              path="/customer/orders"
              element={
                <CustomerOrdersPage
                  profile={customerProfile}
                  rows={orders}
                  form={customerPortalOrderForm}
                  setForm={setCustomerPortalOrderForm}
                  quote={customerQuote}
                  quoteLoading={customerQuoteLoading}
                  quoteError={customerQuoteError}
                  onSave={saveCustomerPortalOrder}
                />
              }
            />
            <Route path="/customer/route-map" element={<RouteMapPage orders={orders} trips={[]} token={token} apiNamespace="customer-portal" />} />
            <Route path="*" element={<Navigate to="/customer/orders" replace />} />
          </>
        )}
        <Route path="/login" element={<Navigate to={role === 'DRIVER' ? '/driver/trips' : role === 'CUSTOMER' ? '/customer/orders' : '/'} replace />} />
        <Route path="*" element={<Navigate to={role === 'DRIVER' ? '/driver/trips' : role === 'CUSTOMER' ? '/customer/orders' : '/'} replace />} />
      </Routes>
    </Layout>
  );
}

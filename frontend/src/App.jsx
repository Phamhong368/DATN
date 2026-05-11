import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
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
  { key: 'tracking', label: 'GPS realtime', path: '/tracking', roles: ['DISPATCHER'] },
  { key: 'reports', label: 'Báo cáo', path: '/reports', roles: ['ADMIN', 'DISPATCHER'] },
  { key: 'forecasting', label: 'Dự báo nhiên liệu', path: '/forecasting', roles: ['ADMIN', 'DISPATCHER'] }
];

const orderStatusOptions = ['PENDING_DISPATCH', 'ASSIGNED', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED'];
const tripStatusOptions = ['PLANNED', 'ASSIGNED', 'IN_TRANSIT', 'COMPLETED', 'INCIDENT'];
const mapboxAccessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || '';
const roleById = {
  1: 'ADMIN',
  2: 'DISPATCHER',
  3: 'DRIVER'
};

function useAuthState() {
  const [auth, setAuth] = useState(() => {
    const raw = localStorage.getItem('tms-auth');
    return raw ? JSON.parse(raw) : { token: '', user: null };
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

function getRoleLabel(role) {
  const labels = {
    ADMIN: 'Quản trị viên',
    DISPATCHER: 'Điều phối viên',
    DRIVER: 'Tài xế'
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

function RouteMapPage({ orders, token }) {
  const [searchParams] = useSearchParams();
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRefs = useRef([]);
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
  const previewPoints = useMemo(() => buildRoutePreviewPoints(routeResult?.stops || []), [routeResult]);

  useEffect(() => {
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
      setForm((prev) => ({
        ...prev,
        origin,
        destination,
        waypoints: parsedWaypoints
      }));
    }
  }, [searchParams]);

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
      fetchMapboxSuggestions(query)
        .then((items) => {
          setAddressSuggestions((prev) => ({ ...prev, [activeSuggestionField]: items }));
        })
        .catch(() => {
          setAddressSuggestions((prev) => ({ ...prev, [activeSuggestionField]: [] }));
        });
    }, 250);

    return () => clearTimeout(timer);
  }, [activeSuggestionField, form]);

  async function handleCalculateRoute(event) {
    event.preventDefault();
    setMapError('');
    setActiveSuggestionField('');
    setRouteLoading(true);

    try {
      const preview = await apiRequest('/optimizer/route-preview', {
        token,
        method: 'POST',
        body: {
          origin: selectedLocations.origin
            ? { address: form.origin, coordinate: selectedLocations.origin.coordinate }
            : form.origin,
          destination: selectedLocations.destination
            ? { address: form.destination, coordinate: selectedLocations.destination.coordinate }
            : form.destination,
          waypoints: form.waypoints,
          travelMode: form.travelMode
        }
      });

      setRouteResult(preview);
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

  function selectSuggestion(field, suggestion) {
    setForm((prev) => ({ ...prev, [field]: suggestion.label }));
    setSelectedLocations((prev) => ({ ...prev, [field]: suggestion }));
    setAddressSuggestions((prev) => ({ ...prev, [field]: [] }));
    setActiveSuggestionField('');
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
    if (!mapboxAccessToken || !mapContainerRef.current) {
      return;
    }

    mapboxgl.accessToken = mapboxAccessToken;

    try {
      const map =
        mapInstanceRef.current ||
        new mapboxgl.Map({
          container: mapContainerRef.current,
          style: 'mapbox://styles/mapbox/streets-v12',
          center: [106.7009, 16.0544],
          zoom: 5
        });

      mapInstanceRef.current = map;

      const renderRoute = () => {
        setMapRenderError('');

        markerRefs.current.forEach((marker) => marker.remove());
        markerRefs.current = [];

        const sourceId = 'route-preview-source';
        const layerId = 'route-preview-layer';

        if (map.getLayer(layerId)) {
          map.removeLayer(layerId);
        }
        if (map.getSource(sourceId)) {
          map.removeSource(sourceId);
        }

        if (!routeResult?.stops?.length) {
          map.setCenter([106.7009, 16.0544]);
          map.setZoom(5);
          return;
        }

        const geojson = {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: (routeResult.path || []).map((point) => [point.lng, point.lat])
          }
        };

        if (geojson.geometry.coordinates.length > 1) {
          map.addSource(sourceId, { type: 'geojson', data: geojson });
          map.addLayer({
            id: layerId,
            type: 'line',
            source: sourceId,
            layout: {
              'line-cap': 'round',
              'line-join': 'round'
            },
            paint: {
              'line-color': '#2563eb',
              'line-width': 5,
              'line-opacity': 0.9
            }
          });
        }

        routeResult.stops.forEach((stop, index) => {
          const markerElement = document.createElement('div');
          markerElement.className = 'route-map-marker';
          markerElement.textContent = String(index + 1);
          const marker = new mapboxgl.Marker({ element: markerElement })
            .setLngLat([stop.coordinate.lng, stop.coordinate.lat])
            .setPopup(new mapboxgl.Popup({ offset: 18 }).setText(stop.address))
            .addTo(map);
          markerRefs.current.push(marker);
        });

        const bounds = new mapboxgl.LngLatBounds();
        routeResult.stops.forEach((stop) => bounds.extend([stop.coordinate.lng, stop.coordinate.lat]));
        map.fitBounds(bounds, { padding: 60, maxZoom: 11 });
      };

      if (map.isStyleLoaded()) {
        renderRoute();
      } else {
        map.once('load', renderRoute);
      }
    } catch (error) {
      setMapRenderError(error.message || 'Không thể hiển thị Mapbox. Đã chuyển sang sơ đồ tuyến nội bộ.');
    }
  }, [routeResult, mapboxAccessToken]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!mapboxAccessToken || !map || !token) {
      return undefined;
    }

    async function handleMapClick(event) {
      if (!mapPickTarget) {
        return;
      }

      setReverseLoading(true);
      setMapError('');

      try {
        const location = await apiRequest('/optimizer/reverse-geocode', {
          token,
          method: 'POST',
          body: {
            lat: event.lngLat.lat,
            lng: event.lngLat.lng
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

    map.on('click', handleMapClick);
    return () => {
      map.off('click', handleMapClick);
    };
  }, [mapPickTarget, mapboxAccessToken, token]);

  useEffect(() => () => {
    markerRefs.current.forEach((marker) => marker.remove());
    markerRefs.current = [];
    mapInstanceRef.current?.remove();
    mapInstanceRef.current = null;
  }, []);

  return (
    <section className="stack">
      <div className="page-header">
        <div>
          <p className="eyebrow">Bản đồ</p>
          <h2>Công cụ tính toán lộ trình tối ưu</h2>
        </div>
      </div>

      <div className="route-grid">
        <div className="panel stack">
          <div>
            <h3>Tính tuyến đường</h3>
            <p className="muted">Nhập điểm đi, điểm đến hoặc chọn nhanh từ đơn hàng đã có trong hệ thống.</p>
            {form.waypoints.length ? (
              <p className="muted">Tuyến đang có {form.waypoints.length} điểm dừng trung gian từ lịch sử tối ưu.</p>
            ) : null}
          </div>

          <form className="stack" onSubmit={handleCalculateRoute}>
            {mapboxAccessToken ? (
              <div className="map-pick-controls">
                <button
                  type="button"
                  className={mapPickTarget === 'origin' ? 'inline-button active' : 'inline-button'}
                  onClick={() => setMapPickTarget('origin')}
                >
                  Chọn điểm đi trên bản đồ
                </button>
                <button
                  type="button"
                  className={mapPickTarget === 'destination' ? 'inline-button active' : 'inline-button'}
                  onClick={() => setMapPickTarget('destination')}
                >
                  Chọn điểm đến trên bản đồ
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
        </div>

        <div className="stack">
          <div className="panel route-map-panel">
            {routeResult && routeResult.stops?.length && mapboxAccessToken && !mapRenderError ? (
              <div className="route-map-shell">
                <div className="route-map-overlay">
                  <strong>{routeResult.distanceText}</strong>
                  <span>{routeResult.durationText}</span>
                </div>
                <div ref={mapContainerRef} className="route-map-canvas" />
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
            ) : mapboxAccessToken ? (
              <div className="route-map-shell">
                <div className="route-map-overlay">
                  <strong>{mapPickTarget === 'origin' ? 'Đang chọn điểm đi' : 'Đang chọn điểm đến'}</strong>
                  <span>Bấm trực tiếp trên bản đồ</span>
                </div>
                <div ref={mapContainerRef} className="route-map-canvas" />
              </div>
            ) : (
              <div className="route-map-canvas route-map-empty">
                <p className="muted">Nhập tuyến đường rồi bấm "Tính lộ trình" để xem hành trình.</p>
              </div>
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
              <p className="muted">Nhập tuyến đường rồi bấm "Tính lộ trình" để xem bản đồ và thời gian dự kiến từ backend geocode.</p>
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

  function toggleSelection(id, setter, values) {
    setter(values.includes(id) ? values.filter((value) => value !== id) : [...values, id]);
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
            <p className="muted">Chọn kho, đội xe và các đơn hàng cần tối ưu. Hệ thống sẽ phân tuyến theo tải trọng và khung giờ giao.</p>
          </div>

          <form className="stack" onSubmit={handleOptimize}>
            <label>
              Kho xuất phát
              <input value={depot} onChange={(event) => setDepot(event.target.value)} placeholder="Ví dụ: TP.HCM" />
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
                        <p>{order.customer_name} | {order.delivery_location} | {order.weight_tons} tấn</p>
                      </div>
                    </label>
                    <div className="time-window-grid">
                      <label className="checkbox-inline">
                        <input
                          type="checkbox"
                          checked={Boolean(timeWindowMap[order.id]?.useTimeWindow)}
                          onChange={(event) =>
                            setTimeWindowMap((prev) => ({
                              ...prev,
                              [order.id]: { ...prev[order.id], useTimeWindow: event.target.checked }
                            }))
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
                            setTimeWindowMap((prev) => ({
                              ...prev,
                              [order.id]: { ...prev[order.id], windowStart: event.target.value }
                            }))
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
                            setTimeWindowMap((prev) => ({
                              ...prev,
                              [order.id]: { ...prev[order.id], windowEnd: event.target.value }
                            }))
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
                            setTimeWindowMap((prev) => ({
                              ...prev,
                              [order.id]: { ...prev[order.id], serviceMinutes: Number(event.target.value) }
                            }))
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
                <p><strong>Tổng quãng đường:</strong> {route.totalDistanceKm} km</p>
                <p><strong>Tổng thời gian:</strong> {route.totalDurationMinutes} phút</p>
              </div>
              <div className="route-steps">
                {route.stops.map((stop, index) => (
                  <div key={stop.orderId} className="route-step">
                    <div className="route-step-index">{index + 1}</div>
                    <div>
                      <p><strong>{stop.orderCode}</strong> - {stop.destination}</p>
                      <small>
                        {stop.weightTons} tấn | ETA {stop.arrivalTime} | Cửa giao {stop.windowLabel} | Chặng trước {stop.distanceFromPreviousKm} km
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
          <h3>{form.id ? 'Cập nhật đơn hàng' : 'Tạo đơn hàng mới'}</h3>
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
            <button className="primary-button">{form.id ? 'Lưu đơn hàng' : 'Tạo đơn hàng'}</button>
          </form>
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
                    <td>{row.pickup_location} - {row.delivery_location}</td>
                    <td>{row.cargo_type}</td>
                    <td><span className="status-badge" style={{ background: statusColor(row.status) }}>{getStatusLabel(row.status)}</span></td>
                    <td>{formatCurrency(row.planned_revenue)}</td>
                    <td><button className="inline-button" onClick={() => onEdit(row)}>Sửa</button></td>
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

function TrackingPage({ token, trips }) {
  const [latest, setLatest] = useState([]);
  const [selectedTripId, setSelectedTripId] = useState('');
  const [history, setHistory] = useState([]);
  const [form, setForm] = useState({ latitude: '', longitude: '', speed_kmh: '', heading: '', note: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function loadTracking(tripId = selectedTripId) {
    setLoading(true);
    setError('');
    try {
      const latestRows = await apiRequest('/tracking/latest', { token });
      setLatest(latestRows);
      if (tripId) {
        setHistory(await apiRequest(`/tracking/trips/${tripId}/locations`, { token }));
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
          <h2>GPS realtime đội xe</h2>
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
            <p className="muted">Dispatcher có thể nhập tọa độ test; tài xế có thể dùng nút lấy vị trí trên màn chuyến được giao.</p>
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
  const [trips, setTrips] = useState([]);
  const [users, setUsers] = useState([]);
  const [depots, setDepots] = useState([]);
  const [truckForm, setTruckForm] = useState(defaultTruckForm());
  const [driverForm, setDriverForm] = useState(defaultDriverForm());
  const [customerForm, setCustomerForm] = useState(defaultCustomerForm());
  const [orderForm, setOrderForm] = useState(defaultOrderForm());
  const [tripForm, setTripForm] = useState(defaultTripForm());
  const [userForm, setUserForm] = useState({ username: '', full_name: '', role: 'DISPATCHER', password: '' });
  const [depotForm, setDepotForm] = useState({ depot_code: '', name: '', location: '', latitude: '', longitude: '', status: 'ACTIVE' });
  const navigate = useNavigate();
  const location = useLocation();

  const isAuthenticated = Boolean(auth.token);

  const token = auth.token;
  const role = auth.user?.role;

  const loadAll = useMemo(
    () => async (target = 'all') => {
      if (!token) {
        return;
      }

      if (role !== 'DRIVER' && (target === 'all' || target === 'dashboard')) {
        const summaryData = await apiRequest('/reports/summary', { token });
        setSummary(summaryData);
      }
      if (role === 'ADMIN' && (target === 'all' || target === 'users')) {
        setUsers(await apiRequest('/users', { token }));
      }
      if (role !== 'DRIVER' && (target === 'all' || target === 'depots')) {
        setDepots(await apiRequest('/depots', { token }));
      }
      if (role !== 'DRIVER' && (target === 'all' || target === 'trucks')) {
        setTrucks(await apiRequest('/trucks', { token }));
      }
      if (role !== 'DRIVER' && (target === 'all' || target === 'drivers')) {
        setDrivers(await apiRequest('/drivers', { token }));
      }
      if (role !== 'DRIVER' && (target === 'all' || target === 'customers')) {
        setCustomers(await apiRequest('/customers', { token }));
      }
      if (role !== 'DRIVER' && (target === 'all' || target === 'orders' || target === 'dispatch')) {
        setOrders(await apiRequest('/orders', { token }));
      }
      if (target === 'all' || target === 'trips' || target === 'dispatch') {
        setTrips(await apiRequest('/trips', { token }));
      }
    },
    [token, role]
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
    } else if (location.pathname.startsWith('/orders') || location.pathname.startsWith('/route-map')) {
      target = 'orders';
    } else if (location.pathname.startsWith('/dispatch') || location.pathname.startsWith('/tracking')) {
      target = 'dispatch';
    } else if (location.pathname.startsWith('/trips') || location.pathname.startsWith('/driver/trips')) {
      target = 'trips';
    }

    loadAll(target).catch((error) => {
      console.error(error);
    });
  }, [location.pathname, loadAll, token]);

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
      navigate(normalizedAuth.user.role === 'DRIVER' ? '/driver/trips' : '/');
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
        {role !== 'DRIVER' ? (
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
            <Route path="/route-map" element={<RouteMapPage orders={orders} token={token} />} />
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
        ) : (
          <>
            <Route path="/driver/trips" element={<TripsPage trips={trips} auth={auth} onTripStatus={updateTripStatus} refresh={loadAll} token={token} />} />
            <Route path="*" element={<Navigate to="/driver/trips" replace />} />
          </>
        )}
        <Route path="/login" element={<Navigate to={role === 'DRIVER' ? '/driver/trips' : '/'} replace />} />
        <Route path="*" element={<Navigate to={role === 'DRIVER' ? '/driver/trips' : '/'} replace />} />
      </Routes>
    </Layout>
  );
}

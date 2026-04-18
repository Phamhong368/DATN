import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
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
import { apiRequest, login } from './api.js';

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
  { key: 'route-map', label: 'Bản đồ lộ trình', path: '/route-map', roles: ['DISPATCHER'] }
];

const orderStatusOptions = ['PENDING_DISPATCH', 'ASSIGNED', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED'];
const tripStatusOptions = ['PLANNED', 'ASSIGNED', 'IN_TRANSIT', 'COMPLETED', 'INCIDENT'];
const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

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
    ACTIVE: 'Đang hoạt động'
  };
  return labels[status] || status;
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

function loadGoogleMaps(apiKey) {
  if (!apiKey) {
    return Promise.reject(new Error('Thiếu VITE_GOOGLE_MAPS_API_KEY để tải Google Maps.'));
  }

  if (window.google?.maps) {
    return Promise.resolve(window.google.maps);
  }

  const existingScript = document.querySelector('script[data-google-maps-loader="true"]');
  if (existingScript) {
    return new Promise((resolve, reject) => {
      existingScript.addEventListener('load', () => resolve(window.google.maps), { once: true });
      existingScript.addEventListener('error', () => reject(new Error('Không thể tải Google Maps.')), { once: true });
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&loading=async`;
    script.async = true;
    script.defer = true;
    script.dataset.googleMapsLoader = 'true';
    script.onload = () => resolve(window.google.maps);
    script.onerror = () => reject(new Error('Không thể tải Google Maps. Kiểm tra lại API key hoặc cấu hình billing.'));
    document.head.appendChild(script);
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

function LoginPage({ onLogin, loading, error }) {
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

function RouteMapPage({ orders }) {
  const [searchParams] = useSearchParams();
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const directionsRendererRef = useRef(null);
  const [form, setForm] = useState({
    origin: '',
    destination: '',
    travelMode: 'DRIVING',
    waypoints: []
  });
  const [mapError, setMapError] = useState('');
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeResult, setRouteResult] = useState(null);

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
    let mounted = true;

    loadGoogleMaps(googleMapsApiKey)
      .then((maps) => {
        if (!mounted || !mapRef.current) {
          return;
        }

        if (!mapInstanceRef.current) {
          mapInstanceRef.current = new maps.Map(mapRef.current, {
            center: { lat: 16.0471, lng: 108.2068 },
            zoom: 6,
            streetViewControl: false,
            mapTypeControl: false
          });

          directionsRendererRef.current = new maps.DirectionsRenderer({
            map: mapInstanceRef.current,
            suppressMarkers: false
          });
        }
      })
      .catch((error) => {
        if (mounted) {
          setMapError(error.message);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  async function handleCalculateRoute(event) {
    event.preventDefault();
    setMapError('');
    setRouteLoading(true);

    try {
      const maps = await loadGoogleMaps(googleMapsApiKey);
      const service = new maps.DirectionsService();
      const result = await service.route({
        origin: form.origin,
        destination: form.destination,
        travelMode: maps.TravelMode[form.travelMode],
        waypoints: form.waypoints.map((waypoint) => ({
          location: waypoint,
          stopover: true
        }))
      });

      directionsRendererRef.current?.setDirections(result);
      const legs = result.routes[0]?.legs || [];
      const totalDistanceMeters = legs.reduce((sum, leg) => sum + (leg.distance?.value || 0), 0);
      const totalDurationSeconds = legs.reduce((sum, leg) => sum + (leg.duration?.value || 0), 0);
      setRouteResult({
        distanceText: totalDistanceMeters ? `${(totalDistanceMeters / 1000).toFixed(1)} km` : '--',
        durationText: totalDurationSeconds ? `${Math.round(totalDurationSeconds / 60)} phút` : '--',
        startAddress: legs[0]?.start_address || form.origin,
        endAddress: legs[legs.length - 1]?.end_address || form.destination,
        stops: [
          legs[0]?.start_address || form.origin,
          ...legs.map((leg) => leg.end_address)
        ].filter(Boolean),
        legs: legs.map((leg, index) => ({
          segmentNo: index + 1,
          startAddress: leg.start_address,
          endAddress: leg.end_address,
          distance: leg.distance?.text || '',
          duration: leg.duration?.text || '',
          steps: leg.steps?.map((step) => ({
            instruction: step.instructions,
            distance: step.distance?.text || '',
            duration: step.duration?.text || ''
          })) || []
        }))
      });
    } catch (error) {
      setMapError(error.message || 'Không thể tính toán lộ trình.');
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
    setRouteResult(null);
    setMapError('');
  }

  return (
    <section className="stack">
      <div className="page-header">
        <div>
          <p className="eyebrow">Bản đồ</p>
          <h2>Công cụ tính toán lộ trình tối ưu</h2>
        </div>
      </div>

      {!googleMapsApiKey ? (
        <div className="panel">
          <h3>Thiếu API key Google Maps</h3>
          <p className="muted">
            Thêm biến môi trường <code>VITE_GOOGLE_MAPS_API_KEY</code> vào file <code>frontend/.env</code> rồi chạy lại frontend.
          </p>
        </div>
      ) : null}

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
            <label>
              Điểm đi
              <input
                value={form.origin}
                onChange={(event) => setForm((prev) => ({ ...prev, origin: event.target.value }))}
                placeholder="Ví dụ: TP. Hồ Chí Minh"
              />
            </label>

            <label>
              Điểm đến
              <input
                value={form.destination}
                onChange={(event) => setForm((prev) => ({ ...prev, destination: event.target.value }))}
                placeholder="Ví dụ: Hà Nội"
              />
            </label>

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

            <button className="primary-button" disabled={routeLoading || !googleMapsApiKey}>
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
            <div ref={mapRef} className="route-map-canvas" />
          </div>

          <div className="panel stack">
            <h3>Kết quả lộ trình</h3>
            {mapError ? <p className="error-text">{mapError}</p> : null}
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
                      <div key={`${stop}-${index}`} className="route-stop-chip">
                        Chặng {index + 1}: {stop}
                      </div>
                    ))}
                  </div>
                ) : null}
                <div className="route-steps">
                  {routeResult.legs.map((leg) => (
                    <div key={`${leg.segmentNo}-${leg.startAddress}`} className="panel route-leg-panel">
                      <h4>Chặng {leg.segmentNo}</h4>
                      <p className="muted">{leg.startAddress} -> {leg.endAddress}</p>
                      <p className="muted">{leg.distance} | {leg.duration}</p>
                      <div className="route-steps">
                        {leg.steps.map((step, index) => (
                          <div key={`${leg.segmentNo}-${index}`} className="route-step">
                            <div className="route-step-index">{index + 1}</div>
                            <div>
                              <p dangerouslySetInnerHTML={{ __html: step.instruction }} />
                              <small>{step.distance} {step.duration ? `| ${step.duration}` : ''}</small>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="muted">Nhập tuyến đường rồi bấm "Tính lộ trình" để xem bản đồ và thời gian dự kiến.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function OptimizerPage({ orders, trucks, token }) {
  const candidateOrders = orders.filter((order) => ['PENDING_DISPATCH', 'ASSIGNED'].includes(order.status));
  const candidateTrucks = trucks.filter((truck) => ['AVAILABLE', 'IN_USE'].includes(truck.status));
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
  const [error, setError] = useState('');

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

function TripsPage({ trips, auth, onTripStatus }) {
  return (
    <section className="stack">
      <div className="page-header">
        <div>
          <p className="eyebrow">{auth.user.role === 'DRIVER' ? 'Tài xế' : 'Điều hành'}</p>
          <h2>{auth.user.role === 'DRIVER' ? 'Chuyến được giao' : 'Danh sách chuyến hàng'}</h2>
        </div>
      </div>
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
  return { license_plate: '', truck_type: '', capacity_tons: '', status: 'AVAILABLE' };
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

  async function handleLogin(credentials) {
    setLoginLoading(true);
    setLoginError('');
    try {
      const data = await login(credentials.username, credentials.password);
      setAuth(data);
      navigate(data.user.role === 'DRIVER' ? '/driver/trips' : '/');
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
                    { name: 'status', label: 'Trạng thái', type: 'select', options: ['AVAILABLE', 'IN_USE', 'MAINTENANCE'] }
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
            <Route path="/route-map" element={<RouteMapPage orders={orders} />} />
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
            <Route path="/trips" element={<TripsPage trips={trips} auth={auth} onTripStatus={updateTripStatus} />} />
              </>
            ) : null}
          </>
        ) : (
          <>
            <Route path="/driver/trips" element={<TripsPage trips={trips} auth={auth} onTripStatus={updateTripStatus} />} />
            <Route path="*" element={<Navigate to="/driver/trips" replace />} />
          </>
        )}
        <Route path="/login" element={<Navigate to={role === 'DRIVER' ? '/driver/trips' : '/'} replace />} />
        <Route path="*" element={<Navigate to={role === 'DRIVER' ? '/driver/trips' : '/'} replace />} />
      </Routes>
    </Layout>
  );
}

import { expect, test } from '@playwright/test';

const fixtures = {
  summary: {
    totals: {
      totalOrders: 3,
      totalTrips: 2,
      availableTrucks: 4,
      availableDrivers: 3,
      expectedRevenue: 5000000
    },
    monthly: [],
    statusBreakdown: []
  },
  users: [
    { id: 1, username: 'admin', full_name: 'Admin E2E', role: 'ADMIN' },
    { id: 2, username: 'dispatcher', full_name: 'Dispatcher E2E', role: 'DISPATCHER' }
  ],
  depots: [{ id: 1, depot_code: 'DPT-E2E', name: 'Kho E2E', location: 'TP.HCM', status: 'ACTIVE' }],
  trucks: [{ id: 1, license_plate: '51C-E2E', truck_type: 'Thùng kín', capacity_tons: '8.00', status: 'AVAILABLE' }],
  drivers: [{ id: 1, full_name: 'Tài xế E2E', phone: '0900000000', license_number: 'FC-E2E', license_class: 'FC', status: 'AVAILABLE' }],
  customers: [{ id: 1, name: 'Khách hàng E2E', phone: '0900000001', email: 'e2e@example.com', address: 'TP.HCM' }],
  orders: [
    {
      id: 1,
      order_code: 'ORD-E2E',
      pickup_location: 'TP.HCM',
      delivery_location: 'Đà Nẵng',
      cargo_type: 'Hàng E2E',
      weight_tons: '2.00',
      planned_revenue: '1000000',
      status: 'PENDING_DISPATCH',
      customer_id: 1,
      customer_name: 'Khách hàng E2E'
    }
  ],
  trips: [
    {
      id: 1,
      trip_code: 'TRIP-E2E',
      truck_id: 1,
      driver_id: 1,
      license_plate: '51C-E2E',
      driver_name: 'Tài xế E2E',
      start_date: '2026-05-11 08:00:00',
      origin: 'TP.HCM',
      destination: 'Đà Nẵng',
      status: 'ASSIGNED',
      orders: [{ id: 1, order_code: 'ORD-E2E', pickup_location: 'TP.HCM', delivery_location: 'Đà Nẵng' }]
    }
  ],
  optimizerHistory: [
    {
      id: 1,
      optimization_code: 'OPT-E2E',
      algorithm_name: 'E2E VRP',
      total_routes: 1,
      total_assigned_orders: 1,
      total_unassigned_orders: 0,
      total_distance_km: '600.00',
      depot_name: 'Kho E2E',
      depot_location: 'TP.HCM',
      created_by_name: 'Dispatcher E2E'
    }
  ],
  optimizerDetail: {
    optimization: {
      id: 1,
      optimization_code: 'OPT-E2E',
      total_routes: 1,
      total_distance_km: '600.00',
      depot_location: 'TP.HCM'
    },
    routes: [
      {
        id: 1,
        license_plate: '51C-E2E',
        route_no: 1,
        total_stops: 1,
        total_load_tons: '2.00',
        total_distance_km: '600.00',
        total_duration_minutes: 750,
        utilization_percent: 25,
        stops: [{ id: 1, stop_sequence: 1, order_code: 'ORD-E2E', delivery_location: 'Đà Nẵng', arrival_time: '10:00', departure_time: '10:20', distance_from_previous_km: '600.00' }]
      }
    ],
    orders: []
  }
};

async function mockApi(page) {
  await page.route('http://localhost:4000/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() !== 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'ok' })
      });
    }

    const byPath = {
      '/reports/summary': fixtures.summary,
      '/users': fixtures.users,
      '/api/depots': fixtures.depots,
      '/depots': fixtures.depots,
      '/trucks': fixtures.trucks,
      '/drivers': fixtures.drivers,
      '/customers': fixtures.customers,
      '/orders': fixtures.orders,
      '/trips': fixtures.trips,
      '/optimizer/inputs': {
        depotSuggestions: ['TP.HCM', 'Đà Nẵng'],
        orders: fixtures.orders,
        trucks: fixtures.trucks
      },
      '/optimizer/history': fixtures.optimizerHistory,
      '/optimizer/history/1': fixtures.optimizerDetail,
      '/analytics/trucks': fixtures.trucks,
      '/analytics/model': { trained: false },
      '/analytics/fuel-logs': []
    };

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(byPath[url.pathname] ?? [])
    });
  });
}

async function setAuth(page, role) {
  const userByRole = {
    ADMIN: { id: 1, username: 'admin', role: 'ADMIN', fullName: 'Admin E2E' },
    DISPATCHER: { id: 2, username: 'dispatcher', role: 'DISPATCHER', fullName: 'Dispatcher E2E' },
    DRIVER: { id: 3, username: 'driver1', role: 'DRIVER', fullName: 'Tài xế E2E' }
  };

  await page.addInitScript((auth) => {
    window.localStorage.setItem('tms-auth', JSON.stringify({ token: 'e2e-token', user: auth }));
  }, userByRole[role]);
}

test('admin can open core administration screens', async ({ page }) => {
  await mockApi(page);
  await setAuth(page, 'ADMIN');

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Bảng điều khiển vận hành' })).toBeVisible();

  await page.getByRole('link', { name: 'Người dùng' }).click();
  await expect(page.getByRole('heading', { name: 'Quản lý người dùng' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'admin', exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Kho vận hành' }).click();
  await expect(page.getByRole('heading', { name: 'Quản lý kho vận hành' })).toBeVisible();

  await page.getByRole('link', { name: 'Xe' }).click();
  await expect(page.getByRole('heading', { name: 'Quản lý xe' })).toBeVisible();

  await page.getByRole('link', { name: 'Tài xế' }).click();
  await expect(page.getByRole('heading', { name: 'Quản lý tài xế' })).toBeVisible();

  await page.getByRole('link', { name: 'Khách hàng' }).click();
  await expect(page.getByRole('heading', { name: 'Quản lý khách hàng' })).toBeVisible();
});

test('dispatcher can open operations and optimization screens', async ({ page }) => {
  await mockApi(page);
  await setAuth(page, 'DISPATCHER');

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Bảng điều khiển vận hành' })).toBeVisible();

  await page.getByRole('link', { name: 'Đơn hàng' }).click();
  await expect(page.getByRole('heading', { name: 'Quản lý đơn hàng' })).toBeVisible();

  await page.getByRole('link', { name: 'Điều phối' }).click();
  await expect(page.getByRole('heading', { name: 'Tạo và điều phối chuyến' })).toBeVisible();

  await page.getByRole('link', { name: 'Chuyến hàng' }).click();
  await expect(page.getByRole('heading', { name: 'Danh sách chuyến hàng' })).toBeVisible();

  await page.getByRole('link', { name: 'Tối ưu lộ trình' }).click();
  await expect(page.getByRole('heading', { name: 'Phân tuyến giao hàng theo VRP' })).toBeVisible();

  await page.getByRole('link', { name: 'Lịch sử tối ưu' }).click();
  await expect(page.getByRole('heading', { name: 'Lịch sử tối ưu lộ trình' })).toBeVisible();
});

test('driver only opens assigned trips screen', async ({ page }) => {
  await mockApi(page);
  await setAuth(page, 'DRIVER');

  await page.goto('/driver/trips');

  await expect(page.getByRole('heading', { name: 'Chuyến được giao' })).toBeVisible();
  await expect(page.getByText('TRIP-E2E')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Bảng điều khiển' })).toHaveCount(0);
});

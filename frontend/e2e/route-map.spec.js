import { expect, test } from '@playwright/test';

const apiMocks = {
  '/reports/summary': {
    totals: {
      totalOrders: 1,
      totalTrips: 0,
      availableTrucks: 1,
      availableDrivers: 1,
      expectedRevenue: 1000000
    },
    monthly: [],
    statusBreakdown: []
  },
  '/depots': [],
  '/trucks': [],
  '/drivers': [],
  '/customers': [],
  '/orders': [
    {
      id: 1,
      order_code: 'ORD-E2E',
      pickup_location: 'TP.HCM',
      delivery_location: 'Đà Nẵng',
      cargo_type: 'Test cargo',
      weight_tons: '2.00',
      planned_revenue: '1000000',
      status: 'PENDING_DISPATCH',
      customer_name: 'E2E Customer'
    }
  ],
  '/trips': []
};

test.beforeEach(async ({ page }) => {
  await page.route('http://localhost:4000/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === '/optimizer/route-preview') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          startAddress: 'TP.HCM',
          endAddress: 'Đà Nẵng',
          travelMode: 'DRIVING',
          distanceKm: 600,
          durationMinutes: 750,
          distanceText: '600.0 km',
          durationText: '12 giờ 30 phút',
          stops: [
            { address: 'TP.HCM', coordinate: { lat: 10.7769, lng: 106.7009 } },
            { address: 'Đà Nẵng', coordinate: { lat: 16.0544, lng: 108.2022 } }
          ],
          path: [
            { lat: 10.7769, lng: 106.7009 },
            { lat: 16.0544, lng: 108.2022 }
          ],
          legs: [
            {
              segmentNo: 1,
              startAddress: 'TP.HCM',
              endAddress: 'Đà Nẵng',
              distanceKm: 600,
              durationMinutes: 750,
              distanceText: '600.0 km',
              durationText: '12 giờ 30 phút'
            }
          ]
        })
      });
    }

    const payload = apiMocks[url.pathname] ?? {};
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload)
    });
  });

  await page.addInitScript(() => {
    window.localStorage.setItem(
      'tms-auth',
      JSON.stringify({
        token: 'e2e-token',
        user: {
          id: 2,
          username: 'dispatcher',
          role: 'DISPATCHER',
          fullName: 'Điều phối E2E'
        }
      })
    );
  });
});

test('dispatcher can calculate a route from the route map screen', async ({ page }) => {
  await page.goto('/route-map');

  await expect(page.getByRole('heading', { name: 'Công cụ tính toán lộ trình tối ưu' })).toBeVisible();

  await page.getByLabel('Điểm đi').fill('TP.HCM');
  await page.getByLabel('Điểm đến').fill('Đà Nẵng');
  await page.getByRole('button', { name: 'Tính lộ trình' }).click();

  const routeResult = page.locator('.panel.stack').filter({ hasText: 'Kết quả lộ trình' });
  await expect(routeResult.getByText('600.0 km').first()).toBeVisible();
  await expect(routeResult.getByText('12 giờ 30 phút').first()).toBeVisible();
  await expect(routeResult.getByRole('heading', { name: 'Chặng 1' })).toBeVisible();
});

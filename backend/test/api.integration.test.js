import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const shouldRun = process.env.RUN_DB_TESTS === '1';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');

let adminConnection;
let appServer;
let baseUrl;
let dbModule;
let adminToken;
let dispatcherToken;
let driverToken;
let customerToken;

function splitSqlStatements(sql) {
  return sql
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function executeSqlFile(connection, filePath) {
  const sql = await fs.readFile(filePath, 'utf8');
  for (const statement of splitSqlStatements(sql)) {
    await connection.query(statement);
  }
}

async function prepareDatabase() {
  const dbName = process.env.DB_NAME || 'tms_integration_test';

  adminConnection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || ''
  });

  await adminConnection.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
  await adminConnection.query(`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await adminConnection.query(`USE \`${dbName}\``);
  await executeSqlFile(adminConnection, path.join(repoRoot, 'database/schema.sql'));
  await executeSqlFile(adminConnection, path.join(repoRoot, 'database/seed.sql'));
}

async function startApp() {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-test-secret';
  process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1';
  process.env.DB_PORT = process.env.DB_PORT || '3306';
  process.env.DB_USER = process.env.DB_USER || 'root';
  process.env.DB_PASSWORD = process.env.DB_PASSWORD || '';
  process.env.DB_NAME = process.env.DB_NAME || 'tms_integration_test';

  dbModule = await import('../src/config/db.js');
  const { default: app } = await import('../src/app.js');

  await dbModule.connectDB(1);

  appServer = http.createServer(app);
  await new Promise((resolve, reject) => {
    appServer.once('error', reject);
    appServer.listen(0, '127.0.0.1', () => {
      appServer.off('error', reject);
      const address = appServer.address();
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
}

async function closeApp() {
  if (appServer?.listening) {
    await new Promise((resolve, reject) => {
      appServer.close((error) => (error ? reject(error) : resolve()));
    });
  }

  if (dbModule) {
    await dbModule.getPool().end();
  }
}

async function api(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...options.headers
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  return { response, payload };
}

async function rawApi(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...options.headers
    }
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  return { response, buffer };
}

async function loginAs(username) {
  const login = await api('/auth/login', {
    method: 'POST',
    body: {
      username,
      password: 'password123'
    }
  });

  assert.equal(login.response.status, 200);
  assert.ok(login.payload.token);
  assert.equal(login.payload.user.username, username);
  return login.payload.token;
}

if (!shouldRun) {
  test('API integration tests require RUN_DB_TESTS=1', { skip: 'Set RUN_DB_TESTS=1 to run MySQL-backed API tests.' }, () => {});
} else {
  before(async () => {
    await prepareDatabase();
    await startApp();
  });

  after(async () => {
    await closeApp();
    if (adminConnection) {
      await adminConnection.query(`DROP DATABASE IF EXISTS \`${process.env.DB_NAME || 'tms_integration_test'}\``);
      await adminConnection.end();
    }
  });

  test('GET /health returns ok', async () => {
    const { response, payload } = await api('/health');

    assert.equal(response.status, 200);
    assert.deepEqual(payload, { status: 'ok' });
  });

  test('dispatcher can login and access protected dashboard summary', async () => {
    adminToken = await loginAs('admin');
    dispatcherToken = await loginAs('dispatcher');
    driverToken = await loginAs('driver1');
    customerToken = await loginAs('customer1');

    const summary = await api('/reports/summary', { token: dispatcherToken });
    assert.equal(summary.response.status, 200);
    assert.ok(Number(summary.payload.totals.totalOrders) > 0);
    assert.ok(Array.isArray(summary.payload.statusBreakdown));
  });

  test('protected APIs reject missing token and enforce role permissions', async () => {
    const missingToken = await api('/orders');
    assert.equal(missingToken.response.status, 401);

    const driverDenied = await api('/orders', { token: driverToken });
    assert.equal(driverDenied.response.status, 403);

    const dispatcherDenied = await api('/users', { token: dispatcherToken });
    assert.equal(dispatcherDenied.response.status, 403);

    const adminAllowed = await api('/users', { token: adminToken });
    assert.equal(adminAllowed.response.status, 200);
    assert.ok(adminAllowed.payload.some((user) => user.username === 'admin'));
  });

  test('dispatcher cannot create a new order directly after customer-portal migration', async () => {
    const orderCode = `ORD-IT-${Date.now()}`;
    const denied = await api('/orders', {
      method: 'POST',
      token: dispatcherToken,
      body: {
        customer_id: 1,
        order_code: orderCode,
        pickup_location: 'TP.HCM',
        delivery_location: 'Đà Nẵng',
        cargo_type: 'Integration test cargo',
        weight_tons: 2.5,
        planned_revenue: 1500000,
        status: 'PENDING_DISPATCH'
      }
    });

    assert.equal(denied.response.status, 403);
    assert.match(denied.payload.message, /khách hàng/i);
  });

  test('customer portal creates and returns a real order row', async () => {
    const orderCode = `ORD-IT-${Date.now()}`;
    const created = await api('/customer-portal/orders', {
      method: 'POST',
      token: customerToken,
      body: {
        order_code: orderCode,
        pickup_location: 'TP.HCM',
        delivery_location: 'Đà Nẵng',
        cargo_type: 'Integration test cargo',
        weight_tons: 2.5
      }
    });

    assert.equal(created.response.status, 201);
    assert.equal(created.payload.order_code, orderCode);

    const orders = await api('/customer-portal/orders', { token: customerToken });
    assert.equal(orders.response.status, 200);
    assert.ok(orders.payload.some((order) => order.order_code === orderCode));
  });

  test('customer portal returns validation error for missing required fields', async () => {
    const invalid = await api('/customer-portal/orders', {
      method: 'POST',
      token: customerToken,
      body: {
        order_code: 'ORD-MISSING'
      }
    });

    assert.equal(invalid.response.status, 400);
    assert.match(invalid.payload.message, /Missing fields/);
    assert.match(invalid.payload.message, /pickup_location/);
  });

  test('admin can create, update and delete a truck through protected CRUD API', async () => {
    const licensePlate = `IT-${Date.now()}`;
    const created = await api('/trucks', {
      method: 'POST',
      token: adminToken,
      body: {
        license_plate: licensePlate,
        truck_type: 'Integration Truck',
        capacity_tons: 9.5,
        status: 'AVAILABLE'
      }
    });

    assert.equal(created.response.status, 201);
    assert.equal(created.payload.license_plate, licensePlate);

    const dispatcherCreate = await api('/trucks', {
      method: 'POST',
      token: dispatcherToken,
      body: {
        license_plate: `NO-${Date.now()}`,
        truck_type: 'Forbidden Truck',
        capacity_tons: 4
      }
    });
    assert.equal(dispatcherCreate.response.status, 403);

    const updated = await api(`/trucks/${created.payload.id}`, {
      method: 'PUT',
      token: adminToken,
      body: {
        license_plate: licensePlate,
        truck_type: 'Updated Integration Truck',
        capacity_tons: 11,
        status: 'MAINTENANCE',
        cumulative_km: 100,
        maintenance_interval_km: 10000,
        last_maintenance_km: 0,
        last_maintenance_date: null
      }
    });

    assert.equal(updated.response.status, 200);
    assert.equal(updated.payload.truck_type, 'Updated Integration Truck');
    assert.equal(updated.payload.status, 'MAINTENANCE');

    const deleted = await api(`/trucks/${created.payload.id}`, {
      method: 'DELETE',
      token: adminToken
    });
    assert.equal(deleted.response.status, 204);

    const trucks = await api('/trucks', { token: dispatcherToken });
    assert.equal(trucks.response.status, 200);
    assert.equal(trucks.payload.some((truck) => truck.id === created.payload.id), false);
  });

  test('admin user API validates role and supports create/update/delete', async () => {
    const username = `user_it_${Date.now()}`;
    const invalidRole = await api('/users', {
      method: 'POST',
      token: adminToken,
      body: {
        username,
        full_name: 'Invalid Role User',
        password: 'password123',
        role: 'UNKNOWN'
      }
    });

    assert.equal(invalidRole.response.status, 400);
    assert.match(invalidRole.payload.message, /Vai trò không hợp lệ/);

    const created = await api('/users', {
      method: 'POST',
      token: adminToken,
      body: {
        username,
        full_name: 'Integration User',
        password: 'password123',
        role: 'DRIVER'
      }
    });

    assert.equal(created.response.status, 201);
    assert.equal(created.payload.username, username);
    assert.equal(created.payload.role, 'DRIVER');

    const updated = await api(`/users/${created.payload.id}`, {
      method: 'PUT',
      token: adminToken,
      body: {
        username,
        full_name: 'Updated Integration User',
        role: 'DISPATCHER'
      }
    });

    assert.equal(updated.response.status, 200);
    assert.equal(updated.payload.full_name, 'Updated Integration User');
    assert.equal(updated.payload.role, 'DISPATCHER');

    const deleted = await api(`/users/${created.payload.id}`, {
      method: 'DELETE',
      token: adminToken
    });
    assert.equal(deleted.response.status, 204);
  });

  test('optimizer input and route preview APIs work with seeded data', async () => {
    const inputs = await api('/optimizer/inputs', { token: dispatcherToken });
    assert.equal(inputs.response.status, 200);
    assert.ok(inputs.payload.orders.length > 0);
    assert.ok(inputs.payload.trucks.length > 0);

    const preview = await api('/optimizer/route-preview', {
      method: 'POST',
      token: dispatcherToken,
      body: {
        origin: {
          address: 'TP.HCM',
          coordinate: { lat: 10.7769, lng: 106.7009 }
        },
        destination: {
          address: 'Đà Nẵng',
          coordinate: { lat: 16.0544, lng: 108.2022 }
        },
        travelMode: 'DRIVING'
      }
    });

    assert.equal(preview.response.status, 200);
    assert.equal(preview.payload.startAddress, 'TP.HCM');
    assert.equal(preview.payload.endAddress, 'Đà Nẵng');
    assert.ok(preview.payload.distanceKm > 0);
  });

  test('report export returns Excel and PDF files', async () => {
    const excel = await rawApi('/reports/export?report=orders&format=xlsx', { token: dispatcherToken });
    assert.equal(excel.response.status, 200);
    assert.match(excel.response.headers.get('content-type'), /application\/vnd\.ms-excel/);
    assert.match(excel.buffer.toString('utf8'), /Bao cao don hang/);

    const pdf = await rawApi('/reports/export?report=trips&format=pdf', { token: dispatcherToken });
    assert.equal(pdf.response.status, 200);
    assert.match(pdf.response.headers.get('content-type'), /application\/pdf/);
    assert.equal(pdf.buffer.subarray(0, 5).toString('utf8'), '%PDF-');
  });

  test('tracking API stores trip locations and returns latest positions', async () => {
    const created = await api('/tracking/trips/1/locations', {
      method: 'POST',
      token: driverToken,
      body: {
        latitude: 11.1111111,
        longitude: 106.2222222,
        speed_kmh: 55.5,
        heading: 12,
        note: 'Integration GPS ping'
      }
    });

    assert.equal(created.response.status, 201);
    assert.equal(Number(created.payload.trip_id), 1);
    assert.equal(Number(created.payload.latitude), 11.1111111);

    const latest = await api('/tracking/latest', { token: dispatcherToken });
    assert.equal(latest.response.status, 200);
    assert.ok(latest.payload.some((row) => row.trip_id === 1 && row.note === 'Integration GPS ping'));

    const history = await api('/tracking/trips/1/locations', { token: driverToken });
    assert.equal(history.response.status, 200);
    assert.ok(history.payload.some((row) => row.note === 'Integration GPS ping'));
  });
}

import crypto from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../config/db.js';
import { asyncHandler } from '../utils/http.js';
import { ensureFields } from '../utils/validators.js';

const trackingPublicRouter = express.Router();
const trackingRouter = express.Router();
const sseClients = new Set();

function canManageTracking(role) {
  return ['ADMIN', 'DISPATCHER'].includes(role);
}

function emitTrackingUpdate(payload) {
  const serialized = `event: location\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of sseClients) {
    if (client.tripId && Number(client.tripId) !== Number(payload.trip_id)) {
      continue;
    }
    client.res.write(serialized);
  }
}

function verifyStreamToken(token) {
  if (!token) {
    return null;
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'super-secret-demo-key');
    return {
      ...payload,
      role: payload.role || { 1: 'ADMIN', 2: 'DISPATCHER', 3: 'DRIVER' }[payload.role_id]
    };
  } catch {
    return null;
  }
}

async function ensureDriverOwnsTrip(userId, tripId) {
  const rows = await query(
    `SELECT t.id
     FROM trips t
     JOIN drivers d ON d.id = t.driver_id
     WHERE t.id = ? AND d.user_id = ?
     LIMIT 1`,
    [tripId, userId]
  );
  return rows.length > 0;
}

async function insertLocationLog({
  tripId,
  latitude,
  longitude,
  speedKmh,
  heading,
  note,
  recordedBy = null,
  recordedAt = null,
  source = 'BROWSER',
  gpsDeviceId = null
}) {
  const result = await query(
    `INSERT INTO trip_location_logs (
       trip_id, latitude, longitude, speed_kmh, heading, note, recorded_by, recorded_at, source, gps_device_id
     ) VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW()), ?, ?)`,
    [tripId, latitude, longitude, speedKmh, heading, note, recordedBy, recordedAt, source, gpsDeviceId]
  );

  const [row] = await query(
    `SELECT tl.*, t.trip_code, t.status AS trip_status, tr.license_plate, d.full_name AS driver_name
     FROM trip_location_logs tl
     JOIN trips t ON t.id = tl.trip_id
     JOIN trucks tr ON tr.id = t.truck_id
     JOIN drivers d ON d.id = t.driver_id
     WHERE tl.id = ?`,
    [result.insertId]
  );

  emitTrackingUpdate(row);
  return row;
}

trackingPublicRouter.post(
  '/device/ingest',
  asyncHandler(async (req, res) => {
    const deviceToken = req.headers['x-device-token'] || req.body.device_token;
    const missing = ensureFields(req.body, ['latitude', 'longitude']);
    if (!deviceToken) {
      return res.status(401).json({ message: 'Thiếu device token của thiết bị GPS.' });
    }
    if (missing.length) {
      return res.status(400).json({ message: `Missing fields: ${missing.join(', ')}` });
    }

    const [device] = await query(
      `SELECT *
       FROM gps_devices
       WHERE device_token = ? AND status = 'ACTIVE'
       LIMIT 1`,
      [deviceToken]
    );

    if (!device) {
      return res.status(401).json({ message: 'Thiết bị GPS không hợp lệ hoặc đã bị vô hiệu hóa.' });
    }

    const tripId = Number(device.trip_id || req.body.trip_id || 0);
    if (!tripId) {
      return res.status(400).json({ message: 'Thiết bị GPS chưa được gán chuyến xe.' });
    }

    const latitude = Number(req.body.latitude);
    const longitude = Number(req.body.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      return res.status(400).json({ message: 'Tọa độ không hợp lệ.' });
    }

    const row = await insertLocationLog({
      tripId,
      latitude,
      longitude,
      speedKmh: req.body.speed_kmh === '' || req.body.speed_kmh == null ? null : Number(req.body.speed_kmh),
      heading: req.body.heading === '' || req.body.heading == null ? null : Number(req.body.heading),
      note: req.body.note || `Thiết bị ${device.device_code} gửi vị trí`,
      recordedBy: null,
      recordedAt: req.body.recorded_at || null,
      source: 'GPS_DEVICE',
      gpsDeviceId: device.id
    });

    await query('UPDATE gps_devices SET last_seen_at = NOW() WHERE id = ?', [device.id]);
    res.status(201).json(row);
  })
);

trackingRouter.get(
  '/stream',
  asyncHandler(async (req, res) => {
    const user = verifyStreamToken(typeof req.query.token === 'string' ? req.query.token : '');
    if (!user || !canManageTracking(user.role)) {
      return res.status(401).json({ message: 'Phiên realtime không hợp lệ.' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const client = {
      res,
      tripId: req.query.tripId ? Number(req.query.tripId) : null
    };
    sseClients.add(client);
    res.write(`event: ready\ndata: ${JSON.stringify({ status: 'connected' })}\n\n`);

    const keepAlive = setInterval(() => {
      res.write(`event: ping\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);
    }, 25000);

    req.on('close', () => {
      clearInterval(keepAlive);
      sseClients.delete(client);
    });
  })
);

trackingRouter.get(
  '/latest',
  asyncHandler(async (req, res) => {
    if (!canManageTracking(req.user.role)) {
      return res.status(403).json({ message: 'Only admin or dispatcher can view fleet tracking.' });
    }

    const rows = await query(
      `SELECT tl.*, t.trip_code, t.status AS trip_status, tr.license_plate, d.full_name AS driver_name, gd.device_code
       FROM trip_location_logs tl
       JOIN (
         SELECT trip_id, MAX(id) AS latest_id
         FROM trip_location_logs
         GROUP BY trip_id
       ) latest ON latest.latest_id = tl.id
       JOIN trips t ON t.id = tl.trip_id
       JOIN trucks tr ON tr.id = t.truck_id
       JOIN drivers d ON d.id = t.driver_id
       LEFT JOIN gps_devices gd ON gd.id = tl.gps_device_id
       ORDER BY tl.recorded_at DESC`
    );

    res.json(rows);
  })
);

trackingRouter.get(
  '/devices',
  asyncHandler(async (req, res) => {
    if (!canManageTracking(req.user.role)) {
      return res.status(403).json({ message: 'Chỉ điều phối hoặc quản trị mới xem được thiết bị GPS.' });
    }

    const rows = await query(
      `SELECT gd.*, t.trip_code, tr.license_plate, d.full_name AS driver_name
       FROM gps_devices gd
       LEFT JOIN trips t ON t.id = gd.trip_id
       LEFT JOIN trucks tr ON tr.id = gd.truck_id
       LEFT JOIN drivers d ON d.id = gd.driver_id
       ORDER BY gd.id ASC`
    );
    res.json(rows);
  })
);

trackingRouter.post(
  '/devices',
  asyncHandler(async (req, res) => {
    if (!canManageTracking(req.user.role)) {
      return res.status(403).json({ message: 'Chỉ điều phối hoặc quản trị mới tạo được thiết bị GPS.' });
    }

    const missing = ensureFields(req.body, ['device_code']);
    if (missing.length) {
      return res.status(400).json({ message: `Missing fields: ${missing.join(', ')}` });
    }

    const deviceToken = req.body.device_token || crypto.randomBytes(24).toString('hex');
    const result = await query(
      `INSERT INTO gps_devices (device_code, device_token, trip_id, truck_id, driver_id, status, note)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        req.body.device_code,
        deviceToken,
        req.body.trip_id || null,
        req.body.truck_id || null,
        req.body.driver_id || null,
        req.body.status || 'ACTIVE',
        req.body.note || ''
      ]
    );

    const [row] = await query('SELECT * FROM gps_devices WHERE id = ?', [result.insertId]);
    res.status(201).json(row);
  })
);

trackingRouter.patch(
  '/devices/:deviceId',
  asyncHandler(async (req, res) => {
    if (!canManageTracking(req.user.role)) {
      return res.status(403).json({ message: 'Chỉ điều phối hoặc quản trị mới cập nhật được thiết bị GPS.' });
    }

    const deviceId = Number(req.params.deviceId);
    await query(
      `UPDATE gps_devices
       SET trip_id = ?, truck_id = ?, driver_id = ?, status = ?, note = ?
       WHERE id = ?`,
      [
        req.body.trip_id || null,
        req.body.truck_id || null,
        req.body.driver_id || null,
        req.body.status || 'ACTIVE',
        req.body.note || '',
        deviceId
      ]
    );

    const [row] = await query('SELECT * FROM gps_devices WHERE id = ?', [deviceId]);
    res.json(row);
  })
);

trackingRouter.get(
  '/trips/:tripId/locations',
  asyncHandler(async (req, res) => {
    const tripId = Number(req.params.tripId);
    if (req.user.role === 'DRIVER' && !(await ensureDriverOwnsTrip(req.user.id, tripId))) {
      return res.status(403).json({ message: 'You can only view your assigned trip tracking.' });
    }
    if (req.user.role !== 'DRIVER' && !canManageTracking(req.user.role)) {
      return res.status(403).json({ message: 'Not allowed.' });
    }

    const rows = await query(
      `SELECT tl.*, gd.device_code
       FROM trip_location_logs tl
       LEFT JOIN gps_devices gd ON gd.id = tl.gps_device_id
       WHERE tl.trip_id = ?
       ORDER BY tl.recorded_at ASC, tl.id ASC`,
      [tripId]
    );
    res.json(rows);
  })
);

trackingRouter.post(
  '/trips/:tripId/locations',
  asyncHandler(async (req, res) => {
    const tripId = Number(req.params.tripId);
    const missing = ensureFields(req.body, ['latitude', 'longitude']);
    if (missing.length) {
      return res.status(400).json({ message: `Missing fields: ${missing.join(', ')}` });
    }

    if (req.user.role === 'DRIVER' && !(await ensureDriverOwnsTrip(req.user.id, tripId))) {
      return res.status(403).json({ message: 'You can only update your assigned trip tracking.' });
    }
    if (req.user.role !== 'DRIVER' && !canManageTracking(req.user.role)) {
      return res.status(403).json({ message: 'Not allowed.' });
    }

    const latitude = Number(req.body.latitude);
    const longitude = Number(req.body.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      return res.status(400).json({ message: 'Tọa độ không hợp lệ.' });
    }

    const row = await insertLocationLog({
      tripId,
      latitude,
      longitude,
      speedKmh: req.body.speed_kmh === '' || req.body.speed_kmh == null ? null : Number(req.body.speed_kmh),
      heading: req.body.heading === '' || req.body.heading == null ? null : Number(req.body.heading),
      note: req.body.note || '',
      recordedBy: req.user.id,
      recordedAt: req.body.recorded_at || null,
      source: req.user.role === 'DRIVER' ? 'BROWSER' : 'DISPATCHER',
      gpsDeviceId: null
    });

    res.status(201).json(row);
  })
);

export { trackingPublicRouter };
export default trackingRouter;

import express from 'express';
import { query } from '../config/db.js';
import { asyncHandler } from '../utils/http.js';
import { ensureFields } from '../utils/validators.js';

const router = express.Router();

function canManageTracking(role) {
  return ['ADMIN', 'DISPATCHER'].includes(role);
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

router.get(
  '/latest',
  asyncHandler(async (req, res) => {
    if (!canManageTracking(req.user.role)) {
      return res.status(403).json({ message: 'Only admin or dispatcher can view fleet tracking.' });
    }

    const rows = await query(
      `SELECT tl.*, t.trip_code, t.status AS trip_status, tr.license_plate, d.full_name AS driver_name
       FROM trip_location_logs tl
       JOIN (
         SELECT trip_id, MAX(id) AS latest_id
         FROM trip_location_logs
         GROUP BY trip_id
       ) latest ON latest.latest_id = tl.id
       JOIN trips t ON t.id = tl.trip_id
       JOIN trucks tr ON tr.id = t.truck_id
       JOIN drivers d ON d.id = t.driver_id
       ORDER BY tl.recorded_at DESC`
    );

    res.json(rows);
  })
);

router.get(
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
      `SELECT *
       FROM trip_location_logs
       WHERE trip_id = ?
       ORDER BY recorded_at ASC, id ASC`,
      [tripId]
    );
    res.json(rows);
  })
);

router.post(
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

    const result = await query(
      `INSERT INTO trip_location_logs (
         trip_id, latitude, longitude, speed_kmh, heading, note, recorded_by, recorded_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW()))`,
      [
        tripId,
        latitude,
        longitude,
        req.body.speed_kmh === '' || req.body.speed_kmh == null ? null : Number(req.body.speed_kmh),
        req.body.heading === '' || req.body.heading == null ? null : Number(req.body.heading),
        req.body.note || '',
        req.user.id,
        req.body.recorded_at || null
      ]
    );

    const [row] = await query('SELECT * FROM trip_location_logs WHERE id = ?', [result.insertId]);
    res.status(201).json(row);
  })
);

export default router;

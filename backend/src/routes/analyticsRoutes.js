import express from 'express';
import { query, withTransaction } from '../config/db.js';
import { asyncHandler } from '../utils/http.js';
import { ensureFields } from '../utils/validators.js';
import { trainFuelRegression, predictFuelLiters } from '../utils/regression.js';

const router = express.Router();

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getAlertSeverity(remainingKm) {
  if (remainingKm <= 0) {
    return 'CRITICAL';
  }
  if (remainingKm <= 500) {
    return 'HIGH';
  }
  if (remainingKm <= 1500) {
    return 'MEDIUM';
  }
  return 'LOW';
}

router.get(
  '/overview',
  asyncHandler(async (req, res) => {
    const trucks = await query(
      `SELECT
         t.*,
         COUNT(fl.id) AS fuel_log_count,
         AVG(fl.fuel_liters / NULLIF(fl.distance_km, 0) * 100) AS avg_consumption_per_100km,
         AVG(fl.payload_tons) AS avg_payload_tons,
         MAX(fl.log_date) AS latest_fuel_log_date
       FROM trucks t
       LEFT JOIN fuel_logs fl ON fl.truck_id = t.id
       GROUP BY t.id
       ORDER BY t.id DESC`
    );

    const alerts = trucks.map((truck) => {
      const cumulativeKm = toNumber(truck.cumulative_km);
      const lastMaintenanceKm = toNumber(truck.last_maintenance_km);
      const intervalKm = Math.max(toNumber(truck.maintenance_interval_km, 10000), 1);
      const kmSinceMaintenance = cumulativeKm - lastMaintenanceKm;
      const remainingKm = intervalKm - kmSinceMaintenance;

      return {
        truckId: truck.id,
        licensePlate: truck.license_plate,
        cumulativeKm: Number(cumulativeKm.toFixed(2)),
        kmSinceMaintenance: Number(kmSinceMaintenance.toFixed(2)),
        maintenanceIntervalKm: Number(intervalKm.toFixed(2)),
        remainingKm: Number(remainingKm.toFixed(2)),
        severity: getAlertSeverity(remainingKm),
        recommendedAction:
          remainingKm <= 0
            ? 'Đưa xe vào lịch bảo trì ngay.'
            : remainingKm <= 500
              ? 'Ưu tiên xếp lịch bảo trì trong chuyến gần nhất.'
              : remainingKm <= 1500
                ? 'Theo dõi sát và chuẩn bị vật tư bảo trì.'
                : 'Hoạt động bình thường.'
      };
    });

    res.json({
      trucks,
      alerts,
      summary: {
        totalTrucks: trucks.length,
        criticalAlerts: alerts.filter((item) => item.severity === 'CRITICAL').length,
        highAlerts: alerts.filter((item) => item.severity === 'HIGH').length,
        averageConsumption: Number(
          (
            trucks.reduce((sum, truck) => sum + toNumber(truck.avg_consumption_per_100km), 0) /
            Math.max(trucks.filter((truck) => truck.avg_consumption_per_100km !== null).length, 1)
          ).toFixed(2)
        )
      }
    });
  })
);

router.get(
  '/fuel-logs',
  asyncHandler(async (req, res) => {
    const { truckId } = req.query;
    const params = [];
    let whereClause = '';

    if (truckId) {
      whereClause = 'WHERE fl.truck_id = ?';
      params.push(truckId);
    }

    const rows = await query(
      `SELECT fl.*, t.license_plate, tr.trip_code
       FROM fuel_logs fl
       JOIN trucks t ON t.id = fl.truck_id
       LEFT JOIN trips tr ON tr.id = fl.trip_id
       ${whereClause}
       ORDER BY fl.log_date DESC, fl.id DESC`,
      params
    );

    res.json(rows);
  })
);

router.post(
  '/fuel-logs',
  asyncHandler(async (req, res) => {
    const missing = ensureFields(req.body, ['truck_id', 'log_date', 'distance_km', 'fuel_liters', 'cumulative_km_after']);
    if (missing.length) {
      return res.status(400).json({ message: `Missing fields: ${missing.join(', ')}` });
    }

    const truckId = Number(req.body.truck_id);
    const tripId = req.body.trip_id ? Number(req.body.trip_id) : null;
    const distanceKm = toNumber(req.body.distance_km);
    const fuelLiters = toNumber(req.body.fuel_liters);
    const payloadTons = toNumber(req.body.payload_tons);
    const idleMinutes = Math.round(toNumber(req.body.idle_minutes));
    const avgSpeedKmh = toNumber(req.body.avg_speed_kmh, 45);
    const cumulativeKmAfter = toNumber(req.body.cumulative_km_after);

    if (distanceKm <= 0 || fuelLiters <= 0) {
      return res.status(400).json({ message: 'distance_km và fuel_liters phải lớn hơn 0.' });
    }

    const result = await withTransaction(async (connection) => {
      const [truckRows] = await connection.execute('SELECT * FROM trucks WHERE id = ?', [truckId]);
      if (!truckRows.length) {
        throw new Error('Truck not found.');
      }

      const [insertResult] = await connection.execute(
        `INSERT INTO fuel_logs (
           truck_id, trip_id, log_date, distance_km, fuel_liters, payload_tons,
           idle_minutes, avg_speed_kmh, cumulative_km_after, notes
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          truckId,
          tripId,
          req.body.log_date,
          distanceKm,
          fuelLiters,
          payloadTons,
          idleMinutes,
          avgSpeedKmh,
          cumulativeKmAfter,
          req.body.notes || ''
        ]
      );

      await connection.execute(
        `UPDATE trucks
         SET cumulative_km = GREATEST(cumulative_km, ?)
         WHERE id = ?`,
        [cumulativeKmAfter, truckId]
      );

      const [rows] = await connection.execute(
        `SELECT fl.*, t.license_plate
         FROM fuel_logs fl
         JOIN trucks t ON t.id = fl.truck_id
         WHERE fl.id = ?`,
        [insertResult.insertId]
      );

      return rows[0];
    });

    res.status(201).json(result);
  })
);

router.post(
  '/train',
  asyncHandler(async (req, res) => {
    const { truckId } = req.body || {};
    const params = [];
    let whereClause = '';

    if (truckId) {
      whereClause = 'WHERE fl.truck_id = ?';
      params.push(Number(truckId));
    }

    const rows = await query(
      `SELECT fl.*, t.license_plate
       FROM fuel_logs fl
       JOIN trucks t ON t.id = fl.truck_id
       ${whereClause}
       ORDER BY fl.log_date ASC, fl.id ASC`,
      params
    );

    const model = trainFuelRegression(rows);
    const targetLabel = truckId ? rows[0]?.license_plate || `Xe ${truckId}` : 'Toàn đội xe';

    res.json({
      scope: truckId ? 'truck' : 'fleet',
      targetLabel,
      model
    });
  })
);

router.post(
  '/predict',
  asyncHandler(async (req, res) => {
    const missing = ensureFields(req.body, ['distance_km']);
    if (missing.length) {
      return res.status(400).json({ message: `Missing fields: ${missing.join(', ')}` });
    }

    const { truckId = null } = req.body;
    const params = [];
    let whereClause = '';

    if (truckId) {
      whereClause = 'WHERE truck_id = ?';
      params.push(Number(truckId));
    }

    const rows = await query(
      `SELECT *
       FROM fuel_logs
       ${whereClause}
       ORDER BY log_date ASC, id ASC`,
      params
    );

    const model = trainFuelRegression(rows);
    const predictedFuelLiters = predictFuelLiters(model, req.body);
    const distanceKm = toNumber(req.body.distance_km);

    res.json({
      predictedFuelLiters,
      predictedConsumptionPer100Km: distanceKm > 0 ? Number(((predictedFuelLiters / distanceKm) * 100).toFixed(2)) : 0,
      model
    });
  })
);

router.post(
  '/trucks/:id/maintenance-reset',
  asyncHandler(async (req, res) => {
    const truckId = Number(req.params.id);
    await query(
      `UPDATE trucks
       SET last_maintenance_km = cumulative_km,
           last_maintenance_date = CURDATE(),
           status = 'AVAILABLE'
       WHERE id = ?`,
      [truckId]
    );

    const [row] = await query('SELECT * FROM trucks WHERE id = ?', [truckId]);
    res.json(row);
  })
);

export default router;

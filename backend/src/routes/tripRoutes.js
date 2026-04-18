import express from 'express';
import { query, withTransaction } from '../config/db.js';
import { asyncHandler } from '../utils/http.js';
import { ensureFields } from '../utils/validators.js';

const router = express.Router();

function requireDispatcher(req, res) {
  if (!['ADMIN', 'DISPATCHER'].includes(req.user.role)) {
    res.status(403).json({ message: 'Only admin or dispatcher can manage trips.' });
    return false;
  }
  return true;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const onlyMine = req.user.role === 'DRIVER';
    const params = [];
    let whereClause = '';

    if (onlyMine) {
      whereClause = 'WHERE drivers.user_id = ?';
      params.push(req.user.id);
    }

    const trips = await query(
      `SELECT trips.*, trucks.license_plate, drivers.full_name AS driver_name
       FROM trips
       JOIN trucks ON trucks.id = trips.truck_id
       JOIN drivers ON drivers.id = trips.driver_id
       ${whereClause}
       ORDER BY trips.id DESC`,
      params
    );

    const tripIds = trips.map((trip) => trip.id);
    let orders = [];
    let logs = [];
    if (tripIds.length) {
      const placeholders = tripIds.map(() => '?').join(', ');
      orders = await query(
        `SELECT trip_orders.trip_id, orders.*
         FROM trip_orders
         JOIN orders ON orders.id = trip_orders.order_id
         WHERE trip_orders.trip_id IN (${placeholders})`,
        tripIds
      );
      logs = await query(
        `SELECT trip_id, status, note, created_at
         FROM trip_status_logs
         WHERE trip_id IN (${placeholders})
         ORDER BY created_at DESC`,
        tripIds
      );
    }

    const response = trips.map((trip) => ({
      ...trip,
      orders: orders.filter((order) => order.trip_id === trip.id),
      logs: logs.filter((log) => log.trip_id === trip.id)
    }));

    res.json(response);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!requireDispatcher(req, res)) {
      return;
    }

    const missing = ensureFields(req.body, ['trip_code', 'truck_id', 'driver_id', 'start_date', 'origin', 'destination']);
    if (missing.length) {
      return res.status(400).json({ message: `Missing fields: ${missing.join(', ')}` });
    }

    const { trip_code, truck_id, driver_id, start_date, end_date = null, origin, destination, status = 'PLANNED', notes = '' } = req.body;

    const [truck] = await query('SELECT * FROM trucks WHERE id = ?', [truck_id]);
    const [driver] = await query('SELECT * FROM drivers WHERE id = ?', [driver_id]);
    if (!truck || !driver) {
      return res.status(400).json({ message: 'Truck or driver does not exist.' });
    }

    const result = await query(
      `INSERT INTO trips (trip_code, truck_id, driver_id, start_date, end_date, origin, destination, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [trip_code, truck_id, driver_id, start_date, end_date, origin, destination, status, notes]
    );

    await query(
      'INSERT INTO trip_status_logs (trip_id, status, updated_by, note) VALUES (?, ?, ?, ?)',
      [result.insertId, status, req.user.id, 'Khoi tao chuyen']
    );

    const rows = await query('SELECT * FROM trips WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  })
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!requireDispatcher(req, res)) {
      return;
    }

    const { trip_code, truck_id, driver_id, start_date, end_date = null, origin, destination, status, notes = '' } = req.body;
    await query(
      `UPDATE trips
       SET trip_code = ?, truck_id = ?, driver_id = ?, start_date = ?, end_date = ?, origin = ?, destination = ?, status = ?, notes = ?
       WHERE id = ?`,
      [trip_code, truck_id, driver_id, start_date, end_date, origin, destination, status, notes, req.params.id]
    );
    const rows = await query('SELECT * FROM trips WHERE id = ?', [req.params.id]);
    res.json(rows[0]);
  })
);

router.post(
  '/:id/assign-orders',
  asyncHandler(async (req, res) => {
    if (!requireDispatcher(req, res)) {
      return;
    }

    const tripId = Number(req.params.id);
    const { orderIds } = req.body;

    if (!Array.isArray(orderIds) || !orderIds.length) {
      return res.status(400).json({ message: 'orderIds is required.' });
    }

    const result = await withTransaction(async (connection) => {
      const [tripRows] = await connection.execute('SELECT * FROM trips WHERE id = ?', [tripId]);
      if (!tripRows.length) {
        throw new Error('Trip not found.');
      }

      const placeholders = orderIds.map(() => '?').join(', ');
      const [orderRows] = await connection.execute(
        `SELECT * FROM orders WHERE id IN (${placeholders})`,
        orderIds
      );
      if (orderRows.length !== orderIds.length) {
        throw new Error('One or more orders do not exist.');
      }

      for (const orderId of orderIds) {
        await connection.execute(
          'INSERT INTO trip_orders (trip_id, order_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE trip_id = VALUES(trip_id)',
          [tripId, orderId]
        );
      }

      await connection.execute(
        `UPDATE orders
         SET status = 'ASSIGNED'
         WHERE id IN (${placeholders})`,
        orderIds
      );

      await connection.execute(
        `UPDATE trips
         SET status = 'ASSIGNED'
         WHERE id = ?`,
        [tripId]
      );

      await connection.execute(
        'INSERT INTO trip_status_logs (trip_id, status, updated_by, note) VALUES (?, ?, ?, ?)',
        [tripId, 'ASSIGNED', req.user.id, 'Gan don hang vao chuyen']
      );

      return { message: 'Orders assigned successfully.' };
    });

    res.json(result);
  })
);

router.post(
  '/:id/status',
  asyncHandler(async (req, res) => {
    const tripId = Number(req.params.id);
    const { status, note = '' } = req.body;
    const validStatuses = ['PLANNED', 'ASSIGNED', 'IN_TRANSIT', 'COMPLETED', 'INCIDENT'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status.' });
    }

    await withTransaction(async (connection) => {
      const [tripRows] = await connection.execute('SELECT * FROM trips WHERE id = ?', [tripId]);
      if (!tripRows.length) {
        throw new Error('Trip not found.');
      }

      const trip = tripRows[0];
      if (req.user.role === 'DRIVER') {
        const [driverRows] = await connection.execute('SELECT * FROM drivers WHERE id = ? AND user_id = ?', [trip.driver_id, req.user.id]);
        if (!driverRows.length) {
          throw new Error('You can only update your assigned trip.');
        }
        if (!['IN_TRANSIT', 'COMPLETED'].includes(status)) {
          throw new Error('Driver can only mark trip as IN_TRANSIT or COMPLETED.');
        }
      }

      await connection.execute('UPDATE trips SET status = ?, end_date = IF(? = "COMPLETED", NOW(), end_date) WHERE id = ?', [status, status, tripId]);
      await connection.execute('INSERT INTO trip_status_logs (trip_id, status, updated_by, note) VALUES (?, ?, ?, ?)', [tripId, status, req.user.id, note]);

      const [assignedOrderRows] = await connection.execute('SELECT order_id FROM trip_orders WHERE trip_id = ?', [tripId]);
      const orderIds = assignedOrderRows.map((row) => row.order_id);
      if (orderIds.length) {
        const orderStatus = status === 'ASSIGNED' ? 'ASSIGNED' : status === 'IN_TRANSIT' ? 'IN_TRANSIT' : status === 'COMPLETED' ? 'COMPLETED' : 'ASSIGNED';
        const placeholders = orderIds.map(() => '?').join(', ');
        await connection.execute(`UPDATE orders SET status = ? WHERE id IN (${placeholders})`, [orderStatus, ...orderIds]);
      }
    });

    res.json({ message: 'Trip status updated.' });
  })
);

export default router;

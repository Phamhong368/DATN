import express from 'express';
import { query } from '../config/db.js';
import { asyncHandler } from '../utils/http.js';
import { ensureFields } from '../utils/validators.js';

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = await query(
      `SELECT orders.*, customers.name AS customer_name
       FROM orders
       JOIN customers ON customers.id = orders.customer_id
       ORDER BY orders.id DESC`
    );
    res.json(rows);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const missing = ensureFields(req.body, [
      'customer_id',
      'order_code',
      'pickup_location',
      'delivery_location',
      'cargo_type',
      'weight_tons',
      'planned_revenue'
    ]);
    if (missing.length) {
      return res.status(400).json({ message: `Missing fields: ${missing.join(', ')}` });
    }

    const {
      customer_id,
      order_code,
      pickup_location,
      delivery_location,
      cargo_type,
      weight_tons,
      planned_revenue,
      status = 'PENDING_DISPATCH'
    } = req.body;

    const result = await query(
      `INSERT INTO orders (
          customer_id, order_code, pickup_location, delivery_location,
          cargo_type, weight_tons, planned_revenue, status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [customer_id, order_code, pickup_location, delivery_location, cargo_type, weight_tons, planned_revenue, status]
    );
    const rows = await query('SELECT * FROM orders WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  })
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const {
      customer_id,
      order_code,
      pickup_location,
      delivery_location,
      cargo_type,
      weight_tons,
      planned_revenue,
      status
    } = req.body;
    await query(
      `UPDATE orders
       SET customer_id = ?, order_code = ?, pickup_location = ?, delivery_location = ?,
           cargo_type = ?, weight_tons = ?, planned_revenue = ?, status = ?
       WHERE id = ?`,
      [customer_id, order_code, pickup_location, delivery_location, cargo_type, weight_tons, planned_revenue, status, req.params.id]
    );
    const rows = await query('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    res.json(rows[0]);
  })
);

export default router;


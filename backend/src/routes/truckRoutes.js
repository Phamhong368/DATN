import express from 'express';
import { query } from '../config/db.js';
import { asyncHandler } from '../utils/http.js';
import { ensureFields } from '../utils/validators.js';
import { requireAdmin } from '../utils/permissions.js';

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = await query('SELECT * FROM trucks ORDER BY id DESC');
    res.json(rows);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!requireAdmin(req, res)) {
      return;
    }

    const missing = ensureFields(req.body, ['license_plate', 'truck_type', 'capacity_tons']);
    if (missing.length) {
      return res.status(400).json({ message: `Missing fields: ${missing.join(', ')}` });
    }

    const { license_plate, truck_type, capacity_tons, status = 'AVAILABLE' } = req.body;
    const result = await query(
      'INSERT INTO trucks (license_plate, truck_type, capacity_tons, status) VALUES (?, ?, ?, ?)',
      [license_plate, truck_type, capacity_tons, status]
    );

    const rows = await query('SELECT * FROM trucks WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  })
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!requireAdmin(req, res)) {
      return;
    }

    const { id } = req.params;
    const { license_plate, truck_type, capacity_tons, status } = req.body;
    await query(
      `UPDATE trucks
       SET license_plate = ?, truck_type = ?, capacity_tons = ?, status = ?
       WHERE id = ?`,
      [license_plate, truck_type, capacity_tons, status, id]
    );
    const rows = await query('SELECT * FROM trucks WHERE id = ?', [id]);
    res.json(rows[0]);
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!requireAdmin(req, res)) {
      return;
    }

    await query('DELETE FROM trucks WHERE id = ?', [req.params.id]);
    res.status(204).send();
  })
);

export default router;

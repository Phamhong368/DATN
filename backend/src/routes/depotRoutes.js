import express from 'express';
import { query } from '../config/db.js';
import { asyncHandler } from '../utils/http.js';
import { ensureFields } from '../utils/validators.js';
import { requireAdmin } from '../utils/permissions.js';

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = await query('SELECT * FROM depots ORDER BY id DESC');
    res.json(rows);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!requireAdmin(req, res)) {
      return;
    }

    const missing = ensureFields(req.body, ['depot_code', 'name', 'location']);
    if (missing.length) {
      return res.status(400).json({ message: `Missing fields: ${missing.join(', ')}` });
    }

    const { depot_code, name, location, latitude = null, longitude = null, status = 'ACTIVE' } = req.body;
    const result = await query(
      `INSERT INTO depots (depot_code, name, location, latitude, longitude, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [depot_code, name, location, latitude, longitude, status]
    );
    const rows = await query('SELECT * FROM depots WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  })
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!requireAdmin(req, res)) {
      return;
    }

    const { depot_code, name, location, latitude = null, longitude = null, status } = req.body;
    await query(
      `UPDATE depots
       SET depot_code = ?, name = ?, location = ?, latitude = ?, longitude = ?, status = ?
       WHERE id = ?`,
      [depot_code, name, location, latitude, longitude, status, req.params.id]
    );
    const rows = await query('SELECT * FROM depots WHERE id = ?', [req.params.id]);
    res.json(rows[0]);
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!requireAdmin(req, res)) {
      return;
    }

    await query('DELETE FROM depots WHERE id = ?', [req.params.id]);
    res.status(204).send();
  })
);

export default router;


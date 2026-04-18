import express from 'express';
import { query } from '../config/db.js';
import { asyncHandler } from '../utils/http.js';
import { ensureFields } from '../utils/validators.js';
import { requireAdmin } from '../utils/permissions.js';

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = await query(
      `SELECT drivers.*, users.username
       FROM drivers
       LEFT JOIN users ON users.id = drivers.user_id
       ORDER BY drivers.id DESC`
    );
    res.json(rows);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!requireAdmin(req, res)) {
      return;
    }

    const missing = ensureFields(req.body, ['full_name', 'phone', 'license_number', 'license_class']);
    if (missing.length) {
      return res.status(400).json({ message: `Missing fields: ${missing.join(', ')}` });
    }

    const { user_id = null, full_name, phone, license_number, license_class, status = 'AVAILABLE' } = req.body;
    const result = await query(
      `INSERT INTO drivers (user_id, full_name, phone, license_number, license_class, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [user_id, full_name, phone, license_number, license_class, status]
    );
    const rows = await query('SELECT * FROM drivers WHERE id = ?', [result.insertId]);
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
    const { user_id = null, full_name, phone, license_number, license_class, status } = req.body;
    await query(
      `UPDATE drivers
       SET user_id = ?, full_name = ?, phone = ?, license_number = ?, license_class = ?, status = ?
       WHERE id = ?`,
      [user_id, full_name, phone, license_number, license_class, status, id]
    );
    const rows = await query('SELECT * FROM drivers WHERE id = ?', [id]);
    res.json(rows[0]);
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!requireAdmin(req, res)) {
      return;
    }

    await query('DELETE FROM drivers WHERE id = ?', [req.params.id]);
    res.status(204).send();
  })
);

export default router;

import express from 'express';
import { query } from '../config/db.js';
import { asyncHandler } from '../utils/http.js';
import { ensureFields } from '../utils/validators.js';
import { requireAdmin } from '../utils/permissions.js';

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = await query('SELECT * FROM customers ORDER BY id DESC');
    res.json(rows);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!requireAdmin(req, res)) {
      return;
    }

    const missing = ensureFields(req.body, ['name']);
    if (missing.length) {
      return res.status(400).json({ message: `Missing fields: ${missing.join(', ')}` });
    }
    const { name, phone = '', email = '', address = '' } = req.body;
    const result = await query(
      'INSERT INTO customers (name, phone, email, address) VALUES (?, ?, ?, ?)',
      [name, phone, email, address]
    );
    const rows = await query('SELECT * FROM customers WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  })
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!requireAdmin(req, res)) {
      return;
    }

    const { name, phone = '', email = '', address = '' } = req.body;
    await query(
      'UPDATE customers SET name = ?, phone = ?, email = ?, address = ? WHERE id = ?',
      [name, phone, email, address, req.params.id]
    );
    const rows = await query('SELECT * FROM customers WHERE id = ?', [req.params.id]);
    res.json(rows[0]);
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!requireAdmin(req, res)) {
      return;
    }

    await query('DELETE FROM customers WHERE id = ?', [req.params.id]);
    res.status(204).send();
  })
);

export default router;

import express from 'express';
import asyncHandler from 'express-async-handler';
import { query } from '../config/db.js';

const router = express.Router();

/**
 * Helper nhỏ nếu bạn chưa có implementation trung tâm.
 * Nếu đã có hàm requireAdmin/ensureFields ở chỗ khác, xóa hoặc thay bằng import tương ứng.
 */
function ensureFields(body = {}, fields = []) {
  return fields.filter((f) => {
    const v = body[f];
    return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
  });
}

function requireAdmin(req, res) {
  // Nếu bạn có auth, kiểm tra req.user.role ở đây.
  // Mặc định cho dev: nếu không có user => chặn; nếu muốn mở, return true.
  const user = req.user || null;
  if (!user || (user.role && user.role.toLowerCase() !== 'admin')) {
    res.status(403).json({ error: 'Admin permission required' });
    return false;
  }
  return true;
}

/* Routes */
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
    if (!requireAdmin(req, res)) return;

    const missing = ensureFields(req.body, ['depot_code', 'name', 'location']);
    if (missing.length) {
      return res.status(400).json({ error: 'Missing fields', missing });
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
    if (!requireAdmin(req, res)) return;

    const { depot_code, name, location, latitude = null, longitude = null, status } = req.body;
    await query(
      `UPDATE depots
       SET depot_code = ?, name = ?, location = ?, latitude = ?, longitude = ?, status = ?
       WHERE id = ?`,
      [depot_code, name, location, latitude, longitude, status, req.params.id]
    );
    const rows = await query('SELECT * FROM depots WHERE id = ?', [req.params.id]);
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Depot not found' });
    res.json(rows[0]);
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!requireAdmin(req, res)) return;

    await query('DELETE FROM depots WHERE id = ?', [req.params.id]);
    res.status(204).send();
  })
);

export default router;


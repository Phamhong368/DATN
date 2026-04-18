import express from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../config/db.js';
import { asyncHandler } from '../utils/http.js';
import { ensureFields } from '../utils/validators.js';

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = await query(
      `SELECT users.id, users.username, users.full_name, users.created_at, roles.name AS role
       FROM users
       JOIN roles ON roles.id = users.role_id
       ORDER BY users.id DESC`
    );
    res.json(rows);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const missing = ensureFields(req.body, ['username', 'full_name', 'password', 'role']);
    if (missing.length) {
      return res.status(400).json({ message: `Missing fields: ${missing.join(', ')}` });
    }

    const [role] = await query('SELECT id, name FROM roles WHERE name = ?', [req.body.role]);
    if (!role) {
      return res.status(400).json({ message: 'Vai trò không hợp lệ.' });
    }

    const passwordHash = await bcrypt.hash(req.body.password, 10);
    const result = await query(
      `INSERT INTO users (role_id, username, password_hash, full_name)
       VALUES (?, ?, ?, ?)`,
      [role.id, req.body.username, passwordHash, req.body.full_name]
    );

    const rows = await query(
      `SELECT users.id, users.username, users.full_name, roles.name AS role
       FROM users
       JOIN roles ON roles.id = users.role_id
       WHERE users.id = ?`,
      [result.insertId]
    );
    res.status(201).json(rows[0]);
  })
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const missing = ensureFields(req.body, ['username', 'full_name', 'role']);
    if (missing.length) {
      return res.status(400).json({ message: `Missing fields: ${missing.join(', ')}` });
    }

    const [role] = await query('SELECT id FROM roles WHERE name = ?', [req.body.role]);
    if (!role) {
      return res.status(400).json({ message: 'Vai trò không hợp lệ.' });
    }

    if (req.body.password) {
      const passwordHash = await bcrypt.hash(req.body.password, 10);
      await query(
        `UPDATE users
         SET role_id = ?, username = ?, password_hash = ?, full_name = ?
         WHERE id = ?`,
        [role.id, req.body.username, passwordHash, req.body.full_name, req.params.id]
      );
    } else {
      await query(
        `UPDATE users
         SET role_id = ?, username = ?, full_name = ?
         WHERE id = ?`,
        [role.id, req.body.username, req.body.full_name, req.params.id]
      );
    }

    const rows = await query(
      `SELECT users.id, users.username, users.full_name, roles.name AS role
       FROM users
       JOIN roles ON roles.id = users.role_id
       WHERE users.id = ?`,
      [req.params.id]
    );
    res.json(rows[0]);
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await query('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.status(204).send();
  })
);

export default router;

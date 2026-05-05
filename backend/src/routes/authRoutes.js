import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../config/db.js';

const router = express.Router();

// POST /api/auth/login
router.post(
  '/login',
  async (req, res, next) => {
    try {
      const { username, password } = req.body || {};
      if (!username || !password) return res.status(400).json({ error: 'username and password required' });

      const rows = await query('SELECT * FROM users WHERE username = ? LIMIT 1', [username]);
      const user = rows && rows[0];
      if (!user) return res.status(401).json({ error: 'Invalid credentials' });

      const hash = user.password_hash; // adjust if column name differs
      const ok = await bcrypt.compare(password, hash);
      if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

      const payload = { id: user.id, username: user.username, role_id: user.role_id };
      const token = jwt.sign(payload, process.env.JWT_SECRET || 'super-secret-demo-key', { expiresIn: '8h' });

      res.json({
        token,
        user: { id: user.id, username: user.username, full_name: user.full_name, role_id: user.role_id }
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;


import express from 'express';
import { query } from '../config/db.js';
import { asyncHandler } from '../utils/http.js';

const router = express.Router();

router.get(
  '/summary',
  asyncHandler(async (_req, res) => {
    const [counts] = await query(
      `SELECT
         (SELECT COUNT(*) FROM orders) AS totalOrders,
         (SELECT COUNT(*) FROM trips) AS totalTrips,
         (SELECT COUNT(*) FROM trucks WHERE status = 'AVAILABLE') AS availableTrucks,
         (SELECT COUNT(*) FROM drivers WHERE status = 'AVAILABLE') AS availableDrivers,
         (SELECT COALESCE(SUM(planned_revenue), 0) FROM orders) AS expectedRevenue`
    );

    const monthly = await query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, COUNT(*) AS total_orders, SUM(planned_revenue) AS revenue
       FROM orders
       GROUP BY DATE_FORMAT(created_at, '%Y-%m')
       ORDER BY month ASC`
    );

    const statusBreakdown = await query(
      `SELECT status, COUNT(*) AS total
       FROM orders
       GROUP BY status`
    );

    res.json({
      totals: counts,
      monthly,
      statusBreakdown
    });
  })
);

export default router;


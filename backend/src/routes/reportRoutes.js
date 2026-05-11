import express from 'express';
import { query } from '../config/db.js';
import { asyncHandler } from '../utils/http.js';
import { buildExcelHtml, buildSimplePdf } from '../utils/reportExport.js';

const router = express.Router();

const reportDefinitions = {
  orders: {
    title: 'Bao cao don hang',
    filename: 'orders-report',
    columns: [
      { key: 'order_code', label: 'Ma don' },
      { key: 'customer_name', label: 'Khach hang' },
      { key: 'pickup_location', label: 'Diem lay' },
      { key: 'delivery_location', label: 'Diem giao' },
      { key: 'cargo_type', label: 'Hang hoa' },
      { key: 'weight_tons', label: 'Tai trong' },
      { key: 'planned_revenue', label: 'Doanh thu' },
      { key: 'status', label: 'Trang thai' }
    ],
    sql: `SELECT o.*, c.name AS customer_name
          FROM orders o
          JOIN customers c ON c.id = o.customer_id
          ORDER BY o.id DESC`
  },
  trips: {
    title: 'Bao cao chuyen hang',
    filename: 'trips-report',
    columns: [
      { key: 'trip_code', label: 'Ma chuyen' },
      { key: 'license_plate', label: 'Xe' },
      { key: 'driver_name', label: 'Tai xe' },
      { key: 'origin', label: 'Diem di' },
      { key: 'destination', label: 'Diem den' },
      { key: 'start_date', label: 'Ngay bat dau' },
      { key: 'end_date', label: 'Ngay ket thuc' },
      { key: 'status', label: 'Trang thai' }
    ],
    sql: `SELECT t.*, tr.license_plate, d.full_name AS driver_name
          FROM trips t
          JOIN trucks tr ON tr.id = t.truck_id
          JOIN drivers d ON d.id = t.driver_id
          ORDER BY t.id DESC`
  },
  fuel: {
    title: 'Bao cao nhien lieu',
    filename: 'fuel-report',
    columns: [
      { key: 'log_date', label: 'Ngay' },
      { key: 'license_plate', label: 'Xe' },
      { key: 'trip_code', label: 'Chuyen' },
      { key: 'distance_km', label: 'Km' },
      { key: 'fuel_liters', label: 'Lit' },
      { key: 'payload_tons', label: 'Tai trong' },
      { key: 'avg_speed_kmh', label: 'Toc do TB' },
      { key: 'cumulative_km_after', label: 'Odometer' }
    ],
    sql: `SELECT fl.*, tr.license_plate, tp.trip_code
          FROM fuel_logs fl
          JOIN trucks tr ON tr.id = fl.truck_id
          LEFT JOIN trips tp ON tp.id = fl.trip_id
          ORDER BY fl.log_date DESC, fl.id DESC`
  },
  maintenance: {
    title: 'Bao cao bao tri',
    filename: 'maintenance-report',
    columns: [
      { key: 'license_plate', label: 'Xe' },
      { key: 'truck_type', label: 'Loai xe' },
      { key: 'status', label: 'Trang thai' },
      { key: 'cumulative_km', label: 'Km tich luy' },
      { key: 'last_maintenance_km', label: 'Km bao tri gan nhat' },
      { key: 'maintenance_interval_km', label: 'Chu ky bao tri' },
      { key: 'remaining_km', label: 'Km con lai' }
    ],
    sql: `SELECT *,
                 maintenance_interval_km - (cumulative_km - last_maintenance_km) AS remaining_km
          FROM trucks
          ORDER BY remaining_km ASC`
  }
};

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

router.get(
  '/export',
  asyncHandler(async (req, res) => {
    const reportKey = String(req.query.report || 'orders');
    const format = String(req.query.format || 'xlsx').toLowerCase();
    const definition = reportDefinitions[reportKey];

    if (!definition) {
      return res.status(400).json({ message: 'Loại báo cáo không hợp lệ.' });
    }
    if (!['xlsx', 'xls', 'pdf'].includes(format)) {
      return res.status(400).json({ message: 'Định dạng export không hợp lệ.' });
    }

    const rows = await query(definition.sql);

    if (format === 'pdf') {
      const pdf = buildSimplePdf({
        title: definition.title,
        columns: definition.columns,
        rows
      });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${definition.filename}.pdf"`);
      return res.send(pdf);
    }

    const html = buildExcelHtml({
      title: definition.title,
      columns: definition.columns,
      rows
    });
    res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${definition.filename}.xls"`);
    return res.send(html);
  })
);

export default router;

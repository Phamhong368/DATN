import express from 'express';
import { query, withTransaction } from '../config/db.js';
import { asyncHandler } from '../utils/http.js';
import { optimizeRoutesWithOrTools } from '../utils/optimizerService.js';

const router = express.Router();

function generateOptimizationCode() {
  return `OPT-${Date.now()}`;
}

async function findOrCreateDepot(connection, depot) {
  const [existingRows] = await connection.execute(
    `SELECT * FROM depots
     WHERE location = ?
     ORDER BY id DESC
     LIMIT 1`,
    [depot.location]
  );

  if (existingRows.length) {
    return existingRows[0];
  }

  const code = `DPT-AUTO-${Date.now()}`;
  const [result] = await connection.execute(
    `INSERT INTO depots (depot_code, name, location, status)
     VALUES (?, ?, ?, 'ACTIVE')`,
    [code, depot.name || depot.location, depot.location]
  );

  return {
    id: result.insertId,
    depot_code: code,
    name: depot.name || depot.location,
    location: depot.location
  };
}

async function persistOptimization({ result, depot, orders, createdBy }) {
  return withTransaction(async (connection) => {
    const depotRow = await findOrCreateDepot(connection, depot);
    const optimizationCode = generateOptimizationCode();

    const [optimizationInsert] = await connection.execute(
      `INSERT INTO route_optimizations (
         optimization_code, depot_id, algorithm_name, total_routes,
         total_assigned_orders, total_unassigned_orders, total_distance_km,
         created_by, notes
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        optimizationCode,
        depotRow.id,
        result.meta.algorithm,
        result.meta.totalRoutes,
        result.meta.totalAssignedOrders,
        result.meta.totalUnassignedOrders,
        result.meta.totalDistanceKm,
        createdBy,
        `Tối ưu từ kho ${depot.location}`
      ]
    );

    const optimizationId = optimizationInsert.insertId;
    const unassignedByOrderId = new Map(result.unassignedOrders.map((item) => [item.orderId, item.reason]));

    for (const order of orders) {
      await connection.execute(
        `INSERT INTO route_optimization_orders (
           optimization_id, order_id, selected_time_window_start,
           selected_time_window_end, service_minutes, is_assigned, unassigned_reason
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          optimizationId,
          order.id,
          order.windowStart || null,
          order.windowEnd || null,
          Number(order.serviceMinutes || 20),
          unassignedByOrderId.has(order.id) ? 0 : 1,
          unassignedByOrderId.get(order.id) || null
        ]
      );
    }

    for (const [index, route] of result.routes.entries()) {
      const [routeInsert] = await connection.execute(
        `INSERT INTO route_optimization_routes (
           optimization_id, truck_id, route_no, total_stops, total_load_tons,
           total_distance_km, total_duration_minutes, utilization_percent
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          optimizationId,
          route.truckId,
          index + 1,
          route.stops.length,
          route.totalLoadTons,
          route.totalDistanceKm,
          route.totalDurationMinutes,
          route.utilizationPercent
        ]
      );

      for (const [stopIndex, stop] of route.stops.entries()) {
        await connection.execute(
          `INSERT INTO route_optimization_stops (
             optimization_route_id, order_id, stop_sequence, arrival_time,
             departure_time, service_start_time, distance_from_previous_km,
             duration_from_previous_minutes, time_window_label
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            routeInsert.insertId,
            stop.orderId,
            stopIndex + 1,
            stop.arrivalTime || null,
            stop.departureTime || null,
            stop.serviceStartTime || null,
            stop.distanceFromPreviousKm || 0,
            stop.durationFromPreviousMinutes || 0,
            stop.windowLabel || null
          ]
        );
      }
    }

    return {
      optimizationId,
      optimizationCode
    };
  });
}

router.get(
  '/inputs',
  asyncHandler(async (_req, res) => {
    const [orders, trucks] = await Promise.all([
      query(
        `SELECT orders.id, orders.order_code, orders.pickup_location, orders.delivery_location, orders.cargo_type,
                orders.weight_tons, orders.status, customers.name AS customer_name
         FROM orders
         JOIN customers ON customers.id = orders.customer_id
         WHERE orders.status IN ('PENDING_DISPATCH', 'ASSIGNED')
         ORDER BY orders.id DESC`
      ),
      query(
        `SELECT id, license_plate, truck_type, capacity_tons, status
         FROM trucks
         WHERE status IN ('AVAILABLE', 'IN_USE')
         ORDER BY capacity_tons DESC, id ASC`
      )
    ]);

    res.json({
      depotSuggestions: ['TP.HCM', 'Đà Nẵng', 'Hà Nội', 'Bình Dương', 'Nha Trang'],
      orders,
      trucks
    });
  })
);

router.post(
  '/vrp',
  asyncHandler(async (req, res) => {
    const { depot, selectedTruckIds = [], orders = [] } = req.body;

    if (!depot?.location) {
      return res.status(400).json({ message: 'Cần nhập địa điểm kho xuất phát.' });
    }

    if (!selectedTruckIds.length) {
      return res.status(400).json({ message: 'Cần chọn ít nhất một xe để tối ưu.' });
    }

    if (!orders.length) {
      return res.status(400).json({ message: 'Cần chọn ít nhất một đơn hàng để tối ưu.' });
    }

    const placeholders = selectedTruckIds.map(() => '?').join(', ');
    const trucks = await query(
      `SELECT id, license_plate, truck_type, capacity_tons, status
       FROM trucks
       WHERE id IN (${placeholders})`,
      selectedTruckIds
    );

    if (trucks.length !== selectedTruckIds.length) {
      return res.status(400).json({ message: 'Danh sách xe không hợp lệ.' });
    }

    const result = await optimizeRoutesWithOrTools({ depot, trucks, orders });
    const saved = await persistOptimization({
      result,
      depot,
      orders,
      createdBy: req.user.id
    });

    res.json({
      ...result,
      saved
    });
  })
);

router.get(
  '/history',
  asyncHandler(async (_req, res) => {
    const rows = await query(
      `SELECT ro.id, ro.optimization_code, ro.algorithm_name, ro.total_routes,
              ro.total_assigned_orders, ro.total_unassigned_orders, ro.total_distance_km,
              ro.created_at, depots.name AS depot_name, depots.location AS depot_location,
              users.full_name AS created_by_name
       FROM route_optimizations ro
       LEFT JOIN depots ON depots.id = ro.depot_id
       LEFT JOIN users ON users.id = ro.created_by
       ORDER BY ro.id DESC`
    );
    res.json(rows);
  })
);

router.get(
  '/history/:id',
  asyncHandler(async (req, res) => {
    const [optimization] = await query(
      `SELECT ro.id, ro.optimization_code, ro.algorithm_name, ro.total_routes,
              ro.total_assigned_orders, ro.total_unassigned_orders, ro.total_distance_km,
              ro.created_at, depots.name AS depot_name, depots.location AS depot_location,
              users.full_name AS created_by_name
       FROM route_optimizations ro
       LEFT JOIN depots ON depots.id = ro.depot_id
       LEFT JOIN users ON users.id = ro.created_by
       WHERE ro.id = ?`,
      [req.params.id]
    );

    if (!optimization) {
      return res.status(404).json({ message: 'Không tìm thấy lịch sử tối ưu.' });
    }

    const routes = await query(
      `SELECT ror.*, trucks.license_plate
       FROM route_optimization_routes ror
       JOIN trucks ON trucks.id = ror.truck_id
       WHERE ror.optimization_id = ?
       ORDER BY ror.route_no ASC`,
      [req.params.id]
    );

    const stops = await query(
      `SELECT ros.*, orders.order_code, orders.delivery_location
       FROM route_optimization_stops ros
       JOIN orders ON orders.id = ros.order_id
       JOIN route_optimization_routes ror ON ror.id = ros.optimization_route_id
       WHERE ror.optimization_id = ?
       ORDER BY ros.optimization_route_id ASC, ros.stop_sequence ASC`,
      [req.params.id]
    );

    const orders = await query(
      `SELECT roo.*, orders.order_code, orders.delivery_location
       FROM route_optimization_orders roo
       JOIN orders ON orders.id = roo.order_id
       WHERE roo.optimization_id = ?
       ORDER BY roo.id ASC`,
      [req.params.id]
    );

    res.json({
      optimization,
      routes: routes.map((route) => ({
        ...route,
        stops: stops.filter((stop) => stop.optimization_route_id === route.id)
      })),
      orders
    });
  })
);

router.delete(
  '/history/:id',
  asyncHandler(async (req, res) => {
    const [optimization] = await query('SELECT id FROM route_optimizations WHERE id = ?', [req.params.id]);
    if (!optimization) {
      return res.status(404).json({ message: 'Không tìm thấy lịch sử tối ưu.' });
    }

    await query('DELETE FROM route_optimizations WHERE id = ?', [req.params.id]);
    res.status(204).send();
  })
);

router.post(
  '/history/:id/materialize',
  asyncHandler(async (req, res) => {
    const optimizationId = Number(req.params.id);

    const routes = await query(
      `SELECT ror.*, depots.location AS depot_location
       FROM route_optimization_routes ror
       JOIN route_optimizations ro ON ro.id = ror.optimization_id
       LEFT JOIN depots ON depots.id = ro.depot_id
       WHERE ror.optimization_id = ?
       ORDER BY ror.route_no ASC`,
      [optimizationId]
    );

    if (!routes.length) {
      return res.status(404).json({ message: 'Không tìm thấy tuyến tối ưu để tạo chuyến.' });
    }

    const stops = await query(
      `SELECT ros.*, orders.order_code, orders.delivery_location
       FROM route_optimization_stops ros
       JOIN orders ON orders.id = ros.order_id
       JOIN route_optimization_routes ror ON ror.id = ros.optimization_route_id
       WHERE ror.optimization_id = ?
       ORDER BY ros.optimization_route_id ASC, ros.stop_sequence ASC`,
      [optimizationId]
    );

    const createdTrips = await withTransaction(async (connection) => {
      const output = [];
      const [driverRows] = await connection.execute(
        `SELECT id
         FROM drivers
         WHERE status IN ('AVAILABLE', 'ON_TRIP')
         ORDER BY status = 'AVAILABLE' DESC, id ASC`
      );

      if (!driverRows.length) {
        throw new Error('Không có tài xế khả dụng để tạo chuyến tự động.');
      }

      for (const route of routes) {
        const routeStops = stops.filter((stop) => stop.optimization_route_id === route.id);
        if (!routeStops.length) {
          continue;
        }

        const destination = routeStops[routeStops.length - 1].delivery_location;
        const tripCode = `AUTO-${Date.now()}-${route.route_no}`;
        const [tripInsert] = await connection.execute(
          `INSERT INTO trips (
             trip_code, truck_id, driver_id, start_date, origin, destination, status, notes
           ) VALUES (?, ?, ?, NOW(), ?, ?, 'ASSIGNED', ?)`,
          [
            tripCode,
            route.truck_id,
            driverRows[0].id,
            route.depot_location || 'Kho điều phối',
            destination,
            `Sinh tự động từ tối ưu ${optimizationId}`
          ]
        );

        for (const stop of routeStops) {
          await connection.execute(
            'INSERT INTO trip_orders (trip_id, order_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE trip_id = VALUES(trip_id)',
            [tripInsert.insertId, stop.order_id]
          );
        }

        const orderIds = routeStops.map((stop) => stop.order_id);
        const placeholders = orderIds.map(() => '?').join(', ');
        await connection.execute(
          `UPDATE orders
           SET status = 'ASSIGNED'
           WHERE id IN (${placeholders})`,
          orderIds
        );

        await connection.execute(
          'INSERT INTO trip_status_logs (trip_id, status, updated_by, note) VALUES (?, ?, ?, ?)',
          [tripInsert.insertId, 'ASSIGNED', req.user.id, `Tạo từ lịch sử tối ưu ${optimizationId}`]
        );

        output.push({
          tripId: tripInsert.insertId,
          tripCode,
          truckId: route.truck_id,
          totalOrders: routeStops.length
        });
      }

      return output;
    });

    res.json({
      message: 'Đã tạo chuyến từ lịch sử tối ưu.',
      createdTrips
    });
  })
);

export default router;

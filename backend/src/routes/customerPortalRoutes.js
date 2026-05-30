import express from 'express';
import { query } from '../config/db.js';
import { asyncHandler } from '../utils/http.js';
import { ensureFields } from '../utils/validators.js';
import { resolveAddressCoordinate, reverseGeocodeCoordinate } from '../utils/geocoding.js';
import { buildRoutePreview } from '../utils/routePreview.js';

const router = express.Router();
const CUSTOMER_QUOTE_BASE_FEE = 250000;
const CUSTOMER_QUOTE_PER_KM = 12000;
const CUSTOMER_QUOTE_PER_TON_KM = 1800;

function getStopAddress(stop) {
  if (!stop) {
    return '';
  }
  return typeof stop === 'string' ? stop : stop.address || '';
}

async function resolveStopCoordinate(stop) {
  if (stop?.coordinate?.lat && stop?.coordinate?.lng) {
    return stop.coordinate;
  }
  return resolveAddressCoordinate(getStopAddress(stop));
}

function ensureCustomer(req, res) {
  if (req.user?.role !== 'CUSTOMER') {
    res.status(403).json({ message: 'Forbidden.' });
    return false;
  }
  return true;
}

function roundCurrency(value) {
  return Math.round(Number(value || 0));
}

async function buildCustomerQuote({ pickupLocation, deliveryLocation, weightTons }) {
  const normalizedWeight = Number(weightTons);
  if (!Number.isFinite(normalizedWeight) || normalizedWeight <= 0) {
    throw new Error('Trọng lượng hàng phải lớn hơn 0.');
  }

  const [originCoordinate, destinationCoordinate] = await Promise.all([
    resolveAddressCoordinate(pickupLocation),
    resolveAddressCoordinate(deliveryLocation)
  ]);

  const preview = await buildRoutePreview({
    origin: {
      address: pickupLocation,
      coordinate: originCoordinate
    },
    destination: {
      address: deliveryLocation,
      coordinate: destinationCoordinate
    },
    travelMode: 'DRIVING'
  });

  const [normalizedPickup, normalizedDelivery] = await Promise.all([
    reverseGeocodeCoordinate(originCoordinate),
    reverseGeocodeCoordinate(destinationCoordinate)
  ]);

  const distanceKm = Number(preview.distanceKm || 0);
  const estimatedPrice = roundCurrency(
    CUSTOMER_QUOTE_BASE_FEE +
      distanceKm * CUSTOMER_QUOTE_PER_KM +
      distanceKm * normalizedWeight * CUSTOMER_QUOTE_PER_TON_KM
  );

  return {
    distanceKm,
    durationMinutes: Number(preview.durationMinutes || 0),
    distanceText: preview.distanceText,
    durationText: preview.durationText,
    estimatedPrice,
    pickupLocationNormalized: normalizedPickup.address,
    deliveryLocationNormalized: normalizedDelivery.address
  };
}

router.get(
  '/profile',
  asyncHandler(async (req, res) => {
    if (!ensureCustomer(req, res)) return;

    const rows = await query(
      `SELECT id, user_id, name, phone, email, address, created_at, updated_at
       FROM customers
       WHERE user_id = ?
       LIMIT 1`,
      [req.user.id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'Customer profile not found.' });
    }

    res.json(rows[0]);
  })
);

router.get(
  '/orders',
  asyncHandler(async (req, res) => {
    if (!ensureCustomer(req, res)) return;

    const rows = await query(
      `SELECT
         orders.*,
         customers.name AS customer_name,
         trips.id AS trip_id,
         trips.trip_code,
         trips.status AS trip_status,
         trips.origin,
         trips.destination,
         trips.start_date,
         trips.end_date,
         trucks.license_plate,
         drivers.full_name AS driver_name,
         latest.latitude AS latest_latitude,
         latest.longitude AS latest_longitude,
         latest.recorded_at AS latest_recorded_at
       FROM orders
       JOIN customers ON customers.id = orders.customer_id
       LEFT JOIN trip_orders ON trip_orders.order_id = orders.id
       LEFT JOIN trips ON trips.id = trip_orders.trip_id
       LEFT JOIN trucks ON trucks.id = trips.truck_id
       LEFT JOIN drivers ON drivers.id = trips.driver_id
       LEFT JOIN (
         SELECT logs.trip_id, logs.latitude, logs.longitude, logs.recorded_at
         FROM trip_location_logs logs
         JOIN (
           SELECT trip_id, MAX(recorded_at) AS max_recorded_at
           FROM trip_location_logs
           GROUP BY trip_id
         ) latest_logs
           ON latest_logs.trip_id = logs.trip_id
          AND latest_logs.max_recorded_at = logs.recorded_at
       ) latest ON latest.trip_id = trips.id
       WHERE customers.user_id = ?
       ORDER BY orders.id DESC`,
      [req.user.id]
    );

    res.json(rows);
  })
);

router.post(
  '/orders/quote',
  asyncHandler(async (req, res) => {
    if (!ensureCustomer(req, res)) return;

    const missing = ensureFields(req.body, ['pickup_location', 'delivery_location', 'weight_tons']);
    if (missing.length) {
      return res.status(400).json({ message: `Missing fields: ${missing.join(', ')}` });
    }

    const quote = await buildCustomerQuote({
      pickupLocation: req.body.pickup_location,
      deliveryLocation: req.body.delivery_location,
      weightTons: req.body.weight_tons
    });

    res.json(quote);
  })
);

router.post(
  '/reverse-geocode',
  asyncHandler(async (req, res) => {
    if (!ensureCustomer(req, res)) return;

    const { lat, lng } = req.body || {};
    const location = await reverseGeocodeCoordinate({ lat, lng });
    res.json(location);
  })
);

router.post(
  '/route-preview',
  asyncHandler(async (req, res) => {
    if (!ensureCustomer(req, res)) return;

    const { origin, destination, waypoints = [], travelMode = 'DRIVING' } = req.body || {};

    if (!origin || !destination) {
      return res.status(400).json({ message: 'Cần nhập điểm đi và điểm đến.' });
    }

    const allStops = [origin, ...waypoints, destination].filter(Boolean);
    const coordinates = await Promise.all(allStops.map((stop) => resolveStopCoordinate(stop)));

    const preview = await buildRoutePreview({
      origin: {
        address: getStopAddress(origin),
        coordinate: coordinates[0]
      },
      destination: {
        address: getStopAddress(destination),
        coordinate: coordinates[coordinates.length - 1]
      },
      waypoints: waypoints.map((stop, index) => ({
        address: getStopAddress(stop),
        coordinate: coordinates[index + 1]
      })),
      travelMode
    });

    res.json(preview);
  })
);

router.post(
  '/orders',
  asyncHandler(async (req, res) => {
    if (!ensureCustomer(req, res)) return;

    const missing = ensureFields(req.body, [
      'pickup_location',
      'delivery_location',
      'cargo_type',
      'weight_tons'
    ]);
    if (missing.length) {
      return res.status(400).json({ message: `Missing fields: ${missing.join(', ')}` });
    }

    const customers = await query(
      `SELECT id
       FROM customers
       WHERE user_id = ?
       LIMIT 1`,
      [req.user.id]
    );
    if (!customers.length) {
      return res.status(404).json({ message: 'Customer profile not found.' });
    }

    const [lastOrder] = await query('SELECT id FROM orders ORDER BY id DESC LIMIT 1');
    const nextSeq = String((lastOrder?.id || 0) + 1).padStart(4, '0');
    const orderCode = req.body.order_code?.trim() || `ORD-CUS-${nextSeq}`;
    const quote = await buildCustomerQuote({
      pickupLocation: req.body.pickup_location,
      deliveryLocation: req.body.delivery_location,
      weightTons: req.body.weight_tons
    });

    const result = await query(
      `INSERT INTO orders (
         customer_id, order_code, pickup_location, delivery_location,
         cargo_type, weight_tons, planned_revenue, status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING_DISPATCH')`,
      [
        customers[0].id,
        orderCode,
        quote.pickupLocationNormalized,
        quote.deliveryLocationNormalized,
        req.body.cargo_type,
        req.body.weight_tons,
        quote.estimatedPrice
      ]
    );

    const rows = await query(
      `SELECT
         orders.*,
         customers.name AS customer_name
       FROM orders
       JOIN customers ON customers.id = orders.customer_id
       WHERE orders.id = ?`,
      [result.insertId]
    );
    res.status(201).json(rows[0]);
  })
);

export default router;

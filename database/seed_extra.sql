-- Seed mo rong du lieu mau cho cac bang nghiep vu chinh.
-- File nay co tinh chat idempotent o muc co ban: cac ban ghi co khoa duy nhat
-- se duoc bo qua neu da ton tai.

INSERT IGNORE INTO users (role_id, username, password_hash, full_name)
SELECT r.id, 'dispatcher2', '$2a$10$1irC5egGwuVQOUpI1kYVCe.ULkmhcqj466dP1IYIoxjC94Pn/7SPS', 'Le Minh Dieu Phoi'
FROM roles r
WHERE r.name = 'DISPATCHER';

INSERT IGNORE INTO users (role_id, username, password_hash, full_name)
SELECT r.id, 'driver2', '$2a$10$1irC5egGwuVQOUpI1kYVCe.ULkmhcqj466dP1IYIoxjC94Pn/7SPS', 'Nguyen Van Tai Xe 2'
FROM roles r
WHERE r.name = 'DRIVER';

INSERT IGNORE INTO users (role_id, username, password_hash, full_name)
SELECT r.id, 'driver3', '$2a$10$1irC5egGwuVQOUpI1kYVCe.ULkmhcqj466dP1IYIoxjC94Pn/7SPS', 'Tran Van Tai Xe 3'
FROM roles r
WHERE r.name = 'DRIVER';

INSERT IGNORE INTO trucks (
  license_plate, truck_type, capacity_tons, status, cumulative_km,
  maintenance_interval_km, last_maintenance_km, last_maintenance_date
) VALUES
  ('30H-55667', 'Thung kin', 5.00, 'AVAILABLE', 28140, 10000, 22000, '2026-03-15'),
  ('36C-77889', 'Mui bat', 12.00, 'AVAILABLE', 68420, 12000, 60000, '2026-02-18'),
  ('50H-88991', 'Dong lanh', 9.00, 'IN_USE', 74210, 10000, 70000, '2026-01-27'),
  ('15H-10234', 'Container 20ft', 18.00, 'AVAILABLE', 91550, 15000, 84000, '2026-02-06'),
  ('92C-44556', 'Ben', 14.00, 'MAINTENANCE', 109230, 12000, 96000, '2025-12-28');

INSERT IGNORE INTO drivers (user_id, full_name, phone, license_number, license_class, status)
SELECT u.id, 'Nguyen Van Tai Xe 2', '0905000006', 'FC006', 'FC', 'AVAILABLE'
FROM users u
WHERE u.username = 'driver2';

INSERT IGNORE INTO drivers (user_id, full_name, phone, license_number, license_class, status)
SELECT u.id, 'Tran Van Tai Xe 3', '0905000007', 'FC007', 'FC', 'AVAILABLE'
FROM users u
WHERE u.username = 'driver3';

INSERT IGNORE INTO drivers (user_id, full_name, phone, license_number, license_class, status) VALUES
  (NULL, 'Pham Duc Huy', '0905000008', 'FC008', 'FC', 'AVAILABLE'),
  (NULL, 'Doan Thanh Son', '0905000009', 'FC009', 'FC', 'ON_TRIP'),
  (NULL, 'Bui Gia Khang', '0905000010', 'FC010', 'FC', 'AVAILABLE');

INSERT INTO customers (name, phone, email, address)
SELECT * FROM (
  SELECT 'Cong ty Nam Thanh', '0299333444', 'ops@namthanh.vn', 'Hai Phong' UNION ALL
  SELECT 'Cong ty Song Hong', '0243555666', 'care@songhong.vn', 'Hung Yen' UNION ALL
  SELECT 'Cong ty An Phat', '0283777888', 'logistics@anphat.vn', 'Hoc Mon, TP.HCM' UNION ALL
  SELECT 'Cong ty Minh Quan', '0225666999', 'cs@minhquan.vn', 'Thai Binh' UNION ALL
  SELECT 'Cong ty Green Farm', '0263666111', 'supply@greenfarm.vn', 'Bao Loc, Lam Dong'
) AS src(name, phone, email, address)
WHERE NOT EXISTS (
  SELECT 1 FROM customers c WHERE c.name = src.name
);

INSERT IGNORE INTO orders (
  customer_id, order_code, pickup_location, delivery_location,
  cargo_type, weight_tons, planned_revenue, status
) VALUES
  ((SELECT id FROM customers WHERE name = 'Cong ty Nam Thanh' LIMIT 1), 'ORD-011', 'Hai Phong', 'Ha Noi', 'Hang gia dung', 4.80, 7600000, 'PENDING_DISPATCH'),
  ((SELECT id FROM customers WHERE name = 'Cong ty Song Hong' LIMIT 1), 'ORD-012', 'Hung Yen', 'Nghe An', 'Vat tu dien', 7.20, 13500000, 'PENDING_DISPATCH'),
  ((SELECT id FROM customers WHERE name = 'Cong ty An Phat' LIMIT 1), 'ORD-013', 'Hoc Mon, TP.HCM', 'Binh Dinh', 'Bao bi nhua', 5.10, 9400000, 'ASSIGNED'),
  ((SELECT id FROM customers WHERE name = 'Cong ty Minh Quan' LIMIT 1), 'ORD-014', 'Thai Binh', 'Ha Nam', 'May moc nho', 3.40, 6800000, 'PENDING_DISPATCH'),
  ((SELECT id FROM customers WHERE name = 'Cong ty Green Farm' LIMIT 1), 'ORD-015', 'Bao Loc', 'TP.HCM', 'Nong san', 6.00, 8900000, 'COMPLETED'),
  ((SELECT id FROM customers WHERE name = 'Cong ty Viet Logistics' LIMIT 1), 'ORD-016', 'TP.HCM', 'Can Tho', 'Hang tieu dung', 4.40, 7200000, 'PENDING_DISPATCH'),
  ((SELECT id FROM customers WHERE name = 'Cong ty Bac Nam Cargo' LIMIT 1), 'ORD-017', 'Ha Noi', 'Lao Cai', 'Linh kien', 8.80, 14900000, 'ASSIGNED'),
  ((SELECT id FROM customers WHERE name = 'Cong ty Fresh Food' LIMIT 1), 'ORD-018', 'Da Nang', 'Quang Nam', 'Thuc pham lanh', 2.90, 5400000, 'COMPLETED'),
  ((SELECT id FROM customers WHERE name = 'Cong ty Noi That A' LIMIT 1), 'ORD-019', 'Nha Trang', 'Phu Yen', 'Do go', 6.60, 9800000, 'PENDING_DISPATCH'),
  ((SELECT id FROM customers WHERE name = 'Cong ty Vat Lieu Xay Dung B' LIMIT 1), 'ORD-020', 'Binh Duong', 'Dong Nai', 'Xi mang', 11.50, 11800000, 'ASSIGNED');

INSERT IGNORE INTO trips (
  trip_code, truck_id, driver_id, start_date, end_date, origin, destination, status, notes
) VALUES
  (
    'TRIP-004', (SELECT id FROM trucks WHERE license_plate = '30H-55667' LIMIT 1),
    (SELECT id FROM drivers WHERE license_number = 'FC006' LIMIT 1), '2026-04-20 07:30:00',
    NULL, 'Hai Phong', 'Ha Noi', 'ASSIGNED', 'Chuyen noi vung mien Bac'
  ),
  (
    'TRIP-005', (SELECT id FROM trucks WHERE license_plate = '36C-77889' LIMIT 1),
    (SELECT id FROM drivers WHERE license_number = 'FC007' LIMIT 1), '2026-04-22 06:45:00',
    NULL, 'Hung Yen', 'Nghe An', 'IN_TRANSIT', 'Dang van chuyen don hang lien tinh'
  ),
  (
    'TRIP-006', (SELECT id FROM trucks WHERE license_plate = '15H-10234' LIMIT 1),
    (SELECT id FROM drivers WHERE license_number = 'FC008' LIMIT 1), '2026-04-23 08:15:00',
    '2026-04-24 17:40:00', 'TP.HCM', 'Can Tho', 'COMPLETED', 'Da ket thuc chuyen giao hang mien Tay'
  );

INSERT IGNORE INTO trip_orders (trip_id, order_id) VALUES
  ((SELECT id FROM trips WHERE trip_code = 'TRIP-004' LIMIT 1), (SELECT id FROM orders WHERE order_code = 'ORD-011' LIMIT 1)),
  ((SELECT id FROM trips WHERE trip_code = 'TRIP-004' LIMIT 1), (SELECT id FROM orders WHERE order_code = 'ORD-014' LIMIT 1)),
  ((SELECT id FROM trips WHERE trip_code = 'TRIP-005' LIMIT 1), (SELECT id FROM orders WHERE order_code = 'ORD-012' LIMIT 1)),
  ((SELECT id FROM trips WHERE trip_code = 'TRIP-005' LIMIT 1), (SELECT id FROM orders WHERE order_code = 'ORD-017' LIMIT 1)),
  ((SELECT id FROM trips WHERE trip_code = 'TRIP-006' LIMIT 1), (SELECT id FROM orders WHERE order_code = 'ORD-016' LIMIT 1));

INSERT INTO fuel_logs (
  truck_id, trip_id, log_date, distance_km, fuel_liters, payload_tons,
  idle_minutes, avg_speed_kmh, cumulative_km_after, notes
)
SELECT * FROM (
  SELECT
    (SELECT id FROM trucks WHERE license_plate = '30H-55667' LIMIT 1),
    (SELECT id FROM trips WHERE trip_code = 'TRIP-004' LIMIT 1),
    '2026-04-20', 160.0, 24.3, 4.8, 17, 47.0, 28300.0, 'Chuyen Hai Phong - Ha Noi'
  UNION ALL SELECT
    (SELECT id FROM trucks WHERE license_plate = '30H-55667' LIMIT 1),
    NULL,
    '2026-04-25', 220.0, 32.9, 5.0, 23, 45.0, 28520.0, 'Phan phoi noi thanh'
  UNION ALL SELECT
    (SELECT id FROM trucks WHERE license_plate = '36C-77889' LIMIT 1),
    (SELECT id FROM trips WHERE trip_code = 'TRIP-005' LIMIT 1),
    '2026-04-22', 380.0, 58.6, 8.6, 31, 46.0, 68800.0, 'Tuyen Hung Yen - Nghe An'
  UNION ALL SELECT
    (SELECT id FROM trucks WHERE license_plate = '50H-88991' LIMIT 1),
    NULL,
    '2026-04-18', 290.0, 49.8, 7.2, 28, 42.0, 74500.0, 'Xe lanh cho hang thuc pham'
  UNION ALL SELECT
    (SELECT id FROM trucks WHERE license_plate = '15H-10234' LIMIT 1),
    (SELECT id FROM trips WHERE trip_code = 'TRIP-006' LIMIT 1),
    '2026-04-24', 210.0, 37.1, 6.4, 20, 48.0, 91760.0, 'Hoan thanh giao hang Can Tho'
) AS src(
  truck_id, trip_id, log_date, distance_km, fuel_liters, payload_tons,
  idle_minutes, avg_speed_kmh, cumulative_km_after, notes
)
WHERE NOT EXISTS (
  SELECT 1
  FROM fuel_logs fl
  WHERE fl.truck_id = src.truck_id
    AND fl.log_date = src.log_date
    AND ABS(fl.distance_km - src.distance_km) < 0.01
);

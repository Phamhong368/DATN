DELETE FROM trip_status_logs;
DELETE FROM trip_location_logs;
DELETE FROM trip_orders;
DELETE FROM trips;
DELETE FROM fuel_logs;
DELETE FROM route_optimization_stops;
DELETE FROM route_optimization_routes;
DELETE FROM route_optimization_orders;
DELETE FROM route_optimizations;
DELETE FROM depots;
DELETE FROM orders;
DELETE FROM customers;
DELETE FROM drivers;
DELETE FROM trucks;
DELETE FROM users;
DELETE FROM roles;

ALTER TABLE roles AUTO_INCREMENT = 1;
ALTER TABLE users AUTO_INCREMENT = 1;
ALTER TABLE trucks AUTO_INCREMENT = 1;
ALTER TABLE drivers AUTO_INCREMENT = 1;
ALTER TABLE customers AUTO_INCREMENT = 1;
ALTER TABLE orders AUTO_INCREMENT = 1;
ALTER TABLE trips AUTO_INCREMENT = 1;
ALTER TABLE trip_orders AUTO_INCREMENT = 1;
ALTER TABLE trip_status_logs AUTO_INCREMENT = 1;
ALTER TABLE trip_location_logs AUTO_INCREMENT = 1;
ALTER TABLE fuel_logs AUTO_INCREMENT = 1;
ALTER TABLE depots AUTO_INCREMENT = 1;
ALTER TABLE route_optimizations AUTO_INCREMENT = 1;
ALTER TABLE route_optimization_orders AUTO_INCREMENT = 1;
ALTER TABLE route_optimization_routes AUTO_INCREMENT = 1;
ALTER TABLE route_optimization_stops AUTO_INCREMENT = 1;

INSERT INTO roles (name) VALUES
  ('ADMIN'),
  ('DISPATCHER'),
  ('DRIVER');

INSERT INTO users (role_id, username, password_hash, full_name) VALUES
  (1, 'admin', '$2a$10$1irC5egGwuVQOUpI1kYVCe.ULkmhcqj466dP1IYIoxjC94Pn/7SPS', 'Nguyễn Văn Admin'),
  (2, 'dispatcher', '$2a$10$1irC5egGwuVQOUpI1kYVCe.ULkmhcqj466dP1IYIoxjC94Pn/7SPS', 'Trần Thị Điều Phối'),
  (3, 'driver1', '$2a$10$1irC5egGwuVQOUpI1kYVCe.ULkmhcqj466dP1IYIoxjC94Pn/7SPS', 'Phạm Văn Tài Xế');

INSERT INTO trucks (
  license_plate, truck_type, capacity_tons, status, cumulative_km,
  maintenance_interval_km, last_maintenance_km, last_maintenance_date
) VALUES
  ('51C-12345', 'Thùng kín', 8.00, 'AVAILABLE', 48200, 10000, 40000, '2026-02-10'),
  ('43H-67890', 'Container 40ft', 25.00, 'IN_USE', 119500, 15000, 108000, '2026-01-22'),
  ('29H-24680', 'Mui bạt', 15.00, 'AVAILABLE', 76150, 12000, 72000, '2026-03-01'),
  ('77C-13579', 'Đông lạnh', 10.00, 'MAINTENANCE', 93420, 10000, 83000, '2025-12-15'),
  ('60H-11223', 'Sơ mi rơ moóc', 20.00, 'AVAILABLE', 55680, 14000, 42000, '2026-02-28');

INSERT INTO drivers (user_id, full_name, phone, license_number, license_class, status) VALUES
  (3, 'Phạm Văn Tài Xế', '0905000001', 'FC001', 'FC', 'ON_TRIP'),
  (NULL, 'Nguyễn Quốc Bảo', '0905000002', 'FC002', 'FC', 'AVAILABLE'),
  (NULL, 'Lê Thị Hạnh', '0905000003', 'FC003', 'FC', 'AVAILABLE'),
  (NULL, 'Trần Đức Long', '0905000004', 'FC004', 'FC', 'INACTIVE'),
  (NULL, 'Võ Minh Tâm', '0905000005', 'FC005', 'FC', 'AVAILABLE');

INSERT INTO customers (name, phone, email, address) VALUES
  ('Công ty Việt Logistics', '0281111111', 'ops@vietlogistics.vn', 'Thủ Đức, TP.HCM'),
  ('Công ty Bắc Nam Cargo', '0242222222', 'contact@bacnam.vn', 'Long Biên, Hà Nội'),
  ('Công ty Fresh Food', '0236333333', 'supply@freshfood.vn', 'Hải Châu, Đà Nẵng'),
  ('Công ty Nội Thất A', '0258444444', 'sales@noithata.vn', 'Nha Trang, Khánh Hòa'),
  ('Công ty Vật Liệu Xây Dựng B', '0271555555', 'buy@vlxd-b.vn', 'Thủ Dầu Một, Bình Dương');

INSERT INTO depots (depot_code, name, location, latitude, longitude, status) VALUES
  ('DPT-HCM', 'Kho trung tâm miền Nam', 'TP.HCM', 10.7769000, 106.7009000, 'ACTIVE'),
  ('DPT-DN', 'Kho trung chuyển Đà Nẵng', 'Đà Nẵng', 16.0544000, 108.2022000, 'ACTIVE'),
  ('DPT-HN', 'Kho trung tâm miền Bắc', 'Hà Nội', 21.0285000, 105.8542000, 'ACTIVE');

INSERT INTO orders (customer_id, order_code, pickup_location, delivery_location, cargo_type, weight_tons, planned_revenue, status) VALUES
  (1, 'ORD-001', 'TP.HCM', 'Đà Nẵng', 'Hàng tiêu dùng', 5.50, 12000000, 'ASSIGNED'),
  (2, 'ORD-002', 'Hà Nội', 'TP.HCM', 'Máy móc', 12.00, 26000000, 'PENDING_DISPATCH'),
  (3, 'ORD-003', 'Đà Nẵng', 'Huế', 'Thực phẩm lạnh', 4.00, 8500000, 'COMPLETED'),
  (4, 'ORD-004', 'Nha Trang', 'Hà Nội', 'Nội thất', 7.50, 17000000, 'ASSIGNED'),
  (5, 'ORD-005', 'Bình Dương', 'Nghệ An', 'Vật liệu xây dựng', 13.00, 22000000, 'PENDING_DISPATCH'),
  (1, 'ORD-006', 'Long An', 'Quảng Ngãi', 'Bao bì', 6.20, 11000000, 'IN_TRANSIT'),
  (2, 'ORD-007', 'Bắc Ninh', 'Cần Thơ', 'Linh kiện điện tử', 8.30, 23000000, 'PENDING_DISPATCH'),
  (3, 'ORD-008', 'Lâm Đồng', 'TP.HCM', 'Rau củ', 3.50, 7800000, 'COMPLETED'),
  (4, 'ORD-009', 'Đồng Nai', 'Hải Phòng', 'Đồ gỗ', 9.00, 21000000, 'PENDING_DISPATCH'),
  (5, 'ORD-010', 'Vũng Tàu', 'Thanh Hóa', 'Sắt thép', 14.50, 28000000, 'ASSIGNED');

INSERT INTO trips (trip_code, truck_id, driver_id, start_date, end_date, origin, destination, status, notes) VALUES
  ('TRIP-001', 2, 1, '2026-04-18 08:00:00', NULL, 'TP.HCM', 'Đà Nẵng', 'IN_TRANSIT', 'Chuyến hàng kết hợp 2 đơn'),
  ('TRIP-002', 3, 2, '2026-04-17 06:30:00', '2026-04-18 15:00:00', 'Đà Nẵng', 'Huế', 'COMPLETED', 'Đã giao hàng đúng hẹn'),
  ('TRIP-003', 5, 5, '2026-04-19 07:00:00', NULL, 'Nha Trang', 'Hà Nội', 'ASSIGNED', 'Chờ tài xế nhận chuyến');

INSERT INTO trip_orders (trip_id, order_id) VALUES
  (1, 1),
  (1, 6),
  (2, 3),
  (3, 4),
  (3, 10);

INSERT INTO trip_status_logs (trip_id, status, updated_by, note) VALUES
  (1, 'ASSIGNED', 2, 'Đã tạo chuyến và gán đơn'),
  (1, 'IN_TRANSIT', 3, 'Tài xế đã khởi hành'),
  (2, 'ASSIGNED', 2, 'Đã gán chuyến'),
  (2, 'COMPLETED', 2, 'Đơn hàng đã hoàn tất'),
  (3, 'ASSIGNED', 2, 'Chờ tài xế xác nhận');

INSERT INTO trip_location_logs (trip_id, latitude, longitude, speed_kmh, heading, note, recorded_by, recorded_at) VALUES
  (1, 10.7769000, 106.7009000, 38.5, 25, 'Rời kho TP.HCM', 3, '2026-04-18 08:15:00'),
  (1, 11.3254000, 106.4770000, 52.0, 12, 'Qua Bình Dương', 3, '2026-04-18 10:10:00'),
  (1, 16.0544000, 108.2022000, 46.0, 5, 'Gần điểm giao Đà Nẵng', 3, '2026-04-19 07:30:00'),
  (3, 12.2388000, 109.1967000, 0.0, 0, 'Đang chờ khởi hành tại Nha Trang', 2, '2026-04-19 06:50:00');

INSERT INTO fuel_logs (
  truck_id, trip_id, log_date, distance_km, fuel_liters, payload_tons,
  idle_minutes, avg_speed_kmh, cumulative_km_after, notes
) VALUES
  (1, NULL, '2026-03-12', 120.0, 19.6, 4.5, 18, 46.0, 47010.0, 'Phân phối nội vùng'),
  (1, NULL, '2026-03-20', 180.0, 28.8, 5.2, 25, 48.0, 47190.0, 'Tuyến liên tỉnh ngắn'),
  (1, 1, '2026-04-02', 245.0, 38.7, 6.1, 35, 44.0, 47435.0, 'Chuyến ghép đơn'),
  (1, NULL, '2026-04-14', 310.0, 47.9, 7.0, 32, 50.0, 47745.0, 'Tuyến Bắc Nam chặng đầu'),
  (1, NULL, '2026-04-21', 455.0, 68.9, 7.6, 48, 47.0, 48200.0, 'Hàng tải nặng'),

  (2, NULL, '2026-03-08', 260.0, 56.2, 16.0, 40, 43.0, 117820.0, 'Container nội địa'),
  (2, NULL, '2026-03-18', 340.0, 71.9, 18.5, 55, 41.0, 118160.0, 'Kẹt cảng'),
  (2, 1, '2026-04-01', 420.0, 86.1, 20.0, 30, 45.0, 118580.0, 'Chuyến tuyến dài'),
  (2, NULL, '2026-04-12', 380.0, 79.7, 17.0, 42, 44.0, 118960.0, 'Về kho'),
  (2, NULL, '2026-04-23', 540.0, 110.8, 22.5, 58, 42.0, 119500.0, 'Container quá cảnh'),

  (3, NULL, '2026-03-05', 140.0, 24.1, 8.0, 20, 49.0, 74890.0, 'Chuyến ngắn'),
  (3, 2, '2026-03-16', 210.0, 34.8, 9.5, 22, 50.0, 75100.0, 'Hàng hỗn hợp'),
  (3, NULL, '2026-03-28', 330.0, 51.5, 11.0, 33, 46.0, 75430.0, 'Đường đèo'),
  (3, NULL, '2026-04-11', 290.0, 45.8, 10.4, 28, 48.0, 75720.0, 'Tuyến miền Trung'),
  (3, NULL, '2026-04-24', 430.0, 66.7, 12.7, 44, 45.0, 76150.0, 'Giao đa điểm'),

  (4, NULL, '2026-03-10', 160.0, 31.5, 5.5, 26, 42.0, 90940.0, 'Xe lạnh tải nhẹ'),
  (4, NULL, '2026-03-22', 250.0, 46.8, 6.5, 31, 43.0, 91190.0, 'Bảo quản lạnh'),
  (4, NULL, '2026-04-04', 305.0, 57.2, 7.2, 35, 41.0, 91495.0, 'Dừng máy lạnh nhiều'),
  (4, NULL, '2026-04-16', 410.0, 76.9, 8.1, 46, 40.0, 91905.0, 'Tải lạnh liên tỉnh'),
  (4, NULL, '2026-04-24', 515.0, 95.8, 8.8, 54, 39.0, 92420.0, 'Chu kỳ lạnh kéo dài'),

  (5, NULL, '2026-03-07', 230.0, 44.0, 12.5, 24, 47.0, 54010.0, 'Sơ mi rơ moóc tuyến ngắn'),
  (5, NULL, '2026-03-21', 360.0, 67.9, 14.0, 34, 45.0, 54370.0, 'Tuyến công trình'),
  (5, 3, '2026-04-06', 415.0, 77.6, 15.0, 29, 48.0, 54785.0, 'Nhận chuyến Bắc'),
  (5, NULL, '2026-04-15', 390.0, 73.3, 13.2, 38, 46.0, 55175.0, 'Chạy hàng vật liệu'),
  (5, NULL, '2026-04-24', 505.0, 94.1, 16.8, 41, 44.0, 55680.0, 'Tải lớn đường dài');

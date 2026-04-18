DELETE FROM trip_status_logs;
DELETE FROM trip_orders;
DELETE FROM trips;
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

INSERT INTO trucks (license_plate, truck_type, capacity_tons, status) VALUES
  ('51C-12345', 'Thùng kín', 8.00, 'AVAILABLE'),
  ('43H-67890', 'Container 40ft', 25.00, 'IN_USE'),
  ('29H-24680', 'Mui bạt', 15.00, 'AVAILABLE'),
  ('77C-13579', 'Đông lạnh', 10.00, 'MAINTENANCE'),
  ('60H-11223', 'Sơ mi rơ moóc', 20.00, 'AVAILABLE');

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

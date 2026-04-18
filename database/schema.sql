CREATE TABLE IF NOT EXISTS roles (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  role_id INT NOT NULL,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(120) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id)
);

CREATE TABLE IF NOT EXISTS trucks (
  id INT PRIMARY KEY AUTO_INCREMENT,
  license_plate VARCHAR(20) NOT NULL UNIQUE,
  truck_type VARCHAR(100) NOT NULL,
  capacity_tons DECIMAL(10,2) NOT NULL,
  status ENUM('AVAILABLE', 'IN_USE', 'MAINTENANCE') NOT NULL DEFAULT 'AVAILABLE',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS drivers (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NULL UNIQUE,
  full_name VARCHAR(120) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  license_number VARCHAR(50) NOT NULL UNIQUE,
  license_class VARCHAR(20) NOT NULL,
  status ENUM('AVAILABLE', 'ON_TRIP', 'INACTIVE') NOT NULL DEFAULT 'AVAILABLE',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_drivers_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS customers (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(150) NOT NULL,
  phone VARCHAR(20),
  email VARCHAR(100),
  address TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
  id INT PRIMARY KEY AUTO_INCREMENT,
  customer_id INT NOT NULL,
  order_code VARCHAR(30) NOT NULL UNIQUE,
  pickup_location VARCHAR(255) NOT NULL,
  delivery_location VARCHAR(255) NOT NULL,
  cargo_type VARCHAR(120) NOT NULL,
  weight_tons DECIMAL(10,2) NOT NULL,
  planned_revenue DECIMAL(12,2) NOT NULL DEFAULT 0,
  status ENUM('PENDING_DISPATCH', 'ASSIGNED', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'PENDING_DISPATCH',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS trips (
  id INT PRIMARY KEY AUTO_INCREMENT,
  trip_code VARCHAR(30) NOT NULL UNIQUE,
  truck_id INT NOT NULL,
  driver_id INT NOT NULL,
  start_date DATETIME NOT NULL,
  end_date DATETIME NULL,
  origin VARCHAR(255) NOT NULL,
  destination VARCHAR(255) NOT NULL,
  status ENUM('PLANNED', 'ASSIGNED', 'IN_TRANSIT', 'COMPLETED', 'INCIDENT') NOT NULL DEFAULT 'PLANNED',
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_trips_truck FOREIGN KEY (truck_id) REFERENCES trucks(id),
  CONSTRAINT fk_trips_driver FOREIGN KEY (driver_id) REFERENCES drivers(id)
);

CREATE TABLE IF NOT EXISTS trip_orders (
  id INT PRIMARY KEY AUTO_INCREMENT,
  trip_id INT NOT NULL,
  order_id INT NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_trip_orders_trip FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
  CONSTRAINT fk_trip_orders_order FOREIGN KEY (order_id) REFERENCES orders(id),
  CONSTRAINT uq_trip_order UNIQUE (trip_id, order_id)
);

CREATE TABLE IF NOT EXISTS trip_status_logs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  trip_id INT NOT NULL,
  status ENUM('PLANNED', 'ASSIGNED', 'IN_TRANSIT', 'COMPLETED', 'INCIDENT') NOT NULL,
  updated_by INT NULL,
  note TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_trip_status_trip FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
  CONSTRAINT fk_trip_status_user FOREIGN KEY (updated_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS depots (
  id INT PRIMARY KEY AUTO_INCREMENT,
  depot_code VARCHAR(30) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  location VARCHAR(255) NOT NULL,
  latitude DECIMAL(10,7) NULL,
  longitude DECIMAL(10,7) NULL,
  status ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS route_optimizations (
  id INT PRIMARY KEY AUTO_INCREMENT,
  optimization_code VARCHAR(30) NOT NULL UNIQUE,
  depot_id INT NULL,
  algorithm_name VARCHAR(120) NOT NULL,
  total_routes INT NOT NULL DEFAULT 0,
  total_assigned_orders INT NOT NULL DEFAULT 0,
  total_unassigned_orders INT NOT NULL DEFAULT 0,
  total_distance_km DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_by INT NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_route_optimizations_depot FOREIGN KEY (depot_id) REFERENCES depots(id),
  CONSTRAINT fk_route_optimizations_user FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS route_optimization_orders (
  id INT PRIMARY KEY AUTO_INCREMENT,
  optimization_id INT NOT NULL,
  order_id INT NOT NULL,
  selected_time_window_start TIME NULL,
  selected_time_window_end TIME NULL,
  service_minutes INT NOT NULL DEFAULT 20,
  is_assigned TINYINT(1) NOT NULL DEFAULT 0,
  unassigned_reason VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_route_opt_orders_optimization FOREIGN KEY (optimization_id) REFERENCES route_optimizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_route_opt_orders_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT uq_route_opt_order UNIQUE (optimization_id, order_id)
);

CREATE TABLE IF NOT EXISTS route_optimization_routes (
  id INT PRIMARY KEY AUTO_INCREMENT,
  optimization_id INT NOT NULL,
  truck_id INT NOT NULL,
  route_no INT NOT NULL,
  total_stops INT NOT NULL DEFAULT 0,
  total_load_tons DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_distance_km DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_duration_minutes INT NOT NULL DEFAULT 0,
  utilization_percent INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_route_opt_routes_optimization FOREIGN KEY (optimization_id) REFERENCES route_optimizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_route_opt_routes_truck FOREIGN KEY (truck_id) REFERENCES trucks(id)
);

CREATE TABLE IF NOT EXISTS route_optimization_stops (
  id INT PRIMARY KEY AUTO_INCREMENT,
  optimization_route_id INT NOT NULL,
  order_id INT NOT NULL,
  stop_sequence INT NOT NULL,
  arrival_time VARCHAR(10) NULL,
  departure_time VARCHAR(10) NULL,
  service_start_time VARCHAR(10) NULL,
  distance_from_previous_km DECIMAL(12,2) NOT NULL DEFAULT 0,
  duration_from_previous_minutes INT NOT NULL DEFAULT 0,
  time_window_label VARCHAR(50) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_route_opt_stops_route FOREIGN KEY (optimization_route_id) REFERENCES route_optimization_routes(id) ON DELETE CASCADE,
  CONSTRAINT fk_route_opt_stops_order FOREIGN KEY (order_id) REFERENCES orders(id),
  CONSTRAINT uq_route_opt_stop UNIQUE (optimization_route_id, stop_sequence)
);

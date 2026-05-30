import { query } from '../config/db.js';

async function ensureColumn(tableName, columnName, definition) {
  const rows = await query(
    `SELECT 1
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?
     LIMIT 1`,
    [tableName, columnName]
  );

  if (!rows.length) {
    await query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

export async function ensureAnalyticsSchema() {
  await ensureColumn('customers', 'user_id', 'INT NULL UNIQUE');

  await query(
    `INSERT IGNORE INTO roles (id, name)
     VALUES (4, 'CUSTOMER')`
  );

  const existingCustomerUsers = await query(
    `SELECT users.id
     FROM users
     JOIN roles ON roles.id = users.role_id
     WHERE roles.name = 'CUSTOMER'
     LIMIT 1`
  );

  if (!existingCustomerUsers.length) {
    await query(
      `INSERT INTO users (role_id, username, password_hash, full_name)
       SELECT
         roles.id,
         'customer1',
         (SELECT password_hash FROM users ORDER BY id ASC LIMIT 1),
         'Khach hang demo'
       FROM roles
       WHERE roles.name = 'CUSTOMER'
       LIMIT 1`
    );
  }

  const unlinkedCustomer = await query(
    `SELECT id
     FROM customers
     WHERE user_id IS NULL
     ORDER BY id ASC
     LIMIT 1`
  );
  const seededCustomerUser = await query(
    `SELECT users.id
     FROM users
     JOIN roles ON roles.id = users.role_id
     WHERE roles.name = 'CUSTOMER'
       AND users.username = 'customer1'
     LIMIT 1`
  );
  const linkedCustomer = await query(
    `SELECT id
     FROM customers
     WHERE user_id = ?
     LIMIT 1`,
    [seededCustomerUser[0]?.id || null]
  );

  if (linkedCustomer.length) {
    // Customer login da duoc lien ket, khong can seed tiep.
  } else if (!unlinkedCustomer.length) {
    await query(
      `INSERT INTO customers (name, phone, email, address, user_id)
       SELECT
         'Khach hang demo',
         '0900000000',
         'customer1@example.com',
         '175 Tay Son, Dong Da, Ha Noi',
         ?
       WHERE NOT EXISTS (
         SELECT 1 FROM customers WHERE email = 'customer1@example.com'
       )`,
      [seededCustomerUser[0]?.id || null]
    );
  } else if (seededCustomerUser.length) {
    await query('UPDATE customers SET user_id = ? WHERE id = ?', [seededCustomerUser[0].id, unlinkedCustomer[0].id]);
  }

  await ensureColumn('trucks', 'cumulative_km', 'DECIMAL(12,2) NOT NULL DEFAULT 0');
  await ensureColumn('trucks', 'maintenance_interval_km', 'DECIMAL(12,2) NOT NULL DEFAULT 10000');
  await ensureColumn('trucks', 'last_maintenance_km', 'DECIMAL(12,2) NOT NULL DEFAULT 0');
  await ensureColumn('trucks', 'last_maintenance_date', 'DATE NULL');

  await query(
    `CREATE TABLE IF NOT EXISTS fuel_logs (
      id INT PRIMARY KEY AUTO_INCREMENT,
      truck_id INT NOT NULL,
      trip_id INT NULL,
      log_date DATE NOT NULL,
      distance_km DECIMAL(12,2) NOT NULL,
      fuel_liters DECIMAL(12,2) NOT NULL,
      payload_tons DECIMAL(10,2) NOT NULL DEFAULT 0,
      idle_minutes INT NOT NULL DEFAULT 0,
      avg_speed_kmh DECIMAL(10,2) NOT NULL DEFAULT 45,
      cumulative_km_after DECIMAL(12,2) NOT NULL,
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_fuel_logs_truck FOREIGN KEY (truck_id) REFERENCES trucks(id) ON DELETE CASCADE,
      CONSTRAINT fk_fuel_logs_trip FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE SET NULL
    )`
  );

  await query(
    `CREATE TABLE IF NOT EXISTS trip_location_logs (
      id INT PRIMARY KEY AUTO_INCREMENT,
      trip_id INT NOT NULL,
      latitude DECIMAL(10,7) NOT NULL,
      longitude DECIMAL(10,7) NOT NULL,
      speed_kmh DECIMAL(10,2) NULL,
      heading DECIMAL(10,2) NULL,
      note TEXT,
      recorded_by INT NULL,
      recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_trip_location_trip FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
      CONSTRAINT fk_trip_location_user FOREIGN KEY (recorded_by) REFERENCES users(id),
      INDEX idx_trip_location_trip_time (trip_id, recorded_at),
      INDEX idx_trip_location_recorded_at (recorded_at)
    )`
  );

  await ensureColumn('trip_location_logs', 'source', `ENUM('BROWSER', 'DISPATCHER', 'GPS_DEVICE', 'SYSTEM') NOT NULL DEFAULT 'BROWSER'`);
  await ensureColumn('trip_location_logs', 'gps_device_id', 'INT NULL');

  await query(
    `CREATE TABLE IF NOT EXISTS gps_devices (
      id INT PRIMARY KEY AUTO_INCREMENT,
      device_code VARCHAR(60) NOT NULL UNIQUE,
      device_token VARCHAR(128) NOT NULL UNIQUE,
      trip_id INT NULL,
      truck_id INT NULL,
      driver_id INT NULL,
      status ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
      last_seen_at DATETIME NULL,
      note TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_gps_devices_trip FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE SET NULL,
      CONSTRAINT fk_gps_devices_truck FOREIGN KEY (truck_id) REFERENCES trucks(id) ON DELETE SET NULL,
      CONSTRAINT fk_gps_devices_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE SET NULL
    )`
  );

  const existingDevices = await query('SELECT COUNT(*) AS total FROM gps_devices');
  if (!existingDevices[0]?.total) {
    await query(
      `INSERT INTO gps_devices (device_code, device_token, trip_id, truck_id, driver_id, status, note)
       SELECT
         'GPS-DEMO-001',
         'gps-demo-token-001',
         t.id,
         t.truck_id,
         t.driver_id,
         'ACTIVE',
         'Thiet bi GPS demo gan san cho do an'
       FROM trips t
       ORDER BY t.id ASC
       LIMIT 1`
    );
  }
}

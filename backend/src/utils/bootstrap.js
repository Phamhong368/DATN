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
}

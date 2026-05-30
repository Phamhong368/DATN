-- Tao 200 du lieu mau cho bang trips.
-- Yeu cau:
-- 1) Bang trucks va drivers da co du lieu
-- 2) MySQL 8+ (ho tro CTE va window function)

WITH RECURSIVE seq AS (
  SELECT 1 AS n
  UNION ALL
  SELECT n + 1 FROM seq WHERE n < 200
),
truck_pool AS (
  SELECT
    id,
    ROW_NUMBER() OVER (ORDER BY id) AS rn,
    COUNT(*) OVER () AS total
  FROM trucks
),
driver_pool AS (
  SELECT
    id,
    ROW_NUMBER() OVER (ORDER BY id) AS rn,
    COUNT(*) OVER () AS total
  FROM drivers
),
trip_seed AS (
  SELECT
    s.n,
    CONCAT('TRIP-', LPAD(1000 + s.n, 4, '0')) AS trip_code,
    CASE MOD(s.n, 10)
      WHEN 0 THEN 'Ha Noi'
      WHEN 1 THEN 'Hai Phong'
      WHEN 2 THEN 'Da Nang'
      WHEN 3 THEN 'TP.HCM'
      WHEN 4 THEN 'Can Tho'
      WHEN 5 THEN 'Nha Trang'
      WHEN 6 THEN 'Binh Duong'
      WHEN 7 THEN 'Nghe An'
      WHEN 8 THEN 'Hue'
      ELSE 'Thai Binh'
    END AS origin,
    CASE MOD(s.n + 3, 10)
      WHEN 0 THEN 'Ha Noi'
      WHEN 1 THEN 'Hai Phong'
      WHEN 2 THEN 'Da Nang'
      WHEN 3 THEN 'TP.HCM'
      WHEN 4 THEN 'Can Tho'
      WHEN 5 THEN 'Nha Trang'
      WHEN 6 THEN 'Binh Duong'
      WHEN 7 THEN 'Nghe An'
      WHEN 8 THEN 'Hue'
      ELSE 'Thai Binh'
    END AS destination,
    TIMESTAMP('2026-01-01 06:00:00') + INTERVAL (s.n - 1) DAY + INTERVAL MOD(s.n, 8) HOUR AS start_date,
    CASE
      WHEN MOD(s.n, 5) = 0 THEN
        TIMESTAMP('2026-01-01 06:00:00') + INTERVAL (s.n - 1) DAY + INTERVAL MOD(s.n, 8) HOUR + INTERVAL 10 HOUR
      WHEN MOD(s.n, 5) = 1 THEN
        TIMESTAMP('2026-01-01 06:00:00') + INTERVAL (s.n - 1) DAY + INTERVAL MOD(s.n, 8) HOUR + INTERVAL 14 HOUR
      ELSE NULL
    END AS end_date,
    CASE
      WHEN MOD(s.n, 5) = 0 THEN 'COMPLETED'
      WHEN MOD(s.n, 5) = 1 THEN 'COMPLETED'
      WHEN MOD(s.n, 5) = 2 THEN 'IN_TRANSIT'
      WHEN MOD(s.n, 5) = 3 THEN 'ASSIGNED'
      ELSE 'PLANNED'
    END AS status,
    CONCAT('Du lieu mau chuyen xe so ', s.n) AS notes
  FROM seq s
)
INSERT IGNORE INTO trips (
  trip_code,
  truck_id,
  driver_id,
  start_date,
  end_date,
  origin,
  destination,
  status,
  notes
)
SELECT
  ts.trip_code,
  tp.id AS truck_id,
  dp.id AS driver_id,
  ts.start_date,
  ts.end_date,
  ts.origin,
  ts.destination,
  ts.status,
  ts.notes
FROM trip_seed ts
JOIN truck_pool tp
  ON tp.rn = MOD(ts.n - 1, tp.total) + 1
JOIN driver_pool dp
  ON dp.rn = MOD(ts.n - 1, dp.total) + 1;

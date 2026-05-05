function transpose(matrix) {
  return matrix[0].map((_, colIndex) => matrix.map((row) => row[colIndex]));
}

function multiply(a, b) {
  return a.map((row) =>
    b[0].map((_, colIndex) =>
      row.reduce((sum, value, cellIndex) => sum + value * b[cellIndex][colIndex], 0)
    )
  );
}

function identity(size) {
  return Array.from({ length: size }, (_, rowIndex) =>
    Array.from({ length: size }, (_, colIndex) => (rowIndex === colIndex ? 1 : 0))
  );
}

function invert(matrix) {
  const size = matrix.length;
  const working = matrix.map((row, index) => [...row, ...identity(size)[index]]);

  for (let pivotIndex = 0; pivotIndex < size; pivotIndex += 1) {
    let pivot = working[pivotIndex][pivotIndex];

    if (Math.abs(pivot) < 1e-10) {
      const replacementIndex = working.findIndex((row, index) => index > pivotIndex && Math.abs(row[pivotIndex]) > 1e-10);
      if (replacementIndex === -1) {
        throw new Error('Không thể huấn luyện mô hình do ma trận đặc trưng suy biến.');
      }
      [working[pivotIndex], working[replacementIndex]] = [working[replacementIndex], working[pivotIndex]];
      pivot = working[pivotIndex][pivotIndex];
    }

    for (let colIndex = 0; colIndex < size * 2; colIndex += 1) {
      working[pivotIndex][colIndex] /= pivot;
    }

    for (let rowIndex = 0; rowIndex < size; rowIndex += 1) {
      if (rowIndex === pivotIndex) {
        continue;
      }

      const factor = working[rowIndex][pivotIndex];
      for (let colIndex = 0; colIndex < size * 2; colIndex += 1) {
        working[rowIndex][colIndex] -= factor * working[pivotIndex][colIndex];
      }
    }
  }

  return working.map((row) => row.slice(size));
}

function round(value, digits = 4) {
  return Number(Number(value || 0).toFixed(digits));
}

export function trainFuelRegression(rows) {
  if (rows.length < 5) {
    throw new Error('Cần ít nhất 5 bản ghi nhiên liệu để huấn luyện mô hình.');
  }

  const featureMatrix = rows.map((row) => [
    1,
    Number(row.distance_km),
    Number(row.payload_tons || 0),
    Number(row.idle_minutes || 0),
    Number(row.avg_speed_kmh || 0)
  ]);
  const targetMatrix = rows.map((row) => [Number(row.fuel_liters)]);
  const featureNames = ['intercept', 'distance_km', 'payload_tons', 'idle_minutes', 'avg_speed_kmh'];

  const xt = transpose(featureMatrix);
  const xtx = multiply(xt, featureMatrix);
  const xtxInverse = invert(xtx);
  const xty = multiply(xt, targetMatrix);
  const coefficients = multiply(xtxInverse, xty).map((row) => row[0]);

  const predictions = featureMatrix.map((featureRow) =>
    featureRow.reduce((sum, value, index) => sum + value * coefficients[index], 0)
  );
  const actuals = targetMatrix.map((row) => row[0]);
  const actualMean = actuals.reduce((sum, value) => sum + value, 0) / actuals.length;
  const rss = actuals.reduce((sum, actual, index) => sum + (actual - predictions[index]) ** 2, 0);
  const tss = actuals.reduce((sum, actual) => sum + (actual - actualMean) ** 2, 0);
  const mae = actuals.reduce((sum, actual, index) => sum + Math.abs(actual - predictions[index]), 0) / actuals.length;

  return {
    featureNames,
    coefficients: Object.fromEntries(featureNames.map((name, index) => [name, round(coefficients[index], 6)])),
    metrics: {
      sampleSize: rows.length,
      r2: round(tss === 0 ? 1 : 1 - rss / tss, 6),
      mae: round(mae, 4)
    }
  };
}

export function predictFuelLiters(model, features) {
  const vector = [
    1,
    Number(features.distance_km),
    Number(features.payload_tons || 0),
    Number(features.idle_minutes || 0),
    Number(features.avg_speed_kmh || 0)
  ];
  const names = ['intercept', 'distance_km', 'payload_tons', 'idle_minutes', 'avg_speed_kmh'];

  return round(
    vector.reduce((sum, value, index) => sum + value * Number(model.coefficients[names[index]] || 0), 0),
    3
  );
}

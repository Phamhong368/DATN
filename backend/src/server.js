import dotenv from 'dotenv';
import app from './app.js';
import { connectDB } from './config/db.js';
import { ensureAnalyticsSchema } from './utils/bootstrap.js';

dotenv.config();

const PORT = Number(process.env.PORT || 4000);

async function start() {
  try {
    await connectDB();
    await ensureAnalyticsSchema();
    app.listen(PORT, () => {
      console.log(`Backend listening on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server due to DB error:', err?.message || err);
    process.exit(1);
  }
}

start();

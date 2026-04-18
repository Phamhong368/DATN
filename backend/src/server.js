import app from './app.js';
import { testConnection } from './config/db.js';

const port = Number(process.env.PORT || 4001);

async function bootstrap() {
  try {
    await testConnection();
    console.log('Database connected.');
  } catch (error) {
    console.warn('Database connection failed on startup:', error.message);
  }

  const server = app.listen(port, () => {
    console.log(`Backend listening on http://localhost:${port}`);
  });

  server.on('error', (err) => {
    console.error('Server error:', err.message);
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use. Set PORT env or free the port and restart.`);
      process.exit(1);
    }
  });
}

bootstrap();


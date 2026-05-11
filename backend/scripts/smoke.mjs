import http from 'node:http';
import app from '../src/app.js';

const server = http.createServer(app);
let isListening = false;

function listen() {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      isListening = true;
      server.off('error', reject);
      resolve(server.address());
    });
  });
}

function close() {
  if (!isListening) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function requestHealth(port) {
  const response = await fetch(`http://127.0.0.1:${port}/health`);
  if (!response.ok) {
    throw new Error(`/health returned HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (payload.status !== 'ok') {
    throw new Error(`/health returned unexpected payload: ${JSON.stringify(payload)}`);
  }
}

try {
  const address = await listen();
  await requestHealth(address.port);
  console.log('Smoke check passed: /health returned ok.');
} finally {
  await close();
}

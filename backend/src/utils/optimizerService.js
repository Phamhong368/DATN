import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const solverPath = path.resolve(__dirname, '../../optimizer/solver.py');

export function optimizeRoutesWithOrTools(payload) {
  const result = spawnSync('python3', [solverPath], {
    cwd: path.resolve(__dirname, '../../'),
    env: {
      ...process.env,
      PYTHONPYCACHEPREFIX: process.env.PYTHONPYCACHEPREFIX || '/tmp/codex-python-cache'
    },
    input: JSON.stringify(payload),
    encoding: 'utf-8',
    timeout: 15000
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error((result.stderr || 'Optimizer service failed.').trim());
  }

  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error('Optimizer service returned invalid JSON.');
  }
}

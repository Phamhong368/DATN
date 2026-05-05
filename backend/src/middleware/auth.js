import jwt from 'jsonwebtoken';

const rolePriority = {
  DRIVER: 1,
  DISPATCHER: 2,
  ADMIN: 3
};

const roleById = {
  1: 'ADMIN',
  2: 'DISPATCHER',
  3: 'DRIVER'
};

export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing or invalid authorization header.' });
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'super-secret-demo-key');
    req.user = {
      ...payload,
      role: payload.role || roleById[payload.role_id]
    };
    next();
  } catch {
    res.status(401).json({ message: 'Invalid or expired token.' });
  }
}

export function authorize(minRole) {
  return (req, res, next) => {
    const current = req.user?.role;
    if (!current || rolePriority[current] < rolePriority[minRole]) {
      return res.status(403).json({ message: 'Forbidden.' });
    }
    next();
  };
}

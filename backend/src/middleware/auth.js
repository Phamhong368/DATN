import jwt from 'jsonwebtoken';

const rolePriority = {
  CUSTOMER: 1,
  DRIVER: 2,
  DISPATCHER: 3,
  ADMIN: 4
};

const roleById = {
  1: 'ADMIN',
  2: 'DISPATCHER',
  3: 'DRIVER',
  4: 'CUSTOMER'
};

export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  const tokenFromHeader = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const tokenFromQuery = typeof req.query?.token === 'string' ? req.query.token : '';
  const token = tokenFromHeader || tokenFromQuery;

  if (!token) {
    return res.status(401).json({ message: 'Missing or invalid authorization header.' });
  }

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

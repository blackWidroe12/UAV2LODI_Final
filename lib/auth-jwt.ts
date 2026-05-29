import jwt from 'jsonwebtoken';

// Resolve the secret lazily so importing this module never throws at build
// time (e.g. during Next.js page-data collection). The check only runs when a
// token is actually signed or verified at runtime.
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;

  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is required in production');
  }
  return 'dev-secret-change-in-production-2024';
}

const JWT_EXPIRY = '30d';

export interface JWTPayload {
  userId: string;
  iat: number;
  exp?: number;
}

export function generateToken(userId: string): string {
  return jwt.sign(
    { userId, iat: Math.floor(Date.now() / 1000) },
    getJwtSecret(),
    { expiresIn: JWT_EXPIRY, algorithm: 'HS256' }
  );
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });
    return decoded as JWTPayload;
  } catch (err) {
    return null;
  }
}

export function decodeToken(token: string): any {
  try {
    return jwt.decode(token);
  } catch {
    return null;
  }
}

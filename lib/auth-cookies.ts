import { cookies } from 'next/headers';

const COOKIE_NAME = 'auth_token';
const COOKIE_SECURE = process.env.NODE_ENV === 'production';
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds

export async function setAuthCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true, // JavaScript cannot access this cookie
    secure: COOKIE_SECURE, // HTTPS only in production
    sameSite: 'lax', // CSRF protection
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  });
}

export async function getAuthCookie(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    return cookieStore.get(COOKIE_NAME)?.value ?? null;
  } catch {
    return null;
  }
}

export async function clearAuthCookie() {
  try {
    const cookieStore = await cookies();
    cookieStore.delete(COOKIE_NAME);
  } catch {
    // Ignore
  }
}

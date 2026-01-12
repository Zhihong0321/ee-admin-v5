import { cookies } from 'next/headers';
import { decodeJwt } from 'jose';

export interface User {
  userId: string;
  phone: string;
  role: string;
  isAdmin: boolean;
  name: string;
}

export async function getUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;

  if (!token) return null;

  try {
    // Note: We don't verify the secret here because this is for UI display.
    // The middleware already verified the token before the request reached here.
    const decoded = decodeJwt(token) as unknown as User;
    return decoded;
  } catch (err) {
    return null;
  }
}

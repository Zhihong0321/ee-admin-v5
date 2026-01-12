import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const AUTH_URL = 'https://auth.atap.solar';
const JWT_SECRET = process.env.JWT_SECRET || 'your-fallback-secret-if-any';

export async function middleware(request: NextRequest) {
  // 1. Get Token from Cookie
  const token = request.cookies.get('auth_token')?.value;

  if (!token) {
    // Redirect to Auth Hub with Return URL
    const returnTo = encodeURIComponent(request.url);
    return NextResponse.redirect(`${AUTH_URL}/?return_to=${returnTo}`);
  }

  try {
    // 2. Verify Token
    const secret = new TextEncoder().encode(JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    
    const user = payload as unknown as { 
      role?: string; 
      isAdmin?: boolean; 
      tags?: string[] 
    };

    const path = request.nextUrl.pathname;
    const userTags = user.tags || [];
    const isOwner = user.role === 'owner' || user.isAdmin === true; // Owners usually have full access

    // Helper to check if user has any of the required tags
    const hasTag = (...required: string[]) => 
      isOwner || userTags.some(tag => required.includes(tag.toLowerCase()));

    // RBAC Rules
    if (path.startsWith('/invoices') && !hasTag('admin', 'finance')) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    if (path.startsWith('/payments') && !hasTag('finance')) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    if (path.startsWith('/users') && !hasTag('admin')) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    if (path.startsWith('/customers') && !hasTag('admin')) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    
    // Token is valid and authorized
    return NextResponse.next();
  } catch (err) {
    // Token invalid or expired
    const returnTo = encodeURIComponent(request.url);
    return NextResponse.redirect(`${AUTH_URL}/?return_to=${returnTo}`);
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};

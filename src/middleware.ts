import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const AUTH_URL = 'https://auth.atap.solar';
const JWT_SECRET = process.env.JWT_SECRET; // Don't fallback silently, handle it logic

export async function middleware(request: NextRequest) {
  // 1. Get Token from Cookie
  const token = request.cookies.get('auth_token')?.value;

  if (!token) {
    // console.log("Middleware: No token found. Redirecting to Auth."); // Optional debug
    const returnTo = encodeURIComponent(request.url);
    return NextResponse.redirect(`${AUTH_URL}/?return_to=${returnTo}`);
  }

  try {
    if (!JWT_SECRET) {
      console.error("CRITICAL: JWT_SECRET is missing in environment variables! Auth will fail.");
      // Fallback for dev only, or fail
      if (process.env.NODE_ENV === 'production') {
         throw new Error("Missing JWT_SECRET in production");
      }
    }

    const secretStr = JWT_SECRET || 'your-fallback-secret-if-any';
    // Debug: Check if secret persists
    // console.log(`Middleware: Verifying with secret (len=${secretStr.length})...`);

    // 2. Verify Token
    const secret = new TextEncoder().encode(secretStr);
    const { payload } = await jwtVerify(token, secret);
    
    const user = payload as unknown as { 
      role?: string; 
      isAdmin?: boolean; 
      tags?: string[] 
    };

    const path = request.nextUrl.pathname;
    const userTags = user.tags || [];
    const isOwner = user.role === 'owner' || user.isAdmin === true; 

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
    
    return NextResponse.next();
  } catch (err) {
    console.error(`Auth Error: ${String(err)}`);
    const returnTo = encodeURIComponent(request.url);
    return NextResponse.redirect(`${AUTH_URL}/?return_to=${returnTo}`);
  }
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};

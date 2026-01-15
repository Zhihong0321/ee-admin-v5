# Auth Redirect Issue Fix - localhost:8080

## Problem
After authentication, users are redirected to `localhost:8080` instead of the production Railway URL.

## Root Cause
The auth service at `https://auth.atap.solar` likely has a hardcoded redirect URL to `localhost:8080` and may not be honoring the `return_to` parameter sent by your application.

## Solution Implemented

### 1. Middleware Update (src/middleware.ts)
Added support for `NEXT_PUBLIC_APP_URL` environment variable to explicitly set the production URL:
- Uses `NEXT_PUBLIC_APP_URL` if set
- Falls back to `request.url` if not set
- Logs the URL being sent as `return_to` for debugging

### 2. Environment Variables
Created `.env.example` documenting required variables:
- `NEXT_PUBLIC_APP_URL` - Your Railway production URL (REQUIRED for auth to work)
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - JWT verification key
- `BUBBLE_API_KEY` - Bubble.io API key (optional)

### 3. Railway Configuration
Added `railway.json` for deployment configuration.

## Action Required on Railway

1. **Go to your Railway project settings**
2. **Add the following environment variable:**
   ```
   NEXT_PUBLIC_APP_URL=https://your-ee-admin-app.up.railway.app
   ```
   Replace with your actual Railway domain URL.

3. **Redeploy your application** after adding the variable.

## Verification

After deployment, test the auth flow:
1. Access your app on Railway
2. Click to login
3. Check Railway logs for: `[Auth] Redirecting to auth, return_to: https://your-url.railway.app/...`
4. If redirected to `localhost:8080`, the auth service at `https://auth.atap.solar` needs configuration update

## Important Notes

### Why `NEXT_PUBLIC_APP_URL`?
Next.js requires the `NEXT_PUBLIC_` prefix for environment variables that need to be accessible on both server and client sides. This ensures the URL is available in middleware.

### If Issue Persists
The problem may be on the **auth service side** (`https://auth.atap.solar`):
- Contact the auth service administrator
- Request they update their redirect logic to use the `return_to` parameter
- The auth service should honor the `return_to` URL sent by your application instead of hardcoding `localhost:8080`

### What the Middleware Does
1. Checks for auth token
2. If no token, constructs the return URL using `NEXT_PUBLIC_APP_URL` + current path
3. Redirects to auth service with `return_to` parameter
4. Logs the URL for debugging

## Example Railway Environment Variables
```
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://ee-admin-v5-production.up.railway.app
DATABASE_URL=postgresql://postgres:password@host:5432/eeadmin
JWT_SECRET=your-long-random-secret-key-here
BUBBLE_API_KEY=your-bubble-api-key-here
```

## Testing
```bash
# Local testing (should work without NEXT_PUBLIC_APP_URL)
npm run dev

# Production (MUST have NEXT_PUBLIC_APP_URL set)
# Deploy to Railway with environment variables
```

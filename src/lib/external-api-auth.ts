import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

/** Protects server-to-server API routes with a shared Bearer token. */
export function requireExternalApiKey(
  request: NextRequest,
  environmentVariable = "SEDA_API_KEY"
): NextResponse | null {
  const configuredKey = process.env[environmentVariable]?.trim();

  if (!configuredKey) {
    return NextResponse.json(
      { error: "API authentication is not configured" },
      { status: 503 }
    );
  }

  const authorization = request.headers.get("authorization");
  const bearerKey = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const suppliedKey = bearerKey || request.headers.get("x-api-key")?.trim();

  if (!suppliedKey) {
    return NextResponse.json(
      { error: "Missing API key" },
      { status: 401, headers: { "WWW-Authenticate": "Bearer" } }
    );
  }

  const expected = Buffer.from(configuredKey, "utf8");
  const supplied = Buffer.from(suppliedKey, "utf8");
  const isValid =
    expected.length === supplied.length && timingSafeEqual(expected, supplied);

  if (!isValid) {
    return NextResponse.json(
      { error: "Invalid API key" },
      { status: 401, headers: { "WWW-Authenticate": "Bearer" } }
    );
  }

  return null;
}

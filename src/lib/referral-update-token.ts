import { jwtVerify, SignJWT } from "jose";

const TOKEN_AUDIENCE = "ee-admin-referral-details";
const TOKEN_SCOPE = "referral-details-update";

export type ReferralUpdateTokenPayload = {
  referrerCustomerId: string;
  referralIds: number[];
};

function getSigningKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is required for referral update links");
  return new TextEncoder().encode(secret);
}

export async function signReferralUpdateToken(payload: ReferralUpdateTokenPayload) {
  return new SignJWT({ ...payload, scope: TOKEN_SCOPE })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(TOKEN_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getSigningKey());
}

export async function verifyReferralUpdateToken(token: string): Promise<ReferralUpdateTokenPayload> {
  const { payload } = await jwtVerify(token, getSigningKey(), { audience: TOKEN_AUDIENCE });
  const referrerCustomerId = payload.referrerCustomerId;
  const referralIds = payload.referralIds;

  if (
    payload.scope !== TOKEN_SCOPE ||
    typeof referrerCustomerId !== "string" ||
    !referrerCustomerId.trim() ||
    !Array.isArray(referralIds) ||
    referralIds.length === 0 ||
    referralIds.length > 200 ||
    referralIds.some((id) => !Number.isSafeInteger(id) || id <= 0) ||
    new Set(referralIds).size !== referralIds.length
  ) {
    throw new Error("Invalid referral update link");
  }

  return { referrerCustomerId, referralIds: referralIds as number[] };
}

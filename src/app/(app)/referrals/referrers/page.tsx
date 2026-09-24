import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getReferrerFeeSummary } from "../referrers-actions";
import ReferrersClient from "./referrers-client";

export default async function ReferrersPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const isAdmin =
    user.isAdmin === true ||
    user.role === "owner" ||
    (user.tags || []).map((tag) => tag.toLowerCase()).includes("admin");
  if (!isAdmin) redirect("/referrals");

  const referrers = await getReferrerFeeSummary();
  return <ReferrersClient referrers={referrers} />;
}

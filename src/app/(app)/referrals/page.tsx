import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import ReferralsClient from "./referrals-client";

export default async function ReferralsPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const isAdmin =
    user.isAdmin === true ||
    user.role === "owner" ||
    (user.tags || []).map((tag) => tag.toLowerCase()).includes("admin");

  return <ReferralsClient isAdmin={isAdmin} />;
}

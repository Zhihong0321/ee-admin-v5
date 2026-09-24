import { notFound } from "next/navigation";
import { getReferralUpdateForm } from "../actions";
import ReferralUpdateForm from "./referral-update-form";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function ReferralUpdatePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const form = await getReferralUpdateForm(token);
  if (!form.success) notFound();

  return <ReferralUpdateForm token={token} referrerName={form.referrerName} leads={form.leads} />;
}

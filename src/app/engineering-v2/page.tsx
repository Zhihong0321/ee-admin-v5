import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { EngineeringV2Client } from "./engineering-v2-client";

export const metadata = {
    title: "Engineering V2 | EE Admin",
    description: "Systematic attachment tracker for all invoices – roof, site assessment, PV drawings & engineering drawings.",
};

export default async function EngineeringV2Page() {
    const user = await getUser();
    if (!user) redirect("/login");

    return <EngineeringV2Client user={user} />;
}

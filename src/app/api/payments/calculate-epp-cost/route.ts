import { db } from "@/lib/db";
import { payments } from "@/db/schema";
import { eq, and, isNull, or } from "drizzle-orm";
import { calculateEppCost, getEppRate } from "@/lib/epp-rates";
import { NextResponse } from "next/server";

export async function POST() {
  try {
    console.log('🚀 Starting EPP cost calculation for all payments...');

    // Find all EPP payments with empty/null epp_cost
    const eppPayments = await db
      .select({
        id: payments.id,
        amount: payments.amount,
        issuer_bank: payments.issuer_bank,
        epp_month: payments.epp_month,
        epp_type: payments.epp_type,
        epp_cost: payments.epp_cost,
      })
      .from(payments)
      .where(
        and(
          eq(payments.epp_type, 'EPP'),
          or(isNull(payments.epp_cost), eq(payments.epp_cost, '0'))
        )
      );

    console.log(`📊 Found ${eppPayments.length} EPP payments to update`);

    let updated = 0;
    let skipped = 0;
    const errors: any[] = [];

    for (const payment of eppPayments) {
      try {
        const tenure = payment.epp_month ? parseInt(payment.epp_month) : null;
        const amount = payment.amount ? parseFloat(payment.amount) : null;
        const bank = payment.issuer_bank;

        // Validate required fields
        if (!amount || !tenure || !bank) {
          skipped++;
          console.log(`   ⚠️  Skipping ID ${payment.id}: Missing data`);
          continue;
        }

        // Get the EPP rate
        const rate = getEppRate(bank, tenure);
        if (rate === null) {
          skipped++;
          console.log(`   ⚠️  Skipping ID ${payment.id}: No rate for ${bank} at ${tenure}mo`);
          continue;
        }

        // Calculate EPP cost
        const eppCost = calculateEppCost(amount, rate);

        // Update the database
        await db
          .update(payments)
          .set({ epp_cost: eppCost.toString() })
          .where(eq(payments.id, payment.id));

        updated++;
        console.log(`   ✅ ID ${payment.id}: RM${amount.toFixed(2)} @ ${rate}% → EPP Cost: RM${eppCost.toFixed(2)}`);

      } catch (error: any) {
        errors.push({ id: payment.id, error: error.message });
        console.error(`   ❌ Error updating ID ${payment.id}:`, error);
      }
    }

    console.log(`\n✅ Complete! Updated: ${updated}, Skipped: ${skipped}, Errors: ${errors.length}`);

    return NextResponse.json({
      success: true,
      updated,
      skipped,
      errors: errors.length,
      details: errors,
    });

  } catch (error: any) {
    console.error('❌ EPP cost calculation failed:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

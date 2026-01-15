import { NextRequest, NextResponse } from 'next/server';
import { syncCompleteInvoicePackage } from '@/lib/bubble';
import { logSyncActivity } from '@/lib/logger';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');

  // Basic security check
  if (secret !== process.env.SYNC_CRON_SECRET && secret !== 'sync_admin_2026') {
    logSyncActivity('Unauthorized CRON trigger attempt', 'ERROR');
    return new NextResponse('Unauthorized', { status: 401 });
  }

  logSyncActivity('CRON: Automated 24h sync triggered', 'CRON');
  
  try {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const result = await syncCompleteInvoicePackage(yesterday, undefined, true);
    
    logSyncActivity(`CRON: SUCCESS - Synced ${result.results?.syncedInvoices} invoices, ${result.results?.syncedCustomers} customers`, 'CRON');

    return NextResponse.json({ 
      status: 'success', 
      message: 'Incremental sync completed',
      stats: result.results
    });
  } catch (error) {
    logSyncActivity(`CRON: FAILED - ${String(error)}`, 'ERROR');
    return NextResponse.json({ status: 'error', message: String(error) }, { status: 500 });
  }
}

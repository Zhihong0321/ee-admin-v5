-- Create sync_progress table for tracking sync operation progress
CREATE TABLE IF NOT EXISTS sync_progress (
  id SERIAL PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL, -- 'running', 'completed', 'error'
  total_invoices INTEGER NOT NULL DEFAULT 0,
  synced_invoices INTEGER NOT NULL DEFAULT 0,
  current_invoice_id TEXT,
  date_from TEXT,
  date_to TEXT,
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Create index on session_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_sync_progress_session_id ON sync_progress(session_id);

-- Create index on status for querying running syncs
CREATE INDEX IF NOT EXISTS idx_sync_progress_status ON sync_progress(status);

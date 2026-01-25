-- =====================================================
-- Customer Snapshot Table & Triggers Migration
-- =====================================================
-- This migration creates a customer_snapshot table and
-- automatic triggers to capture UPDATE and DELETE operations
--
-- Author: Claude Sonnet 4.5
-- Date: 2026-01-19
-- =====================================================

-- Step 1: Create the customer_snapshot table
CREATE TABLE IF NOT EXISTS customer_snapshot (
  snapshot_id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customer(id) ON DELETE CASCADE,
  -- Snapshot of all customer fields (old values)
  customer_id_text TEXT,
  name TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  postcode TEXT,
  ic_number TEXT,
  linked_seda_registration TEXT,
  linked_old_customer TEXT,
  notes TEXT,
  version INTEGER,
  updated_by TEXT,
  created_by TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  last_synced_at TIMESTAMP,
  -- Snapshot metadata
  snapshot_operation TEXT NOT NULL, -- 'UPDATE' or 'DELETE'
  snapshot_created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  snapshot_created_by TEXT
);

-- Step 2: Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_customer_snapshot_customer_id ON customer_snapshot(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_snapshot_operation ON customer_snapshot(snapshot_operation);
CREATE INDEX IF NOT EXISTS idx_customer_snapshot_created_at ON customer_snapshot(snapshot_created_at DESC);

-- Step 3: Create the trigger function for customer snapshots
CREATE OR REPLACE FUNCTION customer_snapshot_trigger()
RETURNS TRIGGER AS $$
BEGIN
  -- Check which operation triggered the function
  IF TG_OP = 'UPDATE' THEN
    -- Insert snapshot of OLD values (before update)
    INSERT INTO customer_snapshot (
      customer_id,
      customer_id_text,
      name,
      email,
      phone,
      address,
      city,
      state,
      postcode,
      ic_number,
      linked_seda_registration,
      linked_old_customer,
      notes,
      version,
      updated_by,
      created_by,
      created_at,
      updated_at,
      last_synced_at,
      snapshot_operation,
      snapshot_created_by
    )
    VALUES (
      OLD.id,
      OLD.customer_id,
      OLD.name,
      OLD.email,
      OLD.phone,
      OLD.address,
      OLD.city,
      OLD.state,
      OLD.postcode,
      OLD.ic_number,
      OLD.linked_seda_registration,
      OLD.linked_old_customer,
      OLD.notes,
      OLD.version,
      OLD.updated_by,
      OLD.created_by,
      OLD.created_at,
      OLD.updated_at,
      OLD.last_synced_at,
      'UPDATE',
      NEW.updated_by  -- Track who made the change
    );

    -- Auto-increment version
    NEW.version = OLD.version + 1;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    -- Insert snapshot before deletion
    INSERT INTO customer_snapshot (
      customer_id,
      customer_id_text,
      name,
      email,
      phone,
      address,
      city,
      state,
      postcode,
      ic_number,
      linked_seda_registration,
      linked_old_customer,
      notes,
      version,
      updated_by,
      created_by,
      created_at,
      updated_at,
      last_synced_at,
      snapshot_operation,
      snapshot_created_by
    )
    VALUES (
      OLD.id,
      OLD.customer_id,
      OLD.name,
      OLD.email,
      OLD.phone,
      OLD.address,
      OLD.city,
      OLD.state,
      OLD.postcode,
      OLD.ic_number,
      OLD.linked_seda_registration,
      OLD.linked_old_customer,
      OLD.notes,
      OLD.version,
      OLD.updated_by,
      OLD.created_by,
      OLD.created_at,
      OLD.updated_at,
      OLD.last_synced_at,
      'DELETE',
      OLD.updated_by
    );

    RETURN OLD;

  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Step 4: Drop existing triggers if they exist
DROP TRIGGER IF EXISTS customer_update_snapshot_trigger ON customer;
DROP TRIGGER IF EXISTS customer_delete_snapshot_trigger ON customer;

-- Step 5: Create the triggers
CREATE TRIGGER customer_update_snapshot_trigger
BEFORE UPDATE ON customer
FOR EACH ROW
EXECUTE FUNCTION customer_snapshot_trigger();

CREATE TRIGGER customer_delete_snapshot_trigger
BEFORE DELETE ON customer
FOR EACH ROW
EXECUTE FUNCTION customer_snapshot_trigger();

-- Step 6: (Optional) Add comment for documentation
COMMENT ON TABLE customer_snapshot IS 'Automatic snapshots of customer records before UPDATE and DELETE operations. Maintains audit trail of all changes.';

COMMENT ON FUNCTION customer_snapshot_trigger() IS 'Trigger function that automatically creates snapshots before UPDATE and DELETE operations on customer table. Also auto-increments version on updates.';

-- =====================================================
-- Verification Query (run this to verify setup)
-- =====================================================
-- Check if triggers are active:
-- SELECT
--   tgname AS trigger_name,
--   tgtype AS trigger_type,
--   tgattr AS trigger_columns
-- FROM pg_trigger
-- WHERE tgrelid = 'customer'::regclass
--   AND tgisinternal = false;

-- Count snapshots created (should be 0 initially):
-- SELECT COUNT(*) FROM customer_snapshot;

-- Sample query to view snapshot history:
-- SELECT
--   s.snapshot_id,
--   s.snapshot_operation,
--   s.snapshot_created_at,
--   s.name,
--   s.email,
--   s.version,
--   c.name AS current_name
-- FROM customer_snapshot s
-- LEFT JOIN customer c ON c.id = s.customer_id
-- ORDER BY s.snapshot_created_at DESC
-- LIMIT 10;

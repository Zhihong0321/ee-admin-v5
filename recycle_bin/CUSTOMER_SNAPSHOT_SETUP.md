# Customer Snapshot System

## Overview

The Customer Snapshot system automatically creates snapshots of customer records **before** any UPDATE or DELETE operation. This provides a complete audit trail of all changes to customer data, implemented entirely at the PostgreSQL database level using triggers.

## Features

- ✅ **Automatic snapshots** - Works transparently at the database level
- ✅ **UPDATE tracking** - Captures old values before any update
- ✅ **DELETE tracking** - Preserves data before deletion
- ✅ **Auto-increment version** - Automatically increments customer version on each update
- ✅ **FK with CASCADE** - Snapshots are automatically cleaned up when customer is deleted
- ✅ **Performance optimized** - Indexes on customer_id, operation, and timestamp

## Files Modified/Created

### 1. Schema Definition
**File:** `src/db/schema.ts`

Added `customer_snapshots` table definition with:
- FK reference to `customer.id` with ON DELETE CASCADE
- All customer fields duplicated (snapshot of old values)
- Metadata fields (operation, created_at, created_by)

### 2. SQL Migration
**File:** `migrations/add_customer_snapshot_table.sql`

Creates:
- `customer_snapshot` table
- Indexes for performance
- Trigger function `customer_snapshot_trigger()`
- UPDATE and DELETE triggers on `customer` table

### 3. Test Script
**File:** `scripts/test-customer-snapshot.js`

Tests the snapshot system to ensure it works correctly.

## Setup Instructions

### Step 1: Apply the Migration

Connect to your PostgreSQL database and run:

```bash
psql -U your_username -d your_database -f migrations/add_customer_snapshot_table.sql
```

Or using your database tool (pgAdmin, DBeaver, etc.), open and execute the SQL file.

### Step 2: Verify Installation

Run this query to verify triggers are active:

```sql
SELECT
  tgname AS trigger_name,
  tgtype AS trigger_type
FROM pg_trigger
WHERE tgrelid = 'customer'::regclass
  AND tgisinternal = false;
```

Expected output:
```
trigger_name                      | trigger_type
----------------------------------|--------------
customer_update_snapshot_trigger  | 21
customer_delete_snapshot_trigger  | 9
```

### Step 3: Test the System (Optional)

```bash
node scripts/test-customer-snapshot.js
```

This will:
1. Create a test customer
2. Update it (triggers UPDATE snapshot)
3. Delete it (triggers DELETE snapshot)
4. Verify snapshots were created correctly
5. Clean up test data

## How It Works

### On UPDATE

When a customer record is updated:

1. **BEFORE** the update completes, the trigger fires
2. A snapshot is created with the **OLD** values (before the change)
3. The `version` field is auto-incremented
4. The update completes with new values

### On DELETE

When a customer record is deleted:

1. **BEFORE** the delete completes, the trigger fires
2. A snapshot is created with all values
3. The delete completes
4. Original data is preserved in `customer_snapshot` table

## Usage Examples

### View All Snapshots for a Customer

```sql
SELECT
  s.snapshot_id,
  s.snapshot_operation,
  s.snapshot_created_at,
  s.name,
  s.email,
  s.phone,
  s.version,
  s.snapshot_created_by
FROM customer_snapshot s
WHERE s.customer_id = 123
ORDER BY s.snapshot_created_at DESC;
```

### View Change History

```sql
SELECT
  s.snapshot_operation,
  s.snapshot_created_at,
  s.name AS old_name,
  s.email AS old_email,
  s.version AS old_version,
  c.name AS current_name,
  c.email AS current_email,
  c.version AS current_version
FROM customer_snapshot s
LEFT JOIN customer c ON c.id = s.customer_id
WHERE s.customer_id = 123
ORDER BY s.snapshot_created_at DESC;
```

### Count Snapshots by Operation

```sql
SELECT
  snapshot_operation,
  COUNT(*) as total_snapshots
FROM customer_snapshot
GROUP BY snapshot_operation;
```

### Find All Deleted Customers

```sql
SELECT DISTINCT
  s.customer_id,
  s.name,
  s.email,
  s.snapshot_created_at AS deleted_at
FROM customer_snapshot s
WHERE s.snapshot_operation = 'DELETE'
  AND NOT EXISTS (SELECT 1 FROM customer c WHERE c.id = s.customer_id)
ORDER BY s.snapshot_created_at DESC;
```

## Table Schema

### customer_snapshot

| Column | Type | Description |
|--------|------|-------------|
| snapshot_id | SERIAL | Primary key |
| customer_id | INTEGER | FK to customer.id (CASCADE DELETE) |
| customer_id_text | TEXT | Original customer.customer_id |
| name | TEXT | Customer name |
| email | TEXT | Customer email |
| phone | TEXT | Phone number |
| address | TEXT | Address |
| city | TEXT | City |
| state | TEXT | State |
| postcode | TEXT | Postal code |
| ic_number | TEXT | IC number |
| linked_seda_registration | TEXT | SEDA registration link |
| linked_old_customer | TEXT | Old customer link |
| notes | TEXT | Notes |
| version | INTEGER | Version number at time of snapshot |
| updated_by | TEXT | Last updated by |
| created_by | TEXT | Created by |
| created_at | TIMESTAMP | Created timestamp |
| updated_at | TIMESTAMP | Updated timestamp |
| last_synced_at | TIMESTAMP | Last synced timestamp |
| snapshot_operation | TEXT | 'UPDATE' or 'DELETE' |
| snapshot_created_at | TIMESTAMP | When snapshot was created |
| snapshot_created_by | TEXT | Who triggered the snapshot |

## Indexes

Three indexes are created for performance:

1. `idx_customer_snapshot_customer_id` - For querying by customer
2. `idx_customer_snapshot_operation` - For filtering by operation type
3. `idx_customer_snapshot_created_at` - For chronological queries

## Cleanup & Maintenance

### Delete Old Snapshots

Snapshots older than a certain date can be cleaned up:

```sql
-- Delete snapshots older than 1 year
DELETE FROM customer_snapshot
WHERE snapshot_created_at < NOW() - INTERVAL '1 year';
```

### Storage Monitoring

Monitor table size:

```sql
SELECT
  pg_size_pretty(pg_total_relation_size('customer_snapshot')) AS size,
  COUNT(*) AS total_snapshots
FROM customer_snapshot;
```

## Troubleshooting

### Triggers Not Working

Check if triggers exist:

```sql
SELECT * FROM pg_trigger
WHERE tgrelid = 'customer'::regclass
  AND tgisinternal = false;
```

### Re-create Triggers

If needed, drop and recreate:

```sql
DROP TRIGGER IF EXISTS customer_update_snapshot_trigger ON customer;
DROP TRIGGER IF EXISTS customer_delete_snapshot_trigger ON customer;

-- Then re-run the migration file
```

## Extending to Other Tables

To add snapshot functionality to other tables (e.g., `invoices`, `seda_registration`):

1. Create a `[table]_snapshot` table
2. Create a trigger function
3. Create UPDATE and DELETE triggers

See `migrations/add_customer_snapshot_table.sql` as a template.

## Notes

- Snapshots are created **BEFORE** the operation, ensuring data is never lost
- The system is transparent to application code - works at DB level
- Cascading deletes automatically clean up snapshots when customer is permanently deleted
- Performance impact is minimal due to proper indexing
- Version field is auto-incremented on UPDATE (useful for optimistic locking)

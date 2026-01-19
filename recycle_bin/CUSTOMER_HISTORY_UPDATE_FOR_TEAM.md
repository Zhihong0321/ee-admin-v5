# Customer History Tracking (Postgres Level)

## Overview
We have implemented an automatic history tracking system for the `customer` table using a **Postgres Trigger**. This ensures a full audit trail of every change (UPDATE/DELETE) made to customer data, regardless of which application or service performs the action.

## What Other Teams Need to Do

### 1. Populate the `updated_by` Column
While the database captures the *what* and *when*, it only knows *who* made the change if you tell it.
- **Action:** In your `UPDATE` queries, please ensure you populate the `updated_by` column with the current user's name, email, or ID.
- **Why:** This ensures the `customer_history` table reflects the correct person responsible for the change.

### 2. Schema Coordination
If you add a new column to the `customer` table (e.g., `loyalty_points`):
- **Action A:** Add that same column to the `customer_history` table.
- **Action B:** Update the `archive_customer_history()` trigger function to include the new field in the `INSERT` statement.
- **Why:** If skipped, history tracking for that specific field will be broken.

### 3. Versioning
The database automatically handles the `version` column. You do **not** need to manually increment it. Every `UPDATE` will automatically bump the version number.

---

## Technical Details

### Tables
- **Main Table:** `customer` (Contains the current state of all customers)
- **Archive Table:** `customer_history` (Contains snapshots of every previous version)

### Postgres Trigger Logic (For Reference)
The following logic is currently active in the database:

```sql
CREATE OR REPLACE FUNCTION archive_customer_history()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'UPDATE') THEN
        INSERT INTO customer_history (
            customer_id, name, email, phone, address, 
            city, state, postcode, ic_number, notes, 
            version, changed_by, change_operation, changed_at
        )
        VALUES (
            OLD.id, OLD.name, OLD.email, OLD.phone, OLD.address, 
            OLD.city, OLD.state, OLD.postcode, OLD.ic_number, OLD.notes, 
            OLD.version, OLD.updated_by, 'UPDATE', NOW()
        );
        
        NEW.version := OLD.version + 1;
        RETURN NEW;
        
    ELSIF (TG_OP = 'DELETE') THEN
        INSERT INTO customer_history (
            customer_id, name, email, phone, address, 
            city, state, postcode, ic_number, notes, 
            version, changed_by, change_operation, changed_at
        )
        VALUES (
            OLD.id, OLD.name, OLD.email, OLD.phone, OLD.address, 
            OLD.city, OLD.state, OLD.postcode, OLD.ic_number, OLD.notes, 
            OLD.version, OLD.updated_by, 'DELETE', NOW()
        );
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_customer_history
BEFORE UPDATE OR DELETE ON customer
FOR EACH ROW EXECUTE FUNCTION archive_customer_history();
```

# Relationship Validator System

## Overview

The Relationship Validator system validates and rebuilds database relationships after JSON sync operations. It ensures all `linked_*` fields reference existing records in the database and provides detailed error reporting for missing data.

## Features

### 1. **Comprehensive Validation**
- Validates relationships across 7 tables:
  - `invoice` (6 relationship types)
  - `payment` (4 relationship types)
  - `submitted_payment` (4 relationship types)
  - `seda_registration` (3 relationship types)
  - `invoice_item` (2 relationship types)
  - `user` (1 relationship type)
  - `customer` (validated as referenced table)
  - `agent` (validated as referenced table)

### 2. **Two Operation Modes**
- **Validate Only**: Checks relationships and reports errors without making changes
- **Validate & Fix**: Checks relationships and automatically removes invalid references

### 3. **Persistent Error Reporting**
- Generates detailed validation reports with:
  - Total relationships checked
  - Total errors found
  - Errors grouped by table
  - Individual error details with bubble IDs
- Saves reports in multiple formats:
  - JSON (machine-readable)
  - TXT (human-readable)
  - CSV (for data analysis)

### 4. **Performance Optimized**
- Pre-loads all bubble_ids into Sets for O(1) lookup performance
- Batch validation prevents N+1 queries
- Efficient array operations for linked_* fields

## Architecture

### Core Files

#### 1. **src/lib/relationship-validator.ts** (924 lines)
Core validation logic that:
- Pre-loads all existing bubble_ids from all tables
- Validates each table's relationships
- Provides granular error reporting
- Supports both validate-only and fix modes

#### 2. **src/app/sync/actions/relationship-rebuild.ts** (291 lines)
Server actions that:
- Expose validation functionality to the UI
- Handle logging and error reporting
- Save reports to files
- Provide convenience methods (quickValidation, fullRebuild)

#### 3. **src/app/sync/components/forms/RelationshipValidatorForm.tsx** (279 lines)
UI component with:
- Mode selection (Validate Only / Validate & Fix)
- Table selection (can choose specific tables or all)
- Real-time progress indicators
- Results display with error details

## Usage

### From the UI

1. Navigate to `/sync` page
2. Find the "Relationship Validator" section
3. Choose operation mode:
   - **Validate Only**: Safe check, no changes
   - **Validate & Fix**: Removes invalid references
4. Optionally select specific tables to check
5. Click the validation button
6. Review results and error details

### From Code

```typescript
import { runRelationshipValidation } from '@/app/sync/actions/relationship-rebuild';

// Validate only
const result = await runRelationshipValidation({
  validate_only: true,
  fix_broken_links: false
});

// Validate and fix all
const result = await runRelationshipValidation({
  validate_only: false,
  fix_broken_links: true,
  log_to_file: true
});

// Validate specific tables
const result = await runRelationshipValidation({
  validate_only: true,
  tables: ['invoice', 'payment']
});
```

## Validation Details

### Invoice Table
Validates:
- `linked_customer` → customer.customer_id
- `linked_agent` → agent.bubble_id
- `linked_payment[]` → payment.bubble_id OR submitted_payment.bubble_id
- `linked_seda_registration` → seda_registration.bubble_id
- `linked_invoice_item[]` → invoice_item.bubble_id
- `created_by` → user.bubble_id

### Payment Table
Validates:
- `linked_invoice` → invoice.bubble_id
- `linked_customer` → customer.customer_id
- `linked_agent` → agent.bubble_id
- `created_by` → user.bubble_id

### Submitted Payment Table
Validates:
- `linked_invoice` → invoice.bubble_id
- `linked_customer` → customer.customer_id
- `linked_agent` → agent.bubble_id
- `created_by` → user.bubble_id

### SEDA Registration Table
Validates:
- `linked_customer` → customer.customer_id
- `linked_invoice[]` → invoice.bubble_id
- `created_by` → user.bubble_id

### Invoice Item Table
Validates:
- `linked_invoice` → invoice.bubble_id
- `created_by` → user.bubble_id

### User Table
Validates:
- `linked_agent_profile` → agent.bubble_id

## Error Report Format

### JSON Report Structure
```json
{
  "started_at": "2026-01-25T10:30:00.000Z",
  "completed_at": "2026-01-25T10:30:15.000Z",
  "total_records_checked": 1250,
  "total_relationships_checked": 4500,
  "total_errors": 23,
  "errors_by_table": {
    "invoice": 10,
    "payment": 8,
    "seda_registration": 5
  },
  "errors": [
    {
      "table": "invoice",
      "record_id": 123,
      "bubble_id": "1234567890x123456789012345678",
      "field": "linked_customer",
      "referenced_bubble_id": "9876543210x987654321098765432",
      "referenced_table": "customer",
      "error": "Customer 9876543210x987654321098765432 not found in database",
      "timestamp": "2026-01-25T10:30:05.000Z"
    }
  ],
  "fixed_relationships": 0,
  "summary": "Validation complete. Found 23 errors across 3 tables."
}
```

### Text Report Format
```
================================================================================
RELATIONSHIP VALIDATION REPORT
================================================================================

Started:  2026-01-25T10:30:00.000Z
Completed: 2026-01-25T10:30:15.000Z
Duration: 15.23s

================================================================================
SUMMARY
================================================================================

Total relationships checked: 4500
Total errors found: 23
Relationships fixed: 0

Errors by table:
  invoice                   10
  payment                   8
  seda_registration         5

================================================================================
DETAILED ERRORS
================================================================================

1. invoice (ID: 123, Bubble ID: 1234567890x123456789012345678)
   Field: linked_customer
   Referenced: 9876543210x987654321098765432 (customer)
   Error: Customer 9876543210x987654321098765432 not found in database
   Time: 2026-01-25T10:30:05.000Z

...
```

## Report Storage

Reports are saved to:
```
logs/relationship-validation/
├── relationship-validation-2026-01-25T10-30-00-000Z.json
├── relationship-validation-2026-01-25T10-30-00-000Z.txt
└── relationship-validation-2026-01-25T10-30-00-000Z.csv
```

## Best Practices

### When to Validate

1. **After JSON Sync**: Always validate after syncing data from JSON files
2. **After Bulk Operations**: Validate after bulk imports or data migrations
3. **Periodic Checks**: Run validation weekly to catch data integrity issues
4. **Before Deployments**: Validate before major deployments to ensure data consistency

### Validation vs Fix Mode

- Use **Validate Only** first to assess the scope of issues
- Review the error report to understand what data is missing
- Use **Validate & Fix** only after confirming it's safe to remove invalid references
- Always backup the database before running fix mode on production

### Table Selection

- Check all tables after a complete JSON sync
- Check specific tables after targeted operations (e.g., only invoice and payment tables after payment sync)
- Use table selection to speed up validation when you know which tables are affected

## Troubleshooting

### Common Issues

**Issue**: Validation finds many errors
- **Cause**: Missing records in referenced tables
- **Solution**: Sync the referenced tables first (e.g., sync customers before invoices)

**Issue**: Validation is slow
- **Cause**: Large number of records
- **Solution**: Use table selection to validate only affected tables

**Issue**: Fix mode removes important data
- **Cause**: Referenced records are genuinely missing
- **Solution**: Sync missing records first, then validate again

## Integration Points

### Sync Workflow
```
1. Sync JSON data (invoice, payment, etc.)
2. Run relationship validation
3. Review error report
4. If errors found:
   a. Identify missing records
   b. Sync missing records
   c. Validate again
5. If no errors or acceptable errors:
   a. Optionally run fix mode to clean up
```

### Logging
All validation operations are logged to:
- Sync logs (visible in UI)
- Detailed reports (saved to disk)
- Console (for debugging)

## API Reference

### Server Actions

#### `runRelationshipValidation(options)`
Main validation function
- **Parameters**: `RebuildOptions`
- **Returns**: `{ success: boolean; report?: ValidationReport; error?: string }`

#### `quickValidation()`
Convenience method for validate-only mode

#### `fullRebuild()`
Convenience method for validate and fix mode

#### `validateSpecificTables(tables)`
Validate only specified tables

#### `rebuildSpecificTables(tables)`
Validate and fix only specified tables

#### `getRecentReports()`
Get list of recent validation reports

#### `getValidationReport(filename)`
Retrieve a specific validation report

#### `exportErrorsAsCSV(report)`
Export errors as CSV file

## Future Enhancements

Potential improvements:
1. **Automatic Sync Suggestions**: Suggest which tables to sync based on validation errors
2. **Scheduled Validation**: Automatically run validation on a schedule
3. **Email Notifications**: Send email alerts when validation finds critical errors
4. **Historical Trends**: Track validation errors over time
5. **Relationship Visualization**: Visual graph of relationship dependencies
6. **Smart Fix Mode**: Attempt to resolve some errors automatically (e.g., find similar records)

## Support

For issues or questions:
1. Check the logs in `/logs/relationship-validation/`
2. Review the error details in the validation report
3. Check the sync logs for context
4. Verify database connectivity and permissions

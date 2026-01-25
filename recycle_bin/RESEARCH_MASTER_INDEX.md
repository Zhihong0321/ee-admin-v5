# BUBBLE SYNC RESEARCH - MASTER INDEX

**Session Date**: 2026-01-19
**Goal**: Fix all Bubble sync issues once and for all
**Status**: Phase 1 - Complete Schema Audit

---

## QUICK START: What You Need to Know

### The Problem
```
Every sync function causes DATA LOSS because:
1. Only partial fields are mapped (avg 48% coverage)
2. onConflictDoUpdate NULLIFIES unmapped fields
3. Column names don't match (e.g., "first_payment" vs "1st_payment")
4. Some tables use wrong Bubble object names
```

### The Scope
```
7 relational tables link to invoice:
1. invoice              ✅ AUDITED - 38% coverage
2. seda_registration    🔴 CRITICAL - 23% coverage
3. payment              🔴 CRITICAL - 36% coverage
4. agent                🟠 BAD - 54% coverage
5. customer (Customer_Profile) 🟠 BAD - 58% coverage
6. user                 🟠 BAD - 69% coverage
7. submit_payment       🟡 OK - 78% coverage

Plus 2 more tables:
8. invoice_item         ❌ Can't find Bubble object
9. invoice_template     ❌ Can't find Bubble object
```

### Files Created (This Session)

| File | Purpose |
|------|---------|
| `SCHEMA_AUDIT_RESULTS.json` | Raw audit data |
| `BUBBLE_FIELD_MAPPING_ANALYSIS.md` | Complete schema analysis |
| `audit-schema.js` | Audit script (run anytime) |
| `test-field-mapping.js` | Test mapping with real data |
| `src/lib/bubble-field-mappings.ts` | Invoice field mappings (CORRECTED) |
| `CRITICAL_BUG_FIX_COLUMN_MAPPING.md` | Bug fix documentation |
| `RELATIONAL_TABLES_GAP_ANALYSIS.md` | Relational tables gap analysis |
| `audit-relational-tables.js` | Audit all relational tables |
| `detailed-relational-audit.js` | Get exact Bubble field lists |
| `RESEARCH_MASTER_INDEX.md` | THIS FILE |

---

## SESSION TIMELINE

### Discovery Phase
1. **User asks**: "how many column in table invoice = relational data"
2. **I analyzed**: Found invoice has 7 relational fields
3. **User asks**: "prove you understand the SCHEMA"
4. **I created**: Schema audit showing 107 columns vs 27 in schema.ts
5. **User identifies**: "you map between 2 same column with same name right?"
6. **I discovered**: CRITICAL BUG - was mapping to non-existent columns!
7. **I fixed**: Corrected 3 payment field mappings
8. **User asks**: "did you perform check, mapping on other table that link to invoice?"
9. **I realized**: ONLY checked invoice, NOT the 7 relational tables!
10. **User chooses**: Option A - Audit ALL tables completely

---

## DATABASE CONNECTION INFO

**Postgres**:
```
Host: shinkansen.proxy.rlwy.net
Port: 34999
Database: railway
User: postgres
Password: tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA
Connection String: postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway
```

**Bubble API**:
```
Base URL: https://eternalgy.bubbleapps.io/api/1.1/obj
API Key: b870d2b5ee6e6b39bcf99409c59c9e02
```

---

## KEY FINDINGS

### 1. Invoice Table (107 columns)
```
✅ AUDITED
✅ MAPPING CORRECTED
⚠️  3 columns need creation: percent_of_total_amount, 1st_payment_%, 2nd_payment_%

Bubble Fields: 39
Postgres Columns: 107
Current Sync Coverage: 38% (15/39 fields)
Fixed Mapping Coverage: 100% (39/39 fields)
```

**Critical Bug Fixed**:
```typescript
// WRONG (before):
'1st Payment %': { column: 'first_payment_percent', ... }  // ❌ Doesn't exist

// CORRECT (after):
'1st Payment %': { column: '1st_payment', type: 'integer' }  // ✅ Exists
```

### 2. invoice_item Table (20 columns, 15,961 rows)
```
❌ NOT IN schema.ts (CRITICAL FAILURE)
✅ EXISTS in Postgres
❌ Can't find Bubble object name (tried: invoice_new_item, invoice_item)

Postgres Columns: 20
Rows: 15,961
Bubble Object: ??? (404 on all attempts)
```

### 3. seda_registration Table (69 columns)
```
🔴 WORST OFFENDER - 77% DATA LOSS

Bubble Fields: 16
Postgres Columns: 69
Current Sync Coverage: 23% (8/69 fields mapped!)
Missing: 53 fields NOT being synced
```

**Bubble Object Name**: `seda_registration` ✅ (verified)

### 4. payment Table (25 columns, 2,578 rows)
```
🔴 BAD - 64% DATA LOSS

Bubble Fields: 9
Postgres Columns: 25
Current Sync Coverage: 36% (9/25 fields)
Missing: 16 fields
```

### 5. submit_payment Table (18 columns, 3 rows)
```
🟡 BEST SO FAR - 78% coverage

Bubble Fields: 14
Postgres Columns: 18
Current Sync Coverage: 78%
Missing: 4 fields
```

### 6. agent Table (26 columns, 161 rows)
```
🟠 MEDIUM - 46% DATA LOSS

Bubble Fields: 14
Postgres Columns: 26
Current Sync Coverage: 54%
Missing: 12 fields
```

### 7. customer / Customer_Profile (19 columns, 4,494 rows)
```
🟠 MEDIUM - 42% DATA LOSS

Bubble Object: Customer_Profile ✅ (not "customer")
Bubble Fields: 11
Postgres Columns: 19
Current Sync Coverage: 58%
Missing: 8 fields
```

### 8. user Table (16 columns, 1 row)
```
🟠 MEDIUM - 31% DATA LOSS

Bubble Fields: 11
Postgres Columns: 16
Current Sync Coverage: 69%
Missing: 5 fields
```

---

## DEPENDENCY GRAPH (Sync Order Required)

```
LEVEL 0 (No dependencies):
  • agents
  • customers (Customer_Profile)
  • invoice_templates

LEVEL 1 (Depends on Level 0):
  • users (via agents.linked_user_login)

LEVEL 2 (Depends on Level 0-1):
  • invoices (needs: customer, agent, created_by, template)

LEVEL 3 (Depends on Level 2):
  • payments (needs: invoice, customer, agent)
  • submitted_payments (same)
  • invoice_items (needs: invoice)

LEVEL 4 (Depends on Level 2-3):
  • seda_registration (needs: customer, has back-link to invoice)
```

**CRITICAL**: Must sync in this order or FK violations will occur!

---

## CURRENT SYNC FUNCTIONS (ALL BUGGY)

### File: `src/lib/bubble.ts`

#### syncCompleteInvoicePackage() - Line 175
```typescript
// PROBLEMS:
1. Only maps 15/39 invoice fields (38%)
2. Only maps 8/69 seda_registration fields (11%!)
3. Uses wrong object name for customer ("Customer_Profile" works but inconsistent)
4. Every onConflictDoUpdate causes data loss
```

#### syncInvoicePackageWithRelations() - Line 531
```typescript
// PROBLEMS:
1. More complete but still partial
2. Checks timestamps correctly ✓
3. Still has field gaps
```

---

## FIELD MAPPING STRATEGY (LESSONS LEARNED)

### ❌ WRONG Approach
```typescript
// Assume nice snake_case names
'1st Payment %': { column: 'first_payment_percent' }
```

### ✅ CORRECT Approach
```typescript
// ALWAYS verify against actual Postgres schema
'1st Payment %': { column: '1st_payment' }  // Keep original naming
```

### Process for Each Table:
1. Get ALL Postgres column names from information_schema
2. Fetch sample record from Bubble
3. Get ALL Bubble field names
4. Map Bubble field → Postgres column ONE BY ONE
5. Verify column EXISTS in Postgres
6. Test with real data
7. Handle data type conversions

---

## KNOWN UNKNOWN: Missing Bubble Objects

### invoice_item
```
Tried:
• invoice_item → 404
• invoice_new_item → 404
• Invoice_Item → 404
• Invoice Item → 404

Need to find correct name!
```

### invoice_template
```
Tried:
• invoice_template → 404
• Invoice Template → 404
• Invoice_Template → 404

Need to find correct name!
```

---

## NEXT STEPS (Option A)

### Phase 1A: Complete All Table Audits (IN PROGRESS)
- [ ] seda_registration - Complete field mapping
- [ ] payment - Complete field mapping
- [ ] agent - Complete field mapping
- [ ] Customer_Profile - Complete field mapping
- [ ] user - Complete field mapping
- [ ] submit_payment - Complete field mapping
- [ ] invoice_item - Find Bubble object name + mapping
- [ ] invoice_template - Find Bubble object name + mapping

### Phase 1B: Create Complete Mapping File
- [ ] `src/lib/bubble-field-mappings-complete.ts`
- [ ] ALL tables mapped
- [ ] ALL column names verified
- [ ] Type conversions handled

### Phase 2: Integrity Sync Function
- [ ] `syncInvoiceWithFullIntegrity()`
- [ ] Dependency-aware sync order
- [ ] MERGE logic (no data loss)

---

## SCRIPTS TO RUN

### Audit Scripts
```bash
# Re-audit invoice table
node audit-schema.js

# Audit all relational tables
node audit-relational-tables.js

# Get detailed Bubble field lists
node detailed-relational-audit.js

# Test invoice field mapping
node test-field-mapping.js

# Verify column names
node check-column-names.js

# Check actual data in Postgres
node check-actual-data.js
```

---

## CRITICAL WARNINGS

### ⚠️ NEVER Assume Column Names
Always verify against `information_schema.columns`

### ⚠️ NEVER Use Partial Mappings
`onConflictDoUpdate` with partial data = data loss

### ⚠️ NEVER Sync Out of Order
Respect dependency graph or FK violations occur

### ⚠️ NEVER Trust schema.ts
Postgres has 4x more columns than defined in code

---

## SESSION OUTPUT

All files created in this session are saved to:
```
E:\ee-admin-v5\
├── SCHEMA_AUDIT_RESULTS.json
├── BUBBLE_FIELD_MAPPING_ANALYSIS.md
├── PHASE_1B_COMPLETE.md
├── CRITICAL_BUG_FIX_COLUMN_MAPPING.md
├── RELATIONAL_TABLES_GAP_ANALYSIS.md
├── RESEARCH_MASTER_INDEX.md (THIS FILE)
├── audit-schema.js
├── test-field-mapping.js
├── check-column-names.js
├── check-actual-data.js
├── audit-relational-tables.js
├── detailed-relational-audit.js
└── src/lib/bubble-field-mappings.ts
```

---

## FOR NEXT SESSION

Start here: Read this file first to understand:
1. What was discovered
2. What was fixed
3. What remains to be done
4. How to continue the work

Then read: `RELATIONAL_TABLES_GAP_ANALYSIS.md` for detailed gap analysis.

Then run: `node audit-relational-tables.js` to refresh audit data.

---

**END OF MASTER INDEX**

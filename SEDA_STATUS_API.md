# SEDA Status API

## Endpoint

```http
POST https://admin.atap.solar/api/v1/seda/status
```

This endpoint finds an existing SEDA registration using the customer name and installation address, then updates its SEDA status.

## Authentication

Send the production API key as a Bearer token:

```http
Authorization: Bearer <SEDA_API_KEY>
Content-Type: application/json
```

`X-API-Key: <SEDA_API_KEY>` is also accepted.

The API key should be shared through a secure channel, not committed to source code or placed in a public document.

## Request body

```json
{
  "name": "Customer Name",
  "address": "Full SEDA installation address",
  "status": "Submitted",
  "dry_run": true
}
```

Fields:

| Field | Type | Required | Description |
|---|---|---:|---|
| `name` | string | Yes | Customer or SEDA registration name. |
| `address` | string | Yes | SEDA installation address. |
| `status` | string | Yes | `Pending`, `Submitted`, `Approved`, or `APPROVED BY SEDA`. |
| `dry_run` | boolean | No | Defaults to `false`. When `true`, performs matching without updating data. |

Status values are case-insensitive for matching and are stored using the system’s canonical spelling.

## Matching behavior

The API normalizes punctuation, spacing, case, and common formatting differences, then calculates separate name and address similarity scores.

An update is allowed only when all conditions pass:

- Overall score is at least `0.90`.
- Name score is at least `0.85`.
- Address score is at least `0.85`.
- The best candidate leads the second-best candidate by at least `0.05`.

If the match is uncertain, the API does not change any status.

## Successful response

```json
{
  "success": true,
  "matched": true,
  "dry_run": false,
  "seda_bubble_id": "1647839483923x8394832",
  "previous_status": "Pending",
  "status": "Submitted",
  "name_score": 0.97,
  "address_score": 0.94,
  "score": 0.954,
  "score_margin": 0.18,
  "updated": true
}
```

When `dry_run` is `true`, `updated` is always `false`.

## Error responses

### Missing or invalid key — `401`

```json
{
  "error": "Invalid API key"
}
```

### API key is not configured — `503`

The production service has not received its `SEDA_API_KEY` deployment variable yet.

### No match — `404`

No candidate reached the 90% threshold. The response includes the strongest candidates and their scores.

### Ambiguous match — `409`

More than one candidate is too close, or one of the individual field scores is below the safe minimum. No status is changed.

### Invalid input — `400`

The request is missing `name`, `address`, or a supported `status`.

## Test first with dry run

```bash
export SEDA_API_KEY="<provided-securely>"

curl -X POST "https://admin.atap.solar/api/v1/seda/status" \
  -H "Authorization: Bearer ${SEDA_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Customer Name",
    "address": "Full SEDA installation address",
    "status": "Submitted",
    "dry_run": true
  }'
```

After the dry-run response confirms the correct `seda_bubble_id` and score, remove `dry_run` or set it to `false` to perform the update.

## Audit behavior

Every real status change is recorded in the shared invoice audit log with the previous status, new status, match score, and source `external-seda-api`.

## Documentation page

Interactive API documentation is available at:

```text
https://admin.atap.solar/api-doc
```

"use server";

/**
 * ============================================================================
 * RELATIONSHIP VALIDATION & REBUILD ACTIONS
 * ============================================================================
 * 
 * Server actions for validating and rebuilding relationships after JSON sync.
 * Provides comprehensive error reporting and automatic fixing of broken links.
 * 
 * File: src/app/sync/actions/relationship-rebuild.ts
 */

import { 
  validateAndRebuildRelationships,
  type ValidationReport,
  type RebuildOptions 
} from "@/lib/relationship-validator";
import { logSyncActivity } from "@/lib/logger";
import { revalidatePath } from "next/cache";
import fs from "fs/promises";
import path from "path";

// ============================================================================
// ACTION: Run Relationship Validation
// ============================================================================

/**
 * Validate all relationships and optionally fix broken links
 * 
 * @param options - Validation options
 * @returns Validation report with errors and statistics
 */
export async function runRelationshipValidation(
  options: RebuildOptions = {}
): Promise<{ success: boolean; report?: ValidationReport; error?: string }> {
  logSyncActivity(`🔍 Starting relationship validation...`, 'INFO');
  logSyncActivity(`Options: ${JSON.stringify(options)}`, 'INFO');

  try {
    const report = await validateAndRebuildRelationships(options);

    // Log summary
    logSyncActivity(`✅ Validation complete: ${report.total_errors} errors found`, 
      report.total_errors > 0 ? 'WARN' : 'INFO');
    
    if (options.fix_broken_links && report.fixed_relationships > 0) {
      logSyncActivity(`🔧 Fixed ${report.fixed_relationships} broken relationships`, 'INFO');
    }

    // Save detailed report to file if requested
    if (options.log_to_file) {
      const reportPath = await saveReportToFile(report);
      logSyncActivity(`📄 Detailed report saved to: ${reportPath}`, 'INFO');
    }

    // Revalidate affected pages
    revalidatePath("/sync");
    revalidatePath("/invoices");
    revalidatePath("/payments");
    revalidatePath("/customers");
    revalidatePath("/seda");

    return { success: true, report };

  } catch (error) {
    const errorMsg = `Relationship validation failed: ${String(error)}`;
    logSyncActivity(`❌ ${errorMsg}`, 'ERROR');
    return { success: false, error: errorMsg };
  }
}

/**
 * Quick validation - only checks without fixing
 */
export async function quickValidation() {
  return runRelationshipValidation({
    validate_only: true,
    fix_broken_links: false
  });
}

/**
 * Full rebuild - validates and fixes all broken links
 */
export async function fullRebuild() {
  return runRelationshipValidation({
    validate_only: false,
    fix_broken_links: true,
    log_to_file: true
  });
}

/**
 * Validate specific tables only
 */
export async function validateSpecificTables(tables: string[]) {
  return runRelationshipValidation({
    validate_only: true,
    fix_broken_links: false,
    tables
  });
}

/**
 * Rebuild specific tables
 */
export async function rebuildSpecificTables(tables: string[]) {
  return runRelationshipValidation({
    validate_only: false,
    fix_broken_links: true,
    tables,
    log_to_file: true
  });
}

// ============================================================================
// HELPER: Save Report to File
// ============================================================================

async function saveReportToFile(report: ValidationReport): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `relationship-validation-${timestamp}.json`;
  const reportDir = path.join(process.cwd(), 'logs', 'relationship-validation');
  
  // Ensure directory exists
  await fs.mkdir(reportDir, { recursive: true });
  
  const filepath = path.join(reportDir, filename);
  
  // Save full report
  await fs.writeFile(filepath, JSON.stringify(report, null, 2), 'utf-8');
  
  // Also save a human-readable summary
  const summaryFilename = `relationship-validation-${timestamp}.txt`;
  const summaryPath = path.join(reportDir, summaryFilename);
  
  const summaryContent = `
================================================================================
RELATIONSHIP VALIDATION REPORT
================================================================================

Started:  ${report.started_at.toISOString()}
Completed: ${report.completed_at.toISOString()}
Duration: ${((report.completed_at.getTime() - report.started_at.getTime()) / 1000).toFixed(2)}s

================================================================================
SUMMARY
================================================================================

Total relationships checked: ${report.total_relationships_checked}
Total errors found: ${report.total_errors}
Relationships fixed: ${report.fixed_relationships}

Errors by table:
${Object.entries(report.errors_by_table)
  .map(([table, count]) => `  ${table.padEnd(25)} ${count}`)
  .join('\n')}

================================================================================
DETAILED ERRORS
================================================================================

${report.errors.length === 0 ? '✅ No errors found! All relationships are valid.' : ''}
${report.errors.map((err, idx) => `
${idx + 1}. ${err.table} (ID: ${err.record_id}, Bubble ID: ${err.bubble_id})
   Field: ${err.field}
   Referenced: ${err.referenced_bubble_id} (${err.referenced_table})
   Error: ${err.error}
   Time: ${err.timestamp.toISOString()}
`).join('\n')}

================================================================================
END OF REPORT
================================================================================
`;

  await fs.writeFile(summaryPath, summaryContent, 'utf-8');
  
  return filepath;
}

// ============================================================================
// ACTION: Get Recent Validation Reports
// ============================================================================

/**
 * Get list of recent validation reports
 */
export async function getRecentReports(): Promise<{
  success: boolean;
  reports?: Array<{ filename: string; timestamp: Date; size: number }>;
  error?: string;
}> {
  try {
    const reportDir = path.join(process.cwd(), 'logs', 'relationship-validation');
    
    // Check if directory exists
    try {
      await fs.access(reportDir);
    } catch {
      return { success: true, reports: [] };
    }

    const files = await fs.readdir(reportDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));
    
    const reports = await Promise.all(
      jsonFiles.map(async (filename) => {
        const filepath = path.join(reportDir, filename);
        const stats = await fs.stat(filepath);
        return {
          filename,
          timestamp: stats.mtime,
          size: stats.size
        };
      })
    );

    // Sort by timestamp descending
    reports.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return { success: true, reports };

  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Get specific validation report
 */
export async function getValidationReport(filename: string): Promise<{
  success: boolean;
  report?: ValidationReport;
  error?: string;
}> {
  try {
    const reportDir = path.join(process.cwd(), 'logs', 'relationship-validation');
    const filepath = path.join(reportDir, filename);
    
    const content = await fs.readFile(filepath, 'utf-8');
    const report = JSON.parse(content) as ValidationReport;
    
    return { success: true, report };

  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// ============================================================================
// ACTION: Export Errors as CSV
// ============================================================================

/**
 * Export validation errors as CSV for analysis
 */
export async function exportErrorsAsCSV(report: ValidationReport): Promise<{
  success: boolean;
  filepath?: string;
  error?: string;
}> {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `relationship-errors-${timestamp}.csv`;
    const reportDir = path.join(process.cwd(), 'logs', 'relationship-validation');
    
    await fs.mkdir(reportDir, { recursive: true });
    
    const filepath = path.join(reportDir, filename);
    
    // CSV header
    const header = 'Table,Record ID,Bubble ID,Field,Referenced Bubble ID,Referenced Table,Error,Timestamp\n';
    
    // CSV rows
    const rows = report.errors.map(err => 
      `"${err.table}",${err.record_id},"${err.bubble_id}","${err.field}","${err.referenced_bubble_id}","${err.referenced_table}","${err.error}","${err.timestamp.toISOString()}"`
    ).join('\n');
    
    await fs.writeFile(filepath, header + rows, 'utf-8');
    
    logSyncActivity(`📊 Errors exported to CSV: ${filepath}`, 'INFO');
    
    return { success: true, filepath };

  } catch (error) {
    return { success: false, error: String(error) };
  }
}

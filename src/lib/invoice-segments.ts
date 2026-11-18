// Preset customer segments an admin can pick for an invoice (invoice.customer_segment).
// Stored as lowercase values; shown with the label.
export const INVOICE_SEGMENT_OPTIONS = ["residential", "commercial", "factory"] as const;

export type InvoiceSegment = (typeof INVOICE_SEGMENT_OPTIONS)[number];

export const INVOICE_SEGMENT_LABELS: Record<InvoiceSegment, string> = {
  residential: "Residential",
  commercial: "Commercial",
  factory: "Factory",
};

interface InvoiceDisplayRecord {
  invoice_id?: number | string | null;
  invoice_number?: string | null;
}

function hasValue(value: number | string | null | undefined) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

export function getInvoiceIdDisplay(invoice?: InvoiceDisplayRecord | null) {
  if (hasValue(invoice?.invoice_id)) {
    return String(invoice?.invoice_id);
  }

  return "N/A";
}

export function getInvoiceNumberDisplay(invoice?: InvoiceDisplayRecord | null) {
  if (hasValue(invoice?.invoice_number)) {
    return String(invoice?.invoice_number);
  }

  if (hasValue(invoice?.invoice_id)) {
    return `INV-${invoice?.invoice_id}`;
  }

  return null;
}

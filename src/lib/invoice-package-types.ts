// Preset package types an admin can pick for an invoice (invoice.package_type).
// Matches the package.type values used in the package catalogue.
export const INVOICE_PACKAGE_TYPE_OPTIONS = [
  "Residential",
  "Tariff B&D Low Voltage",
  "Special / Roadshow",
  "EV Charger",
] as const;

export type InvoicePackageType = (typeof INVOICE_PACKAGE_TYPE_OPTIONS)[number];

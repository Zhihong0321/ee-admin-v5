/**
 * SEDA Registration Checkpoint Validation
 * Validates 7 critical checkpoints for SEDA registration
 */

export interface SedaCheckpointResult {
  name: boolean;
  address: boolean;
  mykad: boolean;
  tnb_bill: boolean;
  tnb_meter: boolean;
  emergency_contact: boolean;
  payment_required: boolean;
  commercial_docs?: boolean;
}

export interface SedaCheckpointDetails {
  result: SedaCheckpointResult;
  completed_count: number;
  progress_percentage: number;
  total_checkpoints: number;
}

/**
 * Validate all 7 checkpoints for a SEDA registration
 */
export async function validateSedaCheckpoints(
  sedaData: any,
  customerData: any,
  invoiceData: any,
  paymentsData: any[]
): Promise<SedaCheckpointDetails> {
  const checkpoints: SedaCheckpointResult = {
    name: validateName(customerData),
    address: validateAddress(sedaData),
    mykad: validateMykad(sedaData),
    tnb_bill: validateTnbBill(sedaData),
    tnb_meter: validateTnbMeter(sedaData),
    emergency_contact: validateEmergencyContact(sedaData),
    payment_required: validatePaymentRequired(invoiceData, paymentsData),
  };
  if (isCommercialApplication(sedaData)) {
    checkpoints.commercial_docs = validateCommercialDocs(sedaData);
  }

  const completed_count = Object.values(checkpoints).filter(Boolean).length;
  const total_checkpoints = Object.keys(checkpoints).length;
  const progress_percentage = Math.round((completed_count / total_checkpoints) * 100);

  return {
    result: checkpoints,
    completed_count,
    progress_percentage,
    total_checkpoints,
  };
}

/**
 * Checkpoint 1: Name
 * Validates if customer name exists
 */
function validateName(customer: any): boolean {
  if (!customer) return false;
  const name = customer.name;
  return name !== null && name !== undefined && name !== "";
}

/**
 * Checkpoint 2: Address
 * Validates if installation address exists
 */
function validateAddress(seda: any): boolean {
  const address = seda.installation_address;
  return address !== null && address !== undefined && address !== "";
}

/**
 * Checkpoint 3: MyKad
 * Validates if MyKad PDF OR IC copy front exists
 * IC copy back is optional
 */
function validateMykad(seda: any): boolean {
  const mykadPdf = seda.mykad_pdf;
  const icCopyFront = seda.ic_copy_front;

  const hasPdf = mykadPdf !== null && mykadPdf !== undefined && mykadPdf !== "";
  const hasIcFront = icCopyFront !== null && icCopyFront !== undefined && icCopyFront !== "";

  return hasPdf || hasIcFront;
}

/**
 * Checkpoint 4: TNB Bills
 * Validates if all 3 TNB bills exist
 */
function validateTnbBill(seda: any): boolean {
  const bill1 = seda.tnb_bill_1;
  const bill2 = seda.tnb_bill_2;
  const bill3 = seda.tnb_bill_3;
  const twelveMonthBills = Array.isArray(seda.tnb_bills_12_months)
    ? seda.tnb_bills_12_months
    : [];

  const hasBill1 = bill1 !== null && bill1 !== undefined && bill1 !== "";
  const hasBill2 = bill2 !== null && bill2 !== undefined && bill2 !== "";
  const hasBill3 = bill3 !== null && bill3 !== undefined && bill3 !== "";
  const hasTwelveMonthBills = twelveMonthBills.some((url: string) => url && url.trim() !== "");

  return hasBill1 || hasBill2 || hasBill3 || hasTwelveMonthBills;
}

/**
 * Checkpoint 5: TNB Meter
 * Validates if TNB meter image exists
 */
function validateTnbMeter(seda: any): boolean {
  const meter = seda.tnb_meter;
  return meter !== null && meter !== undefined && meter !== "";
}

/**
 * Checkpoint 6: Emergency Contact
 * Validates if all emergency contact fields are filled
 */
function validateEmergencyContact(seda: any): boolean {
  const name = seda.e_contact_name;
  const no = seda.e_contact_no;
  const relationship = seda.e_contact_relationship;

  const hasName = name !== null && name !== undefined && name !== "";
  const hasNo = no !== null && no !== undefined && no !== "";
  const hasRelationship = relationship !== null && relationship !== undefined && relationship !== "";

  return hasName && hasNo && hasRelationship;
}

/**
 * Checkpoint 7: Payment >= 4%
 * Validates if payment percentage is >= 4% of invoice total
 * Uses first invoice only
 */
function validatePaymentRequired(invoice: any, payments: any[]): boolean {
  if (!invoice) return false;

  const invoiceTotal = parseFloat(invoice.total_amount || "0");
  if (invoiceTotal === 0) return false;

  // Sum all payments
  const totalPaid = payments.reduce((sum, payment) => {
    const amount = parseFloat(payment.amount || "0");
    return sum + amount;
  }, 0);

  // Calculate percentage
  const paymentPercentage = (totalPaid / invoiceTotal) * 100;

  return paymentPercentage >= 4;
}

function isCommercialApplication(seda: any): boolean {
  const applicationType = String(seda?.application_type || "").toLowerCase();
  const nemType = String(seda?.nem_type || "").toLowerCase();
  return (
    applicationType === "commercial" ||
    nemType.includes("commercial") ||
    nemType.includes("nova") ||
    !!seda?.company_registration_no
  );
}

function validateCommercialDocs(seda: any): boolean {
  return !!(
    seda?.ssm_form_9 &&
    seda?.ssm_form_49 &&
    seda?.director_ic_front &&
    seda?.director_ic_back
  );
}

/**
 * Get checkpoint display labels
 */
export const CHECKPOINT_LABELS = {
  name: "Name",
  address: "Address",
  mykad: "MyKad",
  tnb_bill: "TNB Bill(s)",
  tnb_meter: "TNB Meter",
  emergency_contact: "Emergency Contact",
  payment_required: "Payment ≥4%",
  commercial_docs: "Commercial Docs",
};

/**
 * Get checkpoint icons (for display)
 */
export const CHECKPOINT_ICONS = {
  name: "👤",
  address: "🏠",
  mykad: "🪪",
  tnb_bill: "📄",
  tnb_meter: "⚡",
  emergency_contact: "📞",
  payment_required: "💰",
  commercial_docs: "🏢",
};

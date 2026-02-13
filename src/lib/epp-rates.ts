// EPP Rate Configuration
// Based on Eternal Energy rate table (2026)

export interface EppRate {
  tenure: number;
  rates: {
    [bank: string]: number | null; // null means not supported
  };
}

export const EPP_BANKS = ["MBB", "PBB", "HLB", "CIMB", "AM Bank", "UOB", "OCBC"] as const;
export type EppBank = typeof EPP_BANKS[number];

export const EPP_RATES: EppRate[] = [
  {
    tenure: 6,
    rates: {
      MBB: 2.50,
      PBB: 2.50,
      HLB: null,
      CIMB: 2.50,
      "AM Bank": null,
      UOB: 2.50,
      OCBC: 4.00,
    },
  },
  {
    tenure: 12,
    rates: {
      MBB: 3.50,
      PBB: 3.50,
      HLB: 3.50,
      CIMB: 3.50,
      "AM Bank": null,
      UOB: 3.50,
      OCBC: 5.00,
    },
  },
  {
    tenure: 18,
    rates: {
      MBB: null,
      PBB: 4.00,
      HLB: null,       // Fixed: was 4.00, image shows "-"
      CIMB: null,
      "AM Bank": null,
      UOB: null,
      OCBC: 6.00,
    },
  },
  {
    tenure: 24,
    rates: {
      MBB: 5.50,
      PBB: 5.50,
      HLB: 5.50,
      CIMB: 5.50,
      "AM Bank": 7.00,
      UOB: 5.50,
      OCBC: 7.00,
    },
  },
  {
    tenure: 36,
    rates: {
      MBB: 6.00,
      PBB: 6.00,
      HLB: 6.00,
      CIMB: null,
      "AM Bank": 9.00,
      UOB: null,        // Fixed: was 9.00, image shows "-"
      OCBC: 8.00,
    },
  },
  {
    tenure: 48,
    rates: {
      MBB: 8.00,
      PBB: 8.00,
      HLB: 8.00,
      CIMB: null,
      "AM Bank": null,
      UOB: 8.50,
      OCBC: 9.00,
    },
  },
  {
    tenure: 60,
    rates: {
      MBB: 10.00,
      PBB: 10.00,
      HLB: 10.00,
      CIMB: 10.00,      // Fixed: was null, image shows 10.00%
      "AM Bank": null,
      UOB: null,
      OCBC: null,
    },
  },
  {
    tenure: 68,
    rates: {
      MBB: null,
      PBB: null,
      HLB: null,
      CIMB: null,
      "AM Bank": null,
      UOB: 11.50,       // Added: 68-month tenure from image
      OCBC: null,
    },
  },
];

// Special Rates
export const FOREIGN_CARD_RATES: { [bank: string]: number } = {
  PBB: 2.00,
  HLB: 2.00,
  UOB: 2.30,
  OCBC: 2.80,
};

export const AMEX_RATE = 0.30; // Standard MDR, No EPP

// Map common bank name variations to the short code used in EPP_RATES
const BANK_ALIASES: { [key: string]: string } = {
  "MAYBANK": "MBB",
  "MBB": "MBB",
  "PUBLIC BANK": "PBB",
  "PBB": "PBB",
  "HONG LEONG": "HLB",
  "HONG LEONG BANK": "HLB",
  "HLB": "HLB",
  "CIMB": "CIMB",
  "CIMB BANK": "CIMB",
  "AM BANK": "AM Bank",
  "AMBANK": "AM Bank",
  "UOB": "UOB",
  "OCBC": "OCBC",
};

export function normalizeBankName(bank: string): string {
  return BANK_ALIASES[bank.toUpperCase().trim()] ?? bank;
}

export function getEppRate(bank: string, tenure: number): number | null {
  const rateConfig = EPP_RATES.find((r) => r.tenure === tenure);
  if (!rateConfig) return null;

  const normalizedBank = normalizeBankName(bank);
  // @ts-ignore
  return rateConfig.rates[normalizedBank] ?? null;
}

/**
 * Calculate EPP Cost (interest amount charged)
 * Formula: epp_cost = (amount * rate) / (100 + rate)
 *
 * Example: RM20,000 at 10% interest
 * epp_cost = (20000 * 10) / (100 + 10)
 * epp_cost = 200000 / 110
 * epp_cost = RM1,818.18
 *
 * @param amount - Transaction amount
 * @param rate - Interest rate percentage (e.g., 10 for 10%)
 * @returns EPP cost in RM
 */
export function calculateEppCost(amount: number, rate: number): number {
  return (amount * rate) / (100 + rate);
}

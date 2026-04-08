export const HYBRID_RULE_TYPES = [
  "inverter_upgrade",
  "battery_addon",
  "meter_addon",
] as const;

export const HYBRID_PHASE_SCOPES = [
  "single_phase",
  "three_phase",
] as const;

export type HybridRuleType = typeof HYBRID_RULE_TYPES[number];
export type HybridPhaseScope = typeof HYBRID_PHASE_SCOPES[number];
export type HybridSectionKey = "single_phase" | "three_phase" | "addons";

export interface HybridInverterUpgradeRuleRecord {
  id: number;
  bubble_id: string;
  rule_type: HybridRuleType;
  phase_scope: HybridPhaseScope | null;
  from_model_code: string | null;
  from_product_bubble_id: string | null;
  from_product_name_snapshot: string | null;
  to_model_code: string | null;
  to_product_bubble_id: string | null;
  to_product_name_snapshot: string | null;
  addon_model_code: string | null;
  addon_product_bubble_id: string | null;
  addon_product_name_snapshot: string | null;
  price_amount: string;
  currency_code: string;
  stock_ready: boolean;
  active: boolean;
  notes: string | null;
  sort_order: number;
}

export interface HybridProductOption {
  bubble_id: string;
  name: string | null;
  label: string | null;
  active: boolean | null;
}

export const HYBRID_RULE_TYPE_LABELS: Record<HybridRuleType, string> = {
  inverter_upgrade: "Inverter upgrade",
  battery_addon: "Battery add-on",
  meter_addon: "Meter add-on",
};

export const HYBRID_PHASE_LABELS: Record<HybridPhaseScope, string> = {
  single_phase: "Single phase",
  three_phase: "Three phase",
};

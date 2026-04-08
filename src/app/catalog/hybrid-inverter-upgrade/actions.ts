"use server";

import { db } from "@/lib/db";
import { hybridInverterUpgradeRules, products } from "@/db/schema";
import { asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
  HYBRID_PHASE_SCOPES,
  HYBRID_RULE_TYPES,
  type HybridInverterUpgradeRuleRecord,
  type HybridPhaseScope,
  type HybridProductOption,
  type HybridRuleType,
} from "./shared";

interface HybridRuleMutationInput {
  bubble_id?: string;
  rule_type: HybridRuleType;
  phase_scope?: HybridPhaseScope | null;
  from_model_code?: string | null;
  from_product_bubble_id?: string | null;
  to_model_code?: string | null;
  to_product_bubble_id?: string | null;
  addon_model_code?: string | null;
  addon_product_bubble_id?: string | null;
  price_amount: string | number;
  currency_code?: string | null;
  stock_ready?: boolean;
  active?: boolean;
  notes?: string | null;
  sort_order?: number | string | null;
}

type HybridRuleRow = typeof hybridInverterUpgradeRules.$inferSelect;

function normalizeNullableText(value?: string | null) {
  const nextValue = value?.trim();
  return nextValue ? nextValue : null;
}

function normalizeSortOrder(value?: number | string | null) {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  const parsedValue = typeof value === "number" ? value : Number.parseInt(String(value), 10);

  if (!Number.isFinite(parsedValue)) {
    throw new Error("Sort order must be a whole number.");
  }

  return Math.trunc(parsedValue);
}

function normalizePriceAmount(value: string | number) {
  const parsedValue = typeof value === "number" ? value : Number.parseFloat(String(value));

  if (!Number.isFinite(parsedValue)) {
    throw new Error("Price amount must be a valid number.");
  }

  if (parsedValue < 0) {
    throw new Error("Price amount must be 0 or greater.");
  }

  return parsedValue.toFixed(2);
}

function validateRuleType(value: string): HybridRuleType {
  if ((HYBRID_RULE_TYPES as readonly string[]).includes(value)) {
    return value as HybridRuleType;
  }

  throw new Error("Rule type is invalid.");
}

function validatePhaseScope(value?: string | null) {
  if (!value) {
    return null;
  }

  if ((HYBRID_PHASE_SCOPES as readonly string[]).includes(value)) {
    return value as HybridPhaseScope;
  }

  throw new Error("Phase scope is invalid.");
}

function serializeRule(row: HybridRuleRow): HybridInverterUpgradeRuleRecord {
  return {
    id: row.id,
    bubble_id: row.bubble_id,
    rule_type: row.rule_type as HybridRuleType,
    phase_scope: row.phase_scope as HybridPhaseScope | null,
    from_model_code: row.from_model_code,
    from_product_bubble_id: row.from_product_bubble_id,
    from_product_name_snapshot: row.from_product_name_snapshot,
    to_model_code: row.to_model_code,
    to_product_bubble_id: row.to_product_bubble_id,
    to_product_name_snapshot: row.to_product_name_snapshot,
    addon_model_code: row.addon_model_code,
    addon_product_bubble_id: row.addon_product_bubble_id,
    addon_product_name_snapshot: row.addon_product_name_snapshot,
    price_amount: String(row.price_amount ?? "0.00"),
    currency_code: row.currency_code,
    stock_ready: row.stock_ready,
    active: row.active,
    notes: row.notes,
    sort_order: row.sort_order,
  };
}

function revalidateCatalogPaths() {
  revalidatePath("/catalog");
  revalidatePath("/catalog/hybrid-inverter-upgrade");
}

async function getProductPreviewMap(productBubbleIds: Array<string | null | undefined>) {
  const uniqueBubbleIds = Array.from(
    new Set(
      productBubbleIds
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
    )
  );

  if (uniqueBubbleIds.length === 0) {
    return new Map<string, HybridProductOption>();
  }

  const productRows = await db
    .select({
      bubble_id: products.bubble_id,
      name: products.name,
      label: products.label,
      active: products.active,
    })
    .from(products)
    .where(inArray(products.bubble_id, uniqueBubbleIds));

  return new Map(
    productRows
      .filter((row): row is HybridProductOption => Boolean(row.bubble_id))
      .map((row) => [row.bubble_id, row])
  );
}

function resolveSnapshot(
  productBubbleId: string | null,
  existingBubbleId: string | null,
  existingSnapshot: string | null,
  productPreviewMap: Map<string, HybridProductOption>
) {
  if (!productBubbleId) {
    return null;
  }

  const matchedProduct = productPreviewMap.get(productBubbleId);
  if (matchedProduct) {
    return matchedProduct.name ?? matchedProduct.label ?? existingSnapshot ?? null;
  }

  if (existingBubbleId === productBubbleId) {
    return existingSnapshot ?? null;
  }

  return null;
}

function buildNormalizedRulePayload(input: HybridRuleMutationInput) {
  const ruleType = validateRuleType(input.rule_type);
  const parsedPhaseScope = validatePhaseScope(input.phase_scope);

  if (ruleType === "inverter_upgrade" && !parsedPhaseScope) {
    throw new Error("Phase scope is required for inverter upgrade rules.");
  }

  const normalizedPayload = {
    rule_type: ruleType,
    phase_scope: ruleType === "inverter_upgrade" ? parsedPhaseScope : null,
    from_model_code: ruleType === "inverter_upgrade" ? normalizeNullableText(input.from_model_code) : null,
    from_product_bubble_id: ruleType === "inverter_upgrade" ? normalizeNullableText(input.from_product_bubble_id) : null,
    to_model_code: ruleType === "inverter_upgrade" ? normalizeNullableText(input.to_model_code) : null,
    to_product_bubble_id: ruleType === "inverter_upgrade" ? normalizeNullableText(input.to_product_bubble_id) : null,
    addon_model_code: ruleType === "inverter_upgrade" ? null : normalizeNullableText(input.addon_model_code),
    addon_product_bubble_id: ruleType === "inverter_upgrade" ? null : normalizeNullableText(input.addon_product_bubble_id),
    price_amount: normalizePriceAmount(input.price_amount),
    currency_code: normalizeNullableText(input.currency_code) ?? "MYR",
    stock_ready: input.stock_ready === true,
    active: input.active !== false,
    notes: normalizeNullableText(input.notes),
    sort_order: normalizeSortOrder(input.sort_order),
  };

  if (ruleType !== "inverter_upgrade") {
    return normalizedPayload;
  }

  return normalizedPayload;
}

export async function getHybridUpgradeCatalogData(): Promise<{
  rules: HybridInverterUpgradeRuleRecord[];
  products: HybridProductOption[];
}> {
  try {
    const [ruleRows, productRows] = await Promise.all([
      db
        .select()
        .from(hybridInverterUpgradeRules)
        .orderBy(asc(hybridInverterUpgradeRules.sort_order), asc(hybridInverterUpgradeRules.id)),
      db
        .select({
          bubble_id: products.bubble_id,
          name: products.name,
          label: products.label,
          active: products.active,
        })
        .from(products)
        .where(isNotNull(products.bubble_id))
        .orderBy(desc(products.active), asc(products.name), asc(products.bubble_id))
        .limit(3000),
    ]);

    return {
      rules: ruleRows.map(serializeRule),
      products: productRows.filter((row): row is HybridProductOption => Boolean(row.bubble_id)),
    };
  } catch (error) {
    console.error("Database error in getHybridUpgradeCatalogData:", error);
    return { rules: [], products: [] };
  }
}

export async function saveHybridUpgradeRule(input: HybridRuleMutationInput) {
  try {
    const normalizedPayload = buildNormalizedRulePayload(input);
    const requestedBubbleId = normalizeNullableText(input.bubble_id);
    const existingRule = requestedBubbleId
      ? await db.query.hybridInverterUpgradeRules.findFirst({
          where: eq(hybridInverterUpgradeRules.bubble_id, requestedBubbleId),
        })
      : null;

    if (requestedBubbleId && !existingRule) {
      throw new Error("The selected rule no longer exists. Refresh the page and try again.");
    }

    const productPreviewMap = await getProductPreviewMap([
      normalizedPayload.from_product_bubble_id,
      normalizedPayload.to_product_bubble_id,
      normalizedPayload.addon_product_bubble_id,
    ]);

    const payloadWithSnapshots = {
      ...normalizedPayload,
      from_product_name_snapshot: resolveSnapshot(
        normalizedPayload.from_product_bubble_id,
        existingRule?.from_product_bubble_id ?? null,
        existingRule?.from_product_name_snapshot ?? null,
        productPreviewMap
      ),
      to_product_name_snapshot: resolveSnapshot(
        normalizedPayload.to_product_bubble_id,
        existingRule?.to_product_bubble_id ?? null,
        existingRule?.to_product_name_snapshot ?? null,
        productPreviewMap
      ),
      addon_product_name_snapshot: resolveSnapshot(
        normalizedPayload.addon_product_bubble_id,
        existingRule?.addon_product_bubble_id ?? null,
        existingRule?.addon_product_name_snapshot ?? null,
        productPreviewMap
      ),
      updated_at: new Date(),
    };

    if (existingRule) {
      await db
        .update(hybridInverterUpgradeRules)
        .set(payloadWithSnapshots)
        .where(eq(hybridInverterUpgradeRules.bubble_id, existingRule.bubble_id));

      revalidateCatalogPaths();
      return { success: true, bubble_id: existingRule.bubble_id };
    }

    const bubbleId = `hiur_${crypto.randomUUID()}`;

    await db.insert(hybridInverterUpgradeRules).values({
      bubble_id: bubbleId,
      ...payloadWithSnapshots,
      created_at: new Date(),
    });

    revalidateCatalogPaths();
    return { success: true, bubble_id: bubbleId };
  } catch (error) {
    console.error("Database error in saveHybridUpgradeRule:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function toggleHybridUpgradeRuleFlags(
  bubbleId: string,
  updates: Partial<Pick<HybridRuleMutationInput, "active" | "stock_ready">>
) {
  try {
    await db
      .update(hybridInverterUpgradeRules)
      .set({
        active: updates.active,
        stock_ready: updates.stock_ready,
        updated_at: new Date(),
      })
      .where(eq(hybridInverterUpgradeRules.bubble_id, bubbleId));

    revalidateCatalogPaths();
    return { success: true };
  } catch (error) {
    console.error("Database error in toggleHybridUpgradeRuleFlags:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function deleteHybridUpgradeRule(bubbleId: string) {
  try {
    await db
      .delete(hybridInverterUpgradeRules)
      .where(eq(hybridInverterUpgradeRules.bubble_id, bubbleId));

    revalidateCatalogPaths();
    return { success: true };
  } catch (error) {
    console.error("Database error in deleteHybridUpgradeRule:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

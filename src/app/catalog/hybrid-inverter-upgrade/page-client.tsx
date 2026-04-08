"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Edit2,
  Filter,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { CatalogSubnav } from "@/components/catalog/CatalogSubnav";
import {
  deleteHybridUpgradeRule,
  getHybridUpgradeCatalogData,
  saveHybridUpgradeRule,
  toggleHybridUpgradeRuleFlags,
} from "./actions";
import {
  HYBRID_PHASE_LABELS,
  HYBRID_RULE_TYPE_LABELS,
  type HybridInverterUpgradeRuleRecord,
  type HybridPhaseScope,
  type HybridProductOption,
  type HybridRuleType,
  type HybridSectionKey,
} from "./shared";

type ActiveFilter = "all" | "active" | "inactive";
type StockFilter = "all" | "ready" | "not_ready";
type MappingFilter = "all" | "mapped" | "unmapped";

interface FeedbackState {
  type: "success" | "error";
  message: string;
}

interface RuleFormState {
  bubble_id?: string;
  rule_type: HybridRuleType;
  phase_scope: HybridPhaseScope | null;
  from_model_code: string;
  from_product_bubble_id: string;
  to_model_code: string;
  to_product_bubble_id: string;
  addon_model_code: string;
  addon_product_bubble_id: string;
  price_amount: string;
  stock_ready: boolean;
  active: boolean;
  notes: string;
  sort_order: string;
}

const SECTION_COPY: Record<
  HybridSectionKey,
  { title: string; description: string; addLabel: string }
> = {
  single_phase: {
    title: "Single Phase Upgrade",
    description: "Upgrade rules for single-phase string inverter to hybrid inverter pricing.",
    addLabel: "Add single-phase rule",
  },
  three_phase: {
    title: "Three Phase Upgrade",
    description: "Upgrade rules for three-phase hybrid inverter pricing and mapping.",
    addLabel: "Add three-phase rule",
  },
  addons: {
    title: "Low Voltage Add-ons",
    description: "Battery and meter add-ons that Solar Calculator can price from this table.",
    addLabel: "Add add-on rule",
  },
};

function createEmptyFormState(sectionKey?: HybridSectionKey): RuleFormState {
  if (sectionKey === "single_phase") {
    return {
      rule_type: "inverter_upgrade",
      phase_scope: "single_phase",
      from_model_code: "",
      from_product_bubble_id: "",
      to_model_code: "",
      to_product_bubble_id: "",
      addon_model_code: "",
      addon_product_bubble_id: "",
      price_amount: "0.00",
      stock_ready: false,
      active: true,
      notes: "",
      sort_order: "0",
    };
  }

  if (sectionKey === "three_phase") {
    return {
      rule_type: "inverter_upgrade",
      phase_scope: "three_phase",
      from_model_code: "",
      from_product_bubble_id: "",
      to_model_code: "",
      to_product_bubble_id: "",
      addon_model_code: "",
      addon_product_bubble_id: "",
      price_amount: "0.00",
      stock_ready: false,
      active: true,
      notes: "",
      sort_order: "0",
    };
  }

  return {
    rule_type: "battery_addon",
    phase_scope: null,
    from_model_code: "",
    from_product_bubble_id: "",
    to_model_code: "",
    to_product_bubble_id: "",
    addon_model_code: "",
    addon_product_bubble_id: "",
    price_amount: "0.00",
    stock_ready: false,
    active: true,
    notes: "",
    sort_order: "0",
  };
}

function ruleToFormState(rule: HybridInverterUpgradeRuleRecord): RuleFormState {
  return {
    bubble_id: rule.bubble_id,
    rule_type: rule.rule_type,
    phase_scope: rule.phase_scope,
    from_model_code: rule.from_model_code ?? "",
    from_product_bubble_id: rule.from_product_bubble_id ?? "",
    to_model_code: rule.to_model_code ?? "",
    to_product_bubble_id: rule.to_product_bubble_id ?? "",
    addon_model_code: rule.addon_model_code ?? "",
    addon_product_bubble_id: rule.addon_product_bubble_id ?? "",
    price_amount: rule.price_amount ?? "0.00",
    stock_ready: rule.stock_ready,
    active: rule.active,
    notes: rule.notes ?? "",
    sort_order: String(rule.sort_order ?? 0),
  };
}

function getRuleSection(rule: HybridInverterUpgradeRuleRecord): HybridSectionKey {
  if (rule.rule_type === "inverter_upgrade") {
    return rule.phase_scope === "three_phase" ? "three_phase" : "single_phase";
  }

  return "addons";
}

function isRuleMapped(rule: HybridInverterUpgradeRuleRecord) {
  if (rule.rule_type === "inverter_upgrade") {
    return Boolean(rule.from_product_bubble_id && rule.to_product_bubble_id);
  }

  return Boolean(rule.addon_product_bubble_id);
}

function formatCurrency(value: string) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return "RM 0.00";
  }

  return `RM ${numericValue.toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function ProductMappingSummary({
  bubbleId,
  snapshot,
  productMap,
}: {
  bubbleId: string | null;
  snapshot: string | null;
  productMap: Map<string, HybridProductOption>;
}) {
  if (!bubbleId) {
    return <span className="badge-warning">Mapping missing</span>;
  }

  const product = productMap.get(bubbleId);

  if (!product) {
    return (
      <div className="space-y-2">
        <div className="font-medium text-secondary-900 break-all">{bubbleId}</div>
        {snapshot ? (
          <div className="text-xs text-secondary-500 whitespace-normal break-words">{snapshot}</div>
        ) : null}
        <span className="badge-danger">Product not found</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="font-medium text-secondary-900 whitespace-normal break-words">
        {product.name ?? product.label ?? snapshot ?? bubbleId}
      </div>
      <div className="text-xs text-secondary-500 break-all">{bubbleId}</div>
      {product.active === false ? <span className="badge-warning">Product inactive</span> : null}
    </div>
  );
}

function getProductDisplayName(product: HybridProductOption) {
  return product.name ?? product.label ?? product.bubble_id;
}

function SearchableProductPicker({
  label,
  selectedBubbleId,
  snapshot,
  onSelect,
  productOptions,
  productMap,
}: {
  label: string;
  selectedBubbleId: string;
  snapshot: string | null;
  onSelect: (bubbleId: string) => void;
  productOptions: HybridProductOption[];
  productMap: Map<string, HybridProductOption>;
}) {
  const selectedProduct = selectedBubbleId ? productMap.get(selectedBubbleId) ?? null : null;
  const [query, setQuery] = useState(selectedProduct ? getProductDisplayName(selectedProduct) : snapshot ?? "");
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setQuery(selectedProduct ? getProductDisplayName(selectedProduct) : snapshot ?? "");
  }, [selectedProduct, snapshot]);

  const trimmedQuery = query.trim().toLowerCase();
  const filteredProducts = trimmedQuery
    ? productOptions
        .filter((product) => {
          const searchableText = [
            product.name,
            product.label,
            product.bubble_id,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          return searchableText.includes(trimmedQuery);
        })
        .slice(0, 8)
    : [];

  return (
    <div className="space-y-2">
      <label className="text-sm font-semibold text-secondary-700">{label}</label>
      <div className="relative">
        <input
          type="text"
          className="input"
          placeholder="Search by product name or model"
          value={query}
          onFocus={() => setIsOpen(true)}
          onBlur={() => {
            window.setTimeout(() => setIsOpen(false), 120);
          }}
          onChange={(event) => {
            const nextQuery = event.target.value;
            setQuery(nextQuery);
            setIsOpen(true);

            if (selectedBubbleId) {
              onSelect("");
            }
          }}
        />
        {isOpen && trimmedQuery ? (
          <div className="absolute z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-xl border border-secondary-200 bg-white shadow-lg">
            {filteredProducts.length > 0 ? (
              filteredProducts.map((product) => (
                <button
                  key={product.bubble_id}
                  type="button"
                  className="flex w-full items-start justify-between gap-3 border-b border-secondary-100 px-4 py-3 text-left last:border-b-0 hover:bg-secondary-50"
                  onMouseDown={() => {
                    onSelect(product.bubble_id);
                    setQuery(getProductDisplayName(product));
                    setIsOpen(false);
                  }}
                >
                  <div className="min-w-0">
                    <div className="font-medium text-secondary-900 whitespace-normal break-words">
                      {getProductDisplayName(product)}
                    </div>
                    <div className="text-xs text-secondary-500 break-all">{product.bubble_id}</div>
                  </div>
                  {product.active === false ? (
                    <span className="badge-warning shrink-0">Inactive</span>
                  ) : null}
                </button>
              ))
            ) : (
              <div className="px-4 py-3 text-sm text-secondary-500">
                No matching product found. Keep the mapping empty if the product does not exist yet.
              </div>
            )}
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn-secondary shrink-0"
          onClick={() => {
            setQuery("");
            onSelect("");
          }}
          disabled={!selectedBubbleId && !query}
        >
          Clear
        </button>
        <span className="text-xs text-secondary-500">
          Search and click a product to map this rule.
        </span>
      </div>
      <div className="rounded-xl border border-secondary-200 bg-secondary-50/70 p-3 text-sm">
        {!selectedBubbleId ? (
          <span className="badge-warning">Mapping missing</span>
        ) : selectedProduct ? (
          <div className="space-y-1">
            <div className="font-medium text-secondary-900">
              {getProductDisplayName(selectedProduct)}
            </div>
            <div className="text-xs text-secondary-500 break-all">{selectedProduct.bubble_id}</div>
            {selectedProduct.active === false ? (
              <span className="badge-warning">Mapped product is inactive</span>
            ) : (
              <span className="badge-success">Mapped product resolved</span>
            )}
          </div>
        ) : (
          <div className="space-y-1">
            {snapshot ? <div className="text-xs text-secondary-500">{snapshot}</div> : null}
            <span className="badge-danger">No matching product row found</span>
          </div>
        )}
      </div>
    </div>
  );
}

interface RuleSectionProps {
  sectionKey: HybridSectionKey;
  rules: HybridInverterUpgradeRuleRecord[];
  productMap: Map<string, HybridProductOption>;
  onAdd: (sectionKey: HybridSectionKey) => void;
  onEdit: (rule: HybridInverterUpgradeRuleRecord) => void;
  onToggleFlag: (
    rule: HybridInverterUpgradeRuleRecord,
    field: "active" | "stock_ready",
    nextValue: boolean
  ) => Promise<void>;
  toggleLoadingKey: string | null;
}

function RuleSection({
  sectionKey,
  rules,
  productMap,
  onAdd,
  onEdit,
  onToggleFlag,
  toggleLoadingKey,
}: RuleSectionProps) {
  const unmappedCount = rules.filter((rule) => !isRuleMapped(rule)).length;

  return (
    <section className="card">
      <div className="flex flex-col gap-4 border-b border-secondary-200 p-6 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-bold text-secondary-900">{SECTION_COPY[sectionKey].title}</h2>
            <span className="badge-secondary">{rules.length} rule{rules.length === 1 ? "" : "s"}</span>
            {unmappedCount > 0 ? (
              <span className="badge-warning">{unmappedCount} unmapped</span>
            ) : null}
          </div>
          <p className="text-sm text-secondary-600">{SECTION_COPY[sectionKey].description}</p>
        </div>

        <button onClick={() => onAdd(sectionKey)} className="btn-primary flex items-center gap-2">
          <Plus className="h-4 w-4" />
          {SECTION_COPY[sectionKey].addLabel}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="table min-w-[1050px]">
          <thead>
            <tr>
              <th>Sort</th>
              {sectionKey === "addons" ? <th>Type</th> : null}
              {sectionKey !== "addons" ? <th>Source Model</th> : null}
              {sectionKey !== "addons" ? <th>Source Product</th> : null}
              {sectionKey !== "addons" ? <th>Target Model</th> : null}
              {sectionKey !== "addons" ? <th>Target Product</th> : null}
              {sectionKey === "addons" ? <th>Add-on Model</th> : null}
              {sectionKey === "addons" ? <th>Add-on Product</th> : null}
              <th>Price</th>
              <th>Stock Ready</th>
              <th>Active</th>
              <th>Notes</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rules.length === 0 ? (
              <tr>
                <td
                  colSpan={sectionKey === "addons" ? 9 : 10}
                  className="py-10 text-center text-secondary-500"
                >
                  No rules match the current filters.
                </td>
              </tr>
            ) : (
              rules.map((rule) => {
                const stockToggleKey = `${rule.bubble_id}:stock_ready`;
                const activeToggleKey = `${rule.bubble_id}:active`;

                return (
                  <tr key={rule.bubble_id}>
                    <td>{rule.sort_order}</td>
                    {sectionKey === "addons" ? (
                      <td>
                        <span className="badge-secondary">
                          {HYBRID_RULE_TYPE_LABELS[rule.rule_type]}
                        </span>
                      </td>
                    ) : null}
                    {sectionKey !== "addons" ? (
                      <td>
                        <div className="font-medium text-secondary-900">
                          {rule.from_model_code ?? "Not set"}
                        </div>
                        <div className="text-xs text-secondary-500">
                          {rule.phase_scope ? HYBRID_PHASE_LABELS[rule.phase_scope] : "No phase"}
                        </div>
                      </td>
                    ) : null}
                    {sectionKey !== "addons" ? (
                      <td className="align-top">
                        <ProductMappingSummary
                          bubbleId={rule.from_product_bubble_id}
                          snapshot={rule.from_product_name_snapshot}
                          productMap={productMap}
                        />
                      </td>
                    ) : null}
                    {sectionKey !== "addons" ? (
                      <td>
                        <div className="font-medium text-secondary-900">
                          {rule.to_model_code ?? "Not set"}
                        </div>
                      </td>
                    ) : null}
                    {sectionKey !== "addons" ? (
                      <td className="align-top">
                        <ProductMappingSummary
                          bubbleId={rule.to_product_bubble_id}
                          snapshot={rule.to_product_name_snapshot}
                          productMap={productMap}
                        />
                      </td>
                    ) : null}
                    {sectionKey === "addons" ? (
                      <td>
                        <div className="font-medium text-secondary-900">
                          {rule.addon_model_code ?? "Not set"}
                        </div>
                      </td>
                    ) : null}
                    {sectionKey === "addons" ? (
                      <td className="align-top">
                        <ProductMappingSummary
                          bubbleId={rule.addon_product_bubble_id}
                          snapshot={rule.addon_product_name_snapshot}
                          productMap={productMap}
                        />
                      </td>
                    ) : null}
                    <td>
                      <div className="font-semibold text-secondary-900">
                        {formatCurrency(rule.price_amount)}
                      </div>
                      <div className="text-xs text-secondary-500">{rule.currency_code}</div>
                    </td>
                    <td>
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-secondary-300 text-primary-600 focus:ring-primary-500"
                          checked={rule.stock_ready}
                          disabled={toggleLoadingKey === stockToggleKey}
                          onChange={() => onToggleFlag(rule, "stock_ready", !rule.stock_ready)}
                        />
                        <span className="text-sm text-secondary-700">
                          {rule.stock_ready ? "Ready" : "Not ready"}
                        </span>
                      </label>
                    </td>
                    <td>
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-secondary-300 text-primary-600 focus:ring-primary-500"
                          checked={rule.active}
                          disabled={toggleLoadingKey === activeToggleKey}
                          onChange={() => onToggleFlag(rule, "active", !rule.active)}
                        />
                        <span className="text-sm text-secondary-700">
                          {rule.active ? "Enabled" : "Disabled"}
                        </span>
                      </label>
                    </td>
                    <td className="max-w-[320px] whitespace-normal">
                      <div className="text-sm text-secondary-700">
                        {rule.notes ? rule.notes : <span className="text-secondary-400">No notes</span>}
                      </div>
                    </td>
                    <td className="text-right">
                      <button
                        type="button"
                        onClick={() => onEdit(rule)}
                        className="btn-ghost inline-flex items-center gap-2 text-primary-600 hover:text-primary-700"
                      >
                        <Edit2 className="h-4 w-4" />
                        Edit
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function HybridInverterUpgradePageClient() {
  const [rules, setRules] = useState<HybridInverterUpgradeRuleRecord[]>([]);
  const [productOptions, setProductOptions] = useState<HybridProductOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formState, setFormState] = useState<RuleFormState>(createEmptyFormState("single_phase"));
  const [editingRule, setEditingRule] = useState<HybridInverterUpgradeRuleRecord | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [toggleLoadingKey, setToggleLoadingKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [mappingFilter, setMappingFilter] = useState<MappingFilter>("all");

  useEffect(() => {
    void refreshData(true);
  }, []);

  async function refreshData(initialLoad = false) {
    if (initialLoad) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }

    try {
      const data = await getHybridUpgradeCatalogData();
      setRules(data.rules);
      setProductOptions(data.products);
    } catch (error) {
      console.error("Failed to load hybrid inverter upgrade rules:", error);
      setFeedback({
        type: "error",
        message: "Unable to load hybrid inverter upgrade rules right now.",
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  const productMap = new Map(productOptions.map((product) => [product.bubble_id, product]));

  const filteredRules = rules.filter((rule) => {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    const searchTarget = [
      rule.from_model_code,
      rule.to_model_code,
      rule.addon_model_code,
      rule.notes,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (normalizedSearch && !searchTarget.includes(normalizedSearch)) {
      return false;
    }

    if (activeFilter === "active" && !rule.active) {
      return false;
    }

    if (activeFilter === "inactive" && rule.active) {
      return false;
    }

    if (stockFilter === "ready" && !rule.stock_ready) {
      return false;
    }

    if (stockFilter === "not_ready" && rule.stock_ready) {
      return false;
    }

    if (mappingFilter === "mapped" && !isRuleMapped(rule)) {
      return false;
    }

    if (mappingFilter === "unmapped" && isRuleMapped(rule)) {
      return false;
    }

    return true;
  });

  const singlePhaseRules = filteredRules.filter((rule) => getRuleSection(rule) === "single_phase");
  const threePhaseRules = filteredRules.filter((rule) => getRuleSection(rule) === "three_phase");
  const addonRules = filteredRules.filter((rule) => getRuleSection(rule) === "addons");

  function openCreateModal(sectionKey: HybridSectionKey) {
    setEditingRule(null);
    setFormState(createEmptyFormState(sectionKey));
    setIsModalOpen(true);
  }

  function openEditModal(rule: HybridInverterUpgradeRuleRecord) {
    setEditingRule(rule);
    setFormState(ruleToFormState(rule));
    setIsModalOpen(true);
  }

  async function handleToggleFlag(
    rule: HybridInverterUpgradeRuleRecord,
    field: "active" | "stock_ready",
    nextValue: boolean
  ) {
    const loadingKey = `${rule.bubble_id}:${field}`;
    setToggleLoadingKey(loadingKey);

    try {
      const result = await toggleHybridUpgradeRuleFlags(rule.bubble_id, { [field]: nextValue });
      if (!result.success) {
        throw new Error(result.error || "Failed to update rule status.");
      }

      await refreshData();
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to update rule status.",
      });
    } finally {
      setToggleLoadingKey(null);
    }
  }

  async function handleSaveRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);

    try {
      const result = await saveHybridUpgradeRule({
        bubble_id: formState.bubble_id,
        rule_type: formState.rule_type,
        phase_scope: formState.rule_type === "inverter_upgrade" ? formState.phase_scope : null,
        from_model_code: formState.from_model_code,
        from_product_bubble_id: formState.from_product_bubble_id,
        to_model_code: formState.to_model_code,
        to_product_bubble_id: formState.to_product_bubble_id,
        addon_model_code: formState.addon_model_code,
        addon_product_bubble_id: formState.addon_product_bubble_id,
        price_amount: formState.price_amount,
        stock_ready: formState.stock_ready,
        active: formState.active,
        notes: formState.notes,
        sort_order: formState.sort_order,
      });

      if (!result.success) {
        throw new Error(result.error || "Failed to save hybrid inverter upgrade rule.");
      }

      setFeedback({
        type: "success",
        message: editingRule ? "Rule updated successfully." : "Rule created successfully.",
      });
      setIsModalOpen(false);
      setEditingRule(null);
      await refreshData();
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error instanceof Error ? error.message : "Failed to save hybrid inverter upgrade rule.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteRule() {
    if (!editingRule) {
      return;
    }

    const confirmed = window.confirm(
      "Delete this rule permanently? Prefer deactivation unless you intentionally want to remove the row."
    );

    if (!confirmed) {
      return;
    }

    setIsSaving(true);

    try {
      const result = await deleteHybridUpgradeRule(editingRule.bubble_id);
      if (!result.success) {
        throw new Error(result.error || "Failed to delete rule.");
      }

      setFeedback({
        type: "success",
        message: "Rule deleted successfully.",
      });
      setIsModalOpen(false);
      setEditingRule(null);
      await refreshData();
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to delete rule.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  const totalUnmappedRules = rules.filter((rule) => !isRuleMapped(rule)).length;
  const fromSnapshotPreview =
    editingRule && formState.from_product_bubble_id.trim() === (editingRule.from_product_bubble_id ?? "")
      ? editingRule.from_product_name_snapshot
      : null;
  const toSnapshotPreview =
    editingRule && formState.to_product_bubble_id.trim() === (editingRule.to_product_bubble_id ?? "")
      ? editingRule.to_product_name_snapshot
      : null;
  const addonSnapshotPreview =
    editingRule &&
    formState.addon_product_bubble_id.trim() === (editingRule.addon_product_bubble_id ?? "")
      ? editingRule.addon_product_name_snapshot
      : null;

  return (
    <div className="space-y-6 animate-fade-in">
      <CatalogSubnav />

      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold text-secondary-900">Hybrid Inverter Upgrade</h1>
          <p className="text-secondary-600">
            Manage hybrid upgrade pricing, product mapping, stock readiness, and activation status
            directly from <code>public.hybrid_inverter_upgrade_rule</code>.
          </p>
        </div>

        <button
          type="button"
          onClick={() => refreshData()}
          disabled={isRefreshing || isLoading}
          className="btn-secondary flex items-center gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
          Refresh data
        </button>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="card border-l-4 border-l-primary-500 p-5">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-primary-100 p-2 text-primary-700">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-secondary-900">Schema help</h2>
              <p className="text-sm text-secondary-600">
                <strong>Active</strong> controls whether the pricing rule is enabled in the catalog.
                <strong className="ml-1">Stock ready</strong> is operational readiness for sale or
                installation. Keep them separate so catalog visibility and operational readiness stay
                independent.
              </p>
            </div>
          </div>
        </div>

        <div className="card border-l-4 border-l-warning-500 p-5">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-warning-100 p-2 text-warning-700">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-secondary-900">Pricing source of truth</h2>
              <p className="text-sm text-secondary-600">
                Solar Calculator will consume this table later, so upgrade prices and mapping state
                must stay in the database. Do not hardcode prices in application code.
              </p>
            </div>
          </div>
        </div>
      </div>

      {feedback ? (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            feedback.type === "success"
              ? "border-success-200 bg-success-50 text-success-800"
              : "border-danger-200 bg-danger-50 text-danger-800"
          }`}
        >
          {feedback.message}
        </div>
      ) : null}

      <div className="card p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="grid flex-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-secondary-700">Search</label>
              <div className="relative">
                <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-secondary-400" />
                <input
                  type="text"
                  className="input pl-11"
                  placeholder="Source model, target model, add-on, notes"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-secondary-700">Active status</label>
              <select
                className="input"
                value={activeFilter}
                onChange={(event) => setActiveFilter(event.target.value as ActiveFilter)}
              >
                <option value="all">All rules</option>
                <option value="active">Active only</option>
                <option value="inactive">Inactive only</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-secondary-700">Stock readiness</label>
              <select
                className="input"
                value={stockFilter}
                onChange={(event) => setStockFilter(event.target.value as StockFilter)}
              >
                <option value="all">All stock states</option>
                <option value="ready">Stock ready</option>
                <option value="not_ready">Not ready</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-secondary-700">Mapping status</label>
              <select
                className="input"
                value={mappingFilter}
                onChange={(event) => setMappingFilter(event.target.value as MappingFilter)}
              >
                <option value="all">All mapping states</option>
                <option value="mapped">Mapped only</option>
                <option value="unmapped">Unmapped only</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="badge-secondary">{rules.length} total rules</span>
            <span className="badge-secondary">{filteredRules.length} shown</span>
            {totalUnmappedRules > 0 ? (
              <span className="badge-warning">{totalUnmappedRules} unmapped overall</span>
            ) : null}
            <span className="badge-primary">
              <Filter className="mr-1 h-3 w-3" />
              Sorted by sort order, then ID
            </span>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="card p-12 text-center text-secondary-500">Loading hybrid upgrade rules...</div>
      ) : (
        <div className="space-y-6">
          <RuleSection
            sectionKey="single_phase"
            rules={singlePhaseRules}
            productMap={productMap}
            onAdd={openCreateModal}
            onEdit={openEditModal}
            onToggleFlag={handleToggleFlag}
            toggleLoadingKey={toggleLoadingKey}
          />

          <RuleSection
            sectionKey="three_phase"
            rules={threePhaseRules}
            productMap={productMap}
            onAdd={openCreateModal}
            onEdit={openEditModal}
            onToggleFlag={handleToggleFlag}
            toggleLoadingKey={toggleLoadingKey}
          />

          <RuleSection
            sectionKey="addons"
            rules={addonRules}
            productMap={productMap}
            onAdd={openCreateModal}
            onEdit={openEditModal}
            onToggleFlag={handleToggleFlag}
            toggleLoadingKey={toggleLoadingKey}
          />
        </div>
      )}

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-secondary-900/50 p-4 backdrop-blur-sm animate-fade-in">
          <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-elevation-xl">
            <div className="flex items-center justify-between border-b border-secondary-200 px-6 py-5">
              <div>
                <h2 className="text-xl font-bold text-secondary-900">
                  {editingRule ? "Edit rule" : "Add rule"}
                </h2>
                <p className="text-sm text-secondary-500">
                  Bubble ID: {editingRule?.bubble_id ?? "Generated automatically on save"}
                </p>
              </div>
              <button
                type="button"
                className="rounded-full p-2 transition-colors hover:bg-secondary-100"
                onClick={() => setIsModalOpen(false)}
              >
                <X className="h-5 w-5 text-secondary-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-6">
              <form id="hybrid-upgrade-rule-form" className="space-y-6" onSubmit={handleSaveRule}>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-secondary-700">Rule type</label>
                    <select
                      className="input"
                      value={formState.rule_type}
                      onChange={(event) => {
                        const nextRuleType = event.target.value as HybridRuleType;
                        setFormState((currentState) => ({
                          ...currentState,
                          rule_type: nextRuleType,
                          phase_scope:
                            nextRuleType === "inverter_upgrade"
                              ? currentState.phase_scope ?? "single_phase"
                              : null,
                        }));
                      }}
                    >
                      <option value="inverter_upgrade">Inverter upgrade</option>
                      <option value="battery_addon">Battery add-on</option>
                      <option value="meter_addon">Meter add-on</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-secondary-700">Currency</label>
                    <input type="text" className="input bg-secondary-50" value="MYR" readOnly />
                  </div>
                </div>

                {formState.rule_type === "inverter_upgrade" ? (
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-secondary-700">Phase scope</label>
                    <select
                      className="input"
                      value={formState.phase_scope ?? ""}
                      onChange={(event) =>
                        setFormState((currentState) => ({
                          ...currentState,
                          phase_scope: event.target.value as HybridPhaseScope,
                        }))
                      }
                    >
                      <option value="single_phase">Single phase</option>
                      <option value="three_phase">Three phase</option>
                    </select>
                  </div>
                ) : (
                  <div className="rounded-xl border border-secondary-200 bg-secondary-50/70 px-4 py-3 text-sm text-secondary-600">
                    Add-on rules keep <code>phase_scope</code> empty by design.
                  </div>
                )}

                {formState.rule_type === "inverter_upgrade" ? (
                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-secondary-700">Source model code</label>
                        <input
                          type="text"
                          className="input"
                          value={formState.from_model_code}
                          onChange={(event) =>
                            setFormState((currentState) => ({
                              ...currentState,
                              from_model_code: event.target.value,
                            }))
                          }
                        />
                      </div>

                      <SearchableProductPicker
                        label="Source product search"
                        selectedBubbleId={formState.from_product_bubble_id}
                        snapshot={fromSnapshotPreview}
                        onSelect={(nextValue) =>
                          setFormState((currentState) => ({
                            ...currentState,
                            from_product_bubble_id: nextValue,
                          }))
                        }
                        productOptions={productOptions}
                        productMap={productMap}
                      />
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-secondary-700">Target model code</label>
                        <input
                          type="text"
                          className="input"
                          value={formState.to_model_code}
                          onChange={(event) =>
                            setFormState((currentState) => ({
                              ...currentState,
                              to_model_code: event.target.value,
                            }))
                          }
                        />
                      </div>

                      <SearchableProductPicker
                        label="Target product search"
                        selectedBubbleId={formState.to_product_bubble_id}
                        snapshot={toSnapshotPreview}
                        onSelect={(nextValue) =>
                          setFormState((currentState) => ({
                            ...currentState,
                            to_product_bubble_id: nextValue,
                          }))
                        }
                        productOptions={productOptions}
                        productMap={productMap}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-secondary-700">Add-on model code</label>
                      <input
                        type="text"
                        className="input"
                        value={formState.addon_model_code}
                        onChange={(event) =>
                          setFormState((currentState) => ({
                            ...currentState,
                            addon_model_code: event.target.value,
                          }))
                        }
                      />
                    </div>

                    <SearchableProductPicker
                      label="Add-on product search"
                      selectedBubbleId={formState.addon_product_bubble_id}
                      snapshot={addonSnapshotPreview}
                      onSelect={(nextValue) =>
                        setFormState((currentState) => ({
                          ...currentState,
                          addon_product_bubble_id: nextValue,
                        }))
                      }
                      productOptions={productOptions}
                      productMap={productMap}
                    />
                  </div>
                )}

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-secondary-700">Price amount</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="input"
                      value={formState.price_amount}
                      onChange={(event) =>
                        setFormState((currentState) => ({
                          ...currentState,
                          price_amount: event.target.value,
                        }))
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-secondary-700">Sort order</label>
                    <input
                      type="number"
                      step="1"
                      className="input"
                      value={formState.sort_order}
                      onChange={(event) =>
                        setFormState((currentState) => ({
                          ...currentState,
                          sort_order: event.target.value,
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="flex items-center gap-3 rounded-xl border border-secondary-200 px-4 py-3">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-secondary-300 text-primary-600 focus:ring-primary-500"
                      checked={formState.stock_ready}
                      onChange={(event) =>
                        setFormState((currentState) => ({
                          ...currentState,
                          stock_ready: event.target.checked,
                        }))
                      }
                    />
                    <div>
                      <div className="font-medium text-secondary-900">Stock ready</div>
                      <div className="text-xs text-secondary-500">
                        Operationally ready to sell or install
                      </div>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 rounded-xl border border-secondary-200 px-4 py-3">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-secondary-300 text-primary-600 focus:ring-primary-500"
                      checked={formState.active}
                      onChange={(event) =>
                        setFormState((currentState) => ({
                          ...currentState,
                          active: event.target.checked,
                        }))
                      }
                    />
                    <div>
                      <div className="font-medium text-secondary-900">Active</div>
                      <div className="text-xs text-secondary-500">
                        Enabled in the pricing catalog
                      </div>
                    </div>
                  </label>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-secondary-700">Notes</label>
                  <textarea
                    className="input min-h-[120px]"
                    value={formState.notes}
                    onChange={(event) =>
                      setFormState((currentState) => ({
                        ...currentState,
                        notes: event.target.value,
                      }))
                    }
                    placeholder="Optional internal notes about stock, mapping gaps, or pricing rationale"
                  />
                </div>
              </form>

              {editingRule ? (
                <div className="mt-8 rounded-xl border border-danger-200 bg-danger-50/60 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="space-y-1">
                      <div className="font-semibold text-danger-800">Delete with care</div>
                      <div className="text-sm text-danger-700">
                        Deactivation is the default choice. Only delete permanently when you
                        intentionally want to remove the row from the catalog table.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleDeleteRule}
                      disabled={isSaving}
                      className="btn-secondary flex items-center gap-2 border-danger-200 bg-white text-danger-700 hover:bg-danger-50"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete permanently
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-secondary-200 px-6 py-5">
              <button type="button" onClick={() => setIsModalOpen(false)} className="btn-secondary">
                Cancel
              </button>
              <button
                type="submit"
                form="hybrid-upgrade-rule-form"
                disabled={isSaving}
                className="btn-primary flex items-center gap-2"
              >
                <CheckCircle2 className="h-4 w-4" />
                {isSaving ? "Saving..." : "Save rule"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

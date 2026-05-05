"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  AlertTriangle,
  Briefcase,
  Edit2,
  GitBranch,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  UserCircle,
  Users,
  X,
} from "lucide-react";
import {
  getOutsourceManagementData,
  updateOutsourceRelationship,
  type OutsourceMember,
  type OutsourceRole,
} from "./actions";

type RoleFilter = "ALL" | "UNASSIGNED" | OutsourceRole;

type OutsourceStats = {
  general_managers: number;
  unit_managers: number;
  sales: number;
  unassigned: number;
  invalid_relationships: number;
};

const EMPTY_STATS: OutsourceStats = {
  general_managers: 0,
  unit_managers: 0,
  sales: 0,
  unassigned: 0,
  invalid_relationships: 0,
};

const ROLE_META: Record<OutsourceRole, { title: string; subtitle: string; badge: string; panel: string }> = {
  OGM: {
    title: "OGM",
    subtitle: "General Manager",
    badge: "bg-sky-100 text-sky-800 border-sky-200",
    panel: "border-sky-200 bg-sky-50/50",
  },
  OUM: {
    title: "OUM",
    subtitle: "Unit Manager",
    badge: "bg-emerald-100 text-emerald-800 border-emerald-200",
    panel: "border-emerald-200 bg-emerald-50/50",
  },
  OSM: {
    title: "OSM",
    subtitle: "Sales",
    badge: "bg-amber-100 text-amber-800 border-amber-200",
    panel: "border-amber-200 bg-amber-50/50",
  },
};

function roleBadge(role: OutsourceRole | null) {
  if (!role) {
    return (
      <span className="inline-flex items-center rounded-md border border-secondary-200 bg-secondary-100 px-2 py-1 text-xs font-semibold text-secondary-700">
        Unassigned
      </span>
    );
  }

  const meta = ROLE_META[role];
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-1 text-xs font-semibold ${meta.badge}`}>
      {meta.title}
    </span>
  );
}

function memberMatches(member: OutsourceMember, query: string, roleFilter: RoleFilter) {
  if (roleFilter === "UNASSIGNED" && member.role) return false;
  if (roleFilter !== "ALL" && roleFilter !== "UNASSIGNED" && member.role !== roleFilter) return false;

  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  return [
    member.name,
    member.email,
    member.contact,
    member.agent_code,
    member.dealership,
    member.parent_name,
  ].some((value) => value?.toLowerCase().includes(normalizedQuery));
}

function downlineSummary(member: OutsourceMember) {
  if (member.role === "OGM") return `${member.unit_count} OUM / ${member.sales_count} OSM`;
  if (member.role === "OUM") return `${member.sales_count} OSM`;
  if (member.direct_report_count > 0) return `${member.direct_report_count} direct`;
  return "None";
}

function reportsToSummary(member: OutsourceMember) {
  if (member.parent_name) return member.parent_name;
  if (member.role === "OGM" || member.role === "OUM") return "Top level";
  return "Not assigned";
}

function memberSubtitle(member: OutsourceMember) {
  return [member.agent_code, member.email, member.contact].filter(Boolean).join(" | ") || "No agent details";
}

export default function OutsourceManagementPage() {
  const [members, setMembers] = useState<OutsourceMember[]>([]);
  const [stats, setStats] = useState<OutsourceStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("ALL");
  const [editingMember, setEditingMember] = useState<OutsourceMember | null>(null);
  const [formRole, setFormRole] = useState<OutsourceRole | "">("");
  const [formParentId, setFormParentId] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [error, setError] = useState("");

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const data = await getOutsourceManagementData();
      setMembers(data.members);
      setStats(data.stats);
    } catch (loadError) {
      console.error("Failed to load outsource management data", loadError);
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const filteredMembers = useMemo(
    () => members.filter((member) => memberMatches(member, search, roleFilter)),
    [members, search, roleFilter]
  );

  const hierarchy = useMemo(() => {
    const unitsByOgm = new Map<number, OutsourceMember[]>();
    const salesByOum = new Map<number, OutsourceMember[]>();

    for (const member of members) {
      if (member.role === "OUM" && member.parent_user_id) {
        unitsByOgm.set(member.parent_user_id, [...(unitsByOgm.get(member.parent_user_id) || []), member]);
      }
      if (member.role === "OSM" && member.parent_user_id) {
        salesByOum.set(member.parent_user_id, [...(salesByOum.get(member.parent_user_id) || []), member]);
      }
    }

    const ogmGroups = members
      .filter((member) => member.role === "OGM")
      .map((ogm) => ({
        ogm,
        units: (unitsByOgm.get(ogm.id) || []).map((oum) => ({
          oum,
          sales: salesByOum.get(oum.id) || [],
        })),
      }));
    const topLevelUnits = members
      .filter((member) => member.role === "OUM" && !member.parent_user_id)
      .map((oum) => ({
        oum,
        sales: salesByOum.get(oum.id) || [],
      }));

    return { ogmGroups, topLevelUnits };
  }, [members]);

  const parentOptions = useMemo(() => {
    const requiredParentRole = formRole === "OUM" ? "OGM" : formRole === "OSM" ? "OUM" : null;
    if (!requiredParentRole) return [];
    return members.filter((member) => member.role === requiredParentRole && member.id !== editingMember?.id);
  }, [editingMember?.id, formRole, members]);

  function openEdit(member: OutsourceMember) {
    setEditingMember(member);
    setFormRole(member.role || "");
    setFormParentId(member.parent_user_id ? String(member.parent_user_id) : "");
    setFormNotes(member.notes || "");
    setError("");
  }

  async function saveRelationship(event: React.FormEvent) {
    event.preventDefault();
    if (!editingMember) return;

    setSaving(true);
    setError("");
    try {
      const result = await updateOutsourceRelationship({
        userId: editingMember.id,
        role: formRole,
        parentUserId: formParentId ? Number(formParentId) : null,
        notes: formNotes,
      });

      if (!result.success) {
        setError(result.error || "Unable to save relationship.");
        return;
      }

      setEditingMember(null);
      await loadData();
    } catch (saveError) {
      console.error("Failed to save outsource relationship", saveError);
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <Link href="/users" className="inline-flex items-center gap-2 text-sm font-semibold text-secondary-600 hover:text-primary-700">
            <ArrowLeft className="h-4 w-4" />
            Users
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-secondary-900">Outsource Management</h1>
            <p className="text-secondary-600">OGM, OUM, and OSM reporting relationships.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={loadData}
          disabled={loading}
          className="btn-secondary flex items-center gap-2 self-start lg:self-auto"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-secondary-500">OGM</p>
              <p className="mt-2 text-3xl font-bold text-secondary-900">{stats.general_managers}</p>
            </div>
            <ShieldCheck className="h-8 w-8 text-sky-600" />
          </div>
          <p className="mt-3 text-sm text-secondary-500">General Manager</p>
        </div>
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-secondary-500">OUM</p>
              <p className="mt-2 text-3xl font-bold text-secondary-900">{stats.unit_managers}</p>
            </div>
            <Users className="h-8 w-8 text-emerald-600" />
          </div>
          <p className="mt-3 text-sm text-secondary-500">Unit Manager</p>
        </div>
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-secondary-500">OSM</p>
              <p className="mt-2 text-3xl font-bold text-secondary-900">{stats.sales}</p>
            </div>
            <Briefcase className="h-8 w-8 text-amber-600" />
          </div>
          <p className="mt-3 text-sm text-secondary-500">Sales</p>
        </div>
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-secondary-500">Unassigned</p>
              <p className="mt-2 text-3xl font-bold text-secondary-900">{stats.unassigned}</p>
            </div>
            <UserCircle className="h-8 w-8 text-secondary-500" />
          </div>
          <p className="mt-3 text-sm text-secondary-500">No outsource role</p>
        </div>
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-secondary-500">Review</p>
              <p className="mt-2 text-3xl font-bold text-secondary-900">{stats.invalid_relationships}</p>
            </div>
            <AlertTriangle className="h-8 w-8 text-danger-600" />
          </div>
          <p className="mt-3 text-sm text-secondary-500">Invalid links</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[420px_minmax(0,1fr)]">
        <section className="card min-w-0">
          <div className="border-b border-secondary-200 p-5">
            <div className="flex items-center gap-2">
              <GitBranch className="h-5 w-5 text-primary-600" />
              <h2 className="text-xl font-bold text-secondary-900">Hierarchy Map</h2>
            </div>
          </div>
          <div className="max-h-[660px] space-y-4 overflow-y-auto p-5">
            {loading ? (
              Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-24 animate-pulse rounded-lg bg-secondary-100" />
              ))
            ) : hierarchy.ogmGroups.length === 0 && hierarchy.topLevelUnits.length === 0 ? (
              <div className="rounded-lg border border-dashed border-secondary-300 p-8 text-center text-sm text-secondary-500">
                No OUM assigned yet.
              </div>
            ) : (
              <>
                {hierarchy.ogmGroups.map(({ ogm, units }) => (
                  <div key={ogm.id} className={`rounded-lg border p-4 ${ROLE_META.OGM.panel}`}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {roleBadge(ogm.role)}
                          <span className="text-sm font-semibold text-secondary-900 truncate">{ogm.name}</span>
                        </div>
                        <p className="mt-1 text-xs text-secondary-600">{downlineSummary(ogm)}</p>
                      </div>
                      <button type="button" onClick={() => openEdit(ogm)} className="btn-ghost px-3 py-1.5 text-xs">
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="mt-4 space-y-3">
                      {units.length === 0 ? (
                        <p className="rounded-md bg-white/70 px-3 py-2 text-xs text-secondary-500">No OUM under this OGM.</p>
                      ) : (
                        units.map(({ oum, sales }) => (
                          <div key={oum.id} className={`rounded-lg border p-3 ${ROLE_META.OUM.panel}`}>
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  {roleBadge(oum.role)}
                                  <span className="truncate text-sm font-semibold text-secondary-900">{oum.name}</span>
                                </div>
                                <p className="mt-1 text-xs text-secondary-600">{sales.length} OSM</p>
                              </div>
                              <button type="button" onClick={() => openEdit(oum)} className="btn-ghost px-3 py-1.5 text-xs">
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                              {sales.length === 0 ? (
                                <p className="rounded-md bg-white/70 px-3 py-2 text-xs text-secondary-500 sm:col-span-2">No OSM under this OUM.</p>
                              ) : (
                                sales.map((osm) => (
                                  <button
                                    key={osm.id}
                                    type="button"
                                    onClick={() => openEdit(osm)}
                                    className="flex min-w-0 items-center gap-2 rounded-md border border-amber-200 bg-white px-3 py-2 text-left hover:border-amber-300 hover:bg-amber-50"
                                  >
                                    {roleBadge(osm.role)}
                                    <span className="truncate text-xs font-semibold text-secondary-800">{osm.name}</span>
                                  </button>
                                ))
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ))}

                {hierarchy.topLevelUnits.map(({ oum, sales }) => (
                  <div key={oum.id} className={`rounded-lg border p-4 ${ROLE_META.OUM.panel}`}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {roleBadge(oum.role)}
                          <span className="text-sm font-semibold text-secondary-900 truncate">{oum.name}</span>
                        </div>
                        <p className="mt-1 text-xs text-secondary-600">{downlineSummary(oum)}</p>
                      </div>
                      <button type="button" onClick={() => openEdit(oum)} className="btn-ghost px-3 py-1.5 text-xs">
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {sales.length === 0 ? (
                        <p className="rounded-md bg-white/70 px-3 py-2 text-xs text-secondary-500 sm:col-span-2">No OSM under this OUM.</p>
                      ) : (
                        sales.map((osm) => (
                          <button
                            key={osm.id}
                            type="button"
                            onClick={() => openEdit(osm)}
                            className="flex min-w-0 items-center gap-2 rounded-md border border-amber-200 bg-white px-3 py-2 text-left hover:border-amber-300 hover:bg-amber-50"
                          >
                            {roleBadge(osm.role)}
                            <span className="truncate text-xs font-semibold text-secondary-800">{osm.name}</span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </section>

        <section className="card min-w-0">
          <div className="border-b border-secondary-200 p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-xl font-bold text-secondary-900">People</h2>
                <p className="text-sm text-secondary-500">
                  {filteredMembers.length} of {members.length} users shown
                </p>
              </div>
              <div className="relative w-full lg:max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-secondary-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search users..."
                  className="input pl-10"
                />
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {(["ALL", "OGM", "OUM", "OSM", "UNASSIGNED"] as RoleFilter[]).map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setRoleFilter(filter)}
                  className={`rounded-md border px-3 py-2 text-sm font-semibold transition-colors ${
                    roleFilter === filter
                      ? "border-primary-600 bg-primary-50 text-primary-700"
                      : "border-secondary-200 bg-white text-secondary-600 hover:bg-secondary-50"
                  }`}
                >
                  {filter === "ALL" ? "All" : filter === "UNASSIGNED" ? "Unassigned" : filter}
                </button>
              ))}
            </div>
          </div>
          <div className="divide-y divide-secondary-100">
            {loading ? (
              Array.from({ length: 7 }).map((_, index) => (
                <div key={index} className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1.5fr)_120px_minmax(0,1fr)_120px_88px] lg:items-center">
                  <div className="flex items-center gap-3">
                    <div className="h-11 w-11 animate-pulse rounded-lg bg-secondary-100" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="h-4 w-2/3 animate-pulse rounded bg-secondary-100" />
                      <div className="h-3 w-1/2 animate-pulse rounded bg-secondary-100" />
                    </div>
                  </div>
                  <div className="h-7 w-24 animate-pulse rounded bg-secondary-100" />
                  <div className="h-4 w-32 animate-pulse rounded bg-secondary-100" />
                  <div className="h-4 w-20 animate-pulse rounded bg-secondary-100" />
                  <div className="h-9 w-20 animate-pulse rounded bg-secondary-100" />
                </div>
              ))
            ) : filteredMembers.length === 0 ? (
              <div className="px-6 py-14 text-center text-sm text-secondary-500">No matching users.</div>
            ) : (
              filteredMembers.map((member) => (
                <div
                  key={member.id}
                  className="grid min-w-0 gap-4 px-5 py-4 transition-colors hover:bg-secondary-50/70 lg:grid-cols-[minmax(0,1.5fr)_120px_minmax(0,1fr)_120px_88px] lg:items-center"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-secondary-100">
                      {member.profile_picture ? (
                        <img src={member.profile_picture} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <UserCircle className="h-5 w-5 text-secondary-400" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="break-words text-sm font-semibold leading-5 text-secondary-900">{member.name}</p>
                      <p className="mt-1 break-words text-xs leading-5 text-secondary-500">{memberSubtitle(member)}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 lg:block">
                    <span className="w-20 shrink-0 text-xs font-semibold uppercase text-secondary-400 lg:hidden">Role</span>
                    {roleBadge(member.role)}
                  </div>

                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase text-secondary-400">Reports to</p>
                    <p className="mt-1 break-words text-sm font-semibold text-secondary-800">{reportsToSummary(member)}</p>
                    {member.parent_role && <div className="mt-2">{roleBadge(member.parent_role)}</div>}
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase text-secondary-400">Downline</p>
                    <p className="mt-1 text-sm font-semibold text-secondary-800">{downlineSummary(member)}</p>
                  </div>

                  <div className="flex justify-start lg:justify-end">
                    <button type="button" onClick={() => openEdit(member)} className="btn-secondary h-9 px-3 text-primary-700">
                      <Edit2 className="h-4 w-4" />
                      Edit
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {editingMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-secondary-900/50 p-4 backdrop-blur-sm">
          <form onSubmit={saveRelationship} className="w-full max-w-xl rounded-xl bg-white shadow-elevation-lg">
            <div className="flex items-start justify-between gap-4 border-b border-secondary-200 p-6">
              <div className="min-w-0">
                <h2 className="text-xl font-bold text-secondary-900">Edit Relationship</h2>
                <p className="mt-1 truncate text-sm text-secondary-500">{editingMember.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingMember(null)}
                className="rounded-lg p-2 text-secondary-500 hover:bg-secondary-100"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-5 p-6">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-secondary-700">Outsource Role</label>
                <select
                  value={formRole}
                  onChange={(event) => {
                    setFormRole(event.target.value as OutsourceRole | "");
                    setFormParentId("");
                    setError("");
                  }}
                  className="input"
                >
                  <option value="">Unassigned</option>
                  <option value="OGM">OGM - General Manager</option>
                  <option value="OUM">OUM - Unit Manager</option>
                  <option value="OSM">OSM - Sales</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-secondary-700">Reports To</label>
                <select
                  value={formParentId}
                  onChange={(event) => {
                    setFormParentId(event.target.value);
                    setError("");
                  }}
                  disabled={formRole !== "OUM" && formRole !== "OSM"}
                  className="input disabled:cursor-not-allowed disabled:bg-secondary-50"
                >
                  <option value="">
                    {formRole === "OUM"
                      ? "Select OGM (Optional)"
                      : formRole === "OSM"
                        ? "Select OUM"
                        : "No parent for this role"}
                  </option>
                  {parentOptions.map((parent) => (
                    <option key={parent.id} value={parent.id}>
                      {parent.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-secondary-700">Notes</label>
                <textarea
                  value={formNotes}
                  onChange={(event) => setFormNotes(event.target.value)}
                  className="input min-h-[100px] py-3"
                  placeholder="Internal notes..."
                />
              </div>

              {error && (
                <div className="rounded-lg border border-danger-200 bg-danger-50 px-4 py-3 text-sm font-semibold text-danger-700">
                  {error}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-secondary-200 p-6">
              <button type="button" onClick={() => setEditingMember(null)} className="btn-secondary">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
                <Save className="h-4 w-4" />
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

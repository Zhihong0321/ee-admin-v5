"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Building2,
  Check,
  Edit2,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  UserCircle,
  Users,
  X,
} from "lucide-react";
import {
  createDepartment,
  getDepartmentManagementData,
  updateDepartmentAssignments,
  type DepartmentUserOption,
  type ManagedDepartment,
} from "./actions";

type DepartmentStats = {
  departments: number;
  assigned_hods: number;
  assistant_hods: number;
  members: number;
  unstaffed_departments: number;
};

const EMPTY_STATS: DepartmentStats = {
  departments: 0,
  assigned_hods: 0,
  assistant_hods: 0,
  members: 0,
  unstaffed_departments: 0,
};

function userLabel(user: DepartmentUserOption) {
  return [user.name, user.agent_code, user.email].filter(Boolean).join(" - ");
}

function departmentMatches(department: ManagedDepartment, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  return [
    department.name,
    department.description,
    department.hod?.name,
    ...department.assistant_hods.map((assistant) => assistant.name),
    ...department.members.map((member) => member.name),
  ].some((value) => value?.toLowerCase().includes(normalizedQuery));
}

function userMatches(user: DepartmentUserOption, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  return [user.name, user.email, user.contact, user.agent_code].some((value) =>
    value?.toLowerCase().includes(normalizedQuery)
  );
}

function personPill(user: DepartmentUserOption | null, fallback: string) {
  if (!user) {
    return <span className="text-sm text-secondary-500">{fallback}</span>;
  }

  return (
    <span className="inline-flex max-w-full items-center gap-2 rounded-md border border-secondary-200 bg-white px-2.5 py-1.5 text-sm font-semibold text-secondary-800">
      <UserCircle className="h-4 w-4 shrink-0 text-secondary-400" />
      <span className="truncate">{user.name}</span>
    </span>
  );
}

export default function DepartmentManagementPage() {
  const [departments, setDepartments] = useState<ManagedDepartment[]>([]);
  const [users, setUsers] = useState<DepartmentUserOption[]>([]);
  const [stats, setStats] = useState<DepartmentStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [error, setError] = useState("");

  const [newDepartmentName, setNewDepartmentName] = useState("");
  const [newDepartmentDescription, setNewDepartmentDescription] = useState("");

  const [editingDepartment, setEditingDepartment] = useState<ManagedDepartment | null>(null);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formHodId, setFormHodId] = useState("");
  const [formAssistantOneId, setFormAssistantOneId] = useState("");
  const [formAssistantTwoId, setFormAssistantTwoId] = useState("");
  const [formMemberIds, setFormMemberIds] = useState<number[]>([]);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const data = await getDepartmentManagementData();
      setDepartments(data.departments);
      setUsers(data.users);
      setStats(data.stats);
      if (data.error) {
        setError(data.error);
      }
    } catch (loadError) {
      console.error("Failed to load department management data", loadError);
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const filteredDepartments = useMemo(
    () => departments.filter((department) => departmentMatches(department, search)),
    [departments, search]
  );

  const selectedLeadershipIds = useMemo(
    () => new Set([formHodId, formAssistantOneId, formAssistantTwoId].filter(Boolean).map(Number)),
    [formAssistantOneId, formAssistantTwoId, formHodId]
  );

  const filteredUsers = useMemo(
    () => users.filter((user) => userMatches(user, memberSearch)),
    [memberSearch, users]
  );

  function openEdit(department: ManagedDepartment) {
    setEditingDepartment(department);
    setFormName(department.name);
    setFormDescription(department.description || "");
    setFormHodId(department.hod ? String(department.hod.id) : "");
    setFormAssistantOneId(department.assistant_hods[0] ? String(department.assistant_hods[0].id) : "");
    setFormAssistantTwoId(department.assistant_hods[1] ? String(department.assistant_hods[1].id) : "");
    setFormMemberIds(department.members.map((member) => member.id));
    setMemberSearch("");
    setError("");
  }

  async function handleCreateDepartment(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const result = await createDepartment({
        name: newDepartmentName,
        description: newDepartmentDescription,
      });

      if (!result.success) {
        setError(result.error || "Unable to create department.");
        return;
      }

      setNewDepartmentName("");
      setNewDepartmentDescription("");
      await loadData();
    } catch (createError) {
      console.error("Failed to create department", createError);
      setError(createError instanceof Error ? createError.message : String(createError));
    } finally {
      setSaving(false);
    }
  }

  function updateAssistantOne(value: string) {
    setFormAssistantOneId(value);
    if (value && value === formAssistantTwoId) setFormAssistantTwoId("");
    if (value) setFormMemberIds((ids) => ids.filter((id) => id !== Number(value)));
  }

  function updateAssistantTwo(value: string) {
    setFormAssistantTwoId(value);
    if (value && value === formAssistantOneId) setFormAssistantOneId("");
    if (value) setFormMemberIds((ids) => ids.filter((id) => id !== Number(value)));
  }

  function updateHod(value: string) {
    setFormHodId(value);
    if (value && value === formAssistantOneId) setFormAssistantOneId("");
    if (value && value === formAssistantTwoId) setFormAssistantTwoId("");
    if (value) setFormMemberIds((ids) => ids.filter((id) => id !== Number(value)));
  }

  function toggleMember(userId: number) {
    if (selectedLeadershipIds.has(userId)) return;
    setFormMemberIds((ids) =>
      ids.includes(userId) ? ids.filter((id) => id !== userId) : [...ids, userId]
    );
  }

  async function handleSaveDepartment(event: React.FormEvent) {
    event.preventDefault();
    if (!editingDepartment) return;

    setSaving(true);
    setError("");

    try {
      const assistantIds = [formAssistantOneId, formAssistantTwoId]
        .filter(Boolean)
        .map(Number);

      const result = await updateDepartmentAssignments({
        departmentId: editingDepartment.id,
        name: formName,
        description: formDescription,
        hodUserId: formHodId ? Number(formHodId) : null,
        assistantHodUserIds: assistantIds,
        memberUserIds: formMemberIds,
      });

      if (!result.success) {
        setError(result.error || "Unable to save department.");
        return;
      }

      setEditingDepartment(null);
      await loadData();
    } catch (saveError) {
      console.error("Failed to save department", saveError);
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
            <h1 className="text-3xl font-bold text-secondary-900">Department Management</h1>
            <p className="text-secondary-600">Create departments and assign HoD, Assistant HoD, and members.</p>
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

      {error && !editingDepartment && (
        <div className="rounded-lg border border-danger-200 bg-danger-50 px-4 py-3 text-sm font-semibold text-danger-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-secondary-500">Departments</p>
              <p className="mt-2 text-3xl font-bold text-secondary-900">{stats.departments}</p>
            </div>
            <Building2 className="h-8 w-8 text-primary-600" />
          </div>
        </div>
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-secondary-500">HoD Set</p>
              <p className="mt-2 text-3xl font-bold text-secondary-900">{stats.assigned_hods}</p>
            </div>
            <ShieldCheck className="h-8 w-8 text-sky-600" />
          </div>
        </div>
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-secondary-500">Assistant HoD</p>
              <p className="mt-2 text-3xl font-bold text-secondary-900">{stats.assistant_hods}</p>
            </div>
            <Users className="h-8 w-8 text-emerald-600" />
          </div>
        </div>
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-secondary-500">Members</p>
              <p className="mt-2 text-3xl font-bold text-secondary-900">{stats.members}</p>
            </div>
            <UserCircle className="h-8 w-8 text-amber-600" />
          </div>
        </div>
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-secondary-500">Unstaffed</p>
              <p className="mt-2 text-3xl font-bold text-secondary-900">{stats.unstaffed_departments}</p>
            </div>
            <Building2 className="h-8 w-8 text-secondary-500" />
          </div>
        </div>
      </div>

      <form onSubmit={handleCreateDepartment} className="card">
        <div className="border-b border-secondary-200 p-5">
          <h2 className="text-xl font-bold text-secondary-900">Create Department</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_auto] lg:items-end">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-secondary-700">Department Name</label>
            <input
              type="text"
              value={newDepartmentName}
              onChange={(event) => setNewDepartmentName(event.target.value)}
              className="input"
              placeholder="Finance"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-secondary-700">Description</label>
            <input
              type="text"
              value={newDepartmentDescription}
              onChange={(event) => setNewDepartmentDescription(event.target.value)}
              className="input"
              placeholder="Optional"
            />
          </div>
          <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Create
          </button>
        </div>
      </form>

      <section className="card">
        <div className="border-b border-secondary-200 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-bold text-secondary-900">Departments</h2>
              <p className="text-sm text-secondary-500">{filteredDepartments.length} departments shown</p>
            </div>
            <div className="relative w-full lg:w-96">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-secondary-400" />
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search department or user..."
                className="input pl-10"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Department</th>
                <th>HoD</th>
                <th>Assistant HoD</th>
                <th>Members</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <tr key={index} className="animate-pulse">
                    <td colSpan={5} className="px-6 py-5">
                      <div className="h-4 w-3/4 rounded bg-secondary-200" />
                    </td>
                  </tr>
                ))
              ) : filteredDepartments.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-sm text-secondary-500">
                    No departments found.
                  </td>
                </tr>
              ) : (
                filteredDepartments.map((department) => (
                  <tr key={department.id}>
                    <td className="whitespace-normal">
                      <div className="min-w-[220px]">
                        <p className="font-semibold text-secondary-900">{department.name}</p>
                        <p className="mt-1 text-sm text-secondary-500">{department.description || "No description"}</p>
                        <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-secondary-400">
                          {department.headcount} total assigned
                        </p>
                      </div>
                    </td>
                    <td className="whitespace-normal">{personPill(department.hod, "No HoD")}</td>
                    <td className="whitespace-normal">
                      <div className="flex min-w-[220px] flex-wrap gap-2">
                        {department.assistant_hods.length > 0
                          ? department.assistant_hods.map((assistant) => (
                              <span key={assistant.id}>{personPill(assistant, "")}</span>
                            ))
                          : personPill(null, "No assistant HoD")}
                      </div>
                    </td>
                    <td>
                      <span className="text-sm font-semibold text-secondary-700">{department.members.length}</span>
                    </td>
                    <td className="text-right">
                      <button type="button" onClick={() => openEdit(department)} className="btn-ghost text-primary-700">
                        <Edit2 className="h-4 w-4" />
                        Edit
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {editingDepartment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-secondary-900/50 p-4 backdrop-blur-sm">
          <form onSubmit={handleSaveDepartment} className="flex max-h-[92vh] w-full max-w-4xl flex-col rounded-xl bg-white shadow-elevation-lg">
            <div className="flex items-start justify-between gap-4 border-b border-secondary-200 p-6">
              <div className="min-w-0">
                <h2 className="text-xl font-bold text-secondary-900">Edit Department</h2>
                <p className="mt-1 truncate text-sm text-secondary-500">{editingDepartment.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingDepartment(null)}
                className="rounded-lg p-2 text-secondary-500 hover:bg-secondary-100"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-secondary-700">Department Name</label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(event) => setFormName(event.target.value)}
                    className="input"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-secondary-700">Description</label>
                  <input
                    type="text"
                    value={formDescription}
                    onChange={(event) => setFormDescription(event.target.value)}
                    className="input"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-secondary-700">HoD</label>
                  <select value={formHodId} onChange={(event) => updateHod(event.target.value)} className="input">
                    <option value="">No HoD</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {userLabel(user)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-secondary-700">Assistant HoD 1</label>
                    <select value={formAssistantOneId} onChange={(event) => updateAssistantOne(event.target.value)} className="input">
                      <option value="">No assistant</option>
                      {users
                        .filter((user) => String(user.id) !== formHodId && String(user.id) !== formAssistantTwoId)
                        .map((user) => (
                          <option key={user.id} value={user.id}>
                            {userLabel(user)}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-secondary-700">Assistant HoD 2</label>
                    <select value={formAssistantTwoId} onChange={(event) => updateAssistantTwo(event.target.value)} className="input">
                      <option value="">No assistant</option>
                      {users
                        .filter((user) => String(user.id) !== formHodId && String(user.id) !== formAssistantOneId)
                        .map((user) => (
                          <option key={user.id} value={user.id}>
                            {userLabel(user)}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="mt-6 border-t border-secondary-200 pt-6">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-secondary-900">Members</h3>
                    <p className="text-sm text-secondary-500">{formMemberIds.length} regular members selected</p>
                  </div>
                  <div className="relative w-full lg:w-80">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-secondary-400" />
                    <input
                      type="text"
                      value={memberSearch}
                      onChange={(event) => setMemberSearch(event.target.value)}
                      placeholder="Search users..."
                      className="input pl-10"
                    />
                  </div>
                </div>

                <div className="mt-4 max-h-80 overflow-y-auto rounded-lg border border-secondary-200">
                  {filteredUsers.length === 0 ? (
                    <div className="p-6 text-center text-sm text-secondary-500">No users found.</div>
                  ) : (
                    filteredUsers.map((user) => {
                      const isLeadership = selectedLeadershipIds.has(user.id);
                      const isSelected = formMemberIds.includes(user.id);

                      return (
                        <button
                          key={user.id}
                          type="button"
                          onClick={() => toggleMember(user.id)}
                          disabled={isLeadership}
                          className="flex w-full items-center justify-between gap-4 border-b border-secondary-100 px-4 py-3 text-left last:border-b-0 hover:bg-secondary-50 disabled:cursor-not-allowed disabled:bg-secondary-50/70"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-secondary-100">
                              {user.profile_picture ? (
                                <img src={user.profile_picture} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <UserCircle className="h-5 w-5 text-secondary-400" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-secondary-900">{user.name}</p>
                              <p className="truncate text-xs text-secondary-500">{user.agent_code || user.email || "No agent code"}</p>
                            </div>
                          </div>
                          {isLeadership ? (
                            <span className="shrink-0 rounded-md bg-primary-50 px-2 py-1 text-xs font-semibold text-primary-700">
                              Leadership
                            </span>
                          ) : isSelected ? (
                            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary-600 text-white">
                              <Check className="h-4 w-4" />
                            </span>
                          ) : (
                            <span className="h-6 w-6 shrink-0 rounded-md border border-secondary-300 bg-white" />
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {error && (
                <div className="mt-5 rounded-lg border border-danger-200 bg-danger-50 px-4 py-3 text-sm font-semibold text-danger-700">
                  {error}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-secondary-200 p-6">
              <button type="button" onClick={() => setEditingDepartment(null)} className="btn-secondary">
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

"use client";

import { useState, useEffect } from "react";
import { Search, Filter, ArrowUpDown, ChevronLeft, ChevronRight, Download, Plus, Eye, User, Mail, Phone, MapPin, Edit2, Shield, Briefcase, Building2, Calendar, X, PlusCircle, RefreshCw } from "lucide-react";
import { getUsers, updateUserProfile, getAllUniqueTags, triggerProfileSync, syncUserFromBubble, createAgentForUser } from "./actions";

export default function UsersPage() {
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState("");
  const [activeTab, setActiveTab] = useState<'profile' | 'mykad'>('profile');

  useEffect(() => {
    fetchData();
    loadAvailableTags();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const data = await getUsers(search);
      setUsers(data);
    } catch (error) {
      console.error("Failed to fetch users", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const result = await triggerProfileSync();
      if (result.success) {
        alert("Sync complete: Profiles updated based on latest modification.");
        fetchData();
      } else {
        alert("Sync failed: " + result.error);
      }
    } catch (error) {
      console.error("Sync error", error);
      alert("Sync error");
    } finally {
      setSyncing(false);
    }
  }

  async function handleSingleSync(bubbleId: string, agentBubbleId?: string) {
    setSyncing(true);
    try {
      const result = await syncUserFromBubble(bubbleId, agentBubbleId);
      if (result.success) {
        // Update local state for editing user if open
        if (editingUser && editingUser.bubble_id === bubbleId) {
          const updatedUsers = await getUsers(search);
          const updatedUser = updatedUsers.find(u => u.bubble_id === bubbleId);
          if (updatedUser) setEditingUser(updatedUser);
        }
        fetchData();
      } else {
        alert("Sync failed");
      }
    } catch (error) {
      console.error("Single sync error", error);
    } finally {
      setSyncing(false);
    }
  }

  async function loadAvailableTags() {
    try {
      const tags = await getAllUniqueTags();
      setAvailableTags(tags);
    } catch (error) {
      console.error("Failed to load tags", error);
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchData();
  };

  const handleEditClick = (user: any) => {
    setEditingUser({ ...user });
    setActiveTab('profile'); // Reset to profile tab when opening modal
    setIsEditModalOpen(true);
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('🟢 handleUpdateUser CALLED');
    if (!editingUser) {
      console.log('❌ No editingUser');
      return;
    }

    console.log('=== FORM SUBMISSION DEBUG ===');
    console.log('User ID:', editingUser.id);
    console.log('Agent data being sent:', {
      name: editingUser.agent_name,
      email: editingUser.agent_email,
      contact: editingUser.agent_contact,
      address: editingUser.agent_address,
      banker: editingUser.agent_banker,
      bankin_account: editingUser.agent_bankin_account,
    });
    console.log('Access level:', editingUser.access_level);
    console.log('========================');

    try {
      const result = await updateUserProfile(editingUser.id, {
        name: editingUser.agent_name,
        email: editingUser.agent_email,
        contact: editingUser.agent_contact,
        address: editingUser.agent_address,
        banker: editingUser.agent_banker,
        bankin_account: editingUser.agent_bankin_account,
      }, editingUser.access_level);

      if (result.success) {
        setIsEditModalOpen(false);
        fetchData();
        loadAvailableTags();
      } else {
        alert(`Failed to update user: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error("Failed to update user", error);
      alert(`Failed to update user: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const toggleTag = (tag: string) => {
    if (!editingUser) return;
    const currentTags = [...(editingUser.access_level || [])];
    const index = currentTags.indexOf(tag);
    if (index > -1) {
      currentTags.splice(index, 1);
    } else {
      currentTags.push(tag);
    }
    setEditingUser({ ...editingUser, access_level: currentTags });
  };

  const addNewTag = () => {
    if (!newTagInput.trim() || !editingUser) return;
    const tag = newTagInput.trim().toLowerCase();
    const currentTags = [...(editingUser.access_level || [])];
    if (!currentTags.includes(tag)) {
      currentTags.push(tag);
      setEditingUser({ ...editingUser, access_level: currentTags });
    }
    if (!availableTags.includes(tag)) {
      setAvailableTags(prev => [...prev, tag].sort());
    }
    setNewTagInput("");
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold text-secondary-900">Users & Agents</h1>
          <p className="text-secondary-600">
            Manage your application users and their linked agent profiles.
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={handleSync}
            disabled={syncing}
            className="btn-secondary flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync Bubble'}
          </button>
          <button className="btn-secondary flex items-center gap-2">
            <Download className="h-4 w-4" />
            Export
          </button>
          <button className="btn-primary flex items-center gap-2">
            <Plus className="h-4 w-4" />
            New User
          </button>
        </div>
      </div>

      {/* Main Card */}
      <div className="card">
        {/* Filters Bar */}
        <div className="p-6 border-b border-secondary-200 bg-gradient-to-r from-secondary-50/50 to-white">
          <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="relative w-full md:w-96">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-secondary-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search by name, email, or agent code..."
                className="input pl-12 pr-4"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            
            <div className="flex items-center gap-2 w-full md:w-auto">
              <button 
                type="button"
                onClick={fetchData}
                className="btn-secondary flex items-center gap-2"
              >
                <Filter className="w-4 h-4" />
                Filter
              </button>
              <button 
                type="button"
                className="btn-secondary flex items-center gap-2"
              >
                <ArrowUpDown className="w-4 h-4" />
                Sort
              </button>
            </div>
          </form>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>User / Agent</th>
                <th>Contact</th>
                <th>Joined</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={5} className="px-6 py-6">
                      <div className="h-4 bg-secondary-200 rounded w-3/4"></div>
                    </td>
                  </tr>
                ))
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="p-4 bg-secondary-100 rounded-full">
                        <User className="h-8 w-8 text-secondary-400" />
                      </div>
                      <div>
                        <p className="font-medium text-secondary-900 mb-1">No users found</p>
                        <p className="text-sm text-secondary-600">
                          {search ? "Try adjusting your search criteria" : "Start by adding your first user"}
                        </p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-secondary-100 flex items-center justify-center overflow-hidden">
                          {user.profile_picture ? (
                            <img src={user.profile_picture} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <User className="h-5 w-5 text-secondary-400" />
                          )}
                        </div>
                        <div>
                          <div className="font-semibold text-secondary-900">{user.agent_name || "N/A"}</div>
                          <div className="text-xs text-secondary-500 mb-1.5">{user.agent_code || "No Code"}</div>
                          {user.access_level && user.access_level.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {user.access_level.slice(0, 3).map((tag: string) => (
                                <span 
                                  key={tag} 
                                  className="px-1.5 py-0.5 bg-primary-50 text-primary-600 text-[10px] font-medium rounded border border-primary-100"
                                >
                                  {tag}
                                </span>
                              ))}
                              {user.access_level.length > 3 && (
                                <span className="text-[10px] text-secondary-400 font-medium">
                                  +{user.access_level.length - 3} more
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 text-sm text-secondary-600">
                          <Mail className="h-3.5 w-3.5" />
                          {user.agent_email || "No Email"}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-secondary-600">
                          <Phone className="h-3.5 w-3.5" />
                          {user.agent_contact || "No Contact"}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center gap-2 text-sm text-secondary-600">
                        <Calendar className="h-3.5 w-3.5" />
                          {user.joined_date
                          ? new Date(user.joined_date).toLocaleDateString("en-US", {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })
                          : "N/A"}
                      </div>
                      {user.last_synced_at && (
                        <div className="text-[10px] text-secondary-400 mt-1 flex items-center gap-1">
                          <RefreshCw className="h-2.5 w-2.5" />
                          Synced {new Date(user.last_synced_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      )}
                    </td>
                    <td>
                      {user.access_level?.includes("blocked") ? (
                        <span className="badge-danger uppercase font-bold">
                          Blocked
                        </span>
                      ) : user.access_level?.includes("pending") ? (
                        <span className="badge-warning uppercase font-bold">
                          Pending Approval
                        </span>
                      ) : user.user_signed_up ? (
                        <span className="badge-success uppercase font-bold">
                          Active
                        </span>
                      ) : (
                        <span className="badge bg-secondary-100 text-secondary-600 uppercase font-bold">
                          Pending Signup
                        </span>
                      )}
                    </td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          onClick={() => handleEditClick(user)}
                          className="btn-ghost text-primary-600 hover:text-primary-700 flex items-center gap-1.5"
                        >
                          <Edit2 className="h-4 w-4" />
                          Edit
                        </button>
                        <button className="btn-ghost text-secondary-600 hover:text-secondary-700">
                          <Eye className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-secondary-900/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-elevation-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-scale-in">
            <div className="p-6 border-b border-secondary-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-bold text-secondary-900">Edit User Profile</h2>
                  <button 
                    type="button"
                    onClick={() => handleSingleSync(editingUser.bubble_id, editingUser.linked_agent_profile)}
                    disabled={syncing}
                    className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-bold uppercase tracking-wider bg-secondary-100 text-secondary-600 rounded-lg hover:bg-primary-50 hover:text-primary-600 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3 w-3 ${syncing ? 'animate-spin' : ''}`} />
                    {syncing ? 'Syncing...' : 'Sync from Bubble'}
                  </button>
                  {editingUser?.access_level?.includes("blocked") ? (
                    <span className="badge-danger uppercase font-bold">
                      Blocked
                    </span>
                  ) : editingUser?.access_level?.includes("pending") ? (
                    <span className="badge-warning uppercase font-bold">
                      Pending Approval
                    </span>
                  ) : editingUser?.user_signed_up ? (
                    <span className="badge-success uppercase font-bold">
                      Active
                    </span>
                  ) : (
                    <span className="badge bg-secondary-100 text-secondary-600 uppercase font-bold">
                      Pending Signup
                    </span>
                  )}
                </div>
                <p className="text-sm text-secondary-500">Managing Agent: {editingUser?.agent_name}</p>
                
                {/* Tab Navigation */}
                <div className="flex gap-2 mt-4">
                  <button
                    type="button"
                    onClick={() => setActiveTab('profile')}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      activeTab === 'profile'
                        ? 'bg-primary-600 text-white'
                        : 'bg-secondary-100 text-secondary-600 hover:bg-secondary-200'
                    }`}
                  >
                    Profile
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('mykad')}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      activeTab === 'mykad'
                        ? 'bg-primary-600 text-white'
                        : 'bg-secondary-100 text-secondary-600 hover:bg-secondary-200'
                    }`}
                  >
                    MyKad Documents
                  </button>
                </div>
              </div>
              <button 
                onClick={() => setIsEditModalOpen(false)}
                className="p-2 hover:bg-secondary-100 rounded-full transition-colors"
              >
                <Plus className="h-6 w-6 rotate-45 text-secondary-500" />
              </button>
            </div>
            
            <form onSubmit={handleUpdateUser} className="p-6 space-y-6">
              {activeTab === 'profile' ? (
                <>
              {/* Profile Picture Display */}
              <div className="flex flex-col items-center justify-center pb-6 border-b border-secondary-100">
                <div className="relative group">
                  <div className="h-32 w-32 rounded-2xl bg-secondary-100 flex items-center justify-center overflow-hidden border-4 border-white shadow-elevation-md">
                    {editingUser?.profile_picture ? (
                      <img 
                        src={editingUser.profile_picture} 
                        alt={editingUser.agent_name} 
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <User className="h-12 w-12 text-secondary-300" />
                    )}
                  </div>
                  <div className="absolute -bottom-2 -right-2 p-2 bg-primary-600 rounded-xl text-white shadow-sm">
                    <Shield className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-4 text-center">
                  <h3 className="font-bold text-secondary-900">{editingUser?.agent_name}</h3>
                  <p className="text-sm text-secondary-500 mb-4">{editingUser?.agent_type || "Agent"}</p>
                  
                  {/* Tag Management Section */}
                  <div className="space-y-4 px-6 text-left">
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-secondary-500">Active Tags</label>
                      <div className="flex flex-wrap gap-1.5 min-h-[32px] p-2 bg-secondary-50 rounded-xl border border-secondary-100">
                        {editingUser?.access_level && editingUser.access_level.length > 0 ? (
                          editingUser.access_level.map((tag: string) => (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => toggleTag(tag)}
                              className="group flex items-center gap-1 px-2 py-1 bg-primary-600 text-white text-[10px] font-bold uppercase rounded-lg hover:bg-red-500 transition-colors"
                            >
                              {tag}
                              <X className="h-3 w-3 opacity-60 group-hover:opacity-100" />
                            </button>
                          ))
                        ) : (
                          <span className="text-xs text-secondary-400 italic px-1">No tags assigned</span>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-secondary-500">Available Tags</label>
                      <div className="flex flex-wrap gap-1.5 max-h-[120px] overflow-y-auto p-1">
                        {availableTags
                          .filter(t => !editingUser?.access_level?.includes(t))
                          .map((tag: string) => (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => toggleTag(tag)}
                              className="px-2 py-1 bg-white text-secondary-600 text-[10px] font-bold uppercase rounded-lg border border-secondary-200 hover:border-primary-400 hover:text-primary-600 transition-all"
                            >
                              + {tag}
                            </button>
                          ))
                        }
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Add new custom tag..."
                        className="input text-xs py-2"
                        value={newTagInput}
                        onChange={(e) => setNewTagInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addNewTag())}
                      />
                      <button
                        type="button"
                        onClick={addNewTag}
                        className="btn-secondary py-2 px-3 flex items-center gap-1.5"
                      >
                        <PlusCircle className="h-4 w-4" />
                        Add
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-secondary-700">Full Name</label>
                  <input
                    type="text"
                    required
                    className="input"
                    value={editingUser?.agent_name || ""}
                    onChange={(e) => setEditingUser({ ...editingUser, agent_name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-secondary-700">Email Address</label>
                  <input
                    type="email"
                    required
                    className="input"
                    value={editingUser?.agent_email || ""}
                    onChange={(e) => setEditingUser({ ...editingUser, agent_email: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-secondary-700">Contact Number</label>
                  <input
                    type="text"
                    className="input"
                    value={editingUser?.agent_contact || ""}
                    onChange={(e) => setEditingUser({ ...editingUser, agent_contact: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-secondary-700">Agent Code</label>
                  <input
                    type="text"
                    disabled
                    className="input bg-secondary-50 cursor-not-allowed"
                    value={editingUser?.agent_code || ""}
                  />
                </div>
                <div className="md:col-span-2 space-y-2">
                  <label className="text-sm font-semibold text-secondary-700">Office Address</label>
                  <textarea
                    className="input min-h-[100px] py-3"
                    value={editingUser?.agent_address || ""}
                    onChange={(e) => setEditingUser({ ...editingUser, agent_address: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-secondary-700">Bank Name</label>
                  <input
                    type="text"
                    className="input"
                    value={editingUser?.agent_banker || ""}
                    onChange={(e) => setEditingUser({ ...editingUser, agent_banker: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-secondary-700">Bank Account No.</label>
                  <input
                    type="text"
                    className="input"
                    value={editingUser?.agent_bankin_account || ""}
                    onChange={(e) => setEditingUser({ ...editingUser, agent_bankin_account: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-6 border-t border-secondary-200">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!editingUser) return;
                    
                    try {
                      const result = await updateUserProfile(editingUser.id, {
                        name: editingUser.agent_name,
                        email: editingUser.agent_email,
                        contact: editingUser.agent_contact,
                        address: editingUser.agent_address,
                        banker: editingUser.agent_banker,
                        bankin_account: editingUser.agent_bankin_account,
                      }, editingUser.access_level);

                      if (result.success) {
                        alert('Saved successfully!');
                        setIsEditModalOpen(false);
                        fetchData();
                        loadAvailableTags();
                      } else if (result.error?.includes('no linked agent') || result.error?.includes('broken')) {
                        // Offer to create agent profile
                        const createNew = confirm(`${result.error}\n\nWould you like to create a new agent profile for this user?`);
                        if (createNew) {
                          const createResult = await createAgentForUser(editingUser.id, {
                            name: editingUser.agent_name,
                            email: editingUser.agent_email,
                            contact: editingUser.agent_contact,
                            address: editingUser.agent_address,
                            banker: editingUser.agent_banker,
                            bankin_account: editingUser.agent_bankin_account,
                          });
                          
                          if (createResult.success) {
                            alert('Agent profile created and linked successfully!');
                            setIsEditModalOpen(false);
                            fetchData();
                          } else {
                            alert(`Failed to create agent: ${createResult.error}`);
                          }
                        }
                      } else {
                        alert(`Failed: ${result.error || 'Unknown error'}`);
                      }
                    } catch (error) {
                      alert(`Error: ${error instanceof Error ? error.message : String(error)}`);
                    }
                  }}
                  className="btn-primary"
                >
                  Save Changes
                </button>
              </div>
              </>
              ) : (
                <>
                {/* MyKad Documents Tab - EMPLOYEE IC for User/Agent */}
                <div className="space-y-6">
                  <div className="bg-green-50 border-2 border-green-400 rounded-xl p-6 mb-6">
                    <h3 className="font-bold text-green-800 mb-2 text-lg">✅ Employee IC Documents</h3>
                    <p className="text-green-700 text-sm">
                      <strong>This section shows EMPLOYEE IC</strong> (the agent/user's own identification), <strong>NOT customer IC from SEDA Registration!</strong>
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div className="bg-white rounded-xl border border-secondary-200 p-6">
                      <h3 className="font-semibold text-secondary-900 mb-4">Agent/Employee IC Documents</h3>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* IC Front */}
                        <div className="space-y-3">
                          <label className="text-sm font-semibold text-secondary-700 flex items-center gap-2">
                            <span>IC Front (Employee)</span>
                            {editingUser?.agent_ic_front && (
                              <span className="badge-success text-[10px]">Uploaded</span>
                            )}
                          </label>
                          {editingUser?.agent_ic_front ? (
                            <div className="relative group">
                              <img 
                                src={editingUser.agent_ic_front} 
                                alt="IC Front" 
                                className="w-full h-48 object-cover rounded-lg border-2 border-secondary-200"
                              />
                              <a 
                                href={editingUser.agent_ic_front} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-semibold rounded-lg"
                              >
                                View Full Size
                              </a>
                            </div>
                          ) : (
                            <div className="w-full h-48 bg-secondary-100 rounded-lg border-2 border-dashed border-secondary-300 flex items-center justify-center text-secondary-400">
                              <div className="text-center">
                                <p className="text-sm font-medium">No IC Front Uploaded</p>
                                <p className="text-xs mt-1">Upload through Bubble.io</p>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* IC Back */}
                        <div className="space-y-3">
                          <label className="text-sm font-semibold text-secondary-700 flex items-center gap-2">
                            <span>IC Back (Employee)</span>
                            {editingUser?.agent_ic_back && (
                              <span className="badge-success text-[10px]">Uploaded</span>
                            )}
                          </label>
                          {editingUser?.agent_ic_back ? (
                            <div className="relative group">
                              <img 
                                src={editingUser.agent_ic_back} 
                                alt="IC Back" 
                                className="w-full h-48 object-cover rounded-lg border-2 border-secondary-200"
                              />
                              <a 
                                href={editingUser.agent_ic_back} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-semibold rounded-lg"
                              >
                                View Full Size
                              </a>
                            </div>
                          ) : (
                            <div className="w-full h-48 bg-secondary-100 rounded-lg border-2 border-dashed border-secondary-300 flex items-center justify-center text-secondary-400">
                              <div className="text-center">
                                <p className="text-sm font-medium">No IC Back Uploaded</p>
                                <p className="text-xs mt-1">Upload through Bubble.io</p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                        <p className="text-sm text-blue-800">
                          <strong>Note:</strong> Employee IC documents are synced from Bubble.io Agent Profile.<br/>
                          These are the agent's personal identification documents, not customer documents.
                        </p>
                      </div>
                    </div>

                    <div className="bg-secondary-50 rounded-xl p-6">
                      <h4 className="font-semibold text-secondary-700 mb-3">Quick Reference</h4>
                      <ul className="text-sm text-secondary-600 space-y-2">
                        <li>✅ <strong>This section</strong>: Agent/Employee IC (user/agent identification)</li>
                        <li>❌ <strong>NOT here</strong>: Customer IC (found in SEDA Registration)</li>
                        <li>📄 Bubble field: <code className="bg-secondary-100 px-1 rounded text-xs">IC Front</code> and <code className="bg-secondary-100 px-1 rounded text-xs">IC Back</code></li>
                        <li>🔄 Click "Sync from Bubble" to refresh documents</li>
                      </ul>
                    </div>
                  </div>
                </div>
                </>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

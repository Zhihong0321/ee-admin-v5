"use client";

import { useState, useEffect } from "react";
import { Search, Plus, Edit2, Layers, Package as PackageIcon, Filter, AlertCircle, X, CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react";
import {
    getProducts, updateProduct, createProduct, deleteProduct,
    getPackages, updatePackage, createPackage, deletePackage
} from "./actions";

export default function CatalogPage() {
    const [activeTab, setActiveTab] = useState<"products" | "packages">("products");

    // Products state
    const [products, setProducts] = useState<any[]>([]);
    const [productsSearch, setProductsSearch] = useState("");
    const [loadingProducts, setLoadingProducts] = useState(true);
    const [productsPage, setProductsPage] = useState(1);

    // Packages state
    const [packagesList, setPackagesList] = useState<any[]>([]);
    const [packagesSearch, setPackagesSearch] = useState("");
    const [packageTypeFilter, setPackageTypeFilter] = useState("all");
    const [loadingPackages, setLoadingPackages] = useState(true);
    const [packagesPage, setPackagesPage] = useState(1);

    const itemsPerPage = 10;

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<any | null>(null);

    useEffect(() => {
        fetchProducts();
        fetchPackages();
    }, []);

    async function fetchProducts() {
        setLoadingProducts(true);
        try {
            const data = await getProducts(productsSearch);
            setProducts(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoadingProducts(false);
        }
    }

    async function fetchPackages() {
        setLoadingPackages(true);
        try {
            const data = await getPackages(packagesSearch);
            setPackagesList(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoadingPackages(false);
        }
    }

    const handleSearchProducts = (e: React.FormEvent) => {
        e.preventDefault();
        setProductsPage(1);
        fetchProducts();
    };

    const handleSearchPackages = (e: React.FormEvent) => {
        e.preventDefault();
        setPackagesPage(1);
        fetchPackages();
    };

    const handlePackageFilterChange = (type: string) => {
        setPackageTypeFilter(type);
        setPackagesPage(1);
    };

    // Calculate Paginated Derived State
    const filteredProducts = products;
    const paginatedProducts = filteredProducts.slice((productsPage - 1) * itemsPerPage, productsPage * itemsPerPage);
    const totalProductsPages = Math.ceil(filteredProducts.length / itemsPerPage);

    const filteredPackages = packagesList.filter(pkg => packageTypeFilter === "all" || pkg.type === packageTypeFilter);
    const paginatedPackages = filteredPackages.slice((packagesPage - 1) * itemsPerPage, packagesPage * itemsPerPage);
    const totalPackagesPages = Math.ceil(filteredPackages.length / itemsPerPage);

    const openAddModal = () => {
        setEditingItem(null);
        setIsModalOpen(true);
    };

    const openEditModal = (item: any) => {
        setEditingItem({ ...item });
        setIsModalOpen(true);
    };

    const closeAndRefresh = () => {
        setIsModalOpen(false);
        if (activeTab === "products") fetchProducts();
        else fetchPackages();
    };

    const handleSaveProduct = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const dataToSave = {
                name: editingItem?.name,
                description: editingItem?.description,
                selling_price: editingItem?.selling_price ? String(editingItem.selling_price) : "0",
                cost_price: editingItem?.cost_price ? String(editingItem.cost_price) : "0",
                warranty_name: editingItem?.warranty_name,
                product_warranty_desc: editingItem?.product_warranty_desc,
                warranty_link: editingItem?.warranty_link,
                active: editingItem?.active === true || editingItem?.active === "true",
                inventory: editingItem?.inventory === true || editingItem?.inventory === "true",
            };

            if (editingItem?.id) {
                await updateProduct(editingItem.id, dataToSave);
            } else {
                await createProduct(dataToSave as any);
            }
            closeAndRefresh();
        } catch (err) {
            console.error("Save product error", err);
            alert(`Error saving product: ${err instanceof Error ? err.message : String(err)}`);
        }
    };

    const handleSavePackage = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const dataToSave = {
                package_name: editingItem?.package_name,
                invoice_desc: editingItem?.invoice_desc,
                price: editingItem?.price ? String(editingItem.price) : "0",
                type: editingItem?.type,
                active: editingItem?.active === true || editingItem?.active === "true",
            };

            if (editingItem?.id) {
                await updatePackage(editingItem.id, dataToSave);
            } else {
                await createPackage(dataToSave as any);
            }
            closeAndRefresh();
        } catch (err) {
            console.error("Save package error", err);
            alert(`Error saving package: ${err instanceof Error ? err.message : String(err)}`);
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm("Are you sure you want to delete this item?")) return;
        try {
            if (activeTab === "products") {
                await deleteProduct(id);
                fetchProducts();
            } else {
                await deletePackage(id);
                fetchPackages();
            }
            setIsModalOpen(false);
        } catch (err) {
            alert("Error deleting item");
        }
    };

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                    <h1 className="text-3xl font-bold text-secondary-900">Catalog Manager</h1>
                    <p className="text-secondary-600">
                        Manage your products and packages inventory.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <button onClick={openAddModal} className="btn-primary flex items-center gap-2">
                        <Plus className="h-4 w-4" />
                        Add {activeTab === "products" ? "Product" : "Package"}
                    </button>
                </div>
            </div>

            {/* Main Card */}
            <div className="card">
                {/* Tabs */}
                <div className="flex border-b border-secondary-200 px-6 bg-secondary-50/50">
                    <button
                        onClick={() => setActiveTab("products")}
                        className={`px-4 py-3 text-sm font-medium border-b-2 transition-all flex items-center gap-2 ${activeTab === "products"
                            ? "border-primary-600 text-primary-600"
                            : "border-transparent text-secondary-500 hover:text-secondary-700"
                            }`}
                    >
                        <Layers className="h-4 w-4" />
                        Products
                    </button>
                    <button
                        onClick={() => setActiveTab("packages")}
                        className={`px-4 py-3 text-sm font-medium border-b-2 transition-all flex items-center gap-2 ${activeTab === "packages"
                            ? "border-primary-600 text-primary-600"
                            : "border-transparent text-secondary-500 hover:text-secondary-700"
                            }`}
                    >
                        <PackageIcon className="h-4 w-4" />
                        Packages
                    </button>
                </div>

                {/* Content Area */}
                {activeTab === "products" && (
                    <div>
                        <div className="p-6 border-b border-secondary-200 bg-white">
                            <form onSubmit={handleSearchProducts} className="flex flex-col md:flex-row gap-4 items-center justify-between">
                                <div className="relative w-full md:w-96">
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-secondary-400 w-5 h-5" />
                                    <input
                                        type="text"
                                        placeholder="Search products by name or description..."
                                        className="input pl-12 pr-4"
                                        value={productsSearch}
                                        onChange={(e) => setProductsSearch(e.target.value)}
                                    />
                                </div>
                                <button type="submit" className="btn-secondary flex items-center gap-2 w-full md:w-auto">
                                    <Filter className="w-4 h-4" /> Search
                                </button>
                            </form>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Product Name</th>
                                        <th>Sell Price</th>
                                        <th>Cost Price</th>
                                        <th>Status</th>
                                        <th className="text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loadingProducts ? (
                                        <tr><td colSpan={5} className="text-center py-8">Loading...</td></tr>
                                    ) : paginatedProducts.length === 0 ? (
                                        <tr><td colSpan={5} className="text-center py-8 text-secondary-500">No products found.</td></tr>
                                    ) : (
                                        paginatedProducts.map(product => (
                                            <tr key={product.id}>
                                                <td>
                                                    <div className="font-semibold text-secondary-900">{product.name || "Unnamed"}</div>
                                                    <div className="text-xs text-secondary-500 truncate max-w-[200px]">{product.description || "No description"}</div>
                                                </td>
                                                <td>RM {product.selling_price || "0.00"}</td>
                                                <td>RM {product.cost_price || "0.00"}</td>
                                                <td>
                                                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${product.active ? 'bg-green-100 text-green-700' : 'bg-secondary-100 text-secondary-700'}`}>
                                                        {product.active ? "Active" : "Inactive"}
                                                    </span>
                                                </td>
                                                <td className="text-right">
                                                    <button onClick={() => openEditModal(product)} className="btn-ghost text-primary-600 hover:text-primary-700 inline-flex items-center">
                                                        <Edit2 className="h-4 w-4" /> Edit
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Products Pagination */}
                        <div className="p-6 border-t border-secondary-200 bg-secondary-50/30 flex items-center justify-between">
                            <p className="text-sm text-secondary-600">
                                Showing <span className="font-semibold text-secondary-900">{(productsPage - 1) * itemsPerPage + 1}</span> to <span className="font-semibold text-secondary-900">{Math.min(productsPage * itemsPerPage, filteredProducts.length)}</span> of <span className="font-semibold text-secondary-900">{filteredProducts.length}</span> entries
                            </p>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setProductsPage(p => Math.max(1, p - 1))}
                                    disabled={productsPage === 1}
                                    className="p-2 rounded-lg border border-secondary-200 bg-white text-secondary-400 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-secondary-50 transition-colors"
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </button>
                                <span className="px-3 py-1.5 text-sm font-medium text-secondary-700 bg-white border border-secondary-200 rounded-lg">
                                    {productsPage}
                                </span>
                                <button
                                    onClick={() => setProductsPage(p => Math.min(totalProductsPages, p + 1))}
                                    disabled={productsPage === totalProductsPages || totalProductsPages === 0}
                                    className="p-2 rounded-lg border border-secondary-200 bg-white text-secondary-400 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-secondary-50 transition-colors"
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === "packages" && (
                    <div>
                        <div className="p-6 border-b border-secondary-200 bg-white">
                            <form onSubmit={handleSearchPackages} className="flex flex-col md:flex-row gap-4 items-center justify-between">
                                <div className="flex flex-col md:flex-row gap-4 w-full items-center">
                                    <div className="relative w-full md:w-96">
                                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-secondary-400 w-5 h-5" />
                                        <input
                                            type="text"
                                            placeholder="Search packages by name or invoice desc..."
                                            className="input pl-12 pr-4"
                                            value={packagesSearch}
                                            onChange={(e) => setPackagesSearch(e.target.value)}
                                        />
                                    </div>
                                    <div className="w-full md:w-64">
                                        <select
                                            className="input"
                                            value={packageTypeFilter}
                                            onChange={(e) => handlePackageFilterChange(e.target.value)}
                                        >
                                            <option value="all">All Types</option>
                                            <option value="Residential">Residential</option>
                                            <option value="Special / Roadshow">Special / Roadshow</option>
                                            <option value="Tariff B&D Low Voltage">Tariff B&D Low Voltage</option>
                                        </select>
                                    </div>
                                </div>
                                <button type="submit" className="btn-secondary flex items-center gap-2 w-full md:w-auto shrink-0">
                                    <Filter className="w-4 h-4" /> Search
                                </button>
                            </form>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Package Name</th>
                                        <th>Price</th>
                                        <th>Type</th>
                                        <th>Status</th>
                                        <th className="text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loadingPackages ? (
                                        <tr><td colSpan={5} className="text-center py-8">Loading...</td></tr>
                                    ) : paginatedPackages.length === 0 ? (
                                        <tr><td colSpan={5} className="text-center py-8 text-secondary-500">No packages found.</td></tr>
                                    ) : (
                                        paginatedPackages.map(pkg => (
                                            <tr key={pkg.id}>
                                                <td>
                                                    <div className="font-semibold text-secondary-900">{pkg.package_name || "Unnamed Package"}</div>
                                                    <div className="text-xs text-secondary-500 truncate max-w-[200px]">{pkg.invoice_desc || "No description"}</div>
                                                </td>
                                                <td>RM {pkg.price || "0.00"}</td>
                                                <td>
                                                    <span className="px-2 py-1 rounded bg-secondary-100 text-secondary-700 text-xs font-medium">
                                                        {pkg.type || "N/A"}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${pkg.active ? 'bg-green-100 text-green-700' : 'bg-secondary-100 text-secondary-700'}`}>
                                                        {pkg.active ? "Active" : "Inactive"}
                                                    </span>
                                                </td>
                                                <td className="text-right">
                                                    <button onClick={() => openEditModal(pkg)} className="btn-ghost text-primary-600 hover:text-primary-700 inline-flex items-center">
                                                        <Edit2 className="h-4 w-4" /> Edit
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Packages Pagination */}
                        <div className="p-6 border-t border-secondary-200 bg-secondary-50/30 flex items-center justify-between">
                            <p className="text-sm text-secondary-600">
                                Showing <span className="font-semibold text-secondary-900">{filteredPackages.length > 0 ? (packagesPage - 1) * itemsPerPage + 1 : 0}</span> to <span className="font-semibold text-secondary-900">{Math.min(packagesPage * itemsPerPage, filteredPackages.length)}</span> of <span className="font-semibold text-secondary-900">{filteredPackages.length}</span> entries
                            </p>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setPackagesPage(p => Math.max(1, p - 1))}
                                    disabled={packagesPage === 1}
                                    className="p-2 rounded-lg border border-secondary-200 bg-white text-secondary-400 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-secondary-50 transition-colors"
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </button>
                                <span className="px-3 py-1.5 text-sm font-medium text-secondary-700 bg-white border border-secondary-200 rounded-lg">
                                    {packagesPage}
                                </span>
                                <button
                                    onClick={() => setPackagesPage(p => Math.min(totalPackagesPages, p + 1))}
                                    disabled={packagesPage === totalPackagesPages || totalPackagesPages === 0}
                                    className="p-2 rounded-lg border border-secondary-200 bg-white text-secondary-400 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-secondary-50 transition-colors"
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Edit/Add Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-secondary-900/50 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-2xl shadow-elevation-xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col animate-scale-in">
                        <div className="p-6 border-b border-secondary-200 flex items-center justify-between bg-white z-10">
                            <h2 className="text-xl font-bold text-secondary-900">
                                {editingItem?.id ? 'Edit' : 'Add'} {activeTab === "products" ? 'Product' : 'Package'}
                            </h2>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="p-2 hover:bg-secondary-100 rounded-full transition-colors"
                            >
                                <X className="h-5 w-5 text-secondary-500" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6">
                            <form id="catalog-form" onSubmit={activeTab === "products" ? handleSaveProduct : handleSavePackage} className="space-y-4">
                                {activeTab === "products" && (
                                    <>
                                        <div className="space-y-2">
                                            <label className="text-sm font-semibold text-secondary-700">Name</label>
                                            <input type="text" className="input" required value={editingItem?.name || ""} onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })} />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-semibold text-secondary-700">Description</label>
                                            <textarea className="input min-h-[80px]" value={editingItem?.description || ""} onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })} />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <label className="text-sm font-semibold text-secondary-700">Selling Price</label>
                                                <input type="number" step="0.01" className="input" required value={editingItem?.selling_price || ""} onChange={(e) => setEditingItem({ ...editingItem, selling_price: e.target.value })} />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-sm font-semibold text-secondary-700">Cost Price</label>
                                                <input type="number" step="0.01" className="input" required value={editingItem?.cost_price || ""} onChange={(e) => setEditingItem({ ...editingItem, cost_price: e.target.value })} />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-semibold text-secondary-700">Warranty Name</label>
                                            <input type="text" className="input" value={editingItem?.warranty_name || ""} onChange={(e) => setEditingItem({ ...editingItem, warranty_name: e.target.value })} />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-semibold text-secondary-700">Warranty Description</label>
                                            <textarea className="input min-h-[60px]" value={editingItem?.product_warranty_desc || ""} onChange={(e) => setEditingItem({ ...editingItem, product_warranty_desc: e.target.value })} />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-semibold text-secondary-700">Warranty Link</label>
                                            <input type="url" className="input" placeholder="https://..." value={editingItem?.warranty_link || ""} onChange={(e) => setEditingItem({ ...editingItem, warranty_link: e.target.value })} />
                                        </div>
                                        <div className="flex items-center gap-6 pt-2">
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input type="checkbox" className="w-4 h-4 text-primary-600 border-secondary-300 rounded focus:ring-primary-500" checked={!!editingItem?.active} onChange={(e) => setEditingItem({ ...editingItem, active: e.target.checked })} />
                                                <span className="text-sm font-medium text-secondary-700">Active</span>
                                            </label>
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input type="checkbox" className="w-4 h-4 text-primary-600 border-secondary-300 rounded focus:ring-primary-500" checked={!!editingItem?.inventory} onChange={(e) => setEditingItem({ ...editingItem, inventory: e.target.checked })} />
                                                <span className="text-sm font-medium text-secondary-700">Track Inventory</span>
                                            </label>
                                        </div>
                                    </>
                                )}

                                {activeTab === "packages" && (
                                    <>
                                        <div className="space-y-2">
                                            <label className="text-sm font-semibold text-secondary-700">Package Name</label>
                                            <input type="text" className="input" required value={editingItem?.package_name || ""} onChange={(e) => setEditingItem({ ...editingItem, package_name: e.target.value })} />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-semibold text-secondary-700">Invoice Description</label>
                                            <textarea className="input min-h-[80px]" value={editingItem?.invoice_desc || ""} onChange={(e) => setEditingItem({ ...editingItem, invoice_desc: e.target.value })} />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <label className="text-sm font-semibold text-secondary-700">Price</label>
                                                <input type="number" step="0.01" className="input" required value={editingItem?.price || ""} onChange={(e) => setEditingItem({ ...editingItem, price: e.target.value })} />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-sm font-semibold text-secondary-700">Type</label>
                                                <select
                                                    className="input"
                                                    value={editingItem?.type || ""}
                                                    onChange={(e) => setEditingItem({ ...editingItem, type: e.target.value })}
                                                >
                                                    <option value="">None</option>
                                                    <option value="Residential">Residential</option>
                                                    <option value="Special / Roadshow">Special / Roadshow</option>
                                                    <option value="Tariff B&D Low Voltage">Tariff B&D Low Voltage</option>
                                                </select>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-6 pt-2">
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input type="checkbox" className="w-4 h-4 text-primary-600 border-secondary-300 rounded focus:ring-primary-500" checked={!!editingItem?.active} onChange={(e) => setEditingItem({ ...editingItem, active: e.target.checked })} />
                                                <span className="text-sm font-medium text-secondary-700">Active Status</span>
                                            </label>
                                        </div>
                                    </>
                                )}
                            </form>

                            {editingItem?.id && (
                                <div className="mt-8 border-t border-red-100 pt-4">
                                    <button
                                        type="button"
                                        onClick={() => handleDelete(editingItem.id)}
                                        className="text-red-600 text-sm font-semibold hover:text-red-700 flex items-center gap-1"
                                    >
                                        <AlertCircle className="w-4 h-4" /> Delete {activeTab === "products" ? "Product" : "Package"}
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="p-6 border-t border-secondary-200 bg-white flex items-center justify-end gap-3">
                            <button type="button" onClick={() => setIsModalOpen(false)} className="btn-secondary">
                                Cancel
                            </button>
                            <button type="submit" form="catalog-form" className="btn-primary flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4" /> Save
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

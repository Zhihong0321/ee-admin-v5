"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, LayoutDashboard, Users, Settings, Sparkles, UserCircle, Building2, LogOut, CreditCard, RefreshCw, Database, FileCheck, Globe, FileDigit, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { User } from "@/lib/auth";
import { logoutAction } from "@/app/auth-actions";

const menuItems = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "SEDA Applications", href: "/seda", icon: FileCheck },
  { name: "Invoices", href: "/invoices", icon: FileText },
  { name: "Engineering", href: "/engineering", icon: FileDigit },
  { name: "Payments", href: "/payments", icon: CreditCard },
  { name: "Customers", href: "/customers", icon: Users },
  { name: "Catalog", href: "/catalog", icon: Layers },
  { name: "Users", href: "/users", icon: UserCircle },
  { name: "Manage Company", href: "/manage-company", icon: Building2 },
  { name: "Sync Center", href: "/sync", icon: RefreshCw },
  { name: "Schema Manager", href: "/schema-manager", icon: Database },
  { name: "API Doc", href: "/api-doc", icon: Globe },
  { name: "Settings", href: "/settings", icon: Settings },
];

interface SidebarProps {
  user: User | null;
}

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();

  const userTags = (user?.tags || []).map(t => t.toLowerCase());
  const isOwner = user?.role === 'owner' || user?.isAdmin === true;

  const filteredMenuItems = menuItems.filter(item => {
    if (isOwner) return true;

    switch (item.href) {
      case '/seda':
      case '/invoices':
      case '/engineering':
        return userTags.includes('admin') || userTags.includes('finance');
      case '/payments':
        return userTags.includes('finance');
      case '/catalog':
        return userTags.includes('inventory');
      case '/users':
      case '/customers':
      case '/manage-company':
      case '/sync':
      case '/schema-manager':
      case '/api-doc':
        return userTags.includes('admin');
      default:
        return true; // Dashboard, Settings, etc.
    }
  });

  return (
    <aside className="fixed inset-y-0 left-0 w-64 bg-white border-r border-secondary-200 flex flex-col shadow-elevation-md z-50">
      {/* Logo Section */}
      <div className="h-20 flex items-center px-6 border-b border-secondary-200 bg-gradient-to-r from-primary-600 to-primary-700">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-bold text-white tracking-tight">EE Admin</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto scrollbar-hide">
        {filteredMenuItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-all duration-200 relative",
                isActive
                  ? "bg-primary-50 text-primary-700 shadow-sm"
                  : "text-secondary-600 hover:bg-secondary-50 hover:text-secondary-900"
              )}
            >
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary-600 rounded-r-full" />
              )}
              <Icon
                className={cn(
                  "mr-3 h-5 w-5 transition-transform duration-200",
                  isActive ? "text-primary-600" : "text-secondary-400 group-hover:text-secondary-600"
                )}
              />
              <span className="relative">{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-secondary-200 bg-secondary-50/50">
        {user && (
          <div className="px-4 py-3 mb-4 rounded-lg bg-white border border-secondary-200 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-primary-100 flex items-center justify-center">
                <UserCircle className="h-5 w-5 text-primary-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-secondary-900 truncate">
                  {user.name}
                </p>
                <p className="text-xs text-secondary-500 truncate">
                  {user.phone}
                </p>
              </div>
            </div>
          </div>
        )}
        <form action={logoutAction}>
          <button
            type="submit"
            className="w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg text-red-600 hover:bg-red-50 transition-all duration-200 mt-2"
          >
            <LogOut className="mr-3 h-5 w-5" />
            <span>Logout</span>
          </button>
        </form>
      </div>
    </aside>
  );
}

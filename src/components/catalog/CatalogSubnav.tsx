"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Boxes, ArrowRightLeft } from "lucide-react";
import { cn } from "@/lib/utils";

const catalogNavItems = [
  {
    href: "/catalog",
    label: "Products & Packages",
    description: "Core catalog inventory",
    icon: Boxes,
  },
  {
    href: "/catalog/hybrid-inverter-upgrade",
    label: "Hybrid Inverter Upgrade",
    description: "Hybrid upgrade pricing rules",
    icon: ArrowRightLeft,
  },
];

export function CatalogSubnav() {
  const pathname = usePathname();

  return (
    <div className="card p-2">
      <div className="flex flex-col gap-2 md:flex-row">
        {catalogNavItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.href === "/catalog"
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 items-center gap-3 rounded-xl border px-4 py-3 transition-all",
                isActive
                  ? "border-primary-200 bg-primary-50 text-primary-700 shadow-sm"
                  : "border-transparent bg-secondary-50/70 text-secondary-600 hover:border-secondary-200 hover:bg-white"
              )}
            >
              <div
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-xl",
                  isActive ? "bg-primary-100 text-primary-700" : "bg-white text-secondary-500"
                )}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="font-semibold">{item.label}</div>
                <div className="text-xs text-secondary-500">{item.description}</div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

import Link from "next/link";
import { ArrowRight, TrendingUp, FileText, Users, DollarSign, Activity } from "lucide-react";

const stats = [
  {
    name: "Total Revenue",
    value: "MYR 2,450,000",
    change: "+12.5%",
    changeType: "positive",
    icon: DollarSign,
    color: "primary",
  },
  {
    name: "Active Invoices",
    value: "1,234",
    change: "+8.2%",
    changeType: "positive",
    icon: FileText,
    color: "accent",
  },
  {
    name: "Total Customers",
    value: "856",
    change: "+5.1%",
    changeType: "positive",
    icon: Users,
    color: "success",
  },
  {
    name: "Growth Rate",
    value: "24.3%",
    change: "+2.4%",
    changeType: "positive",
    icon: TrendingUp,
    color: "warning",
  },
];

const quickActions = [
  { name: "View Invoices", href: "/invoices", icon: FileText, color: "primary" },
  { name: "Manage Customers", href: "/customers", icon: Users, color: "accent" },
  { name: "View Reports", href: "/reports", icon: Activity, color: "success" },
];

export default function Home() {
  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-4xl font-bold text-secondary-900">Welcome back!</h1>
        <p className="text-lg text-secondary-600">
          Here's what's happening with your business today.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => {
          const Icon = stat.icon;
          const colorClasses = {
            primary: "bg-primary-50 text-primary-600",
            accent: "bg-accent-50 text-accent-600",
            success: "bg-success-50 text-success-600",
            warning: "bg-warning-50 text-warning-600",
          };
          
          return (
            <div key={stat.name} className="card p-6 hover:shadow-elevation-lg transition-shadow duration-200">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-secondary-600 mb-1">{stat.name}</p>
                  <p className="text-2xl font-bold text-secondary-900 mb-2">{stat.value}</p>
                  <div className="flex items-center gap-1">
                    <TrendingUp className="h-4 w-4 text-success-600" />
                    <span className="text-sm font-medium text-success-600">{stat.change}</span>
                    <span className="text-sm text-secondary-500">vs last month</span>
                  </div>
                </div>
                <div className={`p-3 rounded-xl ${colorClasses[stat.color as keyof typeof colorClasses]}`}>
                  <Icon className="h-6 w-6" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Actions */}
      <div className="card p-6">
        <h2 className="text-xl font-semibold text-secondary-900 mb-6">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {quickActions.map((action) => {
            const Icon = action.icon;
            const colorClasses = {
              primary: "bg-primary-50 hover:bg-primary-100 text-primary-700 border-primary-200",
              accent: "bg-accent-50 hover:bg-accent-100 text-accent-700 border-accent-200",
              success: "bg-success-50 hover:bg-success-100 text-success-700 border-success-200",
            };
            
            return (
              <Link
                key={action.name}
                href={action.href}
                className={`group flex items-center gap-4 p-5 rounded-xl border-2 transition-all duration-200 ${colorClasses[action.color as keyof typeof colorClasses]}`}
              >
                <div className="p-2.5 bg-white/60 rounded-lg group-hover:scale-110 transition-transform duration-200">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-sm">{action.name}</p>
                </div>
                <ArrowRight className="h-5 w-5 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-200" />
              </Link>
            );
          })}
        </div>
      </div>

      {/* Recent Activity Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-secondary-900">Recent Invoices</h2>
            <Link href="/invoices" className="text-sm font-medium text-primary-600 hover:text-primary-700 flex items-center gap-1">
              View all
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between p-4 rounded-lg bg-secondary-50/50 hover:bg-secondary-50 transition-colors">
                <div>
                  <p className="font-medium text-secondary-900">Invoice #{1000 + i}</p>
                  <p className="text-sm text-secondary-600">Customer Name • Today</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-secondary-900">MYR 12,450</p>
                  <span className="badge-success">Paid</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-secondary-900">Performance</h2>
            <span className="text-sm text-secondary-600">Last 30 days</span>
          </div>
          <div className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-secondary-700">Revenue Growth</span>
                <span className="text-sm font-semibold text-success-600">+24.3%</span>
              </div>
              <div className="h-2 bg-secondary-200 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-primary-500 to-primary-600 rounded-full w-3/4"></div>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-secondary-700">Customer Acquisition</span>
                <span className="text-sm font-semibold text-success-600">+18.7%</span>
              </div>
              <div className="h-2 bg-secondary-200 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-accent-500 to-accent-600 rounded-full w-2/3"></div>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-secondary-700">Invoice Processing</span>
                <span className="text-sm font-semibold text-success-600">+12.1%</span>
              </div>
              <div className="h-2 bg-secondary-200 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-success-500 to-success-600 rounded-full w-4/5"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import {
  Archive,
  ArchiveRestore,
  BarChart3,
  LayoutDashboard,
  ScrollText,
  ShieldCheck,
  Ticket,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

// Single source of truth for both the desktop sidebar and the mobile nav
// sheet, so the two can never drift out of sync.
export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Tickets", href: "/tickets", icon: Ticket },
  { label: "Customers", href: "/customers", icon: Users },
  { label: "Archive", href: "/archive", icon: Archive },
];

// Rendered only when canViewPaymentAudit(user) is true — team member
// management is ADMIN-only (see prompt 3's permission matrix and the
// team-members feature's explicit "Admin-only functionality" framing).
// Reports moved here too: all 4 reports (daily/monthly/team-member/customer)
// are requireAdmin()-gated pages, not general staff functionality.
export const ADMIN_NAV_ITEMS: NavItem[] = [
  { label: "Reports", href: "/reports", icon: BarChart3 },
  { label: "Team Members", href: "/team-members", icon: UserCog },
  { label: "Payment Audit", href: "/admin/payment-audit", icon: ShieldCheck },
  { label: "Audit Logs", href: "/admin/audit-logs", icon: ScrollText },
  { label: "Archive Monitor", href: "/admin/archive", icon: ArchiveRestore },
];

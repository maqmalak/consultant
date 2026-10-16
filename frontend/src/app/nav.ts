import {
  LayoutDashboard,
  Users,
  FileText,
  MapPin,
  ClipboardCheck,
  BadgeCheck,
  Send,
  type LucideIcon,
} from "lucide-react";

/** The 8 custom roles defined by the backend (spec §3). */
export const ROLES = {
  SYSTEM_MANAGER: "System Manager",
  CONSULTANT_ADMIN: "Tax Consultant Admin",
  CONSULTANT: "Tax Consultant",
  REVIEWER: "Tax Reviewer",
  APPROVER: "Tax Approver",
  FILING_OFFICER: "Filing Officer",
  FIELD_OFFICER: "Field Officer",
  CLIENT: "Tax Client User",
} as const;

/** Every role that works inside the consultant workspace (non-client). */
export const STAFF_ROLES: string[] = [
  ROLES.SYSTEM_MANAGER,
  ROLES.CONSULTANT_ADMIN,
  ROLES.CONSULTANT,
  ROLES.REVIEWER,
  ROLES.APPROVER,
  ROLES.FILING_OFFICER,
  ROLES.FIELD_OFFICER,
];

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  /** Roles that see this item (UI-only; routes re-check, server enforces). */
  roles: string[];
}

export const WORKSPACE_NAV: NavItem[] = [
  {
    path: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    roles: STAFF_ROLES,
  },
  {
    path: "/clients",
    label: "Clients",
    icon: Users,
    roles: [ROLES.SYSTEM_MANAGER, ROLES.CONSULTANT_ADMIN, ROLES.CONSULTANT, ROLES.FIELD_OFFICER],
  },
  {
    path: "/returns",
    label: "Tax Returns",
    icon: FileText,
    roles: [
      ROLES.SYSTEM_MANAGER,
      ROLES.CONSULTANT_ADMIN,
      ROLES.CONSULTANT,
      ROLES.REVIEWER,
      ROLES.APPROVER,
      ROLES.FILING_OFFICER,
    ],
  },
  {
    path: "/visits",
    label: "Site Visits",
    icon: MapPin,
    roles: [ROLES.SYSTEM_MANAGER, ROLES.CONSULTANT_ADMIN, ROLES.CONSULTANT, ROLES.FIELD_OFFICER],
  },
];

export const QUEUE_NAV: NavItem[] = [
  {
    path: "/queue/review",
    label: "Review Queue",
    icon: ClipboardCheck,
    roles: [ROLES.SYSTEM_MANAGER, ROLES.CONSULTANT_ADMIN, ROLES.REVIEWER],
  },
  {
    path: "/queue/approval",
    label: "Approval Queue",
    icon: BadgeCheck,
    roles: [ROLES.SYSTEM_MANAGER, ROLES.CONSULTANT_ADMIN, ROLES.APPROVER],
  },
  {
    path: "/queue/filing",
    label: "Filing Queue",
    icon: Send,
    roles: [ROLES.SYSTEM_MANAGER, ROLES.CONSULTANT_ADMIN, ROLES.FILING_OFFICER],
  },
];

export const PORTAL_NAV: NavItem[] = [
  { path: "/portal", label: "My Overview", icon: LayoutDashboard, roles: [ROLES.CLIENT] },
];

/** All nav items flattened — used for breadcrumbs and route label lookup. */
export const ALL_NAV: NavItem[] = [...WORKSPACE_NAV, ...QUEUE_NAV, ...PORTAL_NAV];

/**
 * Landing route for the current user after login and on `/`.
 * Mirrors spec §4 "Role-based dashboard redirection".
 */
export function homeForRoles(roles: string[]): string {
  const has = (r: string) => roles.includes(r);
  if (has(ROLES.CLIENT)) return "/portal";
  if (has(ROLES.FIELD_OFFICER)) return "/visits";
  if (has(ROLES.REVIEWER)) return "/queue/review";
  if (has(ROLES.APPROVER)) return "/queue/approval";
  if (has(ROLES.FILING_OFFICER)) return "/queue/filing";
  if (has(ROLES.CONSULTANT) || has(ROLES.CONSULTANT_ADMIN) || has(ROLES.SYSTEM_MANAGER)) {
    return "/dashboard";
  }
  return "/dashboard";
}

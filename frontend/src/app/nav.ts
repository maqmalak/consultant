import {
  CalendarDays, Layers, ListTodo, Mail, Megaphone, Radar, Target,
  TrendingUp,
  ShieldHalf,
  BadgeCheck, BarChart3, Handshake, BookOpen, MessageCircle, UserCog, ClipboardCheck, FileCheck2, FileText, FileUp, Home, LayoutDashboard, MapPin, MessageSquare,
  PhoneCall, Send, Settings2, ShieldAlert, ShieldCheck, Upload, User, Users, Wallet, type LucideIcon,
} from "lucide-react";

export const ROLES = {
  SYSTEM_MANAGER: "System Manager",
  ADMIN: "Tax Admin",
  CONSULTANT: "Tax Consultant",
  REVIEWER: "Tax Reviewer",
  APPROVER: "Tax Approver",
  FILING_OFFICER: "Filing Officer",
  FIELD_OFFICER: "Field Officer",
  DATA_ENTRY: "Data Entry Officer",
  CLIENT: "Client",
} as const;

const { SYSTEM_MANAGER: SM, ADMIN, CONSULTANT, REVIEWER, APPROVER, FILING_OFFICER: FILER, FIELD_OFFICER: FIELD, DATA_ENTRY: DATA } = ROLES;
export const STAFF = [SM, ADMIN, CONSULTANT, REVIEWER, APPROVER, FILER, FIELD, DATA];
const CRM = [SM, ADMIN, CONSULTANT, REVIEWER, FIELD];

export interface NavItem {
  path: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  roles: string[];
  hue: string;
}

export interface NavGroup {
  title: string;
  /** Shorter label for the narrow sidebar (the home page shows `title`). */
  short?: string;
  /** Shown on the home page (and in search) only — the sidebar already links to it. */
  homeOnly?: boolean;
  items: NavItem[];
}

/** Staff navigation (sidebar and launcher). Roles hide items in the UI only — the server enforces access. */
export const STAFF_NAV: NavGroup[] = [
  {
    title: "Workspace",
    items: [
      { path: "/staff/dashboard", label: "Dashboard", hint: "KPIs · Workload", icon: LayoutDashboard, roles: STAFF, hue: "blue" },
      { path: "/staff/clients", label: "Clients", hint: "CNIC · NTN · Invite", icon: Users, roles: [SM, ADMIN, CONSULTANT, FIELD, DATA], hue: "violet" },
      { path: "/staff/returns", label: "Tax Returns", hint: "Wizard · Draft → Filed", icon: FileText, roles: [SM, ADMIN, CONSULTANT, REVIEWER, APPROVER, FILER, DATA], hue: "emerald" },
      { path: "/staff/visits", label: "Site Visits", hint: "Field registration", icon: MapPin, roles: [SM, ADMIN, CONSULTANT, FIELD], hue: "amber" },
      { path: "/staff/import", label: "Import Clients", hint: "CSV · Dry run", icon: Upload, roles: [SM, ADMIN, CONSULTANT], hue: "sky" },
    ],
  },
  {
    title: "Queues",
    items: [
      { path: "/staff/queue/documents", label: "Verify Documents", hint: "Uploads to check", icon: FileCheck2, roles: [SM, ADMIN, CONSULTANT], hue: "teal" },
      { path: "/staff/queue/preparation", label: "In Preparation", hint: "Docs · Draft · Changes", icon: FileUp, roles: [SM, ADMIN, CONSULTANT, DATA], hue: "orange" },
      { path: "/staff/queue/review", label: "Review Queue", hint: "Check & send back", icon: ClipboardCheck, roles: [SM, ADMIN, REVIEWER], hue: "indigo" },
      { path: "/staff/queue/confirmation", label: "Client Confirmation", hint: "Waiting on client", icon: User, roles: [SM, ADMIN, CONSULTANT, REVIEWER, APPROVER, DATA], hue: "pink" },
      { path: "/staff/queue/approval", label: "Approval Queue", hint: "Client confirmed", icon: BadgeCheck, roles: [SM, ADMIN, APPROVER], hue: "green" },
      { path: "/staff/queue/filing", label: "Filing Queue", hint: "File on IRIS", icon: Send, roles: [SM, ADMIN, FILER], hue: "cyan" },
      { path: "/staff/queue/submitted", label: "Awaiting Acknowledgment", hint: "Attach IRIS receipt", icon: FileCheck2, roles: [SM, ADMIN, FILER], hue: "sky" },
      { path: "/staff/queue/errors", label: "Filing Errors", hint: "Retry", icon: ShieldAlert, roles: [SM, ADMIN, FILER], hue: "red" },
    ],
  },
  {
    title: "Client Communication & Collaboration",
    short: "Communication",
    items: [
      { path: "/crm", label: "CRM", hint: "Leads · Pipeline · Calendar", icon: Handshake, roles: [SM, ADMIN, CONSULTANT, REVIEWER, FIELD], hue: "orange" },
      { path: "/staff/inbox", label: "WhatsApp Inbox", hint: "Team chats with clients", icon: MessageCircle, roles: [SM, ADMIN, CONSULTANT, REVIEWER, FIELD], hue: "green" },
      { path: "/staff/vault", label: "Document Vault", hint: "Files · Generate letters", icon: ShieldCheck, roles: STAFF, hue: "amber" },
      { path: "/staff/payments", label: "Payments to Verify", hint: "Proofs → invoice", icon: Wallet, roles: [SM, ADMIN], hue: "lime" },
      { path: "/staff/consultations", label: "Consultations", hint: "Website bookings", icon: PhoneCall, roles: [SM, ADMIN, CONSULTANT], hue: "purple" },
      { path: "/staff/insights", label: "Insights", hint: "Trends · funnel · team", icon: TrendingUp, roles: STAFF, hue: "sky" },
      { path: "/staff/reports", label: "Report Center", hint: "Run · filter · CSV", icon: BarChart3, roles: [SM, ADMIN, CONSULTANT, REVIEWER, APPROVER, FILER], hue: "rose" },
      { path: "/staff/content", label: "Website & Rules", hint: "Prices · FAQ · Articles · Tax years", icon: BookOpen, roles: [SM, ADMIN], hue: "teal" },
    ],
  },
  {
    title: "Setup",
    items: [
      { path: "/staff/settings", label: "Settings", hint: "Firm · WhatsApp · Email · Payments · Codes", icon: Settings2, roles: [SM, ADMIN], hue: "slate" },
      { path: "/staff/roles", label: "Roles & Permissions", hint: "Who may do what", icon: ShieldHalf, roles: [SM, ADMIN], hue: "violet" },
      { path: "/staff/team", label: "Team", hint: "Staff logins & roles", icon: UserCog, roles: [SM, ADMIN], hue: "indigo" },
    ],
  },
  {
    title: "CRM",
    homeOnly: true,
    items: [
      { path: "/crm", label: "CRM Dashboard", hint: "Pipeline at a glance", icon: LayoutDashboard, roles: CRM, hue: "orange" },
      { path: "/crm/leads", label: "Leads", hint: "List · board", icon: Users, roles: CRM, hue: "sky" },
      { path: "/crm/pipeline", label: "Deals", hint: "Pipeline · list", icon: Target, roles: CRM, hue: "violet" },
      { path: "/crm/follow-ups", label: "Follow-ups", hint: "Tasks due", icon: ListTodo, roles: CRM, hue: "amber" },
      { path: "/crm/calendar", label: "Calendar", hint: "Meetings · calls", icon: CalendarDays, roles: CRM, hue: "indigo" },
      { path: "/crm/finder", label: "Lead Finder", hint: "Google Maps · websites", icon: Radar, roles: CRM, hue: "teal" },
      { path: "/crm/broadcast", label: "WhatsApp Broadcast", hint: "Templates · campaigns", icon: Megaphone, roles: CRM, hue: "green" },
      { path: "/crm/email-templates", label: "Email Templates", hint: "Ready-made emails", icon: Mail, roles: CRM, hue: "rose" },
      { path: "/crm/masters", label: "CRM Masters", hint: "Sources · statuses · orgs", icon: Layers, roles: CRM, hue: "slate" },
    ],
  },
];

export const CLIENT_NAV = [
  { path: "/", label: "Home", icon: Home },
  { path: "/documents", label: "Documents", icon: FileUp },
  { path: "/vault", label: "Vault", icon: ShieldCheck },
  { path: "/messages", label: "Messages", icon: MessageSquare },
  { path: "/payments", label: "Payments", icon: Wallet },
  { path: "/profile", label: "Profile", icon: User },
];

import { Briefcase, Handshake } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/cn";

const CRM_ROLES = ["Tax Admin", "Tax Consultant", "Tax Reviewer", "Field Officer", "System Manager"];

/** Tax Portal ⇄ CRM: two apps, one login. */
export function AppSwitcher() {
  const { hasRole } = useAuth();
  if (!hasRole(...CRM_ROLES)) return null;
  const item = ({ isActive }: { isActive: boolean }) => cn("flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
    isActive ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground");
  return (
    <nav aria-label="Apps" className="flex rounded-lg bg-muted p-1">
      <NavLink to="/staff" className={item}><Briefcase className="h-4 w-4" /><span className="hidden sm:inline">Tax Portal</span></NavLink>
      <NavLink to="/crm" className={item}><Handshake className="h-4 w-4" /><span className="hidden sm:inline">CRM</span></NavLink>
    </nav>
  );
}

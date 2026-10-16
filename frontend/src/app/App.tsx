import { Route, Routes } from "react-router-dom";
import { AppProviders } from "./providers";
import { RequireAuth, RequireRole, RoleRedirect } from "@/components/guards";
import { AppShell } from "@/components/layout/app-shell";
import { ROLES, STAFF_ROLES } from "@/app/nav";
import { LoginPage } from "@/pages/login";
import { DashboardPage } from "@/pages/dashboard";
import { HomePage } from "@/pages/home";
import { ClientsPage } from "@/pages/clients";
import { ReturnsPage } from "@/pages/returns";
import { VisitsPage } from "@/pages/visits";
import { QueuePage } from "@/pages/queue-page";
import { PortalHomePage } from "@/pages/portal-home";
import { NotFoundPage } from "@/pages/not-found";

const ALL = Object.values(ROLES);

export default function App() {
  return (
    <AppProviders>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<LoginPage />} />

        {/* Authenticated shell */}
        <Route
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route path="/" element={<RoleRedirect />} />
          <Route path="/home" element={<RequireRole roles={STAFF_ROLES}><HomePage /></RequireRole>} />
          <Route path="/dashboard" element={<RequireRole roles={ALL}><DashboardPage /></RequireRole>} />
          <Route
            path="/clients"
            element={
              <RequireRole
                roles={[ROLES.SYSTEM_MANAGER, ROLES.CONSULTANT_ADMIN, ROLES.CONSULTANT, ROLES.FIELD_OFFICER]}
              >
                <ClientsPage />
              </RequireRole>
            }
          />
          <Route
            path="/returns"
            element={
              <RequireRole
                roles={[
                  ROLES.SYSTEM_MANAGER,
                  ROLES.CONSULTANT_ADMIN,
                  ROLES.CONSULTANT,
                  ROLES.REVIEWER,
                  ROLES.APPROVER,
                  ROLES.FILING_OFFICER,
                ]}
              >
                <ReturnsPage />
              </RequireRole>
            }
          />
          <Route
            path="/visits"
            element={
              <RequireRole
                roles={[ROLES.SYSTEM_MANAGER, ROLES.CONSULTANT_ADMIN, ROLES.CONSULTANT, ROLES.FIELD_OFFICER]}
              >
                <VisitsPage />
              </RequireRole>
            }
          />
          <Route
            path="/queue"
            element={
              <RequireRole roles={[ROLES.SYSTEM_MANAGER, ROLES.CONSULTANT_ADMIN, ROLES.REVIEWER, ROLES.APPROVER, ROLES.FILING_OFFICER]}>
                <QueuePage />
              </RequireRole>
            }
          />
          <Route
            path="/portal"
            element={
              <RequireRole roles={[ROLES.CLIENT]}>
                <PortalHomePage />
              </RequireRole>
            }
          />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AppProviders>
  );
}

import { Navigate, Route, Routes } from "react-router-dom";
import { ROLES } from "@/app/nav";
import { ClientShell } from "@/components/layout/client-shell";
import { StaffShell } from "@/components/layout/staff-shell";
import { ForgotPage } from "@/pages/auth/forgot";
import { LoginPage } from "@/pages/auth/login";
import { SignupPage } from "@/pages/auth/signup";
import { DocumentsPage } from "@/pages/client/documents";
import { ClientHome } from "@/pages/client/home";
import { MessagesPage } from "@/pages/client/messages";
import { OrderPage } from "@/pages/client/order";
import { PaymentsPage } from "@/pages/client/payments";
import { ProfilePage } from "@/pages/client/profile";
import { ReturnPage } from "@/pages/client/return";
import { VaultPage } from "@/pages/client/vault";
import { ClientDetail, ClientsPage } from "@/pages/staff/clients";
import { ConsultationsPage } from "@/pages/staff/consultations";
import { StaffDashboard } from "@/pages/staff/dashboard";
import { StaffHome } from "@/pages/staff/home";
import { ImportPage } from "@/pages/staff/import";
import { PaymentsQueue } from "@/pages/staff/payments";
import { QueuePage } from "@/pages/staff/queue";
import { ReportsPage } from "@/pages/staff/reports";
import { ReturnWizard } from "@/pages/staff/return-wizard";
import { ReturnsPage } from "@/pages/staff/returns";
import { SettingsPage } from "@/pages/staff/settings";
import { ClientForm } from "@/pages/staff/client-form";
import { ContentPage } from "@/pages/staff/content";
import { TeamPage } from "@/pages/staff/team";
import { InboxPage } from "@/pages/staff/inbox";
import { StaffVaultPage } from "@/pages/staff/vault";
import { CrmShell } from "@/components/layout/crm-shell";
import { CrmCalendarPage } from "@/pages/crm/calendar";
import { LeadFinderPage } from "@/pages/crm/finder";
import { FollowUpsPage } from "@/pages/crm/follow-ups";
import { CrmRecordPage } from "@/pages/crm/lead";
import { CrmDashboardPage, CrmLeadsPage, CrmPipelinePage } from "@/pages/crm/overview";
import { VisitForm, VisitsPage } from "@/pages/staff/visits";
import { RequireAuth, RequireClient, RequireStaff } from "./guards";

const { SYSTEM_MANAGER: SM, ADMIN, CONSULTANT, FIELD_OFFICER: FIELD } = ROLES;

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/forgot" element={<ForgotPage />} />

      <Route path="/staff" element={<RequireAuth><RequireStaff><StaffShell /></RequireStaff></RequireAuth>}>
        <Route index element={<StaffHome />} />
        <Route path="dashboard" element={<StaffDashboard />} />
        <Route path="clients" element={<ClientsPage />} />
        <Route path="clients/new" element={<RequireStaff roles={[SM, ADMIN, CONSULTANT, FIELD]}><ClientForm /></RequireStaff>} />
        <Route path="clients/:name" element={<ClientDetail />} />
        <Route path="clients/:name/edit" element={<RequireStaff roles={[SM, ADMIN, CONSULTANT]}><ClientForm /></RequireStaff>} />
        <Route path="import" element={<RequireStaff roles={[SM, ADMIN, CONSULTANT]}><ImportPage /></RequireStaff>} />
        <Route path="visits" element={<VisitsPage />} />
        <Route path="visits/new" element={<RequireStaff roles={[SM, ADMIN, CONSULTANT, FIELD]}><VisitForm /></RequireStaff>} />
        <Route path="returns" element={<ReturnsPage />} />
        <Route path="returns/:name" element={<ReturnWizard />} />
        <Route path="queue/:queue" element={<QueuePage />} />
        <Route path="payments" element={<RequireStaff roles={[SM, ADMIN]}><PaymentsQueue /></RequireStaff>} />
        <Route path="consultations" element={<ConsultationsPage />} />
        <Route path="inbox" element={<RequireStaff roles={[SM, ADMIN, CONSULTANT, FIELD, ROLES.REVIEWER]}><InboxPage /></RequireStaff>} />
        <Route path="crm" element={<Navigate to="/crm" replace />} />
        <Route path="vault" element={<RequireStaff roles={[SM, ADMIN, CONSULTANT, FIELD, ROLES.REVIEWER, ROLES.APPROVER, ROLES.FILING_OFFICER]}><StaffVaultPage /></RequireStaff>} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="settings" element={<RequireStaff roles={[SM, ADMIN]}><SettingsPage /></RequireStaff>} />
        <Route path="content" element={<RequireStaff roles={[SM, ADMIN]}><ContentPage /></RequireStaff>} />
        <Route path="team" element={<RequireStaff roles={[SM, ADMIN]}><TeamPage /></RequireStaff>} />
      </Route>

      {/* CRM: a separate app (own sidebar), same login — switch from the header */}
      <Route path="/crm" element={<RequireAuth><RequireStaff roles={[SM, ADMIN, CONSULTANT, FIELD, ROLES.REVIEWER]}><CrmShell /></RequireStaff></RequireAuth>}>
        <Route index element={<CrmDashboardPage />} />
        <Route path="leads" element={<CrmLeadsPage />} />
        <Route path="leads/:name" element={<CrmRecordPage doctype="CRM Lead" />} />
        <Route path="deals/:name" element={<CrmRecordPage doctype="CRM Deal" />} />
        <Route path="pipeline" element={<CrmPipelinePage />} />
        <Route path="follow-ups" element={<FollowUpsPage />} />
        <Route path="calendar" element={<CrmCalendarPage />} />
        <Route path="finder" element={<LeadFinderPage />} />
      </Route>

      <Route element={<RequireAuth><RequireClient><ClientShell /></RequireClient></RequireAuth>}>
        <Route index element={<ClientHome />} />
        <Route path="order" element={<OrderPage />} />
        <Route path="returns/:name" element={<ReturnPage />} />
        <Route path="documents" element={<DocumentsPage />} />
        <Route path="vault" element={<VaultPage />} />
        <Route path="messages" element={<MessagesPage />} />
        <Route path="payments" element={<PaymentsPage />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RequireAuth, RequireClient, RequireStaff } from "@/app/guards";

const auth = vi.hoisted(() => ({ state: {} as Record<string, unknown> }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth.state }));

function setUser(kind: "guest" | "client" | "staff" | "reviewer") {
  const roles: string[] = { guest: [] as string[], client: ["Client"], staff: ["Tax Consultant"], reviewer: ["Tax Reviewer"] }[kind];
  auth.state = {
    loading: false, isGuest: kind === "guest", isStaff: kind === "staff" || kind === "reviewer",
    me: kind === "guest" ? { user: "Guest", roles: [] } : { user: `${kind}@x`, roles, client: kind === "client" ? { name: "TC-1" } : null },
    hasRole: (...r: string[]) => r.some((x) => roles.includes(x)),
  };
}

function app(start: string) {
  return render(
    <MemoryRouter initialEntries={[start]}>
      <Routes>
        <Route path="/login" element={<p>login page</p>} />
        <Route path="/" element={<RequireAuth><RequireClient><p>client home</p></RequireClient></RequireAuth>} />
        <Route path="/staff" element={<RequireAuth><RequireStaff><p>staff home</p></RequireStaff></RequireAuth>} />
        <Route path="/staff/payments" element={<RequireAuth><RequireStaff roles={["Tax Admin"]}><p>payments</p></RequireStaff></RequireAuth>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("route guards (UI only — the server enforces access)", () => {
  beforeEach(() => setUser("guest"));
  it("sends guests to login", () => {
    app("/staff");
    expect(screen.getByText("login page")).toBeInTheDocument();
  });
  it("keeps clients out of staff screens", () => {
    setUser("client");
    app("/staff");
    expect(screen.getByText("client home")).toBeInTheDocument();
  });
  it("sends staff from the client portal to their workspace", () => {
    setUser("staff");
    app("/");
    expect(screen.getByText("staff home")).toBeInTheDocument();
  });
  it("hides admin-only screens from other staff roles", () => {
    setUser("reviewer");
    app("/staff/payments");
    expect(screen.getByText("staff home")).toBeInTheDocument();
  });
});

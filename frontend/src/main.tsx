import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "@/app/App";
import { AppProviders } from "@/app/providers";
import { applyInitialTheme } from "@/components/layout/theme-provider";
import "@/lib/i18n";
import "@/styles/globals.css";

applyInitialTheme();

// the dev server also answers on "/", where the portal is not mounted
if (!window.location.pathname.startsWith("/portal")) window.history.replaceState(null, "", "/portal/");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter basename="/portal">
      <AppProviders>
        <App />
      </AppProviders>
    </BrowserRouter>
  </React.StrictMode>,
);

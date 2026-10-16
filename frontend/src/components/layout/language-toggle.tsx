import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { setLanguage } from "@/lib/i18n";

export function LanguageToggle() {
  const { i18n } = useTranslation();
  const ur = i18n.language === "ur";
  return (
    <Button variant="ghost" size="sm" onClick={() => setLanguage(ur ? "en" : "ur")} aria-label="Language / زبان"
      title="English / اردو">
      <Languages className="h-4 w-4" /> <span className={ur ? "" : "font-urdu"}>{ur ? "English" : "اردو"}</span>
    </Button>
  );
}

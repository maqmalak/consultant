import { Link } from "react-router-dom";
import { ShieldCheck } from "lucide-react";

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted px-4 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-white">
        <ShieldCheck className="h-7 w-7" />
      </div>
      <h1 className="text-2xl font-semibold text-foreground">Page not found</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        The page you are looking for does not exist or you do not have access to it.
      </p>
      <Link
        to="/login"
        className="mt-6 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
      >
        Go to sign in
      </Link>
    </div>
  );
}

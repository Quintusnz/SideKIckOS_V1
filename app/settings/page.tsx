import Link from "next/link";
import { SettingsPanel } from "@/components/settings-panel";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-[0.35em] text-[#ef233c]">Settings</p>
        <h1 className="text-xl font-semibold text-zinc-100">Platform Defaults</h1>
        <p className="text-sm text-zinc-500">
          Adjust default models and observability. Admin routes live under
          <Link href="/settings/admin/observability" className="ml-1 text-[#ef233c] underline">
            observability controls
          </Link>
          .
        </p>
      </header>
      <SettingsPanel />
    </div>
  );
}

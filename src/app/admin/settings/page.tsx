import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSettings } from "@/lib/services/settings";
import { AppHeader } from "@/components/app-header";
import { AdminNav } from "@/components/admin-nav";
import { SettingRow } from "./settings-form";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const admin = await requireAdmin();
  const settings = await getSettings(createAdminClient());

  return (
    <>
      <AppHeader resident={admin} />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 p-4">
        <AdminNav active="/admin/settings" />
        <h1 className="text-xl font-semibold">Settings</h1>

        <Card>
          <CardContent className="py-2">
            <SettingRow
              settingKey="stale_days"
              label="Stale after"
              help="A reading older than this is marked Stale."
              initial={settings.stale_days}
              unit="days"
            />
            <SettingRow
              settingKey="jump_threshold_kwh_per_day"
              label="Jump threshold"
              help="Readings jumping more than this per day are flagged for review."
              initial={settings.jump_threshold_kwh_per_day}
              unit="kWh/day"
            />
            <SettingRow
              settingKey="rounding_naira"
              label="Recharge rounding"
              help="Suggested recharge amounts round up to a multiple of this."
              initial={settings.rounding_naira}
              unit="₦"
            />
          </CardContent>
        </Card>
      </main>
    </>
  );
}

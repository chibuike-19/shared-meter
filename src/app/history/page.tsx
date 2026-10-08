import { requireResident } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSubmissionHistory } from "@/lib/services/submissions";
import { AppHeader } from "@/components/app-header";
import { SubmissionList } from "./submission-list";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const resident = await requireResident();
  // Service-role client, strictly scoped to the signed-in resident's own id,
  // so we can read audit decisions and sign their private proof photos.
  const db = createAdminClient();
  const submissions = await getSubmissionHistory(db, resident.id);

  return (
    <>
      <AppHeader resident={resident} />
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-4 p-4">
        <div>
          <h1 className="text-xl font-semibold">My submissions</h1>
          <p className="text-sm text-muted-foreground">
            Every reading and recharge you&apos;ve submitted — tap one for the full
            detail and your uploaded proof.
          </p>
        </div>
        <SubmissionList submissions={submissions} />
      </main>
    </>
  );
}

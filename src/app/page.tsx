import { redirect } from "next/navigation";
import { publicEnv } from "@/lib/env";

export default function Home() {
  if (!publicEnv.SUPABASE_URL || !publicEnv.SUPABASE_ANON_KEY) {
    return (
      <main className="mx-auto max-w-lg flex-1 space-y-4 p-8">
        <h1 className="text-xl font-semibold">⚡ Shared Meter Tracker</h1>
        <p className="text-sm text-muted-foreground">
          Supabase isn&apos;t configured yet. Copy{" "}
          <code className="rounded bg-muted px-1">.env.example</code> to{" "}
          <code className="rounded bg-muted px-1">.env.local</code>, fill in your
          Supabase URL and keys, run the migrations in{" "}
          <code className="rounded bg-muted px-1">supabase/migrations</code>, then
          seed an admin. See the README.
        </p>
      </main>
    );
  }
  redirect("/dashboard");
}

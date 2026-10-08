import { createClient } from "@/lib/supabase/client";
import { uploadProof } from "@/lib/services/storage";

/**
 * Upload a proof photo straight from the browser to the private `proofs`
 * bucket, into the signed-in resident's own folder (storage RLS permits this).
 * Returns the stored path to hand to a Server Action — keeping the multi-MB
 * file out of the Server Action body (which is capped at 1 MB).
 */
export async function uploadProofFromBrowser(
  kind: "readings" | "receipts",
  file: File,
): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new Error("You're not signed in. Please sign in again.");
  return uploadProof(supabase, user.id, kind, file);
}

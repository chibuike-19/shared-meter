import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type DB = SupabaseClient<Database>;

export const PROOFS_BUCKET = "proofs";

/** Max accepted photo size (spec: receipts/meter photos). */
export const MAX_PROOF_BYTES = 5 * 1024 * 1024; // 5 MB

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};

function extFor(file: File): string {
  const fromName = file.name.includes(".")
    ? file.name.split(".").pop()!.toLowerCase()
    : "";
  return EXT_BY_TYPE[file.type] ?? (fromName || "jpg");
}

/**
 * Upload a receipt/meter photo to the private `proofs` bucket under the
 * uploader's auth-uid folder, so storage RLS scopes it to that resident
 * (spec §5). Returns the stored path. `kind` is e.g. "readings" | "receipts".
 */
export async function uploadProof(
  db: DB,
  authUserId: string,
  kind: "readings" | "receipts",
  file: File,
): Promise<string> {
  if (!file || file.size === 0) throw new Error("A photo is required.");
  if (!file.type.startsWith("image/")) {
    throw new Error("The upload must be an image.");
  }
  if (file.size > MAX_PROOF_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    throw new Error(`Photo is ${mb} MB — the limit is 5 MB. Please use a smaller photo.`);
  }
  const path = `${authUserId}/${kind}/${crypto.randomUUID()}.${extFor(file)}`;
  const { error } = await db.storage
    .from(PROOFS_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(`Photo upload failed: ${error.message}`);
  return path;
}

/**
 * Signed URL for reading a private proof (admin UI / own history). Pass
 * `downloadName` to make the link download the file (Content-Disposition
 * attachment) instead of rendering inline.
 */
export async function signedProofUrl(
  db: DB,
  path: string,
  expiresInSeconds = 300,
  downloadName?: string,
): Promise<string | null> {
  const { data, error } = await db.storage
    .from(PROOFS_BUCKET)
    .createSignedUrl(path, expiresInSeconds, downloadName ? { download: downloadName } : undefined);
  if (error) return null;
  return data?.signedUrl ?? null;
}

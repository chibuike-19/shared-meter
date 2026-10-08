// Set (or reset) a user's password directly via the Supabase admin API — no
// email sent. Useful for onboarding users created under the old magic-link flow,
// or when the email service is unavailable.
//
// Usage:
//   node scripts/set-password.mjs <email> <password>
//
// Reads Supabase credentials from .env.local.

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import WS from "ws";

// supabase-js needs a global WebSocket; Node 20 lacks it (Node 22+ has it native).
if (typeof globalThis.WebSocket === "undefined") globalThis.WebSocket = WS;

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv(file) {
  try {
    const text = readFileSync(resolve(__dirname, "..", file), "utf8");
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* rely on process env */
  }
}

loadEnv(".env.local");

const [, , email, password] = process.argv;

if (!email || !password) {
  console.error("Usage: node scripts/set-password.mjs <email> <password>");
  process.exit(1);
}
if (password.length < 8) {
  console.error("Password must be at least 8 characters.");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const db = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findUserByEmail(target) {
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    const found = data.users.find((u) => u.email?.toLowerCase() === target.toLowerCase());
    if (found) return found;
    if (data.users.length < 1000) break;
  }
  return null;
}

async function main() {
  const user = await findUserByEmail(email);
  if (!user) throw new Error(`No auth user found for ${email}`);

  const { error } = await db.auth.admin.updateUserById(user.id, {
    password,
    email_confirm: true,
  });
  if (error) throw new Error(error.message);

  console.log(`✅ Password set for ${email}. They can now sign in with it.`);
}

main().catch((err) => {
  console.error("❌", err.message);
  process.exit(1);
});

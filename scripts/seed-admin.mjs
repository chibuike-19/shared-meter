// Seed the first admin + an initial price (spec Phase 1: "seeded admin").
//
// Usage:
//   node scripts/seed-admin.mjs <email> "<Full Name>" "<House>" <openingReading> <pricePerKwh>
//
// Reads Supabase credentials from .env.local. The admin receives a magic-link
// invite email; opening values and an initial price are written so the app has
// a current price from day one.

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
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    /* no .env.local — rely on process env */
  }
}

loadEnv(".env.local");

const [, , email, password, fullName, house, openingReadingArg, priceArg] = process.argv;

if (!email || !password || !fullName || !house) {
  console.error(
    'Usage: node scripts/seed-admin.mjs <email> <password> "<Full Name>" "<House>" [openingReading] [pricePerKwh]',
  );
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

const openingReading = Number(openingReadingArg ?? 0);
const price = Number(priceArg ?? 0);

const db = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log(`Creating admin ${email} …`);
  const { data: created, error: createErr } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr || !created?.user) {
    throw new Error(`Create user failed: ${createErr?.message ?? "unknown"}`);
  }

  const { data: resident, error: resErr } = await db
    .from("residents")
    .insert({
      auth_user_id: created.user.id,
      full_name: fullName,
      house_label: house,
      role: "admin",
      opening_reading: openingReading,
    })
    .select("*")
    .single();
  if (resErr) throw new Error(`Resident insert failed: ${resErr.message}`);

  await db.from("readings").insert({
    resident_id: resident.id,
    reading_kwh: openingReading,
    status: "accepted",
    source: "opening",
    submitted_by: resident.id,
  });

  if (price > 0) {
    await db.from("price_history").insert({
      price_per_kwh: price,
      effective_from: new Date().toISOString(),
      set_by: resident.id,
    });
    console.log(`Seeded initial price ₦${price}/kWh.`);
  }

  console.log(`✅ Admin ${fullName} (${house}) created. Sign in at the app with ${email} and the password you set.`);
}

main().catch((err) => {
  console.error("❌", err.message);
  process.exit(1);
});

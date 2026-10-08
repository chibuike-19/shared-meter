import { NextResponse } from "next/server";

/**
 * WhatsApp bot webhook — stub only (spec §10).
 * The bot will later call the same /lib/services functions as the web app.
 * Not implemented yet.
 */
export function POST() {
  return NextResponse.json({ error: "Not Implemented" }, { status: 501 });
}

export function GET() {
  return NextResponse.json({ error: "Not Implemented" }, { status: 501 });
}

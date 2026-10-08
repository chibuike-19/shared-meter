import "server-only";
import WS from "ws";

/**
 * supabase-js eagerly constructs a realtime client, which needs a global
 * `WebSocket`. Node 22+ has it natively; Node 20 (this project's runtime) does
 * not, so creating any Supabase client throws. We never use realtime, but the
 * constructor still requires the global, so provide one on the server.
 *
 * Imported for side-effect by the server/admin Supabase helpers BEFORE a client
 * is created. The Edge runtime (used by proxy.ts) already has WebSocket, so this
 * module is intentionally not pulled into that bundle.
 */
const g = globalThis as { WebSocket?: unknown };
if (typeof g.WebSocket === "undefined") {
  g.WebSocket = WS;
}

/**
 * Catch innocent email typos (e.g. "gmsil.com" → "gmail.com") before an admin
 * creates a resident, so the person can actually receive a login. Pure; returns
 * a suggested corrected email, or null when the domain looks fine or unknown.
 */

const KNOWN_DOMAINS = [
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "ymail.com",
  "hotmail.com",
  "hotmail.co.uk",
  "outlook.com",
  "live.com",
  "icloud.com",
  "me.com",
  "aol.com",
  "protonmail.com",
  "proton.me",
];

/** Levenshtein edit distance. */
function distance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const row = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = row[j];
      row[j] = Math.min(
        row[j] + 1, // deletion
        row[j - 1] + 1, // insertion
        prev + (a[i - 1] === b[j - 1] ? 0 : 1), // substitution
      );
      prev = temp;
    }
  }
  return row[n];
}

/**
 * Returns a corrected email if the domain is a near-match to a common provider
 * (edit distance 1–2), otherwise null. Only the domain is adjusted; the local
 * part is kept as typed.
 */
export function suggestEmailFix(email: string): string | null {
  const trimmed = email.trim();
  const at = trimmed.lastIndexOf("@");
  if (at < 1 || at === trimmed.length - 1) return null;

  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1).toLowerCase();
  if (!domain.includes(".")) return null;
  if (KNOWN_DOMAINS.includes(domain)) return null;

  let best: string | null = null;
  let bestDist = Infinity;
  for (const candidate of KNOWN_DOMAINS) {
    const d = distance(domain, candidate);
    if (d < bestDist) {
      bestDist = d;
      best = candidate;
    }
  }

  // Require a near-identical length too, so a legitimate custom domain isn't
  // "corrected" to a short common one (e.g. acme.com → me.com).
  if (
    best &&
    bestDist > 0 &&
    bestDist <= 2 &&
    Math.abs(domain.length - best.length) <= 1
  ) {
    return `${local}@${best}`;
  }
  return null;
}

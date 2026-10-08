/**
 * Human-readable labels for audit_log action strings (pure; usable on client
 * and server). Keeps the admin audit log friendly instead of showing the raw
 * service action names.
 */
const LABELS: Record<string, string> = {
  "resident.create": "Resident added",
  "resident.update": "Resident updated",
  "resident.activate": "Resident activated",
  "resident.deactivate": "Resident deactivated",
  "resident.replace_meter": "Meter replaced",
  "recharge.approve": "Recharge approved",
  "recharge.reject": "Recharge rejected",
  "reading.accept": "Reading accepted",
  "reading.reject": "Reading rejected",
  "price.set": "Price update",
  "adjustment.create": "Adjustment added",
  "setting.update": "Setting changed",
};

export function auditActionLabel(action: string): string {
  if (LABELS[action]) return LABELS[action];
  // Fallback: "some.action_name" → "Some action name"
  return action
    .replace(/[._]/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());
}

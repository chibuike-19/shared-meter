/**
 * Hand-maintained types mirroring supabase/migrations.
 * Regenerate with `supabase gen types typescript` once the CLI is wired up;
 * for now this keeps queries type-safe without a running project.
 *
 * NOTE: Row shapes are declared with `type` (not `interface`) on purpose —
 * supabase-js requires each table's Row/Insert/Update to satisfy
 * `Record<string, unknown>`, and TS interfaces lack the implicit index
 * signature needed for that, which would silently collapse inserts to `never`.
 */

export type UserRole = "admin" | "resident";
export type ReadingStatus = "accepted" | "flagged" | "rejected";
export type RechargeStatus = "pending" | "approved" | "rejected";
export type Source = "web" | "whatsapp" | "opening" | "admin";

export type ResidentRow = {
  id: string;
  auth_user_id: string | null;
  full_name: string;
  house_label: string;
  phone_e164: string | null;
  role: UserRole;
  meter_serial: string | null;
  opening_reading: number;
  opening_balance_kwh: number;
  consumed_offset_kwh: number;
  is_active: boolean;
  created_at: string;
};

export type PriceHistoryRow = {
  id: string;
  price_per_kwh: number;
  effective_from: string;
  set_by: string | null;
  created_at: string;
};

export type ReadingRow = {
  id: string;
  resident_id: string;
  reading_kwh: number;
  taken_at: string;
  photo_path: string | null;
  status: ReadingStatus;
  flag_reason: string | null;
  source: Source;
  submitted_by: string | null;
  created_at: string;
};

export type RechargeRow = {
  id: string;
  paid_by: string;
  amount_naira: number;
  price_per_kwh_applied: number;
  kwh_credited: number;
  token_units_kwh: number | null;
  receipt_path: string | null;
  recharged_at: string;
  status: RechargeStatus;
  approved_by: string | null;
  approved_at: string | null;
  reject_reason: string | null;
  note: string | null;
  source: Source;
  created_at: string;
};

export type AdjustmentRow = {
  id: string;
  resident_id: string;
  kwh_delta: number;
  reason: string;
  created_by: string;
  created_at: string;
};

export type SettingRow = {
  key: string;
  value: unknown;
};

export type AuditLogRow = {
  id: string;
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  before: unknown;
  after: unknown;
  created_at: string;
};

export type ResidentBalanceView = {
  resident_id: string;
  full_name: string;
  house_label: string;
  opening_reading: number;
  latest_reading: number;
  last_reading_at: string | null;
  consumed_kwh: number;
  recharged_kwh: number;
  recharge_count: number;
  other_credit_kwh: number;
  balance_kwh: number;
};

export type ReadingIntervalView = {
  resident_id: string;
  from_time: string | null;
  to_time: string;
  from_reading: number | null;
  to_reading: number;
  used_kwh: number | null;
};

type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

type View<Row> = { Row: Row; Relationships: [] };

export type Database = {
  public: {
    Tables: {
      residents: Table<ResidentRow>;
      price_history: Table<PriceHistoryRow>;
      readings: Table<ReadingRow>;
      recharges: Table<RechargeRow>;
      adjustments: Table<AdjustmentRow>;
      settings: Table<SettingRow>;
      audit_log: Table<AuditLogRow>;
    };
    Views: {
      resident_balances: View<ResidentBalanceView>;
      reading_intervals: View<ReadingIntervalView>;
    };
    Functions: Record<string, never>;
    Enums: {
      user_role: UserRole;
      reading_status: ReadingStatus;
      recharge_status: RechargeStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};

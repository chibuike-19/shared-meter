"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface GroupChartDatum {
  house: string;
  paidFor: number;
  consumed: number;
}

/** Paired bars of paid-for vs consumed kWh per resident (spec §7.3). */
export function GroupChart({ data }: { data: GroupChartDatum[] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="house" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip formatter={(value) => [`${value} kWh`, ""]} labelClassName="text-sm" />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="paidFor" name="Paid for" fill="#16a34a" radius={[4, 4, 0, 0]} />
          <Bar dataKey="consumed" name="Consumed" fill="#dc2626" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

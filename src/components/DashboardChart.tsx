import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format } from "date-fns";

interface Trade {
  date: string;
  amount: number;
}

interface DashboardChartProps {
  trades?: Trade[];
  data?: { date: string; value: number }[];
}

export function DashboardChart({ trades, data }: DashboardChartProps) {
  const chartData = useMemo(() => {
    // If manual data is provided, sort it and use it
    if (data && data.length > 0) {
      return [...data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }

    // Fallback to trade-based calculation if no manual data
    if (!trades || trades.length === 0) return [];

    const sortedTrades = [...trades].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    let cumulative = 0;
    return sortedTrades.map((trade) => {
      cumulative += Number(trade.amount);
      return {
        date: trade.date,
        value: cumulative,
      };
    });
  }, [trades, data]);

  if (chartData.length === 0) {
    return (
      <div className="flex h-[300px] items-center justify-center text-muted-foreground border border-dashed rounded-md bg-muted/5">
        No performance data available.
      </div>
    );
  }

  // Determine color based on start vs end value
  const startValue = chartData[0]?.value || 0;
  const endValue = chartData[chartData.length - 1]?.value || 0;
  const isPositive = endValue >= startValue;

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="colorPnL" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="5%"
                stopColor={isPositive ? "#10b981" : "#ef4444"}
                stopOpacity={0.3}
              />
              <stop
                offset="95%"
                stopColor={isPositive ? "#10b981" : "#ef4444"}
                stopOpacity={0}
              />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(value) => format(new Date(value), "MMM d")}
            stroke="#888888"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            minTickGap={32}
          />
          <YAxis
            stroke="#888888"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            domain={['auto', 'auto']}
            tickFormatter={(value) => `$${value}`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              borderColor: "hsl(var(--border))",
              borderRadius: "var(--radius)",
            }}
            labelFormatter={(value) => format(new Date(value), "MMM d, yyyy")}
            formatter={(value: number) => [
              new Intl.NumberFormat("en-US", {
                style: "currency",
                currency: "USD",
              }).format(value),
              "Net Liquidity",
            ]}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={isPositive ? "#10b981" : "#ef4444"}
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorPnL)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
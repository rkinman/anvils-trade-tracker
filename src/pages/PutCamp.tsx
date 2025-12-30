import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingUp, AlertCircle, DollarSign, Percent, Calendar } from "lucide-react";
import { format } from "date-fns";
import { showSuccess, showError } from "@/utils/toast";

interface Trade {
  id: string;
  date: string;
  symbol: string;
  action: string;
  quantity: number;
  price: number;
  fees: number;
  amount: number;
  multiplier: number;
  mark_price: number | null;
}

export default function PutCamp() {
  // 1. Fetch the 'Put Camp' strategy ID
  const { data: strategy } = useQuery({
    queryKey: ['strategy-put-camp'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('strategies')
        .select('*')
        .ilike('name', '%Put Camp%')
        .limit(1)
        .single();
      
      if (error && error.code !== 'PGRST116') console.error(error); // PGRST116 is "no rows found"
      return data;
    }
  });

  // 2. Fetch trades for this strategy
  const { data: trades, isLoading } = useQuery({
    queryKey: ['trades-put-camp', strategy?.id],
    queryFn: async () => {
      if (!strategy?.id) return [];
      const { data, error } = await supabase
        .from('trades')
        .select('*')
        .eq('strategy_id', strategy.id)
        .order('date', { ascending: false });
      
      if (error) throw error;
      return data as Trade[];
    },
    enabled: !!strategy?.id
  });

  // 3. Calculate Custom Metrics (Placeholders for P, Q, R, S)
  const calculatedTrades = useMemo(() => {
    if (!trades) return [];

    return trades.map(trade => {
      // Logic to be updated based on user input for Columns P, Q, R, S
      // Common Put Selling Metrics:
      const collateral = Math.abs(trade.quantity * (trade.price || 0) * trade.multiplier); // Cash to secure? (Guess)
      const premium = trade.amount; // Net credit
      const yieldPct = collateral > 0 ? (premium / collateral) * 100 : 0;
      
      return {
        ...trade,
        col_p: collateral, // Placeholder
        col_q: premium,    // Placeholder
        col_r: yieldPct,   // Placeholder
        col_s: 0           // Placeholder
      };
    });
  }, [trades]);

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[50vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (!strategy) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-[50vh] space-y-4 text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground" />
          <h2 className="text-2xl font-bold">Strategy Not Found</h2>
          <p className="text-muted-foreground max-w-md">
            Please create a strategy named <strong>"Put Camp"</strong> in the Strategies page. 
            Once created, assign trades to it, and they will appear here with your custom metrics.
          </p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Put Camp Tracker</h2>
          <p className="text-muted-foreground">Specialized tracking for your Put Selling campaigns.</p>
        </div>

        {/* Aggregate Metrics Header */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Premium (P)</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-500">
                ${calculatedTrades.reduce((sum, t) => sum + (t.col_q || 0), 0).toFixed(2)}
              </div>
            </CardContent>
          </Card>
          {/* Add more cards for Q, R, S once defined */}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Campaigns</CardTitle>
            <CardDescription>
              Detailed view matching your spreadsheet structure.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead className="text-right">Collateral (P)</TableHead>
                  <TableHead className="text-right">Premium (Q)</TableHead>
                  <TableHead className="text-right">Yield % (R)</TableHead>
                  <TableHead className="text-right">Metric (S)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {calculatedTrades.map((trade) => (
                  <TableRow key={trade.id}>
                    <TableCell>{format(new Date(trade.date), 'MMM d, yyyy')}</TableCell>
                    <TableCell className="font-mono">{trade.symbol}</TableCell>
                    <TableCell>{trade.action}</TableCell>
                    <TableCell className="text-right font-mono">${trade.col_p.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-mono text-green-500">${trade.col_q.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-mono">{trade.col_r.toFixed(2)}%</TableCell>
                    <TableCell className="text-right font-mono">{trade.col_s.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
                {calculatedTrades.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center h-24 text-muted-foreground">
                      No trades assigned to "Put Camp" yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, DollarSign, TrendingUp, Wallet, PieChart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { DashboardChart } from "@/components/DashboardChart";

const Index = () => {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats-v2'],
    queryFn: async () => {
      // 1. Fetch all non-hidden trades
      const { data: trades, error } = await supabase
        .from('trades')
        .select('*')
        .eq('hidden', false)
        .order('date', { ascending: true });
      
      if (error) throw error;

      let totalPnL = 0;
      let realizedPnL = 0;
      let unrealizedPnL = 0;
      let winCount = 0;
      let lossCount = 0;
      let closeCount = 0;

      // Calculate Metrics
      trades.forEach(trade => {
        const amount = Number(trade.amount);
        
        // Handle Open Positions (Unrealized P&L)
        if (trade.mark_price !== null) {
          const mark = Math.abs(Number(trade.mark_price));
          const qty = Number(trade.quantity);
          const mult = Number(trade.multiplier);
          
          // Sign Logic: Short (Sell) = -1, Long (Buy) = +1
          const isShort = trade.action.toUpperCase().includes('SELL') || trade.action.toUpperCase().includes('SHORT');
          const sign = isShort ? -1 : 1;
          
          const marketValue = mark * qty * mult * sign;
          
          // For open trades, P&L = Current Value + Cost Basis (Amount)
          totalPnL += (marketValue + amount);
          unrealizedPnL += (marketValue + amount);
        } else {
          // Closed Logic
          totalPnL += amount;
          realizedPnL += amount;

          if (trade.action.toUpperCase().includes('CLOSE') || trade.action.toUpperCase().includes('EXP')) {
             closeCount++;
             if (amount > 0) winCount++;
             else if (amount < 0) lossCount++;
          }
        }
      });

      const openCount = trades.filter(t => t.mark_price !== null).length;
      
      const winRate = closeCount > 0 
        ? Math.round((winCount / closeCount) * 100) 
        : 0;

      return {
        totalPnL,
        realizedPnL,
        unrealizedPnL,
        activePositions: openCount,
        winRate,
        tradeCount: trades.length,
        trades: trades
      };
    }
  });

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[50vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
            <p className="text-muted-foreground">Overview of your trading performance.</p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="default">
               <Link to="/import">Import Data</Link>
            </Button>
            <Button asChild variant="secondary">
               <Link to="/strategies">Manage Strategies</Link>
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Net Liquidity</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${
                (stats?.totalPnL || 0) >= 0 ? "text-green-500" : "text-red-500"
              }`}>
                {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(stats?.totalPnL || 0)}
              </div>
              <p className="text-xs text-muted-foreground">Realized + Unrealized P&L</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Positions</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.activePositions}</div>
              <p className="text-xs text-muted-foreground">Open Trades / Legs</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Win Rate</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.winRate}%</div>
              <p className="text-xs text-muted-foreground">Based on closed transactions</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Trades</CardTitle>
              <PieChart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.tradeCount}</div>
              <p className="text-xs text-muted-foreground">Transactions imported</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
          <Card className="col-span-4 lg:col-span-7">
            <CardHeader>
              <CardTitle>Cash P&L Performance</CardTitle>
            </CardHeader>
            <CardContent className="pl-0">
               <DashboardChart trades={stats?.trades || []} />
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Index;
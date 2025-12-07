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
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      // 1. Fetch all non-hidden trades to calculate metrics
      const { data: trades, error } = await supabase
        .from('trades')
        .select('amount, action, quantity, date')
        .eq('hidden', false) // Exclude hidden trades
        .order('date', { ascending: true });
      
      if (error) throw error;

      // Calculate Total P&L
      const totalPnL = trades.reduce((acc, t) => acc + Number(t.amount), 0);
      
      // Basic heuristic for open positions
      const openCount = trades.filter(t => t.action.includes('OPEN')).length;
      const closeCount = trades.filter(t => t.action.includes('CLOSE')).length;
      const activePositionsEstimate = Math.max(0, openCount - closeCount);
      
      // Calculate Win Rate
      const closedTrades = trades.filter(t => t.action.includes('CLOSE'));
      const winningTrades = closedTrades.filter(t => Number(t.amount) > 0);
      const winRate = closedTrades.length > 0 
        ? Math.round((winningTrades.length / closedTrades.length) * 100) 
        : 0;

      return {
        totalPnL,
        activePositions: activePositionsEstimate,
        winRate,
        tradeCount: trades.length,
        trades: trades // Pass trades to chart
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

        {/* Key Metrics Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total P&L</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${
                (stats?.totalPnL || 0) >= 0 ? "text-green-500" : "text-red-500"
              }`}>
                {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(stats?.totalPnL || 0)}
              </div>
              <p className="text-xs text-muted-foreground">All time realized</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Positions</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.activePositions}</div>
              <p className="text-xs text-muted-foreground">Est. Open Trades</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Win Rate</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.winRate}%</div>
              <p className="text-xs text-muted-foreground">Based on closed legs</p>
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

        {/* Charts Section */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
          <Card className="col-span-4 lg:col-span-7">
            <CardHeader>
              <CardTitle>P&L Performance</CardTitle>
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
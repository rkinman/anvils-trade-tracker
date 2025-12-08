import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Activity, DollarSign, TrendingUp, Wallet, PieChart, PlusCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { DashboardChart } from "@/components/DashboardChart";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { showSuccess, showError } from "@/utils/toast";

const Index = () => {
  const queryClient = useQueryClient();
  const [isEntryOpen, setIsEntryOpen] = useState(false);
  const [netLiqAmount, setNetLiqAmount] = useState("");
  
  // Date logic
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const currentHour = today.getHours();
  const isAfter4PM = currentHour >= 16; // 4 PM

  // Fetch Net Liquidity Logs (Manual)
  const { data: netLiqLogs, isLoading: logsLoading } = useQuery({
    queryKey: ['net-liq-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('net_liquidity_logs')
        .select('*')
        .order('date', { ascending: true });
      if (error) throw error;
      return data;
    }
  });

  // Fetch Trade Stats (Calculated)
  const { data: tradeStats, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard-stats-v2'],
    queryFn: async () => {
      const { data: trades, error } = await supabase
        .from('trades')
        .select('*')
        .eq('hidden', false)
        .order('date', { ascending: true });
      
      if (error) throw error;

      let winCount = 0;
      let closeCount = 0;
      let openCount = 0;

      trades.forEach(trade => {
        const actionUpper = trade.action.toUpperCase();
        if (trade.mark_price !== null) {
          openCount++;
        } else if (actionUpper.includes('CLOSE') || actionUpper.includes('EXP')) {
           closeCount++;
           if (Number(trade.amount) > 0) winCount++;
        }
      });
      
      const winRate = closeCount > 0 
        ? Math.round((winCount / closeCount) * 100) 
        : 0;

      return {
        activePositions: openCount,
        winRate,
        tradeCount: trades.length,
      };
    }
  });

  const upsertNetLiqMutation = useMutation({
    mutationFn: async (amount: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const numAmount = parseFloat(amount);
      if (isNaN(numAmount)) throw new Error("Invalid amount");

      const { error } = await supabase
        .from('net_liquidity_logs')
        .upsert({ 
          user_id: user.id, 
          date: todayStr, 
          amount: numAmount 
        }, { onConflict: 'user_id, date' });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['net-liq-logs'] });
      setIsEntryOpen(false);
      setNetLiqAmount("");
      showSuccess("Net Liquidity updated for today");
    },
    onError: (err) => showError(err.message)
  });

  const handleSaveNetLiq = () => {
    upsertNetLiqMutation.mutate(netLiqAmount);
  };

  if (statsLoading || logsLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[50vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  // Prepare Chart Data
  const chartData = netLiqLogs?.map(log => ({
    date: log.date,
    value: Number(log.amount)
  })) || [];

  // Determine current Net Liq
  const latestLog = netLiqLogs && netLiqLogs.length > 0 ? netLiqLogs[netLiqLogs.length - 1] : null;
  const currentNetLiq = latestLog ? Number(latestLog.amount) : 0;

  // Check if today's entry exists
  const hasEntryForToday = netLiqLogs?.some(log => log.date === todayStr);
  const showWarning = isAfter4PM && !hasEntryForToday;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
            <p className="text-muted-foreground">Overview of your trading performance.</p>
          </div>
          <div className="flex gap-2">
             <Button onClick={() => setIsEntryOpen(true)} variant="outline">
                <PlusCircle className="mr-2 h-4 w-4" /> Update Net Liq
             </Button>
            <Button asChild variant="default">
               <Link to="/import">Import Data</Link>
            </Button>
            <Button asChild variant="secondary">
               <Link to="/strategies">Manage Strategies</Link>
            </Button>
          </div>
        </div>

        {showWarning && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Missing Daily Update</AlertTitle>
            <AlertDescription className="flex items-center justify-between">
              <span>You haven't entered your Net Liquidity for today (Market Close).</span>
              <Button size="sm" variant="outline" className="bg-background text-foreground hover:bg-background/90" onClick={() => setIsEntryOpen(true)}>
                Enter Now
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Net Liquidity</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(currentNetLiq)}
              </div>
              <p className="text-xs text-muted-foreground">
                {latestLog ? `Updated ${latestLog.date}` : "No data recorded"}
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Positions</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{tradeStats?.activePositions || 0}</div>
              <p className="text-xs text-muted-foreground">Open Trades / Legs</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Win Rate</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{tradeStats?.winRate || 0}%</div>
              <p className="text-xs text-muted-foreground">Based on closed transactions</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Trades</CardTitle>
              <PieChart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{tradeStats?.tradeCount || 0}</div>
              <p className="text-xs text-muted-foreground">Transactions imported</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-1">
          <Card>
            <CardHeader>
              <CardTitle>Net Liquidity Performance</CardTitle>
              <CardDescription>Manual daily tracking of account value.</CardDescription>
            </CardHeader>
            <CardContent className="pl-0">
               <DashboardChart data={chartData} />
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={isEntryOpen} onOpenChange={setIsEntryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Net Liquidity</DialogTitle>
            <DialogDescription>
              Enter your total account value (Net Liquidity) for today, {todayStr}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount ($)</Label>
              <Input 
                id="amount" 
                type="number" 
                placeholder="e.g. 10500.50"
                value={netLiqAmount}
                onChange={(e) => setNetLiqAmount(e.target.value)}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEntryOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveNetLiq} disabled={upsertNetLiqMutation.isPending || !netLiqAmount}>
              {upsertNetLiqMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Index;
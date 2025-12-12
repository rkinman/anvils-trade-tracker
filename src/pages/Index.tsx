import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Activity, DollarSign, TrendingUp, Wallet, PieChart, PlusCircle, AlertTriangle, ArrowUpRight, ArrowDownLeft, ArrowDownRight, RefreshCw } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { format } from "date-fns";

const Index = () => {
  const queryClient = useQueryClient();
  const [isEntryOpen, setIsEntryOpen] = useState(false);
  const [isFlowOpen, setIsFlowOpen] = useState(false);
  const [netLiqAmount, setNetLiqAmount] = useState("");
  const [flowAmount, setFlowAmount] = useState("");
  const [flowType, setFlowType] = useState<'deposit' | 'withdrawal'>('deposit');
  const [showSpy, setShowSpy] = useState(false);
  
  // Date logic
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const currentHour = today.getHours();
  const isAfter4PM = currentHour >= 16; // 4 PM

  // --- QUERIES ---

  // 1. Fetch Net Liquidity Logs
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

  // 2. Fetch Capital Flows (Deposits/Withdrawals)
  const { data: capitalFlows, isLoading: flowsLoading } = useQuery({
    queryKey: ['capital-flows'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('capital_flows')
        .select('*')
        .order('date', { ascending: true });
      if (error) throw error;
      return data;
    }
  });

  // 3. Fetch SPY Benchmark Data
  const { data: spyData, isLoading: spyLoading } = useQuery({
    queryKey: ['spy-benchmark-dashboard'],
    queryFn: async () => {
      // Get the earliest date we need (from logs)
      // We fetch all available SPY data for simplicity and filter client-side
      const { data, error } = await supabase
        .from('benchmark_prices')
        .select('*')
        .eq('ticker', 'SPY')
        .order('date', { ascending: true });
      
      if (error) throw error;
      return data;
    }
  });

  // 4. Fetch Trade Stats (Calculated)
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

  // --- MUTATIONS ---

  const syncSpyMutation = useMutation({
    mutationFn: async () => {
      let startDate = todayStr;
      
      // If we have history, sync from the beginning to update everything including today
      if (netLiqLogs && netLiqLogs.length > 0) {
        startDate = netLiqLogs[0].date;
      }
      
      const { data, error } = await supabase.functions.invoke('fetch-benchmarks', {
        body: { tickers: ['SPY'], startDate }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['spy-benchmark-dashboard'] });
      showSuccess("Synced SPY data successfully");
    },
    onError: (err) => showError(err.message || "Failed to sync")
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
      
      // Auto-trigger sync to get latest SPY price for today
      syncSpyMutation.mutate();
    },
    onError: (err) => showError(err.message)
  });

  const flowMutation = useMutation({
    mutationFn: async ({ amount, type }: { amount: string, type: 'deposit' | 'withdrawal' }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const numAmount = parseFloat(amount);
      if (isNaN(numAmount)) throw new Error("Invalid amount");
      
      const finalAmount = type === 'deposit' ? Math.abs(numAmount) : -Math.abs(numAmount);

      const { error } = await supabase
        .from('capital_flows')
        .insert({ 
          user_id: user.id, 
          date: todayStr, 
          amount: finalAmount 
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['capital-flows'] });
      setIsFlowOpen(false);
      setFlowAmount("");
      showSuccess("Capital flow recorded");
    },
    onError: (err) => showError(err.message)
  });

  // --- LOGIC ---

  const handleSaveNetLiq = () => upsertNetLiqMutation.mutate(netLiqAmount);
  const handleSaveFlow = () => flowMutation.mutate({ amount: flowAmount, type: flowType });

  // Calculate Chart Data & Metrics
  const { chartData, currentNetLiq, totalPnL, pnlChangeToday, totalReturnPct } = useMemo(() => {
    if (!netLiqLogs || netLiqLogs.length === 0) return { chartData: [], currentNetLiq: 0, totalPnL: 0, pnlChangeToday: 0, totalReturnPct: 0 };

    // 1. Prepare base map of logs
    const logsMap = new Map(netLiqLogs.map(l => [l.date, Number(l.amount)]));
    const sortedDates = netLiqLogs.map(l => l.date).sort();
    const startDate = sortedDates[0];
    const latestDate = sortedDates[sortedDates.length - 1];
    const latestValue = logsMap.get(latestDate) || 0;

    // 2. Aggregate Flows
    const initialCapital = logsMap.get(startDate) || 0;
    const flowsAfterStart = capitalFlows?.filter(f => f.date > startDate).reduce((sum, f) => sum + Number(f.amount), 0) || 0;
    
    const totalInvested = initialCapital + flowsAfterStart;
    const totalPnL = latestValue - totalInvested;
    const totalReturnPct = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0;

    // 3. Calculate Change Since Last Update
    let pnlChangeToday = 0;
    if (sortedDates.length >= 2) {
      const prevDate = sortedDates[sortedDates.length - 2];
      const prevValue = logsMap.get(prevDate) || 0;
      const flowsOnLatestDate = capitalFlows?.filter(f => f.date === latestDate).reduce((sum, f) => sum + Number(f.amount), 0) || 0;
      
      pnlChangeToday = (latestValue - flowsOnLatestDate) - prevValue;
    }

    // 4. Build Chart Data with Benchmark
    const data = netLiqLogs.map(log => {
      const date = log.date;
      const value = Number(log.amount);
      let benchmarkValue = undefined;

      if (spyData && spyData.length > 0) {
         // Use matching date or most recent previous date (for weekends/holidays)
         // spyData is sorted ascending
         
         const spyPriceObj = spyData.filter((d: any) => d.date <= date).pop();
         const spyStartObj = spyData.filter((d: any) => d.date <= startDate).pop();
         
         if (spyPriceObj && spyStartObj && Number(spyStartObj.price) > 0) {
            const spyStart = Number(spyStartObj.price);
            const spyCurr = Number(spyPriceObj.price); 
            benchmarkValue = initialCapital * (spyCurr / spyStart);
         }
      }

      return {
        date,
        value,
        benchmarkValue
      };
    });

    return { chartData: data, currentNetLiq: latestValue, totalPnL, pnlChangeToday, totalReturnPct };
  }, [netLiqLogs, capitalFlows, spyData]);

  // Effect to auto-sync if data is missing for latest log (and showSpy is active)
  useEffect(() => {
    if (!showSpy || !netLiqLogs || netLiqLogs.length === 0 || !spyData) return;
    
    const latestLogDate = netLiqLogs[netLiqLogs.length - 1].date;
    // Check if we have a relatively recent SPY price (within 4 days to account for long weekends)
    const latestSpyDate = spyData.length > 0 ? spyData[spyData.length - 1].date : '1900-01-01';
    
    const logTime = new Date(latestLogDate).getTime();
    const spyTime = new Date(latestSpyDate).getTime();
    const diffDays = (logTime - spyTime) / (1000 * 3600 * 24);

    // If gap is more than 3 days, trigger sync
    if (diffDays > 3 && !spyLoading && !syncSpyMutation.isPending) {
        console.log("Auto-syncing SPY data due to stale prices...");
        syncSpyMutation.mutate();
    }
  }, [showSpy, netLiqLogs, spyData]);

  const loading = statsLoading || logsLoading || flowsLoading || spyLoading;

  // Check if today's entry exists
  const hasEntryForToday = netLiqLogs?.some(log => log.date === todayStr);
  const showWarning = isAfter4PM && !hasEntryForToday;

  if (loading) {
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
          <div className="flex flex-wrap gap-2">
             <Button onClick={() => setIsFlowOpen(true)} variant="outline">
                <Wallet className="mr-2 h-4 w-4" /> Deposit / Withdraw
             </Button>
             <Button onClick={() => setIsEntryOpen(true)} variant="default">
                <PlusCircle className="mr-2 h-4 w-4" /> Update Net Liq
             </Button>
             <Button asChild variant="secondary">
                <Link to="/import">Import Data</Link>
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

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Net Liquidity</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(currentNetLiq)}
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                 {pnlChangeToday >= 0 ? <ArrowUpRight className="h-3 w-3 text-green-500" /> : <ArrowDownRight className="h-3 w-3 text-red-500" />}
                 <span className={pnlChangeToday >= 0 ? "text-green-500" : "text-red-500"}>
                    {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', signDisplay: "always" }).format(pnlChangeToday)}
                 </span>
                 {' '}since last update
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Growth</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className={ `text-2xl font-bold ${totalPnL >= 0 ? 'text-green-500' : 'text-red-500'}` }>
                {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', signDisplay: "always" }).format(totalPnL)}
              </div>
              <p className="text-xs text-muted-foreground">
                 {totalReturnPct.toFixed(2)}% Return (Adj. for deposits)
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Trades</CardTitle>
              <PieChart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{tradeStats?.activePositions || 0}</div>
              <p className="text-xs text-muted-foreground">Open legs tracked</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-1">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                 <CardTitle>Portfolio Performance</CardTitle>
                 <CardDescription>Net Liquidity over time vs SPY benchmark.</CardDescription>
              </div>
              <div className="flex items-center gap-4">
                 <div className="flex items-center space-x-2">
                    <Switch id="show-spy" checked={showSpy} onCheckedChange={setShowSpy} />
                    <Label htmlFor="show-spy">Compare SPY</Label>
                 </div>
                 {showSpy && (
                    <Button size="sm" variant="ghost" onClick={() => syncSpyMutation.mutate()} disabled={syncSpyMutation.isPending} title="Sync SPY Data">
                       <RefreshCw className={`h-4 w-4 ${syncSpyMutation.isPending ? 'animate-spin' : ''}`} />
                    </Button>
                 )}
              </div>
            </CardHeader>
            <CardContent className="pl-0">
               <DashboardChart data={chartData} showBenchmark={showSpy} />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Net Liq Dialog */}
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
              <p className="text-xs text-muted-foreground">This will overwrite any existing value for today.</p>
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

      {/* Deposit/Withdraw Dialog */}
      <Dialog open={isFlowOpen} onOpenChange={setIsFlowOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Capital Flow</DialogTitle>
            <DialogDescription>
              Record a deposit or withdrawal. This ensures your performance metrics remain accurate.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
             <div className="flex gap-4">
                <Button 
                   type="button" 
                   variant={flowType === 'deposit' ? 'default' : 'outline'} 
                   className="flex-1"
                   onClick={() => setFlowType('deposit')}
                >
                   <ArrowDownLeft className="mr-2 h-4 w-4" /> Deposit
                </Button>
                <Button 
                   type="button" 
                   variant={flowType === 'withdrawal' ? 'default' : 'outline'} 
                   className="flex-1"
                   onClick={() => setFlowType('withdrawal')}
                >
                   <ArrowUpRight className="mr-2 h-4 w-4" /> Withdraw
                </Button>
             </div>
            <div className="space-y-2">
              <Label htmlFor="flowAmount">Amount ($)</Label>
              <Input 
                id="flowAmount" 
                type="number" 
                placeholder="e.g. 5000"
                value={flowAmount}
                onChange={(e) => setFlowAmount(e.target.value)}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsFlowOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveFlow} disabled={flowMutation.isPending || !flowAmount}>
              {flowMutation.isPending ? "Recording..." : "Record Transaction"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Index;
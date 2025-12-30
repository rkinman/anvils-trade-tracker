import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, TrendingUp, AlertCircle, ChevronDown, ChevronRight, Pencil, Link as LinkIcon } from "lucide-react";
import { format, differenceInCalendarDays, parse } from "date-fns";
import { cn } from "@/lib/utils";
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
import { showSuccess, showError } from "@/utils/toast";

// --- Types ---
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
  pair_id: string | null;
}

interface TradeGroup {
  id: string;
  isPair: boolean;
  trades: Trade[];
  summary: {
    openDate: string;
    closeDate: string | null;
    symbol: string;
    totalAmount: number;
    totalMarketValue: number;
    totalPnl: number;
    isOpen: boolean;
    initialCredit: number;
    strike?: number;
    expiration?: Date;
    type?: 'PUT' | 'CALL' | 'OTHER';
  };
}

// --- Helpers ---

// Helper to parse option symbols for Strike and Expiration
const parseOptionDetails = (symbol: string) => {
  try {
    const clean = symbol.trim().toUpperCase();
    const match = clean.match(/^([A-Z]+)\s+(\d{6})([CP])(\d+(\.\d+)?)$/);
    
    if (match) {
      const dateStr = match[2]; 
      const typeStr = match[3]; 
      const strikeStr = match[4]; 
      
      const expiration = parse(dateStr, 'yyMMdd', new Date());
      let strike = parseFloat(strikeStr);
      if (strikeStr.length === 8 && strike > 10000) strike = strike / 1000;

      return {
        expiration,
        type: typeStr === 'P' ? 'PUT' : 'CALL',
        strike
      };
    }
    
    if (clean.includes(':')) {
       const parts = clean.split(':');
       if (parts.length >= 4) {
          return {
             expiration: new Date(parts[1]),
             strike: parseFloat(parts[2]),
             type: parts[3] === 'P' ? 'PUT' : 'CALL'
          }
       }
    }
  } catch (e) {
    return null;
  }
  return null;
};


export default function PutCamp() {
  const queryClient = useQueryClient();
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [isEditNetLiqOpen, setIsEditNetLiqOpen] = useState(false);
  const [newNetLiq, setNewNetLiq] = useState("");

  // 1. Fetch the 'Put Camp' strategy
  const { data: strategy } = useQuery({
    queryKey: ['strategy-put-camp'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('strategies')
        .select('*')
        .ilike('name', '%Put Camp%')
        .limit(1)
        .maybeSingle(); 
      
      return data;
    }
  });

  // 2. Fetch trades
  const { data: trades, isLoading } = useQuery({
    queryKey: ['trades-put-camp', strategy?.id],
    queryFn: async () => {
      if (!strategy?.id) return [];
      const { data, error } = await supabase
        .from('trades')
        .select('*')
        .eq('strategy_id', strategy.id)
        .eq('hidden', false)
        .order('date', { ascending: false });
      
      if (error) throw error;
      return data as Trade[];
    },
    enabled: !!strategy?.id
  });

  const updateCapitalMutation = useMutation({
    mutationFn: async (newCapital: number) => {
        if (!strategy?.id) throw new Error("No strategy ID");
        const { error } = await supabase
            .from('strategies')
            .update({ capital_allocation: newCapital })
            .eq('id', strategy.id);
        
        if (error) throw error;
    },
    onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['strategy-put-camp'] });
        setIsEditNetLiqOpen(false);
        showSuccess("Net Liquidity updated successfully");
    },
    onError: (err) => showError(err.message)
  });

  // 3. Process Trades into Groups (Positions)
  const groups = useMemo(() => {
    if (!trades) return [];

    const grouped: Record<string, TradeGroup> = {};

    trades.forEach(trade => {
      const groupId = trade.pair_id || trade.id;
      
      if (!grouped[groupId]) {
        grouped[groupId] = {
          id: groupId,
          isPair: !!trade.pair_id,
          trades: [],
          summary: {
            openDate: trade.date,
            closeDate: null,
            symbol: trade.symbol,
            totalAmount: 0,
            totalMarketValue: 0,
            totalPnl: 0,
            isOpen: false,
            initialCredit: 0,
            strike: 0,
            expiration: undefined,
            type: 'OTHER'
          }
        };
      }
      grouped[groupId].trades.push(trade);
    });

    return Object.values(grouped).map(group => {
      group.trades.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
      const openDate = group.trades[0].date;
      const lastTradeDate = group.trades[group.trades.length - 1].date;
      
      let totalAmount = 0;
      let totalMarketValue = 0;
      let isOpen = false;
      let initialCredit = 0;
      
      const parsed = parseOptionDetails(group.trades[0].symbol);
      const strike = parsed?.strike || 0;
      const expiration = parsed?.expiration;
      const type = (parsed?.type || 'OTHER') as 'PUT' | 'CALL' | 'OTHER';

      group.trades.forEach(trade => {
        const amount = Number(trade.amount); 
        totalAmount += amount;
        
        // Sum all positive amounts as total potential credit
        if (amount > 0) initialCredit += amount;

        if (trade.mark_price !== null) {
           isOpen = true;
           const cleanMark = Math.abs(trade.mark_price);
           const qty = trade.quantity;
           const mult = trade.multiplier;
           const actionUpper = trade.action.toUpperCase();
           const isShort = actionUpper.includes('SELL') || actionUpper.includes('SHORT');
           const sign = isShort ? -1 : 1;
           
           totalMarketValue += (cleanMark * qty * mult * sign);
        }
      });

      const totalPnl = totalMarketValue + totalAmount;

      return {
        ...group,
        summary: {
          openDate,
          closeDate: isOpen ? null : lastTradeDate,
          symbol: group.trades[0].symbol, 
          totalAmount,
          totalMarketValue,
          totalPnl,
          isOpen,
          initialCredit,
          strike,
          expiration,
          type
        }
      };
    }).sort((a, b) => new Date(b.summary.openDate).getTime() - new Date(a.summary.openDate).getTime());
  }, [trades]);


  // 4. Calculate Grid Metrics
  const metrics = useMemo(() => {
    if (!strategy || groups.length === 0) return null;

    const totalTrades = groups.length;
    const closedGroups = groups.filter(g => !g.summary.isOpen);
    const openGroups = groups.filter(g => g.summary.isOpen);
    
    const totalClosed = closedGroups.length;
    const totalOpen = openGroups.length;

    const wins = closedGroups.filter(g => g.summary.totalPnl > 0);
    const losses = closedGroups.filter(g => g.summary.totalPnl <= 0);
    
    const totalWins = wins.length;
    const totalLosses = losses.length;
    const winRate = totalClosed > 0 ? (totalWins / totalClosed) * 100 : 0;

    const runningPnl = groups.reduce((sum, g) => sum + g.summary.totalPnl, 0); 
    const allocatedCap = Number(strategy.capital_allocation) || 0;
    const netLiq = allocatedCap + runningPnl; 

    const totalCredit = groups.reduce((sum, g) => sum + g.summary.initialCredit, 0);
    const avgCredit = totalTrades > 0 ? totalCredit / totalTrades : 0;

    const totalWinAmt = wins.reduce((sum, g) => sum + g.summary.totalPnl, 0);
    const totalLossAmt = losses.reduce((sum, g) => sum + g.summary.totalPnl, 0);
    const avgWinner = totalWins > 0 ? totalWinAmt / totalWins : 0;
    const avgLoser = totalLosses > 0 ? totalLossAmt / totalLosses : 0;

    const totalNV = openGroups.reduce((sum, g) => {
       const qty = g.trades[0]?.quantity || 0;
       const mult = g.trades[0]?.multiplier || 100;
       const strike = g.summary.strike || 0;
       return sum + (strike * mult * qty);
    }, 0);

    const notionalLeverage = netLiq > 0 ? totalNV / netLiq : 0;

    let totalDTE = 0;
    let dteCount = 0;
    let totalDIT = 0;
    let ditCount = 0;

    groups.forEach(g => {
       if (g.summary.expiration) {
          const entry = new Date(g.summary.openDate);
          const dte = differenceInCalendarDays(g.summary.expiration, entry);
          if (dte >= 0) {
             totalDTE += dte;
             dteCount++;
          }
       }
    });

    closedGroups.forEach(g => {
       if (g.summary.closeDate) {
          const entry = new Date(g.summary.openDate);
          const close = new Date(g.summary.closeDate);
          const dit = differenceInCalendarDays(close, entry);
          totalDIT += (dit < 1 ? 1 : dit); 
          ditCount++;
       }
    });

    const avgDTE = dteCount > 0 ? totalDTE / dteCount : 0;
    const avgDIT = ditCount > 0 ? totalDIT / ditCount : 0;

    let peak = 0;
    let currentEquity = 0;
    let maxDD = 0;
    
    const timeline = closedGroups
      .filter(g => g.summary.closeDate)
      .sort((a, b) => new Date(a.summary.closeDate!).getTime() - new Date(b.summary.closeDate!).getTime());
    
    timeline.forEach(g => {
       currentEquity += g.summary.totalPnl;
       if (currentEquity > peak) peak = currentEquity;
       const accountVal = allocatedCap + currentEquity;
       const peakVal = allocatedCap + peak;
       const ddPct = peakVal > 0 ? (peakVal - accountVal) / peakVal : 0;
       if (ddPct > maxDD) maxDD = ddPct;
    });

    return {
       totalTrades, totalClosed, totalOpen,
       totalWins, totalLosses, winRate,
       totalNV, notionalLeverage,
       runningPnl, netLiq,
       avgCredit, avgWinner, avgLoser,
       avgDTE, avgDIT,
       netLiqDD: maxDD * 100,
       allocatedCap
    };
  }, [groups, strategy]);

  const toggleGroup = (id: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSaveNetLiq = () => {
    const val = parseFloat(newNetLiq);
    if (isNaN(val) || !metrics) return;
    const requiredCapital = val - metrics.runningPnl;
    updateCapitalMutation.mutate(requiredCapital);
  };

  const openNetLiqDialog = () => {
    if (metrics) {
        setNewNetLiq(metrics.netLiq.toFixed(2));
        setIsEditNetLiqOpen(true);
    }
  };

  const formatMoney = (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

  if (isLoading) return <DashboardLayout><Loader2 className="h-8 w-8 animate-spin mx-auto mt-20" /></DashboardLayout>;

  if (!strategy) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-[50vh] space-y-4 text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground" />
          <h2 className="text-2xl font-bold">Strategy Not Found</h2>
          <p className="text-muted-foreground max-w-md mb-4">
            Please create a strategy named <strong>"Put Camp"</strong> (case insensitive) in the Strategies page to enable this tracker.
          </p>
          <Button asChild>
            <Link to="/strategies">Go to Strategies</Link>
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 pb-20">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Put Camp</h2>
          <p className="text-muted-foreground">Tracking for Short Put campaigns.</p>
        </div>

        {metrics && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border border rounded-lg overflow-hidden shadow-sm">
            <div className="flex flex-col gap-px">
               <MetricBox label="Total Trades" value={metrics.totalTrades} />
               <MetricBox label="Closed Trades" value={metrics.totalClosed} />
               <MetricBox label="Open Trades" value={metrics.totalOpen} />
               <MetricBox label="Total NV" value={formatMoney(metrics.totalNV)} />
               <MetricBox label="Notional LVRG" value={metrics.notionalLeverage.toFixed(3)} className={metrics.notionalLeverage > 1.5 ? "bg-red-100 dark:bg-red-900/20" : ""} />
               <MetricBox label="VIX" value="--" />
            </div>
            
             <div className="flex flex-col gap-px">
               <MetricBox label="Total Wins" value={metrics.totalWins} />
               <MetricBox label="Total Losses" value={metrics.totalLosses} />
               <MetricBox label="Win Rate" value={`${metrics.winRate.toFixed(2)}%`} />
               <MetricBox label="Running P/L" value={formatMoney(metrics.runningPnl)} className={metrics.runningPnl >= 0 ? "text-green-600 dark:text-green-400 font-bold" : "text-red-600 dark:text-red-400 font-bold"} />
               <MetricBox 
                  label="Net LIQ" 
                  value={formatMoney(metrics.netLiq)} 
                  onEdit={openNetLiqDialog}
                  className="cursor-pointer hover:bg-muted/50"
               />
               <MetricBox label="VIX3M" value="--" />
            </div>

             <div className="flex flex-col gap-px">
               <MetricBox label="Avg Credit" value={formatMoney(metrics.avgCredit)} />
               <MetricBox label="Avg Winner" value={formatMoney(metrics.avgWinner)} />
               <MetricBox label="Avg Loser" value={formatMoney(metrics.avgLoser)} />
               <MetricBox label="Avg Cap%" value="--" />
               <MetricBox label="Total MAL" value="--" />
               <MetricBox label="VIX/VIX3M" value="--" />
            </div>

             <div className="flex flex-col gap-px">
               <MetricBox label="Avg DTE" value={metrics.avgDTE.toFixed(1)} />
               <MetricBox label="Avg DIT" value={metrics.avgDIT.toFixed(1)} />
               <MetricBox label="Net LIQ DD" value={`${metrics.netLiqDD.toFixed(2)}%`} />
               <MetricBox label="" value="" className="flex-1 bg-muted/50" /> 
            </div>
          </div>
        )}

        {metrics && metrics.allocatedCap > 0 && (
           <div className="flex items-center gap-2 text-sm font-mono text-muted-foreground">
              <TrendingUp className="h-4 w-4" />
              <span>
                 {((metrics.runningPnl / metrics.allocatedCap) * 100).toFixed(2)}% ROR ON {(metrics.allocatedCap / 1000).toFixed(0)}K
              </span>
           </div>
        )}

        <div className="space-y-4">
           <Card>
              <CardHeader className="py-3 bg-muted/20">
                 <CardTitle className="text-base">Open Positions</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                 <TradeGroupTable 
                    groups={groups.filter(g => g.summary.isOpen)} 
                    expanded={expandedGroups} 
                    toggle={toggleGroup}
                    formatMoney={formatMoney}
                 />
              </CardContent>
           </Card>

            <Card>
              <CardHeader className="py-3 bg-muted/20">
                 <CardTitle className="text-base">Closed Trades</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                 <TradeGroupTable 
                    groups={groups.filter(g => !g.summary.isOpen)} 
                    expanded={expandedGroups} 
                    toggle={toggleGroup}
                    formatMoney={formatMoney}
                 />
              </CardContent>
           </Card>
        </div>
      </div>

      <Dialog open={isEditNetLiqOpen} onOpenChange={setIsEditNetLiqOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Net Liquidity</DialogTitle>
            <DialogDescription>
              Adjusting the Net Liquidity will update the strategy's Allocated Capital to match.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-2">
            <Label>Current Net Liquidity ($)</Label>
            <Input 
              type="number" 
              value={newNetLiq} 
              onChange={(e) => setNewNetLiq(e.target.value)} 
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditNetLiqOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveNetLiq} disabled={updateCapitalMutation.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

const MetricBox = ({ label, value, className, onEdit }: { label: string, value: string | number, className?: string, onEdit?: () => void }) => (
  <div 
    className={cn("bg-card p-2 flex flex-col justify-center h-[60px] relative group transition-colors", className)}
    onClick={onEdit ? onEdit : undefined}
  >
     {label && <span className="text-[10px] uppercase font-semibold text-muted-foreground">{label}</span>}
     {value !== "" && <span className="text-sm font-bold font-mono">{value}</span>}
     {onEdit && (
         <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Pencil className="h-3 w-3 text-muted-foreground" />
         </div>
     )}
  </div>
);

const TradeGroupTable = ({ groups, expanded, toggle, formatMoney }: any) => {
   if (groups.length === 0) return <div className="p-4 text-center text-sm text-muted-foreground">No trades found.</div>;

   return (
      <Table>
         <TableHeader>
            <TableRow>
               <TableHead className="w-8"></TableHead>
               <TableHead>Date</TableHead>
               <TableHead>Symbol</TableHead>
               <TableHead className="text-right">Net Credit</TableHead>
               <TableHead className="text-right">Market Val</TableHead>
               <TableHead className="text-right">P&L</TableHead>
               <TableHead className="text-right">% Cap</TableHead>
            </TableRow>
         </TableHeader>
         <TableBody>
            {groups.map((group: TradeGroup) => {
               const isExpanded = expanded.has(group.id);
               // Calculate % of credit captured (P&L / Max Potential Profit)
               // Max Potential = Sum of all credits (initialCredit)
               const pctCaptured = group.summary.initialCredit > 0 
                  ? (group.summary.totalPnl / group.summary.initialCredit) * 100 
                  : 0;

               return (
                  <>
                     <TableRow 
                        key={group.id} 
                        className={cn("cursor-pointer hover:bg-muted/50", isExpanded && "bg-muted/20 border-b-0")}
                        onClick={() => toggle(group.id)}
                     >
                        <TableCell className="p-2 text-center">
                           {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </TableCell>
                        <TableCell className="font-medium">{format(new Date(group.summary.openDate), 'MMM d, yy')}</TableCell>
                        <TableCell>
                           <div className="flex items-center gap-2">
                              {group.summary.symbol}
                              {group.isPair && <LinkIcon className="h-3 w-3 text-muted-foreground" />}
                           </div>
                        </TableCell>
                        <TableCell className="text-right font-mono">{formatMoney(group.summary.totalAmount)}</TableCell>
                        <TableCell className="text-right font-mono">{group.summary.isOpen ? formatMoney(group.summary.totalMarketValue) : '-'}</TableCell>
                        <TableCell className={cn("text-right font-bold font-mono", group.summary.totalPnl >= 0 ? "text-green-600" : "text-red-600")}>
                           {formatMoney(group.summary.totalPnl)}
                        </TableCell>
                        <TableCell className={cn("text-right font-mono", pctCaptured >= 50 ? "text-green-600 font-bold" : "text-muted-foreground")}>
                           {pctCaptured.toFixed(0)}%
                        </TableCell>
                     </TableRow>
                     
                     {isExpanded && (
                        <TableRow className="bg-muted/5 hover:bg-muted/5">
                           <TableCell colSpan={7} className="p-0">
                              <div className="border-y bg-background/50">
                                 <Table>
                                    <TableBody>
                                       {group.trades.map((trade: Trade) => (
                                          <TableRow key={trade.id} className="border-0 hover:bg-transparent">
                                             <TableCell className="w-8"></TableCell>
                                             <TableCell className="text-xs text-muted-foreground">{format(new Date(trade.date), 'MM/dd')}</TableCell>
                                             <TableCell className="text-xs">
                                                <span className={trade.action.includes('BUY') ? "text-red-500" : "text-green-500"}>{trade.action}</span> {trade.quantity}x {trade.symbol}
                                             </TableCell>
                                             <TableCell className="text-xs text-right text-muted-foreground">{formatMoney(trade.amount)}</TableCell>
                                             <TableCell className="text-xs text-right text-muted-foreground">{trade.mark_price ? formatMoney(trade.mark_price * trade.quantity * trade.multiplier * (trade.action.includes('SELL') ? -1 : 1)) : '-'}</TableCell>
                                             <TableCell className="text-xs text-right"></TableCell>
                                             <TableCell className="text-xs text-right"></TableCell>
                                          </TableRow>
                                       ))}
                                    </TableBody>
                                 </Table>
                              </div>
                           </TableCell>
                        </TableRow>
                     )}
                  </>
               );
            })}
         </TableBody>
      </Table>
   );
}
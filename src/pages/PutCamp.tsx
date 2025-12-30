import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
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
// Matches formats like: SPY 241220P500 or SPY 241220 P 500
const parseOptionDetails = (symbol: string) => {
  try {
    const clean = symbol.trim().toUpperCase();
    // Regex for: SYMBOL + SPACE(s) + YYMMDD + TYPE(C/P) + STRIKE
    // Example: NVDA 241220C140
    // We allow flexible spacing
    const match = clean.match(/^([A-Z]+)\s+(\d{6})([CP])(\d+(\.\d+)?)$/);
    
    if (match) {
      const dateStr = match[2]; // 241220
      const typeStr = match[3]; // C or P
      const strikeStr = match[4]; // 140 or 00140000 (if OCC)
      
      const expiration = parse(dateStr, 'yyMMdd', new Date());
      
      // Determine strike. If > 10000 likely OCC format (implied decimals), but here likely human readable from CSV parser
      // The csvParser usually outputs cleaned strings. Let's assume the CSV parser did its job or the user input is clean.
      // If the strike string is massive (e.g. 00140000), treat as OCC / 1000.
      let strike = parseFloat(strikeStr);
      if (strikeStr.length === 8 && strike > 10000) strike = strike / 1000;

      return {
        expiration,
        type: typeStr === 'P' ? 'PUT' : 'CALL',
        strike
      };
    }
    
    // Fallback for "Symbol:Date:Strike:Type" format (canonical)
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
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // 1. Fetch the 'Put Camp' strategy
  const { data: strategy } = useQuery({
    queryKey: ['strategy-put-camp'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('strategies')
        .select('*')
        .ilike('name', '%Put Camp%')
        .limit(1)
        .maybeSingle(); // Use maybeSingle to avoid error on 0 rows
      
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

  // 3. Process Trades into Groups (Positions)
  const groups = useMemo(() => {
    if (!trades) return [];

    const grouped: Record<string, TradeGroup> = {};

    trades.forEach(trade => {
      // Group by pair_id if exists, otherwise treat as single trade ID
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

    // Calculate Summary for each Group
    return Object.values(grouped).map(group => {
      // Sort trades by date
      group.trades.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
      const openDate = group.trades[0].date;
      const lastTradeDate = group.trades[group.trades.length - 1].date;
      
      let totalAmount = 0;
      let totalMarketValue = 0;
      let isOpen = false;
      let initialCredit = 0;
      
      // Parse symbol from the first trade for metrics (assume it's the main leg)
      const parsed = parseOptionDetails(group.trades[0].symbol);
      const strike = parsed?.strike || 0;
      const expiration = parsed?.expiration;
      const type = (parsed?.type || 'OTHER') as 'PUT' | 'CALL' | 'OTHER';

      group.trades.forEach(trade => {
        const amount = Number(trade.amount); // Positive = Credit, Negative = Debit
        totalAmount += amount;
        
        // Track initial credit (sum of all positive entries near the start?)
        // Simple heuristic: if amount > 0, add to credit
        if (amount > 0) initialCredit += amount;

        if (trade.mark_price !== null) {
           isOpen = true;
           // Market value for a short position is negative (liability)
           const cleanMark = Math.abs(trade.mark_price);
           const qty = trade.quantity;
           const mult = trade.multiplier;
           const actionUpper = trade.action.toUpperCase();
           // If we sold to open, we are short.
           // However, database just has qty. We infer direction from action or context.
           // Usually Put Camp = Selling Puts.
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
          symbol: group.trades[0].symbol, // Use primary symbol
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

    const runningPnl = groups.reduce((sum, g) => sum + g.summary.totalPnl, 0); // Include unrealized? Usually yes for "Running P/L"
    const allocatedCap = Number(strategy.capital_allocation) || 0;
    const netLiq = allocatedCap + runningPnl; // Approximate

    // Avg Credit (Per trade)
    const totalCredit = groups.reduce((sum, g) => sum + g.summary.initialCredit, 0);
    const avgCredit = totalTrades > 0 ? totalCredit / totalTrades : 0;

    // Avg Winner / Loser
    const totalWinAmt = wins.reduce((sum, g) => sum + g.summary.totalPnl, 0);
    const totalLossAmt = losses.reduce((sum, g) => sum + g.summary.totalPnl, 0);
    const avgWinner = totalWins > 0 ? totalWinAmt / totalWins : 0;
    const avgLoser = totalLosses > 0 ? totalLossAmt / totalLosses : 0;

    // Notional Value (Open positions only)
    // NV for Put = Strike * Multiplier * Qty
    const totalNV = openGroups.reduce((sum, g) => {
       // Assume all open legs are the short puts (simplification)
       const qty = g.trades[0]?.quantity || 0;
       const mult = g.trades[0]?.multiplier || 100;
       const strike = g.summary.strike || 0;
       return sum + (strike * mult * qty);
    }, 0);

    const notionalLeverage = netLiq > 0 ? totalNV / netLiq : 0;

    // Averages DTE / DIT
    let totalDTE = 0;
    let dteCount = 0;
    let totalDIT = 0;
    let ditCount = 0;

    // Avg DTE (Entry to Expiration)
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

    // Avg DIT (Entry to Close for closed trades)
    closedGroups.forEach(g => {
       if (g.summary.closeDate) {
          const entry = new Date(g.summary.openDate);
          const close = new Date(g.summary.closeDate);
          const dit = differenceInCalendarDays(close, entry);
          totalDIT += (dit < 1 ? 1 : dit); // Min 1 day
          ditCount++;
       }
    });

    const avgDTE = dteCount > 0 ? totalDTE / dteCount : 0;
    const avgDIT = ditCount > 0 ? totalDIT / ditCount : 0;

    // Drawdown (Simplified based on trade sequence)
    // Construct equity curve
    let peak = 0;
    let currentEquity = 0;
    let maxDD = 0;
    
    // Sort groups by close date to simulate curve
    const timeline = closedGroups
      .filter(g => g.summary.closeDate)
      .sort((a, b) => new Date(a.summary.closeDate!).getTime() - new Date(b.summary.closeDate!).getTime());
    
    timeline.forEach(g => {
       currentEquity += g.summary.totalPnl;
       if (currentEquity > peak) peak = currentEquity;
       const dd = peak > 0 ? (peak - currentEquity) / (allocatedCap + peak) : 0; // relative to total account?
       // Let's use simple absolute DD from peak P&L
       // If we want % DD of Net Liq:
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

  const formatMoney = (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

  // --- Render ---

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

        {/* METRICS GRID - Mimicking the spreadsheet */}
        {metrics && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border border rounded-lg overflow-hidden shadow-sm">
            {/* Column 1 */}
            <div className="flex flex-col gap-px">
               <MetricBox label="Total Trades" value={metrics.totalTrades} />
               <MetricBox label="Closed Trades" value={metrics.totalClosed} />
               <MetricBox label="Open Trades" value={metrics.totalOpen} />
               <MetricBox label="Total NV" value={formatMoney(metrics.totalNV)} />
               <MetricBox label="Notional LVRG" value={metrics.notionalLeverage.toFixed(3)} className={metrics.notionalLeverage > 1.5 ? "bg-red-100 dark:bg-red-900/20" : ""} />
               <MetricBox label="VIX" value="--" />
            </div>
            
            {/* Column 2 */}
             <div className="flex flex-col gap-px">
               <MetricBox label="Total Wins" value={metrics.totalWins} />
               <MetricBox label="Total Losses" value={metrics.totalLosses} />
               <MetricBox label="Win Rate" value={`${metrics.winRate.toFixed(2)}%`} />
               <MetricBox label="Running P/L" value={formatMoney(metrics.runningPnl)} className={metrics.runningPnl >= 0 ? "text-green-600 dark:text-green-400 font-bold" : "text-red-600 dark:text-red-400 font-bold"} />
               <MetricBox label="Net LIQ" value={formatMoney(metrics.netLiq)} />
               <MetricBox label="VIX3M" value="--" />
            </div>

            {/* Column 3 */}
             <div className="flex flex-col gap-px">
               <MetricBox label="Avg Credit" value={formatMoney(metrics.avgCredit)} />
               <MetricBox label="Avg Winner" value={formatMoney(metrics.avgWinner)} />
               <MetricBox label="Avg Loser" value={formatMoney(metrics.avgLoser)} />
               <MetricBox label="Avg Cap%" value="--" />
               <MetricBox label="Total MAL" value="--" />
               <MetricBox label="VIX/VIX3M" value="--" />
            </div>

            {/* Column 4 */}
             <div className="flex flex-col gap-px">
               <MetricBox label="Avg DTE" value={metrics.avgDTE.toFixed(1)} />
               <MetricBox label="Avg DIT" value={metrics.avgDIT.toFixed(1)} />
               <MetricBox label="Net LIQ DD" value={`${metrics.netLiqDD.toFixed(2)}%`} />
               {/* Empty cells to match grid height */}
               <MetricBox label="" value="" className="flex-1 bg-muted/50" /> 
            </div>
          </div>
        )}

        {/* Footer Metric */}
        {metrics && metrics.allocatedCap > 0 && (
           <div className="flex items-center gap-2 text-sm font-mono text-muted-foreground">
              <TrendingUp className="h-4 w-4" />
              <span>
                 {((metrics.runningPnl / metrics.allocatedCap) * 100).toFixed(2)}% ROR ON {(metrics.allocatedCap / 1000).toFixed(0)}K
              </span>
           </div>
        )}

        {/* Trades List */}
        <div className="space-y-4">
           {/* Open Positions */}
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

           {/* Closed Positions */}
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
    </DashboardLayout>
  );
}

// --- Subcomponents ---

const MetricBox = ({ label, value, className }: { label: string, value: string | number, className?: string }) => (
  <div className={cn("bg-card p-2 flex flex-col justify-center h-[60px]", className)}>
     {label && <span className="text-[10px] uppercase font-semibold text-muted-foreground">{label}</span>}
     {value !== "" && <span className="text-sm font-bold font-mono">{value}</span>}
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
            </TableRow>
         </TableHeader>
         <TableBody>
            {groups.map((group: TradeGroup) => {
               const isExpanded = expanded.has(group.id);
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
                     </TableRow>
                     
                     {isExpanded && (
                        <TableRow className="bg-muted/5 hover:bg-muted/5">
                           <TableCell colSpan={6} className="p-0">
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
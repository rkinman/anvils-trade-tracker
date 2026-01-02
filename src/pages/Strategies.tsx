import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Plus, Trash2, TrendingUp, Eye, Target, MoreHorizontal, Archive, RefreshCw, Pencil, DollarSign, Clock, Percent, AlertCircle, BarChart3, RotateCw, LayoutGrid, List } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { showSuccess, showError } from "@/utils/toast";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface Strategy {
  id: string;
  name: string;
  description: string | null;
  capital_allocation: number;
  status: 'active' | 'closed';
  start_date: string | null;
  is_hidden: boolean;
  benchmark_ticker: string;
  total_pnl: number;
  realized_pnl: number;
  unrealized_pnl: number;
  trade_count: number;
  win_count: number;
  loss_count: number;
  days_in_trade: number;
  dashboard_tags?: any[];
  first_trade_date?: string;
  last_trade_date?: string;
  benchmark_performance?: number;
}

export default function Strategies() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState<Strategy | null>(null);
  const [formData, setFormData] = useState({ name: "", description: "", capital_allocation: "0", benchmark_ticker: "SPY" });
  const [isSyncing, setIsSyncing] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
  const queryClient = useQueryClient();

  // Fetch strategies with robust error handling
  const { data: strategies, isLoading: strategiesLoading, error: strategiesError } = useQuery({
    queryKey: ['strategies-calculated'],
    queryFn: async () => {
      try {
        // 1. Fetch Strategies
        const { data: strategiesData, error: stratError } = await supabase
          .from('strategies')
          .select('*');
        
        if (stratError) throw stratError;

        if (!strategiesData || strategiesData.length === 0) {
          return [];
        }

        // 2. Fetch All Trades (needed for accurate aggregation)
        const { data: tradesData, error: tradesError } = await supabase
          .from('trades')
          .select('id, strategy_id, amount, date, mark_price, quantity, multiplier, action, hidden, tag_id');
        
        if (tradesError) console.error(tradesError);

        const safeTrades = tradesData || [];

        // 3. Fetch Tags (for client-side calculation)
        let tagsData: any[] = [];
        try {
          const { data, error } = await supabase
            .from('tags')
            .select('*');
          
          if (!error && data) tagsData = data;
        } catch (err) {
          console.warn("Could not fetch tags", err);
        }

        // 4. Fetch Benchmark Data
        const { data: benchmarkData } = await supabase
          .from('benchmark_prices')
          .select('*');

        // 5. Calculate Metrics per Strategy
        const calculatedStrategies = strategiesData.map(strategy => {
          const stratTrades = safeTrades.filter(t => t.strategy_id === strategy.id && !t.hidden);
          
          let total_pnl = 0;
          let realized_pnl = 0;
          let unrealized_pnl = 0;
          let win_count = 0;
          let loss_count = 0;
          let days_in_trade = 0;
          let first_trade_date = null;
          let last_trade_date = null;

          // Calculate Days in Trade & Dates
          if (stratTrades.length > 0) {
              const dates = stratTrades
                .map(t => t.date ? new Date(t.date).getTime() : NaN)
                .filter(d => !isNaN(d));
              
              if (dates.length > 0) {
                const minDate = Math.min(...dates);
                first_trade_date = new Date(minDate).toISOString().split('T')[0];
                const maxDate = Math.max(...dates);
                last_trade_date = new Date(maxDate).toISOString().split('T')[0];

                const endDate = strategy.status === 'closed' ? maxDate : Date.now();
                const diffTime = Math.max(0, endDate - minDate);
                days_in_trade = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                if (days_in_trade === 0) days_in_trade = 1;
              }
          }

          // Helper logic for P&L calc (reused for Strategy and Tags)
          // MUST MATCH LOGIC IN StrategyDetail.tsx
          const calculateTradePnl = (trade: any) => {
              let amount = Number(trade.amount) || 0;
              const actionStr = trade.action ? trade.action.toUpperCase() : '';
              const isBuy = actionStr.includes('BUY') || actionStr.includes('LONG');
              const isShort = actionStr.includes('SELL') || actionStr.includes('SHORT');
              
              // Apply sign correction for BUY orders having positive amounts (should be debit/negative)
              if (isBuy && amount > 0) {
                amount = -amount;
              }

              if (trade.mark_price !== null && trade.mark_price !== undefined) {
                  const mark = Math.abs(Number(trade.mark_price));
                  const qty = Number(trade.quantity) || 0;
                  const mult = Number(trade.multiplier) || 1; 
                  
                  const sign = isShort ? -1 : 1;
                  const marketValue = mark * qty * mult * sign;
                  return marketValue + amount; // Unrealized P&L
              } else {
                  return amount; // Realized P&L
              }
          };

          stratTrades.forEach(trade => {
              const pnl = calculateTradePnl(trade);
              const isUnrealized = trade.mark_price !== null && trade.mark_price !== undefined;
              
              if (isUnrealized) {
                  unrealized_pnl += pnl;
              } else {
                  realized_pnl += pnl;
                  if (pnl > 0) win_count++;
                  if (pnl < 0) loss_count++;
              }
          });

          total_pnl = realized_pnl + unrealized_pnl;

          // Calculate Tag Performance Client-Side
          const stratTags = tagsData.filter(t => t.strategy_id === strategy.id);
          const dashboard_tags = stratTags.map(tag => {
             const tagTrades = stratTrades.filter(t => t.tag_id === tag.id);
             let tagTotalPnl = 0;
             tagTrades.forEach(t => {
                 tagTotalPnl += calculateTradePnl(t);
             });
             return {
                 tag_id: tag.id,
                 tag_name: tag.name,
                 total_pnl: tagTotalPnl,
                 show_on_dashboard: tag.show_on_dashboard
             };
          }).filter(t => t.show_on_dashboard);


          // Calculate Benchmark Performance
          let benchmarkPerformance = 0;
          const ticker = strategy.benchmark_ticker || 'SPY';
          
          if (first_trade_date && benchmarkData) {
            // Since data in DB is normalized to 100 at the fetch date, we need to compare two points
            // Find price closest to first_trade_date
            const stratPrices = benchmarkData
              .filter((b: any) => b.ticker === ticker)
              .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
            
            if (stratPrices.length > 0) {
              // Find entry price (closest date >= first_trade_date)
              // Since it's sorted, find first
              const startPriceObj = stratPrices.find((p: any) => p.date >= first_trade_date);
              
              // Find end price (closest date <= today or last_trade_date if closed)
              const endDateToCheck = strategy.status === 'closed' ? last_trade_date : new Date().toISOString().split('T')[0];
              // Reverse find for end price
              const endPriceObj = [...stratPrices].reverse().find((p: any) => p.date <= endDateToCheck);

              if (startPriceObj && endPriceObj && Number(startPriceObj.price) > 0) {
                 const startP = Number(startPriceObj.price);
                 const endP = Number(endPriceObj.price);
                 benchmarkPerformance = ((endP - startP) / startP) * 100;
              }
            }
          }

          return {
            ...strategy,
            capital_allocation: Number(strategy.capital_allocation) || 0,
            status: strategy.status || 'active',
            start_date: strategy.start_date,
            is_hidden: strategy.is_hidden || false,
            benchmark_ticker: ticker,
            total_pnl,
            realized_pnl,
            unrealized_pnl,
            trade_count: stratTrades.length,
            win_count,
            loss_count,
            days_in_trade,
            dashboard_tags,
            first_trade_date,
            last_trade_date,
            benchmark_performance: benchmarkPerformance
          };
        });

        return calculatedStrategies.sort((a, b) => b.total_pnl - a.total_pnl) as Strategy[];
      } catch (err) {
        console.error("CRITICAL ERROR in Strategies queryFn:", err);
        throw err;
      }
    }
  });

  const activeStrategies = strategies?.filter(s => s.status === 'active' && !s.is_hidden) || [];
  const closedStrategies = strategies?.filter(s => s.status === 'closed' && !s.is_hidden) || [];

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not found");
      
      const { error } = await supabase.from('strategies').insert({
        name: data.name,
        description: data.description,
        capital_allocation: parseFloat(data.capital_allocation) || 0,
        benchmark_ticker: data.benchmark_ticker.toUpperCase() || 'SPY',
        user_id: user.id
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['strategies-calculated'] });
      setIsCreateOpen(false);
      setFormData({ name: "", description: "", capital_allocation: "0", benchmark_ticker: "SPY" });
      showSuccess("Strategy created successfully!");
    },
    onError: (error) => showError(error.message)
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string, status: 'active' | 'closed' }) => {
      const { error } = await supabase.from('strategies').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['strategies-calculated'] });
      showSuccess("Strategy status updated");
    }
  });

  const updateStrategyMutation = useMutation({
    mutationFn: async (data: typeof formData & { id: string }) => {
      const { error } = await supabase.from('strategies').update({
        name: data.name,
        description: data.description,
        capital_allocation: parseFloat(data.capital_allocation) || 0,
        benchmark_ticker: data.benchmark_ticker.toUpperCase()
      }).eq('id', data.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['strategies-calculated'] });
      setIsEditOpen(false);
      showSuccess("Strategy updated successfully!");
    },
    onError: (error) => showError(error.message)
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => supabase.from('strategies').delete().eq('id', id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['strategies-calculated'] });
      showSuccess("Strategy deleted");
    }
  });

  const handleCreate = () => {
    if (!formData.name) return showError("Name is required");
    createMutation.mutate(formData);
  };

  const handleEditSubmit = () => {
    if (!selectedStrategy) return;
    updateStrategyMutation.mutate({ ...formData, id: selectedStrategy.id });
  };

  const openEdit = (strategy: Strategy) => {
    setSelectedStrategy(strategy);
    setFormData({
      name: strategy.name,
      description: strategy.description || "",
      capital_allocation: strategy.capital_allocation?.toString() || "0",
      benchmark_ticker: strategy.benchmark_ticker || "SPY"
    });
    setIsEditOpen(true);
  };

  const handleSyncBenchmarks = async () => {
    if (!strategies || strategies.length === 0) {
      showError("No strategies to sync.");
      return;
    }

    setIsSyncing(true);
    try {
      // Find the global earliest date needed
      const validDates = strategies
        .map(s => s.first_trade_date ? new Date(s.first_trade_date).getTime() : NaN)
        .filter(d => !isNaN(d));

      if (validDates.length === 0) {
        showSuccess("No trades found to benchmark against.");
        setIsSyncing(false);
        return;
      }

      const minDateMs = Math.min(...validDates);
      // Go back a few days just in case to capture market opens
      const startDate = new Date(minDateMs - 86400000 * 3).toISOString().split('T')[0];
      
      const tickers = Array.from(new Set(strategies.map(s => s.benchmark_ticker || 'SPY')));

      const { data, error } = await supabase.functions.invoke('fetch-benchmarks', {
        body: { tickers, startDate }
      });

      if (error) throw error;

      showSuccess(data?.message || "Benchmarks synced successfully");
      queryClient.invalidateQueries({ queryKey: ['strategies-calculated'] });
    } catch (error: any) {
      console.error("Sync error:", error);
      showError(error.message || "Failed to sync benchmarks");
    } finally {
      setIsSyncing(false);
    }
  };

  const formatCurrency = (val: number) => new Intl.NumberFormat('en-US', { 
    style: 'currency', 
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(val);

  const StrategyCard = ({ strategy, viewMode }: { strategy: Strategy, viewMode: 'grid' | 'list' }) => {
    const isTotalPositive = strategy.total_pnl >= 0;
    const roi = strategy.capital_allocation > 0 
      ? (strategy.total_pnl / strategy.capital_allocation) * 100 
      : 0;
    
    const benchmarkRoi = strategy.benchmark_performance || 0;

    // Actions dropdown menu reused in both views
    const ActionsMenu = () => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <span className="sr-only">Open menu</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => openEdit(strategy)}>
            <Pencil className="mr-2 h-4 w-4" /> Edit Details
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {strategy.status === 'active' ? (
            <DropdownMenuItem onClick={() => updateStatusMutation.mutate({ id: strategy.id, status: 'closed' })}>
              <Archive className="mr-2 h-4 w-4" /> Close Strategy
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => updateStatusMutation.mutate({ id: strategy.id, status: 'active' })}>
              <RefreshCw className="mr-2 h-4 w-4" /> Re-open Strategy
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => { 
            if(confirm('Delete this strategy? This action cannot be undone.')) deleteMutation.mutate(strategy.id) 
          }}>
            <Trash2 className="mr-2 h-4 w-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );

    if (viewMode === 'list') {
      return (
        <Card 
          className="group flex flex-col sm:flex-row sm:items-center justify-between p-3 gap-4 border-l-4 transition-all hover:shadow-md" 
          style={{ borderLeftColor: isTotalPositive ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)' }}
        >
          {/* Info Section - Fixed width to allow tags to flow */}
          <div className="w-full sm:w-[250px] shrink-0">
             <div className="flex items-center gap-2">
                <span className="font-semibold text-base truncate" title={strategy.name}>{strategy.name}</span>
                {strategy.status === 'closed' && <Badge variant="secondary" className="text-[10px] h-4 px-1">Closed</Badge>}
             </div>
             <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{strategy.description || "No description"}</p>
          </div>

          {/* Tags Section - Flex grow to fill space */}
          <div className="flex-1 flex items-center gap-2 overflow-x-auto min-w-0 px-2 scrollbar-thin scrollbar-thumb-muted-foreground/20">
            {strategy.dashboard_tags?.map((tag: any) => (
              <div key={tag.tag_id} className="flex items-center gap-1.5 px-2 py-0.5 bg-muted/40 rounded border text-xs whitespace-nowrap shrink-0">
                 <span className="text-muted-foreground">{tag.tag_name}</span>
                 <span className={`font-mono font-medium ${tag.total_pnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {formatCurrency(tag.total_pnl)}
                 </span>
              </div>
            ))}
          </div>

          {/* Metrics Section - Horizontal Layout */}
          <div className="flex items-center gap-4 shrink-0 border-t pt-2 sm:border-t-0 sm:pt-0 sm:border-l sm:pl-4 bg-card z-10">
             <div className="text-right">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground block">Net Liq</span>
                <span className={`font-bold text-sm ${isTotalPositive ? 'text-green-500' : 'text-red-500'}`}>
                  {formatCurrency(strategy.total_pnl)}
                </span>
             </div>
             
             <div className="text-right min-w-[50px]">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground block">ROI</span>
                <span className={`font-medium text-sm ${roi >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                   {strategy.capital_allocation > 0 ? `${roi > 0 ? '+' : ''}${roi.toFixed(1)}%` : '-'}
                </span>
             </div>

             <div className="text-right min-w-[60px] hidden md:block">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground block">{strategy.benchmark_ticker}</span>
                <span className={`font-medium text-sm ${benchmarkRoi >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                   {benchmarkRoi > 0 ? '+' : ''}{benchmarkRoi.toFixed(1)}%
                </span>
             </div>

             <div className="text-right min-w-[40px] hidden lg:block">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground block">Days</span>
                <span className="font-medium text-sm">{strategy.days_in_trade}</span>
             </div>
          </div>

          {/* Actions Section */}
          <div className="flex items-center gap-1 sm:border-l sm:pl-2 justify-end">
             <Button asChild size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                <Link to={`/strategies/${strategy.id}`}><Eye className="h-4 w-4" /></Link>
             </Button>
             <ActionsMenu />
          </div>
        </Card>
      );
    }

    return (
      <Card className="flex flex-col h-full hover:shadow-lg transition-all duration-200 border-l-4" style={{
        borderLeftColor: isTotalPositive ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)'
      }}>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-start">
            <div className="space-y-1 flex-1">
              <CardTitle className="text-xl flex items-center gap-2">
                {strategy.name}
                {strategy.status === 'closed' && <Badge variant="secondary" className="text-xs">Closed</Badge>}
              </CardTitle>
              <CardDescription className="line-clamp-2 text-sm">
                {strategy.description || "No description provided"}
              </CardDescription>
            </div>
            <ActionsMenu />
          </div>
        </CardHeader>
        
        <CardContent className="flex-1 pb-4 space-y-4">
          <div className="bg-gradient-to-br from-muted/50 to-muted/20 rounded-lg p-4">
            <div className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
              <DollarSign className="h-4 w-4" />
              Total P&L (Net Liquidation)
            </div>
            <div className="flex items-baseline gap-3">
              <span className={`text-4xl font-bold ${isTotalPositive ? 'text-green-500' : 'text-red-500'}`}>
                {formatCurrency(strategy.total_pnl)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-muted/30 p-3 rounded-md">
              <span className="text-muted-foreground block text-sm mb-1 flex items-center gap-1">
                <Percent className="h-4 w-4" />
                ROI
              </span>
              <span className={`text-lg font-bold ${roi >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {strategy.capital_allocation > 0 ? `${roi > 0 ? '+' : ''}${roi.toFixed(2)}%` : 'N/A'}
              </span>
            </div>
             <div className="bg-muted/30 p-3 rounded-md">
              <span className="text-muted-foreground block text-sm mb-1 flex items-center gap-1">
                <BarChart3 className="h-4 w-4" />
                {strategy.benchmark_ticker}
              </span>
              <span className={`text-lg font-bold ${benchmarkRoi >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                   {benchmarkRoi > 0 ? '+' : ''}{benchmarkRoi.toFixed(2)}%
              </span>
            </div>
            <div className="bg-muted/30 p-3 rounded-md">
              <span className="text-muted-foreground block text-sm mb-1 flex items-center gap-1">
                <Clock className="h-4 w-4" />
                Duration
              </span>
              <span className="text-lg font-bold">{strategy.days_in_trade} days</span>
            </div>
          </div>

          {strategy.dashboard_tags && strategy.dashboard_tags.length > 0 && (
            <div className="bg-muted/30 rounded-lg p-3 space-y-2">
              <div className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                <Target className="h-4 w-4" /> Tag Breakdown
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {strategy.dashboard_tags.map((tag: any) => (
                  <div key={tag.tag_id} className="bg-background/80 p-3 rounded border shadow-sm flex justify-between items-center">
                    <div className="text-sm text-muted-foreground font-medium truncate" title={tag.tag_name}>
                      {tag.tag_name}
                    </div>
                    <div className={`text-base font-bold font-mono ${tag.total_pnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {formatCurrency(tag.total_pnl)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
        
        <CardFooter className="pt-0">
          <Button asChild variant="outline" className="w-full">
            <Link to={`/strategies/${strategy.id}`}>
              <Eye className="mr-2 h-4 w-4" /> View Details
            </Link>
          </Button>
        </CardFooter>
      </Card>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-8 pb-10">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Strategies</h2>
            <p className="text-muted-foreground">Manage your trading campaigns and track performance.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
             <div className="flex items-center border rounded-md bg-background p-0.5 shadow-sm mr-2">
                <Button
                  variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                  size="icon"
                  className="h-8 w-8 rounded-sm"
                  onClick={() => setViewMode('grid')}
                  title="Grid View"
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                  size="icon"
                  className="h-8 w-8 rounded-sm"
                  onClick={() => setViewMode('list')}
                   title="List View"
                >
                  <List className="h-4 w-4" />
                </Button>
             </div>

             <Button variant="outline" onClick={handleSyncBenchmarks} disabled={isSyncing}>
                <RotateCw className={`mr-2 h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
                {isSyncing ? "Syncing..." : "Sync Benchmarks"}
              </Button>
            <Button onClick={() => { setFormData({ name: "", description: "", capital_allocation: "0", benchmark_ticker: "SPY" }); setIsCreateOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" /> New Strategy
            </Button>
          </div>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Strategy</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="name">Strategy Name *</Label>
                <Input id="name" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} placeholder="e.g., TSLA Wheel Strategy" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-2">
                  <Label htmlFor="cap">Allocated Capital ($)</Label>
                  <Input id="cap" type="number" value={formData.capital_allocation} onChange={(e) => setFormData({...formData, capital_allocation: e.target.value})} placeholder="10000" />
                </div>
                 <div className="space-y-2">
                  <Label htmlFor="benchmark">Benchmark Ticker</Label>
                  <Input id="benchmark" value={formData.benchmark_ticker} onChange={(e) => setFormData({...formData, benchmark_ticker: e.target.value.toUpperCase()})} placeholder="SPY" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="desc">Description</Label>
                <Textarea id="desc" value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} placeholder="Describe your strategy..." />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating..." : "Create Strategy"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Strategy</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Strategy Name</Label>
                <Input id="edit-name" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} />
              </div>
               <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-cap">Allocated Capital ($)</Label>
                  <Input id="edit-cap" type="number" value={formData.capital_allocation} onChange={(e) => setFormData({...formData, capital_allocation: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-benchmark">Benchmark Ticker</Label>
                  <Input id="edit-benchmark" value={formData.benchmark_ticker} onChange={(e) => setFormData({...formData, benchmark_ticker: e.target.value.toUpperCase()})} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-desc">Description</Label>
                <Textarea id="edit-desc" value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
              <Button onClick={handleEditSubmit} disabled={updateStrategyMutation.isPending}>
                {updateStrategyMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {strategiesError && (
          <div className="p-4 border border-destructive/50 rounded-lg bg-destructive/10 text-destructive flex items-center gap-3">
             <AlertCircle className="h-5 w-5" />
             <div>
               <h3 className="font-semibold">Error Loading Strategies</h3>
               <p className="text-sm">Please refresh the page. If this persists, there may be a database connection issue.</p>
             </div>
          </div>
        )}

        {strategiesLoading ? (
          <div className="text-center py-12">
            <div className="inline-flex items-center gap-2">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <span className="text-muted-foreground">Loading strategies...</span>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                <h3 className="text-xl font-semibold">Active Strategies</h3>
                <Badge variant="outline" className="ml-2">{activeStrategies.length}</Badge>
              </div>
              
              {activeStrategies.length === 0 ? (
                <div className="text-center py-16 border border-dashed rounded-lg bg-muted/5">
                  <div className="max-w-md mx-auto space-y-3">
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                      <TrendingUp className="h-8 w-8 text-primary" />
                    </div>
                    <h3 className="text-lg font-semibold">No Active Strategies</h3>
                    <p className="text-muted-foreground text-sm">Create your first strategy to start tracking your trading performance.</p>
                    <Button onClick={() => setIsCreateOpen(true)} className="mt-4">
                      <Plus className="mr-2 h-4 w-4" /> Create Strategy
                    </Button>
                  </div>
                </div>
              ) : (
                <div className={viewMode === 'grid' ? "grid gap-6 md:grid-cols-2 lg:grid-cols-3" : "grid gap-4 grid-cols-1"}>
                  {activeStrategies.map(strategy => (
                    <StrategyCard key={strategy.id} strategy={strategy} viewMode={viewMode} />
                  ))}
                </div>
              )}
            </div>

            {closedStrategies.length > 0 && (
              <>
                <Separator />
                <div className="space-y-4 opacity-80 hover:opacity-100 transition-opacity">
                  <div className="flex items-center gap-2">
                    <Archive className="h-5 w-5 text-muted-foreground" />
                    <h3 className="text-xl font-semibold text-muted-foreground">Closed Strategies</h3>
                    <Badge variant="outline" className="ml-2">{closedStrategies.length}</Badge>
                  </div>
                  
                  <div className={viewMode === 'grid' ? "grid gap-6 md:grid-cols-2 lg:grid-cols-3" : "grid gap-4 grid-cols-1"}>
                    {closedStrategies.map(strategy => (
                      <StrategyCard key={strategy.id} strategy={strategy} viewMode={viewMode} />
                    ))}
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
} 

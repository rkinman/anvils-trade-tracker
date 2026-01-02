import { useState, useMemo, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { showSuccess, showError } from "@/utils/toast";
import { Loader2, Save, Plus, ArrowLeft, Search, Tag, Trash2, ChevronDown, ChevronRight, Calculator, Link as LinkIcon, ArrowUp, ArrowDown, ArrowUpDown, BarChart3, X, Pencil, Gauge, Settings, Calendar, DollarSign, Percent, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { FloatingActionBar } from "@/components/FloatingActionBar";

interface Trade {
  id: string;
  date: string;
  symbol: string;
  action: string;
  amount: number;
  tag_id: string | null;
  mark_price: number | null;
  quantity: number;
  multiplier: number;
  price: number;
  fees: number;
  pair_id: string | null;
  unrealized_pnl: number | null;
  hidden: boolean;
  tags?: { id: string; name: string } | null;
}

interface Tag {
  id: string;
  name: string;
  show_on_dashboard: boolean;
}

interface TradeGroup {
  id: string;
  isPair: boolean;
  trades: Trade[];
  summary: {
    date: string;
    symbol: string;
    totalAmount: number;
    totalMarketValue: number;
    totalPnl: number;
    isOpen: boolean;
  };
}

// Define sorting types
type SortKey = 'date' | 'symbol' | 'action' | 'quantity' | 'price' | 'amount' | 'tag_name' | 'pair_id';
type SortDirection = 'asc' | 'desc';

// Component for sortable header
interface SortableTableHeadProps {
  children: React.ReactNode;
  sortKey: SortKey;
  currentSortKey: SortKey;
  currentSortDirection: SortDirection;
  onSort: (key: SortKey) => void;
  className?: string;
}

const SortableTableHead: React.FC<SortableTableHeadProps> = ({
  children,
  sortKey,
  currentSortKey,
  currentSortDirection: currentSortDirection,
  onSort,
  className
}) => {
  const isCurrent = currentSortKey === sortKey;
  const Icon = isCurrent
    ? currentSortDirection === 'asc'
      ? ArrowUp
      : ArrowDown
    : ArrowUpDown;

  return (
    <TableHead
      className={`cursor-pointer hover:bg-muted/50 transition-colors ${className}`}
      onClick={() => onSort(sortKey)}
    >
      <div className="flex items-center gap-1">
        {children}
        <Icon className={`h-3 w-3 ${isCurrent ? 'opacity-100' : 'opacity-50'}`} />
      </div>
    </TableHead>
  );
};

export default function StrategyDetail() {
  const { strategyId } = useParams<{ strategyId: string }>();
  const queryClient = useQueryClient();
  const [isAddTradesOpen, setIsAddTradesOpen] = useState(false);
  const [isEditStrategyOpen, setIsEditStrategyOpen] = useState(false);
  const [selectedUnassigned, setSelectedUnassigned] = useState<string[]>([]);
  const [selectedTradesForTagging, setSelectedTradesForTagging] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [newTagName, setNewTagName] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  
  // Edit Trade State
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);
  const [editForm, setEditForm] = useState({ quantity: 0, multiplier: 0, amount: 0, price: 0 });

  // --- QUERIES ---
  const { data: strategy, isLoading: strategyLoading } = useQuery({
    queryKey: ['strategy', strategyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('strategies').select('*').eq('id', strategyId!).single();
      if (error) throw error;
      return data;
    }
  });

  const [formState, setFormState] = useState({ name: '', description: '', capital_allocation: '0', status: 'active', benchmark_ticker: 'SPY' });
  
  useEffect(() => {
    if (strategy) {
      setFormState({ 
        name: strategy.name, 
        description: strategy.description || '',
        capital_allocation: strategy.capital_allocation || '0',
        status: strategy.status || 'active',
        benchmark_ticker: strategy.benchmark_ticker || 'SPY'
      });
    }
  }, [strategy]);

  const { data: benchmarkData } = useQuery({
    queryKey: ['benchmark', strategy?.benchmark_ticker],
    queryFn: async () => {
        if (!strategy?.benchmark_ticker) return null;
        const { data } = await supabase.from('benchmark_prices').select('*').eq('ticker', strategy.benchmark_ticker).order('date', { ascending: true });
        return data;
    },
    enabled: !!strategy?.benchmark_ticker
  });

  const { data: tags, isLoading: tagsLoading } = useQuery<Tag[]>({
    queryKey: ['tags', strategyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('tags').select('*').eq('strategy_id', strategyId!);
      if (error) throw error;
      return data;
    }
  });

  const { data: assignedTrades, isLoading: assignedTradesLoading } = useQuery<Trade[]>({
    queryKey: ['assignedTrades', strategyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('trades')
        .select(`
          *,
          tags (
            id,
            name
          )
        `)
        .eq('strategy_id', strategyId!)
        .eq('hidden', false)
        .order('date', { ascending: false });
      if (error) throw error;
      return data as Trade[];
    }
  });

  const { data: unassignedTrades } = useQuery<Trade[]>({
    queryKey: ['unassignedTrades'],
    queryFn: async () => {
      const { data, error } = await supabase.from('trades').select('*').is('strategy_id', null).eq('hidden', false).order('date', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: isAddTradesOpen,
  });

  // --- METRICS CALCULATION ---
  const metrics = useMemo(() => {
    if (!assignedTrades || !strategy) return null;

    let total_pnl = 0;
    let realized_pnl = 0;
    let unrealized_pnl = 0;
    let win_count = 0;
    let loss_count = 0;
    let open_count = 0;
    let days_in_trade = 0;
    let first_trade_date: string | null = null;
    let last_trade_date: string | null = null;

    const dates = assignedTrades.map(t => new Date(t.date).getTime()).filter(d => !isNaN(d));

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

    assignedTrades.forEach(trade => {
        let amount = Number(trade.amount) || 0;
        const actionStr = trade.action ? trade.action.toUpperCase() : '';
        const isBuy = actionStr.includes('BUY') || actionStr.includes('LONG');
        const isShort = actionStr.includes('SELL') || actionStr.includes('SHORT');
        
        if (isBuy && amount > 0) amount = -amount;

        if (trade.mark_price !== null && trade.mark_price !== undefined) {
            open_count++;
            const mark = Math.abs(Number(trade.mark_price));
            const qty = Number(trade.quantity) || 0;
            const mult = Number(trade.multiplier) || 1; 
            const sign = isShort ? -1 : 1;
            const marketValue = mark * qty * mult * sign;
            const pnl = marketValue + amount;
            unrealized_pnl += pnl;
        } else {
            const pnl = amount;
            realized_pnl += pnl;
            
            // Loose approximation for win rate based on realized legs. 
            // Ideally we'd group by trade chain.
            if (pnl > 0) win_count++;
            if (pnl < 0) loss_count++;
        }
    });
    
    total_pnl = realized_pnl + unrealized_pnl;

    // Benchmark Calculation
    let benchmarkPerformance = 0;
    if (first_trade_date && benchmarkData && benchmarkData.length > 0) {
      const stratPrices = benchmarkData;
      
      // Find start price
      const startPriceObj = stratPrices.find((p: any) => p.date >= first_trade_date!);
      
      // Find end price
      const endDateToCheck = strategy.status === 'closed' && last_trade_date 
        ? last_trade_date 
        : new Date().toISOString().split('T')[0];
      
      // Reverse find for end price (most recent before or on end date)
      const endPriceObj = [...stratPrices].reverse().find((p: any) => p.date <= endDateToCheck);

      if (startPriceObj && endPriceObj && Number(startPriceObj.price) > 0) {
          const startP = Number(startPriceObj.price);
          const endP = Number(endPriceObj.price);
          benchmarkPerformance = ((endP - startP) / startP) * 100;
      }
    }

    const capital = Number(strategy.capital_allocation) || 0;
    const roi = capital > 0 ? (total_pnl / capital) * 100 : 0;
    const total_closed = win_count + loss_count;
    const win_rate = total_closed > 0 ? (win_count / total_closed) * 100 : 0;

    return {
        total_pnl,
        realized_pnl,
        unrealized_pnl,
        days_in_trade,
        open_count,
        capital,
        roi,
        win_rate,
        benchmarkPerformance,
        benchmarkTicker: strategy.benchmark_ticker
    };
  }, [assignedTrades, strategy, benchmarkData]);

  // --- MUTATIONS ---
  const updateStrategyMutation = useMutation({
    mutationFn: (details: any) => supabase.from('strategies').update(details).eq('id', strategyId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['strategy', strategyId] });
      queryClient.invalidateQueries({ queryKey: ['strategies'] });
      queryClient.invalidateQueries({ queryKey: ['strategies-calculated'] });
      showSuccess("Strategy updated");
    },
    onError: (err) => showError(err.message)
  });

  const createTagMutation = useMutation({
    mutationFn: async (name: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      return supabase.from('tags').insert({ name, strategy_id: strategyId, user_id: user.id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags', strategyId] });
      setNewTagName("");
      showSuccess("Tag created");
    },
    onError: (err) => showError(err.message)
  });

  const updateTagMutation = useMutation({
    mutationFn: ({ tagId, show_on_dashboard }: { tagId: string, show_on_dashboard: boolean }) => supabase.from('tags').update({ show_on_dashboard }).eq('id', tagId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags', strategyId] });
      queryClient.invalidateQueries({ queryKey: ['dashboardTags'] });
      queryClient.invalidateQueries({ queryKey: ['strategies-calculated'] });
    },
    onError: (err) => showError(err.message)
  });
  
  const deleteTagMutation = useMutation({
    mutationFn: (tagId: string) => supabase.from('tags').delete().eq('id', tagId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags', strategyId] });
      queryClient.invalidateQueries({ queryKey: ['assignedTrades', strategyId] });
      queryClient.invalidateQueries({ queryKey: ['dashboardTags'] });
      queryClient.invalidateQueries({ queryKey: ['strategies-calculated'] });
      showSuccess("Tag deleted");
    },
    onError: (err) => showError(err.message)
  });

  const assignTradesMutation = useMutation({
    mutationFn: (tradeIds: string[]) => supabase.from('trades').update({ strategy_id: strategyId }).in('id', tradeIds),
    onSuccess: (_, tradeIds) => {
      queryClient.invalidateQueries({ queryKey: ['assignedTrades', strategyId] });
      queryClient.invalidateQueries({ queryKey: ['unassignedTrades'] });
      queryClient.invalidateQueries({ queryKey: ['strategies'] });
      queryClient.invalidateQueries({ queryKey: ['strategies-calculated'] });
      showSuccess(`Assigned ${tradeIds.length} trades`);
      setSelectedUnassigned([]);
      setIsAddTradesOpen(false);
    },
    onError: (err) => showError(err.message)
  });

  const updateTradeTagMutation = useMutation({
    mutationFn: async ({ tradeId, tagId }: { tradeId: string, tagId: string | null }) => {
      const { error } = await supabase.from('trades').update({ tag_id: tagId }).eq('id', tradeId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignedTrades', strategyId] });
      queryClient.invalidateQueries({ queryKey: ['strategies'] });
      queryClient.invalidateQueries({ queryKey: ['strategies-calculated'] });
      showSuccess("Trade tag updated");
    },
    onError: (err) => showError(err.message)
  });

  const bulkUpdateTagMutation = useMutation({
    mutationFn: async ({ tradeIds, tagId }: { tradeIds: string[], tagId: string | null }) => {
      const { error } = await supabase.from('trades').update({ tag_id: tagId }).in('id', tradeIds);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignedTrades', strategyId] });
      queryClient.invalidateQueries({ queryKey: ['strategies'] });
      queryClient.invalidateQueries({ queryKey: ['strategies-calculated'] });
      showSuccess(`Updated tags for ${selectedTradesForTagging.length} trades`);
      setSelectedTradesForTagging([]);
    },
    onError: (err) => showError(err.message)
  });

  const updateTradeDetailsMutation = useMutation({
    mutationFn: async (data: { id: string, quantity: number, multiplier: number, amount: number, price: number }) => {
       const { error } = await supabase.from('trades').update({
         quantity: data.quantity,
         multiplier: data.multiplier,
         amount: data.amount,
         price: data.price
       }).eq('id', data.id);
       if(error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignedTrades', strategyId] });
      queryClient.invalidateQueries({ queryKey: ['strategies-calculated'] });
      setEditingTrade(null);
      showSuccess("Trade details updated");
    },
    onError: (err) => showError(err.message)
  });

  const bulkUpdateMultiplierMutation = useMutation({
    mutationFn: async (multiplier: number) => {
      const { error } = await supabase
        .from('trades')
        .update({ multiplier })
        .eq('strategy_id', strategyId);
      if (error) throw error;
    },
    onSuccess: (_, multiplier) => {
      queryClient.invalidateQueries({ queryKey: ['assignedTrades', strategyId] });
      queryClient.invalidateQueries({ queryKey: ['strategies-calculated'] });
      showSuccess(`All trade multipliers set to ${multiplier}`);
    },
    onError: (err) => showError(err.message)
  });

  // --- HANDLERS ---
  const handleSave = () => {
    updateStrategyMutation.mutate(formState);
    setIsEditStrategyOpen(false);
  };
  
  const handleAddSelected = () => assignTradesMutation.mutate(selectedUnassigned);
  const handleCreateTag = () => {
    if (newTagName.trim()) createTagMutation.mutate(newTagName.trim());
  };

  const handleTradeTagChange = (tradeId: string, tagId: string) => {
    updateTradeTagMutation.mutate({ tradeId, tagId: tagId === "none" ? null : tagId });
  };

  const handleSelectTradeGroup = (tradeIds: string[], checked: boolean) => {
    setSelectedTradesForTagging(prev => {
      const currentSet = new Set(prev);
      if (checked) {
        tradeIds.forEach(id => currentSet.add(id));
      } else {
        tradeIds.forEach(id => currentSet.delete(id));
      }
      return Array.from(currentSet);
    });
  };

  const handleBulkTagChange = (tagId: string) => {
    bulkUpdateTagMutation.mutate({ 
      tradeIds: selectedTradesForTagging, 
      tagId: tagId === "none" ? null : tagId 
    });
  };

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('desc');
    }
  };

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const handleEditTrade = (trade: Trade) => {
    setEditingTrade(trade);
    setEditForm({
      quantity: trade.quantity,
      multiplier: trade.multiplier,
      amount: Number(trade.amount),
      price: trade.price
    });
  };

  const handleSaveTradeEdit = () => {
    if (!editingTrade) return;
    updateTradeDetailsMutation.mutate({
      id: editingTrade.id,
      ...editForm
    });
  };

  const isFutures = useMemo(() => {
    if (!assignedTrades || assignedTrades.length === 0) return false;
    return assignedTrades.every(t => t.multiplier === 50);
  }, [assignedTrades]);

  const handleFuturesToggle = (checked: boolean) => {
    if (checked) {
      if (confirm("This will update ALL trades in this strategy to have a multiplier of 50. This is typically used for Futures contracts (e.g., /ES). Continue?")) {
        bulkUpdateMultiplierMutation.mutate(50);
      }
    } else {
      if (confirm("This will revert ALL trades in this strategy to a multiplier of 100 (Standard Options). Continue?")) {
        bulkUpdateMultiplierMutation.mutate(100);
      }
    }
  };

  const filteredUnassignedTrades = useMemo(() => unassignedTrades?.filter(t => t.symbol.toLowerCase().includes(searchTerm.toLowerCase())), [unassignedTrades, searchTerm]);

  // --- DATA PROCESSING (Grouping by Tags) ---
  const groupedTradesByTag = useMemo(() => {
    if (!assignedTrades) return {};

    const sortedTrades = [...assignedTrades].sort((a, b) => {
      let aValue: any = a[sortKey as keyof Trade];
      let bValue: any = b[sortKey as keyof Trade];

      if (sortKey === 'date') {
        aValue = new Date(a.date).getTime();
        bValue = new Date(b.date).getTime();
      } else if (sortKey === 'tag_name') {
        aValue = a.tags?.name || '';
        bValue = b.tags?.name || '';
      }
      
      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    const groups: Record<string, { name: string; trades: TradeGroup[]; totalPnl: number }> = {};

    sortedTrades.forEach(trade => {
      const tagId = trade.tag_id || 'untagged';
      const tagName = trade.tags?.name || 'Untagged Trades';

      if (!groups[tagId]) {
        groups[tagId] = { name: tagName, trades: [], totalPnl: 0 };
      }

      const groupId = trade.pair_id || trade.id;
      const isPair = !!trade.pair_id;

      let existingGroup = groups[tagId].trades.find(g => g.id === groupId);
      if (!existingGroup) {
        existingGroup = {
          id: groupId,
          isPair,
          trades: [],
          summary: {
            date: trade.date,
            symbol: trade.symbol,
            totalAmount: 0,
            totalMarketValue: 0,
            totalPnl: 0,
            isOpen: false
          }
        };
        groups[tagId].trades.push(existingGroup);
      }

      existingGroup.trades.push(trade);
    });

    Object.values(groups).forEach(tagGroup => {
      let tagTotalPnl = 0;

      tagGroup.trades.forEach(group => {
        let totalAmount = 0;
        let totalMarketValue = 0;
        let totalPnl = 0;
        let isOpen = false;
        let symbols = new Set<string>();

        group.trades.forEach(trade => {
          symbols.add(trade.symbol);
          
          const actionUpper = trade.action.toUpperCase();
          const isSell = actionUpper.includes('SELL') || actionUpper.includes('SHORT');
          const isBuy = actionUpper.includes('BUY') || actionUpper.includes('LONG');
          
          let amount = Number(trade.amount);
          
          if (isBuy && amount > 0) {
            amount = -amount;
          }
          
          totalAmount += amount;

          if (trade.mark_price !== null) {
            isOpen = true;
            const cleanMarkPrice = Math.abs(trade.mark_price || 0);
            const sign = isSell ? -1 : 1;
            const mv = cleanMarkPrice * trade.quantity * trade.multiplier * sign;
            totalMarketValue += mv;
            totalPnl += (mv + amount);
          } else {
            totalPnl += amount;
          }
          
          trade.amount = amount;
        });

        const symbolList = Array.from(symbols);
        const displaySymbol = symbolList.length === 1 
          ? symbolList[0] 
          : group.isPair 
            ? `${symbolList[0]} + ${symbolList.length - 1} legs` 
            : symbolList[0];

        group.trades.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const displayDate = group.trades[0]?.date;

        group.summary = {
          date: displayDate,
          symbol: displaySymbol,
          totalAmount,
          totalMarketValue,
          totalPnl,
          isOpen
        };

        tagTotalPnl += totalPnl;
      });

      tagGroup.totalPnl = tagTotalPnl;
      tagGroup.trades.sort((a, b) => new Date(b.summary.date).getTime() - new Date(a.summary.date).getTime());
    });

    return groups;
  }, [assignedTrades, sortKey, sortDirection]);

  const formatCurrency = (val: number) => new Intl.NumberFormat('en-US', { 
    style: 'currency', 
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(val);

  if (strategyLoading) return <DashboardLayout><Loader2 className="h-8 w-8 animate-spin mx-auto mt-10" /></DashboardLayout>;

  return (
    <DashboardLayout>
      {/* Edit Trade Data Modal */}
      <Dialog open={!!editingTrade} onOpenChange={(open) => !open && setEditingTrade(null)}>
        <DialogContent>
           <DialogHeader>
             <DialogTitle>Edit Trade Details</DialogTitle>
             <DialogDescription>Correct any data import errors here.</DialogDescription>
           </DialogHeader>
           <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                   <Label htmlFor="quantity">Quantity</Label>
                   <Input id="quantity" type="number" value={editForm.quantity} onChange={(e) => setEditForm({...editForm, quantity: Number(e.target.value)})} />
                </div>
                 <div className="space-y-2">
                   <Label htmlFor="multiplier">Multiplier</Label>
                   <Input id="multiplier" type="number" value={editForm.multiplier} onChange={(e) => setEditForm({...editForm, multiplier: Number(e.target.value)})} />
                </div>
              </div>
              <div className="space-y-2">
                 <Label htmlFor="price">Entry Price (per unit)</Label>
                 <Input id="price" type="number" value={editForm.price} onChange={(e) => setEditForm({...editForm, price: Number(e.target.value)})} />
              </div>
              <div className="space-y-2">
                 <Label htmlFor="amount">Net Cash Amount ($)</Label>
                 <Input id="amount" type="number" value={editForm.amount} onChange={(e) => setEditForm({...editForm, amount: Number(e.target.value)})} />
                 <p className="text-xs text-muted-foreground">Positive for Credit (Sell), Negative for Debit (Buy).</p>
              </div>
           </div>
           <DialogFooter>
             <Button variant="outline" onClick={() => setEditingTrade(null)}>Cancel</Button>
             <Button onClick={handleSaveTradeEdit} disabled={updateTradeDetailsMutation.isPending}>Save Changes</Button>
           </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Strategy Settings Modal */}
      <Dialog open={isEditStrategyOpen} onOpenChange={setIsEditStrategyOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Strategy Settings</DialogTitle>
            <DialogDescription>Update strategy details, configuration, and tags.</DialogDescription>
          </DialogHeader>
          
          <Tabs defaultValue="general" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="tags">Tags & KPIs</TabsTrigger>
            </TabsList>
            
            <TabsContent value="general" className="space-y-4 py-4">
               <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Strategy Name</Label>
                    <Input id="name" value={formState.name} onChange={(e) => setFormState({ ...formState, name: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="status">Status</Label>
                    <div className="flex items-center space-x-2 h-10">
                      <Switch 
                        id="status" 
                        checked={formState.status === 'active'} 
                        onCheckedChange={(checked) => setFormState({ ...formState, status: checked ? 'active' : 'closed' })} 
                      />
                      <span className="text-sm text-muted-foreground">{formState.status === 'active' ? 'Active' : 'Closed'}</span>
                    </div>
                  </div>
               </div>
               
               <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="cap">Allocated Capital</Label>
                    <div className="relative">
                      <Calculator className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input id="cap" type="number" className="pl-9" value={formState.capital_allocation} onChange={(e) => setFormState({ ...formState, capital_allocation: e.target.value })} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="benchmark">Benchmark Ticker</Label>
                     <div className="relative">
                      <BarChart3 className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input id="benchmark" className="pl-9" value={formState.benchmark_ticker} onChange={(e) => setFormState({ ...formState, benchmark_ticker: e.target.value.toUpperCase() })} />
                     </div>
                  </div>
               </div>

               <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea id="description" value={formState.description} onChange={(e) => setFormState({ ...formState, description: e.target.value })} />
               </div>

                <div className="pt-2 border-t mt-4">
                  <Label className="mb-2 block">Advanced</Label>
                  <div className="flex items-center space-x-2">
                    <Switch 
                      id="futures-mode" 
                      checked={isFutures} 
                      onCheckedChange={handleFuturesToggle}
                      disabled={bulkUpdateMultiplierMutation.isPending}
                    />
                    <div className="space-y-0.5">
                      <Label htmlFor="futures-mode" className="text-base cursor-pointer">Futures Strategy (50x)</Label>
                      <p className="text-xs text-muted-foreground">Force all trade multipliers to 50.</p>
                    </div>
                  </div>
                </div>
            </TabsContent>
            
            <TabsContent value="tags" className="space-y-4 py-4">
              <div className="flex gap-2 mb-4">
                <Input placeholder="New tag name..." value={newTagName} onChange={(e) => setNewTagName(e.target.value)} />
                <Button onClick={handleCreateTag} disabled={createTagMutation.isPending}><Plus className="h-4 w-4" /></Button>
              </div>
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 border rounded-md p-2">
                {tagsLoading && <Loader2 className="h-4 w-4 animate-spin mx-auto" />}
                {!tagsLoading && tags?.length === 0 && <p className="text-center text-muted-foreground text-sm">No tags created yet.</p>}
                {tags?.map(tag => (
                  <div key={tag.id} className="flex items-center justify-between p-2 rounded-md bg-muted/40 border">
                    <div className="flex items-center gap-2">
                      <Tag className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium text-sm">{tag.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col items-end gap-1">
                        <Switch 
                          checked={tag.show_on_dashboard} 
                          onCheckedChange={(checked) => updateTagMutation.mutate({ tagId: tag.id, show_on_dashboard: checked })} 
                          className="scale-75"
                        />
                        <span className="text-[10px] text-muted-foreground">{tag.show_on_dashboard ? "On Dashboard" : "Hidden"}</span>
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => deleteTagMutation.mutate(tag.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter>
             <Button variant="outline" onClick={() => setIsEditStrategyOpen(false)}>Cancel</Button>
             <Button onClick={handleSave} disabled={updateStrategyMutation.isPending}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="space-y-6 pb-20">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <Link to="/strategies" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-1">
              <ArrowLeft className="h-3 w-3" />Back to Strategies
            </Link>
            <div className="flex items-center gap-3">
               <h2 className="text-3xl font-bold tracking-tight">{strategy?.name}</h2>
               {strategy?.status === 'closed' && <Badge variant="secondary">Closed</Badge>}
            </div>
          </div>
          <div className="flex items-center gap-2">
             <Button variant="outline" onClick={() => setIsEditStrategyOpen(true)}>
                <Settings className="mr-2 h-4 w-4" /> Edit Strategy
             </Button>
             <Dialog open={isAddTradesOpen} onOpenChange={setIsAddTradesOpen}>
                <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> Add Trades</Button></DialogTrigger>
                <DialogContent className="max-w-3xl">
                   <DialogHeader>
                    <DialogTitle>Add Trades to Strategy</DialogTitle>
                    <DialogDescription>Select trades from your history to assign to this strategy.</DialogDescription>
                  </DialogHeader>
                  <div className="py-4">
                     <div className="flex items-center gap-2 mb-4">
                       <Search className="h-4 w-4 text-muted-foreground" />
                       <Input placeholder="Search symbol..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                     </div>
                     <div className="max-h-[400px] overflow-y-auto border rounded-md">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-10"><Checkbox 
                                checked={filteredUnassignedTrades?.length ? selectedUnassigned.length === filteredUnassignedTrades.length : false}
                                onCheckedChange={(checked) => setSelectedUnassigned(checked ? filteredUnassignedTrades?.map(t => t.id) || [] : [])}
                              /></TableHead>
                              <TableHead>Date</TableHead>
                              <TableHead>Symbol</TableHead>
                              <TableHead>Action</TableHead>
                              <TableHead className="text-right">Amount</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredUnassignedTrades?.map(trade => (
                              <TableRow key={trade.id}>
                                <TableCell><Checkbox checked={selectedUnassigned.includes(trade.id)} onCheckedChange={(checked) => setSelectedUnassigned(prev => checked ? [...prev, trade.id] : prev.filter(id => id !== trade.id))} /></TableCell>
                                <TableCell>{format(new Date(trade.date), 'MMM d')}</TableCell>
                                <TableCell>{trade.symbol}</TableCell>
                                <TableCell>{trade.action}</TableCell>
                                <TableCell className="text-right">${trade.amount}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                     </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsAddTradesOpen(false)}>Cancel</Button>
                    <Button onClick={handleAddSelected} disabled={selectedUnassigned.length === 0 || assignTradesMutation.isPending}>
                       {assignTradesMutation.isPending ? "Adding..." : `Add ${selectedUnassigned.length} Trades`}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
          </div>
        </div>
        
        {/* Performance Stats Banner */}
        {metrics && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total P&L</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className={cn("text-2xl font-bold", metrics.total_pnl >= 0 ? "text-green-500" : "text-red-500")}>
                   {formatCurrency(metrics.total_pnl)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                   {formatCurrency(metrics.realized_pnl)} realized
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">ROI</CardTitle>
                <Percent className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className={cn("text-2xl font-bold", metrics.roi >= 0 ? "text-green-500" : "text-red-500")}>
                   {metrics.roi > 0 ? '+' : ''}{metrics.roi.toFixed(1)}%
                </div>
                 <div className="flex items-center text-xs text-muted-foreground mt-1 gap-1">
                   <BarChart3 className="h-3 w-3" />
                   {metrics.benchmarkTicker || 'SPY'}: 
                   <span className={cn(metrics.benchmarkPerformance >= 0 ? "text-green-500" : "text-red-500", "ml-1")}>
                      {metrics.benchmarkPerformance > 0 ? '+' : ''}{metrics.benchmarkPerformance.toFixed(1)}%
                   </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Win Rate</CardTitle>
                <Gauge className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.win_rate.toFixed(0)}%</div>
                <p className="text-xs text-muted-foreground mt-1">
                  On realized legs
                </p>
              </CardContent>
            </Card>

             <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Activity</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.days_in_trade} Days</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {metrics.open_count} open positions
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* TRADES / POSITIONS TABLE */}
        <Card className="flex-1">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Trades & Positions</CardTitle>
              <CardDescription>
                Grouped by tags. Expand to see leg details and P&L.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {assignedTradesLoading ? <Loader2 className="h-6 w-6 animate-spin mx-auto mt-10" /> : (
              <div className="space-y-8">
                {Object.entries(groupedTradesByTag).map(([tagId, tagGroup]) => {
                  const allIdsInTagGroup = tagGroup.trades.flatMap(g => g.trades.map(t => t.id));
                  const allSelected = allIdsInTagGroup.length > 0 && allIdsInTagGroup.every(id => selectedTradesForTagging.includes(id));
                  const someSelected = allIdsInTagGroup.some(id => selectedTradesForTagging.includes(id));

                  return (
                  <div key={tagId}>
                    <div className="flex items-center justify-between mb-3 bg-muted/20 p-2 rounded-lg border-l-4 border-primary">
                      <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                        <Tag className="h-4 w-4" />
                        {tagGroup.name} 
                        <span className="text-muted-foreground text-sm font-normal ml-1">({tagGroup.trades.length} positions)</span>
                      </h3>
                      <div className={cn("text-lg font-bold font-mono", tagGroup.totalPnl >= 0 ? "text-green-600" : "text-red-600")}>
                        {formatCurrency(tagGroup.totalPnl)}
                      </div>
                    </div>
                    <div className="border rounded-md overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead className="w-[40px]">
                              <Checkbox 
                                checked={allSelected ? true : (someSelected ? 'indeterminate' : false)}
                                onCheckedChange={(checked) => handleSelectTradeGroup(allIdsInTagGroup, !!checked)}
                              />
                            </TableHead>
                            <TableHead className="w-[50px]"></TableHead>
                            <SortableTableHead sortKey="date" {...{currentSortKey: sortKey, currentSortDirection: sortDirection, onSort: handleSort}}>Date</SortableTableHead>
                            <SortableTableHead sortKey="symbol" {...{currentSortKey: sortKey, currentSortDirection: sortDirection, onSort: handleSort}}>Structure / Symbol</SortableTableHead>
                            <TableHead>Status</TableHead>
                            <SortableTableHead sortKey="amount" {...{currentSortKey: sortKey, currentSortDirection: sortDirection, onSort: handleSort}} className="text-right">Net Cash Flow</SortableTableHead>
                            <TableHead className="text-right">Current Value</TableHead>
                            <TableHead className="text-right">Net P&L</TableHead>
                            <TableHead>Tag</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {tagGroup.trades.map(group => {
                            const isExpanded = expandedGroups.has(group.id);
                            const groupTradeIds = group.trades.map(t => t.id);
                            const isGroupSelected = groupTradeIds.every(id => selectedTradesForTagging.includes(id));
                            const isGroupPartiallySelected = !isGroupSelected && groupTradeIds.some(id => selectedTradesForTagging.includes(id));
                            
                            const rows = [];
                            
                            rows.push(
                              <TableRow 
                                key={group.id}
                                className={cn(
                                  "cursor-pointer hover:bg-muted/30 transition-colors", 
                                  isExpanded && "bg-muted/20 border-b-0"
                                )}
                                onClick={() => toggleGroup(group.id)}
                              >
                                <TableCell onClick={(e) => e.stopPropagation()}>
                                  <Checkbox 
                                    checked={isGroupSelected ? true : (isGroupPartiallySelected ? 'indeterminate' : false)}
                                    onCheckedChange={(checked) => handleSelectTradeGroup(groupTradeIds, !!checked)}
                                  />
                                </TableCell>
                                <TableCell className="text-center">
                                  {group.isPair ? (
                                    isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
                                  ) : (
                                    <div className="w-4" />
                                  )}
                                </TableCell>
                                <TableCell className="font-medium">{format(new Date(group.summary.date), 'MMM d, yyyy')}</TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold">{group.summary.symbol}</span>
                                    {group.isPair && <LinkIcon className="h-3 w-3 text-muted-foreground" />}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  {group.summary.isOpen ? 
                                    <Badge variant="default" className="bg-green-600 hover:bg-green-700">Open</Badge> : 
                                    <Badge variant="secondary">Closed</Badge>
                                  }
                                </TableCell>
                                <TableCell className="text-right text-muted-foreground">
                                    {formatCurrency(group.summary.totalAmount)}
                                </TableCell>
                                <TableCell className="text-right font-mono">
                                    {group.summary.isOpen ? formatCurrency(group.summary.totalMarketValue) : '-'}
                                </TableCell>
                                <TableCell className={cn("text-right font-bold", group.summary.totalPnl >= 0 ? "text-green-500" : "text-red-500")}>
                                    {formatCurrency(group.summary.totalPnl)}
                                </TableCell>
                                <TableCell className="min-w-[200px]" onClick={(e) => e.stopPropagation()}>
                                  <Select 
                                    defaultValue={group.trades[0]?.tag_id || "none"} 
                                    onValueChange={(val) => {
                                      group.trades.forEach(trade => {
                                        handleTradeTagChange(trade.id, val);
                                      });
                                    }} 
                                    disabled={updateTradeTagMutation.isPending}
                                  >
                                    <SelectTrigger className="w-full h-8">
                                      <SelectValue placeholder="Assign Tag" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="none" className="text-muted-foreground">No Tag</SelectItem>
                                      {tags?.map((tag) => (
                                        <SelectItem key={tag.id} value={tag.id}>{tag.name}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </TableCell>
                              </TableRow>
                            );

                            if (isExpanded) {
                              rows.push(
                                <TableRow key={`${group.id}-details`} className="bg-muted/5 hover:bg-muted/5">
                                  <TableCell colSpan={9} className="p-0">
                                    <div className="border-t border-b bg-muted/10 py-2">
                                      <Table>
                                        <TableHeader>
                                            <TableRow className="border-none">
                                                <TableHead className="pl-12 text-xs">Leg Date</TableHead>
                                                <TableHead className="text-xs">Leg Action</TableHead>
                                                <TableHead className="text-xs">Symbol</TableHead>
                                                <TableHead className="text-xs text-right">Entry Price</TableHead>
                                                <TableHead className="text-xs text-right">Mark Price</TableHead>
                                                <TableHead className="text-xs text-right">Leg P&L / Val</TableHead>
                                                <TableHead className="text-xs text-right w-10"></TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {group.trades.map(trade => {
                                                const amount = Number(trade.amount);
                                                const cleanMarkPrice = Math.abs(trade.mark_price || 0);
                                                
                                                const actionUpper = trade.action.toUpperCase();
                                                const isSell = actionUpper.includes('SELL') || actionUpper.includes('SHORT');
                                                const sign = isSell ? -1 : 1;
                                                
                                                const mv = cleanMarkPrice * trade.quantity * trade.multiplier * sign;
                                                const legPnl = (trade.mark_price !== null) ? (mv + amount) : amount;
                                                
                                                // Calculate absolute entry price from the cash flow
                                                const entryPrice = (trade.quantity > 0) ? Math.abs(amount / (trade.quantity * trade.multiplier)) : 0;
                                                
                                                return (
                                                    <TableRow key={trade.id} className="border-none hover:bg-transparent group/row">
                                                        <TableCell className="pl-12 text-xs text-muted-foreground">{format(new Date(trade.date), 'MM/dd/yy')}</TableCell>
                                                        <TableCell className="text-xs">
                                                            <span className={trade.action.includes('BUY') ? "text-red-500" : "text-green-500"}>{trade.action}</span>
                                                        </TableCell>
                                                        <TableCell className="text-xs font-mono">{trade.symbol}</TableCell>
                                                        <TableCell className="text-xs text-right font-mono">${entryPrice.toFixed(2)}</TableCell>
                                                        <TableCell className="text-xs text-right font-mono">
                                                            {trade.mark_price ? `$${cleanMarkPrice.toFixed(2)}` : '-'}
                                                        </TableCell>
                                                        <TableCell className={cn("text-xs text-right font-bold", legPnl >= 0 ? "text-green-600/70" : "text-red-600/70")}>
                                                            {formatCurrency(legPnl)}
                                                        </TableCell>
                                                        <TableCell>
                                                          <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover/row:opacity-100 transition-opacity" onClick={() => handleEditTrade(trade)}>
                                                            <Pencil className="h-3 w-3 text-muted-foreground" />
                                                          </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                      </Table>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              );
                            }
                            return rows;
                          })}
                          {tagGroup.trades.length === 0 && (
                              <TableRow>
                                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                                      No trades in this tag yet.
                                  </TableCell>
                              </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                  );
                })}
                {Object.keys(groupedTradesByTag).length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No trades assigned to this strategy yet.
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Floating Bulk Actions Bar */}
        <FloatingActionBar isOpen={selectedTradesForTagging.length > 0}>
          <span className="text-sm font-medium text-foreground whitespace-nowrap">
            {selectedTradesForTagging.length} selected
          </span>
          <div className="flex items-center gap-2">
            <Select onValueChange={handleBulkTagChange} disabled={bulkUpdateTagMutation.isPending}>
              <SelectTrigger className="w-[180px] h-9">
                <SelectValue placeholder="Assign Tag" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No Tag</SelectItem>
                {tags?.map((tag) => (
                  <SelectItem key={tag.id} value={tag.id}>{tag.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="icon" onClick={() => setSelectedTradesForTagging([])}>
              <X className="h-5 w-5" />
            </Button>
          </div>
        </FloatingActionBar>
      </div>
    </DashboardLayout>
  );
} 

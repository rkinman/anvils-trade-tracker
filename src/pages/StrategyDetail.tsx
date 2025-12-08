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
import { Loader2, Save, Plus, ArrowLeft, Search, Tag, Trash2, ChevronDown, ChevronRight, Calculator, Link as LinkIcon, ArrowUp, ArrowDown, ArrowUpDown, BarChart3, X } from "lucide-react";
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
import { cn } from "@/lib/utils";

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
  const [selectedUnassigned, setSelectedUnassigned] = useState<string[]>([]);
  const [selectedTradesForTagging, setSelectedTradesForTagging] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [newTagName, setNewTagName] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  
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
        .order('date', { ascending: false });
      if (error) throw error;
      return data as Trade[];
    }
  });

  const { data: unassignedTrades } = useQuery<Trade[]>({
    queryKey: ['unassignedTrades'],
    queryFn: async () => {
      const { data, error } = await supabase.from('trades').select('*').is('strategy_id', null).order('date', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: isAddTradesOpen,
  });

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
    },
    onError: (err) => showError(err.message)
  });
  
  const deleteTagMutation = useMutation({
    mutationFn: (tagId: string) => supabase.from('tags').delete().eq('id', tagId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags', strategyId] });
      queryClient.invalidateQueries({ queryKey: ['assignedTrades', strategyId] });
      queryClient.invalidateQueries({ queryKey: ['dashboardTags'] });
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
      showSuccess(`Updated tags for ${selectedTradesForTagging.length} trades`);
      setSelectedTradesForTagging([]);
    },
    onError: (err) => showError(err.message)
  });

  // --- HANDLERS ---
  const handleSave = () => updateStrategyMutation.mutate(formState);
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

  const filteredUnassignedTrades = useMemo(() => unassignedTrades?.filter(t => t.symbol.toLowerCase().includes(searchTerm.toLowerCase())), [unassignedTrades, searchTerm]);

  // --- DATA PROCESSING (Grouping by Tags) ---
  const groupedTradesByTag = useMemo(() => {
    if (!assignedTrades) return {};

    // First sort trades
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

    // Group by tag
    const groups: Record<string, { name: string; trades: TradeGroup[] }> = {};

    sortedTrades.forEach(trade => {
      const tagId = trade.tag_id || 'untagged';
      const tagName = trade.tags?.name || 'Untagged Trades';

      if (!groups[tagId]) {
        groups[tagId] = { name: tagName, trades: [] };
      }

      // Create trade groups (pairs vs singles)
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

    // Calculate summaries for each group
    Object.values(groups).forEach(tagGroup => {
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
          
          // Re-calculate amount using Price * Qty * Multiplier to ensure correct sign (Polarity)
          // DB 'amount' can sometimes be wrong if import didn't handle debit/credit signs correctly
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
            // Closed Trade P&L is just the realized amount
            totalPnl += amount;
          }
          
          // Update the trade object in memory so the expanded view uses the fixed sign too
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
      });

      // Sort groups within each tag by date
      tagGroup.trades.sort((a, b) => new Date(b.summary.date).getTime() - new Date(a.summary.date).getTime());
    });

    return groups;
  }, [assignedTrades, sortKey, sortDirection]);

  if (strategyLoading) return <DashboardLayout><Loader2 className="h-8 w-8 animate-spin mx-auto mt-10" /></DashboardLayout>;

  return (
    <DashboardLayout>
      <div className="space-y-6 pb-20">
        <div className="flex items-center justify-between">
          <Link to="/strategies" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />Back to Strategies
          </Link>
          {strategy?.status === 'closed' && <Badge variant="secondary">Closed Strategy</Badge>}
        </div>
        
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Strategy Info Card */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader><CardTitle>Strategy Details</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Strategy Name</Label>
                    <Input id="name" value={formState.name} onChange={(e) => setFormState({ ...formState, name: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cap">Allocated Capital</Label>
                    <div className="relative">
                      <Calculator className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input id="cap" type="number" className="pl-9" value={formState.capital_allocation} onChange={(e) => setFormState({ ...formState, capital_allocation: e.target.value })} />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
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
                <div className="flex items-center space-x-2">
                  <Switch 
                    id="status" 
                    checked={formState.status === 'active'} 
                    onCheckedChange={(checked) => setFormState({ ...formState, status: checked ? 'active' : 'closed' })} 
                  />
                  <Label htmlFor="status">Active Strategy</Label>
                </div>
              </CardContent>
              <CardFooter>
                <Button onClick={handleSave} disabled={updateStrategyMutation.isPending}>
                  <Save className="mr-2 h-4 w-4" />Save Changes
                </Button>
              </CardFooter>
            </Card>
          </div>
          
          {/* Tags Card */}
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle>Tags & KPIs</CardTitle>
              <CardDescription>Tags marked "Show on Dashboard" act as sub-metrics.</CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              <div className="flex gap-2 mb-4">
                <Input placeholder="New tag name..." value={newTagName} onChange={(e) => setNewTagName(e.target.value)} />
                <Button onClick={handleCreateTag} disabled={createTagMutation.isPending}><Plus className="h-4 w-4" /></Button>
              </div>
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                {tagsLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                {tags?.map(tag => (
                  <div key={tag.id} className="flex items-center justify-between p-3 rounded-md bg-muted/40 border">
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
            </CardContent>
          </Card>
        </div>

        {/* TRADES / POSITIONS TABLE */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Trades & Positions</CardTitle>
              <CardDescription>
                Grouped by tags. Expand to see leg details and P&L.
              </CardDescription>
            </div>
            <div className="flex gap-2">
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
                    <h3 className="text-xl font-semibold mb-3 text-primary/90 flex items-center gap-2">
                      <Tag className="h-5 w-5" />
                      {tagGroup.name} ({tagGroup.trades.length} positions)
                    </h3>
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
                            
                            // Return array of rows
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
                                    {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(group.summary.totalAmount)}
                                </TableCell>
                                <TableCell className="text-right font-mono">
                                    {group.summary.isOpen ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(group.summary.totalMarketValue) : '-'}
                                </TableCell>
                                <TableCell className={cn("text-right font-bold", group.summary.totalPnl >= 0 ? "text-green-500" : "text-red-500")}>
                                    {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(group.summary.totalPnl)}
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
                                                
                                                // Calculate absolute entry price from the cash flow, as prices are always positive
                                                const entryPrice = (trade.quantity > 0) ? Math.abs(amount / (trade.quantity * trade.multiplier)) : 0;
                                                
                                                return (
                                                    <TableRow key={trade.id} className="border-none hover:bg-transparent">
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
                                                            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(legPnl)}
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
        {selectedTradesForTagging.length > 0 && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4">
            <div className="bg-card border border-border rounded-xl shadow-2xl p-3 flex items-center justify-between gap-4 animate-in slide-in-from-bottom-5 duration-300">
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
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
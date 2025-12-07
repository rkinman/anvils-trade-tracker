import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Loader2, Link as LinkIcon, Unlink, ArrowUp, ArrowDown, ArrowUpDown, Tag, EyeOff, Eye, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { showSuccess, showError } from "@/utils/toast";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuGroup, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Define Trade type based on Supabase schema
interface Trade {
  id: string;
  user_id: string;
  strategy_id: string | null;
  pair_id: string | null;
  symbol: string;
  date: string;
  action: string;
  quantity: number;
  price: number;
  fees: number;
  amount: number;
  multiplier: number;
  asset_type: string;
  notes: string | null;
  import_hash: string | null;
  created_at: string;
  hidden: boolean;
  strategies: { id: string; name: string } | null;
}

// Define sorting types
type SortKey = 'date' | 'symbol' | 'action' | 'quantity' | 'price' | 'amount' | 'strategy_name' | 'pair_id';
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
  currentSortDirection,
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

// Helper function for currency formatting
const formatCurrency = (value: number, decimals: number = 2) => {
  return new Intl.NumberFormat('en-US', { 
    style: 'currency', 
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
};

export default function TradeHistory() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTrades, setSelectedTrades] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [showHidden, setShowHidden] = useState(false);
  const [tradesToDelete, setTradesToDelete] = useState<string[]>([]);
  const queryClient = useQueryClient();

  // Fetch Trades
  const { data: trades, isLoading: tradesLoading } = useQuery<Trade[]>({
    queryKey: ['trades'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trades')
        .select(`
          *,
          strategies (
            id,
            name
          )
        `)
        .order('date', { ascending: false });
      
      if (error) throw error;
      return data as Trade[];
    }
  });

  // Fetch Strategies for the dropdown
  const { data: strategies } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['strategies-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('strategies')
        .select('id, name')
        .order('name');
      if (error) throw error;
      return data;
    }
  });

  // --- Mutations ---
  const updateStrategyMutation = useMutation({
    mutationFn: async ({ tradeId, strategyId }: { tradeId: string, strategyId: string | null }) => {
      const { error } = await supabase.from('trades').update({ strategy_id: strategyId }).eq('id', tradeId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trades', 'strategies'] });
      showSuccess("Trade updated");
    },
    onError: (err) => { showError(err.message); }
  });

  const bulkUpdateStrategyMutation = useMutation({
    mutationFn: async (strategyId: string | null) => {
      if (selectedTrades.length === 0) throw new Error("No trades selected.");
      const { error } = await supabase.from('trades').update({ strategy_id: strategyId }).in('id', selectedTrades);
      if (error) throw error;
    },
    onSuccess: (data, strategyId) => {
      queryClient.invalidateQueries({ queryKey: ['trades', 'strategies'] });
      const strategyName = strategies?.find(s => s.id === strategyId)?.name || 'Unassigned';
      showSuccess(`Assigned ${selectedTrades.length} trades to "${strategyName}".`);
      setSelectedTrades([]);
    },
    onError: (err) => { showError(err.message); }
  });

  const pairTradesMutation = useMutation({
    mutationFn: async (tradeIds: string[]) => {
      if (tradeIds.length < 2) throw new Error("Select at least two trades.");
      const pairId = crypto.randomUUID();
      const { error } = await supabase.from('trades').update({ pair_id: pairId }).in('id', tradeIds);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      showSuccess(`Paired ${selectedTrades.length} trades.`);
      setSelectedTrades([]);
    },
    onError: (err) => { showError(err.message); }
  });

  const unpairTradesMutation = useMutation({
    mutationFn: async (tradeIds: string[]) => {
      const { error } = await supabase.from('trades').update({ pair_id: null }).in('id', tradeIds);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      showSuccess(`Unpaired ${selectedTrades.length} trades.`);
      setSelectedTrades([]);
    },
    onError: (err) => { showError(err.message); }
  });

  const updateHiddenStatusMutation = useMutation({
    mutationFn: async ({ ids, hidden }: { ids: string[], hidden: boolean }) => {
      const { error } = await supabase.from('trades').update({ hidden }).in('id', ids);
      if (error) throw error;
    },
    onSuccess: (data, { hidden }) => {
      queryClient.invalidateQueries({ queryKey: ['trades', 'dashboard-stats', 'strategies'] });
      showSuccess(`Successfully ${hidden ? 'hid' : 'unhid'} ${selectedTrades.length} trades.`);
      setSelectedTrades([]);
    },
    onError: (err) => { showError(err.message); }
  });

  const deleteTradesMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from('trades').delete().in('id', ids);
      if (error) throw error;
    },
    onSuccess: (data, ids) => {
      queryClient.invalidateQueries({ queryKey: ['trades', 'dashboard-stats', 'strategies'] });
      showSuccess(`Successfully deleted ${ids.length} trade(s).`);
      setSelectedTrades(prev => prev.filter(id => !ids.includes(id)));
      setTradesToDelete([]);
    },
    onError: (err) => {
      showError(err.message);
      setTradesToDelete([]);
    }
  });

  // --- Handlers ---
  const handleStrategyChange = (tradeId: string, value: string) => {
    updateStrategyMutation.mutate({ tradeId, strategyId: value === "none" ? null : value });
  };

  const handleBulkStrategyChange = (strategyId: string) => {
    bulkUpdateStrategyMutation.mutate(strategyId === "none" ? null : strategyId);
  };

  const handleSelectTrade = (tradeId: string, checked: boolean) => {
    setSelectedTrades(prev => checked ? [...prev, tradeId] : prev.filter(id => id !== tradeId));
  };

  const handleSelectAllInGroup = (tradeIdsInGroup: string[], checked: boolean) => {
    setSelectedTrades(prevSelected => {
      const groupIds = new Set(tradeIdsInGroup);
      if (checked) {
        return Array.from(new Set([...prevSelected, ...tradeIdsInGroup]));
      } else {
        return prevSelected.filter(id => !groupIds.has(id));
      }
    });
  };

  const handleBulkPair = () => pairTradesMutation.mutate(selectedTrades);
  const handleBulkUnpair = () => unpairTradesMutation.mutate(selectedTrades);
  const handleBulkHide = () => updateHiddenStatusMutation.mutate({ ids: selectedTrades, hidden: true });
  const handleBulkUnhide = () => updateHiddenStatusMutation.mutate({ ids: selectedTrades, hidden: false });
  const handleConfirmDelete = () => deleteTradesMutation.mutate(tradesToDelete);
  
  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('desc');
    }
  };

  // --- Memoized Data ---
  const filteredTrades = useMemo(() => 
    trades?.filter(trade => {
      const matchesSearch = trade.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            trade.action.toLowerCase().includes(searchTerm.toLowerCase());
      const isVisible = showHidden ? true : !trade.hidden;
      return matchesSearch && isVisible;
    }), [trades, searchTerm, showHidden]);

  const sortedTrades = useMemo(() => {
    if (!filteredTrades) return [];
    return [...filteredTrades].sort((a, b) => {
      let aValue: any = a[sortKey as keyof Trade];
      let bValue: any = b[sortKey as keyof Trade];

      if (sortKey === 'date') {
        aValue = new Date(a.date).getTime();
        bValue = new Date(b.date).getTime();
      } else if (sortKey === 'strategy_name') {
        aValue = a.strategies?.name || '';
        bValue = b.strategies?.name || '';
      }
      
      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredTrades, sortKey, sortDirection]);

  const groupedTrades = useMemo(() => {
    if (!sortedTrades) return {};

    const groups: Record<string, { name: string; trades: Trade[] }> = {};
    const hiddenGroup: { name: string; trades: Trade[] } = { name: 'Hidden Trades', trades: [] };

    // Partition trades into strategy groups and a single hidden group
    for (const trade of sortedTrades) {
      if (trade.hidden) {
        hiddenGroup.trades.push(trade);
      } else {
        const strategyId = trade.strategy_id || 'unassigned';
        const strategyName = trade.strategies?.name || 'Unassigned Trades';
        if (!groups[strategyId]) {
          groups[strategyId] = { name: strategyName, trades: [] };
        }
        groups[strategyId].trades.push(trade);
      }
    }

    // Sort the strategy groups
    const orderedKeys = Object.keys(groups).sort((a, b) => {
      if (a === 'unassigned') return -1;
      if (b === 'unassigned') return 1;
      return groups[a].name.localeCompare(groups[b].name);
    });

    const finalGroups = orderedKeys.reduce((acc, key) => {
      if (groups[key].trades.length > 0) { // Only add groups that have trades
        acc[key] = groups[key];
      }
      return acc;
    }, {} as Record<string, { name: string; trades: Trade[] }>);

    // Add the hidden group at the end if it has trades
    if (hiddenGroup.trades.length > 0) {
      finalGroups['hidden'] = hiddenGroup;
    }

    return finalGroups;
  }, [sortedTrades]);

  return (
    <DashboardLayout>
      <AlertDialog open={tradesToDelete.length > 0} onOpenChange={(open) => !open && setTradesToDelete([])}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete {tradesToDelete.length} trade(s) from the database.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deleteTradesMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteTradesMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Trade History</h2>
            <p className="text-muted-foreground">View all transactions and assign them to strategies.</p>
          </div>
          <div className="flex items-center space-x-2">
            <Switch id="show-hidden" checked={showHidden} onCheckedChange={setShowHidden} />
            <Label htmlFor="show-hidden">Show Hidden</Label>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search symbol or action..."
              className="pl-8"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          {selectedTrades.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary">
                  Bulk Actions ({selectedTrades.length})
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Visibility</DropdownMenuLabel>
                  <DropdownMenuItem onClick={handleBulkHide} disabled={updateHiddenStatusMutation.isPending}>
                    <EyeOff className="mr-2 h-4 w-4" /> Hide Selected
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleBulkUnhide} disabled={updateHiddenStatusMutation.isPending}>
                    <Eye className="mr-2 h-4 w-4" /> Unhide Selected
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Pairing</DropdownMenuLabel>
                  <DropdownMenuItem onClick={handleBulkPair} disabled={pairTradesMutation.isPending}>
                    <LinkIcon className="mr-2 h-4 w-4" /> Pair Selected
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleBulkUnpair} disabled={unpairTradesMutation.isPending}>
                    <Unlink className="mr-2 h-4 w-4" /> Unpair Selected
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Assign Strategy</DropdownMenuLabel>
                  <div className="p-2">
                    <Select onValueChange={handleBulkStrategyChange} disabled={bulkUpdateStrategyMutation.isPending || !strategies}>
                      <SelectTrigger className="w-full h-8">
                        <SelectValue placeholder="Select Strategy" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none" className="text-muted-foreground">
                          <Tag className="mr-2 h-4 w-4 inline-block" /> Unassign
                        </SelectItem>
                        {strategies?.map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setTradesToDelete(selectedTrades)} className="text-destructive focus:text-destructive">
                  <Trash2 className="mr-2 h-4 w-4" /> Delete Selected
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <div className="space-y-8">
          {tradesLoading ? (
            <div className="text-center py-10"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
          ) : !sortedTrades || sortedTrades.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">No trades found.</div>
          ) : (
            Object.entries(groupedTrades).map(([strategyId, group]) => {
              const allInGroupSelected = group.trades.every(t => selectedTrades.includes(t.id));
              const someInGroupSelected = group.trades.some(t => selectedTrades.includes(t.id));

              return (
                <div key={strategyId}>
                  <h3 className="text-xl font-semibold mb-3 text-primary/90">{group.name} ({group.trades.length} trades)</h3>
                  <div className="border rounded-md bg-card overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[40px]">
                            <Checkbox
                              checked={allInGroupSelected ? true : (someInGroupSelected ? 'indeterminate' : false)}
                              onCheckedChange={(checked) => handleSelectAllInGroup(group.trades.map(t => t.id), !!checked)}
                            />
                          </TableHead>
                          <SortableTableHead sortKey="date" {...{currentSortKey: sortKey, currentSortDirection: sortDirection, onSort: handleSort}}>Date</SortableTableHead>
                          <SortableTableHead sortKey="symbol" {...{currentSortKey: sortKey, currentSortDirection: sortDirection, onSort: handleSort}}>Symbol</SortableTableHead>
                          <SortableTableHead sortKey="action" {...{currentSortKey: sortKey, currentSortDirection: sortDirection, onSort: handleSort}}>Action</SortableTableHead>
                          <TableHead>Status</TableHead>
                          <SortableTableHead sortKey="quantity" {...{currentSortKey: sortKey, currentSortDirection: sortDirection, onSort: handleSort}} className="text-right">Qty</SortableTableHead>
                          <SortableTableHead sortKey="price" {...{currentSortKey: sortKey, currentSortDirection: sortDirection, onSort: handleSort}} className="text-right">Price</SortableTableHead>
                          <SortableTableHead sortKey="amount" {...{currentSortKey: sortKey, currentSortDirection: sortDirection, onSort: handleSort}} className="text-right">Amount</SortableTableHead>
                          <SortableTableHead sortKey="strategy_name" {...{currentSortKey: sortKey, currentSortDirection: sortDirection, onSort: handleSort}}>Strategy</SortableTableHead>
                          <SortableTableHead sortKey="pair_id" {...{currentSortKey: sortKey, currentSortDirection: sortDirection, onSort: handleSort}}>Pair ID</SortableTableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {group.trades.map((trade) => (
                          <TableRow key={trade.id} data-state={selectedTrades.includes(trade.id) && "selected"} className={cn(trade.pair_id && "bg-primary/5", trade.hidden && "opacity-60 bg-muted/50")}>
                            <TableCell><Checkbox checked={selectedTrades.includes(trade.id)} onCheckedChange={(checked) => handleSelectTrade(trade.id, !!checked)} /></TableCell>
                            <TableCell className="font-medium min-w-[120px]">{format(new Date(trade.date), 'MMM d, yyyy')}</TableCell>
                            <TableCell><Badge variant="outline" className="font-mono">{trade.symbol}</Badge></TableCell>
                            <TableCell><span className={trade.action.includes('BUY') ? "text-red-400" : "text-green-400"}>{trade.action}</span></TableCell>
                            <TableCell>{trade.hidden && <Badge variant="secondary">Hidden</Badge>}</TableCell>
                            <TableCell className="text-right">{trade.quantity}</TableCell>
                            <TableCell className="text-right">{formatCurrency(trade.price / trade.multiplier, 2)}</TableCell>
                            <TableCell className={`text-right font-bold ${Number(trade.amount) >= 0 ? "text-green-500" : "text-red-500"}`}>{formatCurrency(trade.amount, 2)}</TableCell>
                            <TableCell className="min-w-[200px]">
                              <Select defaultValue={trade.strategy_id || "none"} onValueChange={(val) => handleStrategyChange(trade.id, val)} disabled={updateStrategyMutation.isPending}>
                                <SelectTrigger className="w-full h-8"><SelectValue placeholder="Assign" /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none" className="text-muted-foreground">Unassigned</SelectItem>
                                  {strategies?.map((s) => (<SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground max-w-[100px] truncate">
                              {trade.pair_id ? (<Badge variant="secondary" className="font-mono">{trade.pair_id.substring(0, 8)}...</Badge>) : "N/A"}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => setTradesToDelete([trade.id])}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
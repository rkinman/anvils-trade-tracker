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
import { Search, Loader2, Link as LinkIcon, Unlink, ArrowUp, ArrowDown, ArrowUpDown, Tag } from "lucide-react";
import { format } from "date-fns";
import { showSuccess, showError } from "@/utils/toast";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuGroup, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";

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


export default function TradeHistory() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTrades, setSelectedTrades] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
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

  // Mutation to update strategy for a single trade
  const updateStrategyMutation = useMutation({
    mutationFn: async ({ tradeId, strategyId }: { tradeId: string, strategyId: string | null }) => {
      const { error } = await supabase
        .from('trades')
        .update({ strategy_id: strategyId })
        .eq('id', tradeId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      queryClient.invalidateQueries({ queryKey: ['strategies'] });
      showSuccess("Trade updated");
    },
    onError: (err) => {
      showError(err.message);
    }
  });

  // Mutation to update strategy for multiple trades
  const bulkUpdateStrategyMutation = useMutation({
    mutationFn: async (strategyId: string | null) => {
      if (selectedTrades.length === 0) {
        throw new Error("No trades selected for bulk update.");
      }
      
      const { error } = await supabase
        .from('trades')
        .update({ strategy_id: strategyId })
        .in('id', selectedTrades);

      if (error) throw error;
    },
    onSuccess: (data, strategyId) => {
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      queryClient.invalidateQueries({ queryKey: ['strategies'] });
      setSelectedTrades([]);
      const strategyName = strategies?.find(s => s.id === strategyId)?.name || 'Unassigned';
      showSuccess(`Successfully assigned ${selectedTrades.length} trades to "${strategyName}".`);
    },
    onError: (err) => {
      showError(err.message);
    }
  });

  // Mutation for pairing trades
  const pairTradesMutation = useMutation({
    mutationFn: async (tradeIds: string[]) => {
      if (tradeIds.length < 2) {
        throw new Error("Select at least two trades to pair.");
      }
      
      // Generate a new UUID for the pair
      const pairId = crypto.randomUUID();

      const { error } = await supabase
        .from('trades')
        .update({ pair_id: pairId })
        .in('id', tradeIds);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      setSelectedTrades([]);
      showSuccess(`Successfully paired ${selectedTrades.length} trades.`);
    },
    onError: (err) => {
      showError(err.message);
    }
  });

  // Mutation for unpairing trades
  const unpairTradesMutation = useMutation({
    mutationFn: async (tradeIds: string[]) => {
      const { error } = await supabase
        .from('trades')
        .update({ pair_id: null })
        .in('id', tradeIds);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      setSelectedTrades([]);
      showSuccess(`Successfully unpaired ${selectedTrades.length} trades.`);
    },
    onError: (err) => {
      showError(err.message);
    }
  });

  // --- Handlers ---

  const handleStrategyChange = (tradeId: string, value: string) => {
    const strategyId = value === "none" ? null : value;
    updateStrategyMutation.mutate({ tradeId, strategyId });
  };

  const handleBulkStrategyChange = (strategyId: string) => {
    const id = strategyId === "none" ? null : strategyId;
    bulkUpdateStrategyMutation.mutate(id);
  };

  const handleSelectTrade = (tradeId: string, checked: boolean) => {
    setSelectedTrades(prev => 
      checked ? [...prev, tradeId] : prev.filter(id => id !== tradeId)
    );
  };

  const handleSelectAll = (checked: boolean) => {
    if (!filteredTrades) return;
    if (checked) {
      setSelectedTrades(filteredTrades.map(t => t.id));
    } else {
      setSelectedTrades([]);
    }
  };

  const handleBulkPair = () => {
    if (selectedTrades.length < 2) {
      showError("Please select at least two trades to pair.");
      return;
    }
    pairTradesMutation.mutate(selectedTrades);
  };

  const handleBulkUnpair = () => {
    if (selectedTrades.length === 0) return;
    unpairTradesMutation.mutate(selectedTrades);
  };
  
  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('desc'); // Default to descending for new sort key
    }
  };

  // --- Filtering ---

  const filteredTrades = trades?.filter(trade => 
    trade.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
    trade.action.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // --- Sorting Logic ---
  const sortedTrades = useMemo(() => {
    if (!filteredTrades) return [];

    const sorted = [...filteredTrades].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortKey) {
        case 'date':
          aValue = new Date(a.date).getTime();
          bValue = new Date(b.date).getTime();
          break;
        case 'symbol':
        case 'action':
        case 'pair_id':
          aValue = a[sortKey] || '';
          bValue = b[sortKey] || '';
          break;
        case 'strategy_name':
          aValue = a.strategies?.name || '';
          bValue = b.strategies?.name || '';
          break;
        case 'quantity':
        case 'price':
        case 'amount':
          aValue = Number(a[sortKey]);
          bValue = Number(b[sortKey]);
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [filteredTrades, sortKey, sortDirection]);

  // --- Grouping Logic ---
  const groupedTrades = useMemo(() => {
    if (!sortedTrades) return {};

    const groups: Record<string, { name: string; trades: Trade[] }> = {};

    for (const trade of sortedTrades) {
      const strategyId = trade.strategy_id || 'unassigned';
      const strategyName = trade.strategies?.name || 'Unassigned Trades';

      if (!groups[strategyId]) {
        groups[strategyId] = { name: strategyName, trades: [] };
      }
      groups[strategyId].trades.push(trade);
    }

    // Order the groups: 'unassigned' first, then by strategy name
    const orderedKeys = Object.keys(groups).sort((a, b) => {
      if (a === 'unassigned') return -1;
      if (b === 'unassigned') return 1;
      return groups[a].name.localeCompare(groups[b].name);
    });

    const orderedGroups: Record<string, { name: string; trades: Trade[] }> = {};
    for (const key of orderedKeys) {
      orderedGroups[key] = groups[key];
    }

    return orderedGroups;
  }, [sortedTrades]);


  const allSelected = filteredTrades && selectedTrades.length > 0 && selectedTrades.length === filteredTrades.length;
  // const indeterminate = selectedTrades.length > 0 && selectedTrades.length < (filteredTrades?.length || 0); // Not used

  // Helper function for currency formatting
  const formatCurrency = (value: number, decimals: number = 2) => {
    return new Intl.NumberFormat('en-US', { 
      style: 'currency', 
      currency: 'USD',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Trade History</h2>
          <p className="text-muted-foreground">View all transactions and assign them to strategies.</p>
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
                  <DropdownMenuLabel>Pairing</DropdownMenuLabel>
                  <DropdownMenuItem 
                    onClick={handleBulkPair} 
                    disabled={pairTradesMutation.isPending}
                  >
                    <LinkIcon className="mr-2 h-4 w-4" /> Pair Selected Trades
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={handleBulkUnpair} 
                    disabled={unpairTradesMutation.isPending}
                  >
                    <Unlink className="mr-2 h-4 w-4" /> Unpair Selected Trades
                  </DropdownMenuItem>
                </DropdownMenuGroup>

                <DropdownMenuSeparator />

                <DropdownMenuGroup>
                  <DropdownMenuLabel>Assign Strategy</DropdownMenuLabel>
                  <div className="p-2">
                    <Select 
                      onValueChange={handleBulkStrategyChange}
                      disabled={bulkUpdateStrategyMutation.isPending || !strategies || strategies.length === 0}
                    >
                      <SelectTrigger className="w-full h-8">
                        <SelectValue placeholder="Select Strategy" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none" className="text-muted-foreground">
                          <Tag className="mr-2 h-4 w-4 inline-block" /> Unassign Strategy
                        </SelectItem>
                        {strategies?.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <div className="border rounded-md bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={handleSelectAll}
                    aria-label="Select all"
                    className="translate-y-[2px]"
                  />
                </TableHead>
                <SortableTableHead 
                  sortKey="date" 
                  currentSortKey={sortKey} 
                  currentSortDirection={sortDirection} 
                  onSort={handleSort}
                >
                  Date
                </SortableTableHead>
                <SortableTableHead 
                  sortKey="symbol" 
                  currentSortKey={sortKey} 
                  currentSortDirection={sortDirection} 
                  onSort={handleSort}
                >
                  Symbol
                </SortableTableHead>
                <SortableTableHead 
                  sortKey="action" 
                  currentSortKey={sortKey} 
                  currentSortDirection={sortDirection} 
                  onSort={handleSort}
                >
                  Action
                </SortableTableHead>
                <SortableTableHead 
                  sortKey="quantity" 
                  currentSortKey={sortKey} 
                  currentSortDirection={sortDirection} 
                  onSort={handleSort}
                  className="text-right"
                >
                  Qty
                </SortableTableHead>
                <SortableTableHead 
                  sortKey="price" 
                  currentSortKey={sortKey} 
                  currentSortDirection={sortDirection} 
                  onSort={handleSort}
                  className="text-right"
                >
                  Price
                </TableHead>
                <SortableTableHead 
                  sortKey="amount" 
                  currentSortKey={sortKey} 
                  currentSortDirection={sortDirection} 
                  onSort={handleSort}
                  className="text-right"
                >
                  Amount
                </TableHead>
                <SortableTableHead 
                  sortKey="strategy_name" 
                  currentSortKey={sortKey} 
                  currentSortDirection={sortDirection} 
                  onSort={handleSort}
                >
                  Strategy
                </SortableTableHead>
                <SortableTableHead 
                  sortKey="pair_id" 
                  currentSortKey={sortKey} 
                  currentSortDirection={sortDirection} 
                  onSort={handleSort}
                >
                  Pair ID
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tradesLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-10">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : sortedTrades.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-10 text-muted-foreground">
                    No trades found. Import some data to get started.
                  </TableCell>
                </TableRow>
              ) : (
                Object.entries(groupedTrades).map(([strategyId, group]) => (
                  <>
                    <TableRow key={strategyId} className="bg-muted/50 hover:bg-muted/50 border-y border-border/50">
                      <TableCell colSpan={9} className="py-2 font-semibold text-primary/80">
                        {group.name} ({group.trades.length} trades)
                      </TableCell>
                    </TableRow>
                    {group.trades.map((trade) => (
                      <TableRow key={trade.id} className={trade.pair_id ? "bg-primary/5" : ""}>
                        <TableCell>
                          <Checkbox
                            checked={selectedTrades.includes(trade.id)}
                            onCheckedChange={(checked) => handleSelectTrade(trade.id, !!checked)}
                            aria-label={`Select trade ${trade.id}`}
                          />
                        </TableCell>
                        <TableCell className="font-medium min-w-[120px]">
                          {format(new Date(trade.date), 'MMM d, yyyy')}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono">
                            {trade.symbol}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className={
                            trade.action.includes('BUY') ? "text-red-400" : "text-green-400"
                          }>
                            {trade.action}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">{trade.quantity}</TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(trade.price / trade.multiplier, 2)}
                        </TableCell>
                        <TableCell className={`text-right font-bold ${
                          Number(trade.amount) >= 0 ? "text-green-500" : "text-red-500"
                        }`}>
                          {formatCurrency(trade.amount, 2)}
                        </TableCell>
                        <TableCell className="min-w-[200px]">
                          <Select 
                            defaultValue={trade.strategy_id || "none"} 
                            onValueChange={(val) => handleStrategyChange(trade.id, val)}
                            disabled={updateStrategyMutation.isPending}
                          >
                            <SelectTrigger className="w-full h-8">
                              <SelectValue placeholder="Assign Strategy" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none" className="text-muted-foreground">
                                Unassigned
                              </SelectItem>
                              {strategies?.map((s) => (
                                <SelectItem key={s.id} value={s.id}>
                                  {s.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[100px] truncate">
                          {trade.pair_id ? (
                            <Badge variant="secondary" className="font-mono">
                              {trade.pair_id.substring(0, 8)}...
                            </Badge>
                          ) : (
                            "N/A"
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </DashboardLayout>
  );
}
import { useState, useMemo, useEffect, Fragment } from "react";
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
import { Loader2, Save, Plus, ArrowLeft, Search, Tag, Trash2, ChevronDown, ChevronRight, Calculator, Briefcase, Link as LinkIcon } from "lucide-react";
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
  amount: number; // Total Cash Flow (Negative for Debit, Positive for Credit)
  tag_id: string | null;
  mark_price: number | null;
  quantity: number;
  multiplier: number;
  price: number; // Unit Price
  pair_id: string | null;
  unrealized_pnl: number | null;
}

interface Tag {
  id: string;
  name: string;
  show_on_dashboard: boolean;
}

interface TradeGroup {
  id: string; // pair_id or trade_id if single
  isPair: boolean;
  trades: Trade[];
  summary: {
    date: string;
    symbol: string;
    totalAmount: number; // Net Cost Basis (Realized Cash Flow)
    totalMarketValue: number;
    totalPnl: number;
    isOpen: boolean;
  };
}

export default function StrategyDetail() {
  const { strategyId } = useParams<{ strategyId: string }>();
  const queryClient = useQueryClient();
  const [isAddTradesOpen, setIsAddTradesOpen] = useState(false);
  const [selectedUnassigned, setSelectedUnassigned] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [newTagName, setNewTagName] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  
  // --- QUERIES ---
  const { data: strategy, isLoading: strategyLoading } = useQuery({
    queryKey: ['strategy', strategyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('strategies').select('*').eq('id', strategyId!).single();
      if (error) throw error;
      return data;
    }
  });

  const [formState, setFormState] = useState({ name: '', description: '', capital_allocation: '0', status: 'active' });
  
  useEffect(() => {
    if (strategy) {
      setFormState({ 
        name: strategy.name, 
        description: strategy.description || '',
        capital_allocation: strategy.capital_allocation || '0',
        status: strategy.status || 'active'
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
        .select('*')
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

  // --- HANDLERS ---
  const handleSave = () => updateStrategyMutation.mutate(formState);
  const handleAddSelected = () => assignTradesMutation.mutate(selectedUnassigned);
  const handleCreateTag = () => {
    if (newTagName.trim()) createTagMutation.mutate(newTagName.trim());
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

  // --- DATA PROCESSING (Grouping) ---
  const groupedTrades = useMemo<TradeGroup[]>(() => {
    if (!assignedTrades) return [];

    const groups: Record<string, TradeGroup> = {};

    assignedTrades.forEach(trade => {
      // Use pair_id as group key if exists, otherwise trade.id
      const groupId = trade.pair_id || trade.id;
      const isPair = !!trade.pair_id;

      if (!groups[groupId]) {
        groups[groupId] = {
          id: groupId,
          isPair,
          trades: [],
          summary: {
            date: trade.date,
            symbol: trade.symbol, // Will refine later
            totalAmount: 0,
            totalMarketValue: 0,
            totalPnl: 0,
            isOpen: false
          }
        };
      }

      groups[groupId].trades.push(trade);
    });

    // Calculate Summary stats for each group
    return Object.values(groups).map(group => {
      let totalAmount = 0;
      let totalMarketValue = 0;
      let totalPnl = 0;
      let isOpen = false;
      let symbols = new Set<string>();

      group.trades.forEach(trade => {
        symbols.add(trade.symbol);
        totalAmount += trade.amount;

        // --- P&L CALCULATION LOGIC ---
        // 1. Determine if Long or Short
        let sign = 1; // Default to Long
        const actionUpper = trade.action.toUpperCase();
        if (actionUpper.includes('SELL') || actionUpper.includes('SHORT')) {
          sign = -1; // Short
        }

        // 2. Check if Open (has mark_price)
        if (trade.mark_price !== null) {
          isOpen = true;
          // Market Value = Mark * Qty * Multiplier * Sign
          // Note: Short MV is negative (liability), Long MV is positive (asset)
          // Actually, for Net Liq purposes: 
          // Long Call Value = $500.
          // Short Call Cost to Close = $500. Net Liq Impact = -$500.
          // So:
          // Long MV = Mark * Qty * Mult (+ve)
          // Short MV = Mark * Qty * Mult * -1 (-ve)
          const mv = (trade.mark_price || 0) * trade.quantity * trade.multiplier * sign;
          
          totalMarketValue += mv;
          
          // P&L = MV + Cost Basis (Amount)
          // Example Long: Cost -500. MV +600. P&L = +100.
          // Example Short: Credit +500. MV -100. P&L = +400.
          totalPnl += (mv + trade.amount);
        } else {
          // Closed trade. P&L is just the realized amount.
          // (assuming closed trades have no residual market value)
          totalPnl += trade.amount;
        }
      });

      // Refine Symbol Summary
      const symbolList = Array.from(symbols);
      const displaySymbol = symbolList.length === 1 
        ? symbolList[0] 
        : group.isPair 
          ? `${symbolList[0]} + ${symbolList.length - 1} legs` 
          : symbolList[0];

      // Use the earliest date for the group
      group.trades.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const displayDate = group.trades[0]?.date;

      return {
        ...group,
        summary: {
          date: displayDate,
          symbol: displaySymbol,
          totalAmount,
          totalMarketValue,
          totalPnl,
          isOpen
        }
      };
    }).sort((a, b) => new Date(b.summary.date).getTime() - new Date(a.summary.date).getTime());
  }, [assignedTrades]);


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
                Grouped by pair. Expand to see leg details and P&L.
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
              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-[50px]"></TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Structure / Symbol</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Cost Basis</TableHead>
                      <TableHead className="text-right">Current Value</TableHead>
                      <TableHead className="text-right">Net P&L</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groupedTrades.map(group => {
                      const isExpanded = expandedGroups.has(group.id);
                      return (
                        <Fragment key={group.id}>
                          {/* GROUP ROW */}
                          <TableRow 
                            className={cn(
                              "cursor-pointer hover:bg-muted/30 transition-colors", 
                              isExpanded && "bg-muted/20 border-b-0"
                            )}
                            onClick={() => toggleGroup(group.id)}
                          >
                            <TableCell className="text-center">
                              {group.isPair ? (
                                isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
                              ) : (
                                <div className="w-4" /> // Spacer for single trades
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
                          </TableRow>

                          {/* LEGS / EXPANDED ROW */}
                          {/* Only expand if paired or if single trade is open (to see stats) - actually logic below expands everything if clicked */}
                          {isExpanded && (
                            <TableRow className="bg-muted/5 hover:bg-muted/5">
                              <TableCell colSpan={7} className="p-0">
                                <div className="border-t border-b bg-muted/10 py-2">
                                  <Table>
                                    <TableHeader>
                                        <TableRow className="border-none">
                                            <TableHead className="pl-12 text-xs">Leg Date</TableHead>
                                            <TableHead className="text-xs">Leg Action</TableHead>
                                            <TableHead className="text-xs">Symbol</TableHead>
                                            <TableHead className="text-xs text-right">Entry Price</TableHead>
                                            <TableHead className="text-xs text-right">Mark Price</TableHead>
                                            <TableHead className="text-xs text-right">Leg P&L</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {group.trades.map(trade => {
                                            // Leg P&L Calc
                                            let sign = 1;
                                            if (trade.action.toUpperCase().includes('SELL') || trade.action.toUpperCase().includes('SHORT')) sign = -1;
                                            const mv = (trade.mark_price || 0) * trade.quantity * trade.multiplier * sign;
                                            const legPnl = (trade.mark_price !== null) ? (mv + trade.amount) : trade.amount;
                                            const entryPrice = Math.abs(trade.amount / (trade.quantity * trade.multiplier));
                                            
                                            return (
                                                <TableRow key={trade.id} className="border-none hover:bg-transparent">
                                                    <TableCell className="pl-12 text-xs text-muted-foreground">{format(new Date(trade.date), 'MM/dd/yy')}</TableCell>
                                                    <TableCell className="text-xs">
                                                        <span className={trade.action.includes('BUY') ? "text-red-500" : "text-green-500"}>{trade.action}</span>
                                                    </TableCell>
                                                    <TableCell className="text-xs font-mono">{trade.symbol}</TableCell>
                                                    <TableCell className="text-xs text-right font-mono">${entryPrice.toFixed(2)}</TableCell>
                                                    <TableCell className="text-xs text-right font-mono">
                                                        {trade.mark_price ? `$${trade.mark_price.toFixed(2)}` : '-'}
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
                          )}
                        </Fragment>
                      );
                    })}
                    {groupedTrades.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                No trades assigned to this strategy yet.
                            </TableCell>
                        </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
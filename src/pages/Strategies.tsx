import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Plus, Trash2, TrendingUp, TrendingDown, Target, Eye, Tag, MoreHorizontal, Archive, RefreshCw, Pencil, Calculator } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Progress } from "@/components/ui/progress";

interface Strategy {
  id: string;
  name: string;
  description: string | null;
  capital_allocation: number;
  status: 'active' | 'closed';
  start_date: string;
  total_pnl: number;
  realized_pnl: number;
  trade_count: number;
  dashboard_tags?: any[];
}

export default function Strategies() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState<Strategy | null>(null);
  const [formData, setFormData] = useState({ name: "", description: "", capital_allocation: "0" });
  
  const queryClient = useQueryClient();

  // Fetch strategies joined with performance view
  const { data: strategies, isLoading: strategiesLoading } = useQuery({
    queryKey: ['strategies'],
    queryFn: async () => {
      // We join the base table with the performance view manually in client or via separate queries
      // Since Supabase views are read-only, we usually query the view for stats and table for metadata
      // For simplicity, we'll query the performance view and enrich it with table specific columns
      
      const { data: perfData, error: perfError } = await supabase
        .from('strategy_performance')
        .select('*')
        .order('realized_pnl', { ascending: false });
      
      if (perfError) throw perfError;

      const { data: metaData, error: metaError } = await supabase
        .from('strategies')
        .select('id, capital_allocation, status, start_date, is_hidden');

      if (metaError) throw metaError;

      // Merge data
      return perfData.map(p => {
        const meta = metaData.find(m => m.id === p.id);
        return {
          ...p,
          capital_allocation: meta?.capital_allocation || 0,
          status: meta?.status || 'active',
          start_date: meta?.start_date,
          is_hidden: meta?.is_hidden
        };
      });
    }
  });

  const { data: dashboardTags, isLoading: tagsLoading } = useQuery({
    queryKey: ['dashboardTags'],
    queryFn: async () => {
      const { data, error } = await supabase.from('tag_performance').select('*').eq('show_on_dashboard', true);
      if (error) throw error;
      return data;
    }
  });

  const strategiesWithTags = useMemo(() => {
    if (!strategies || !dashboardTags) return strategies;
    return strategies.map(strategy => ({
      ...strategy,
      dashboard_tags: dashboardTags.filter(tag => tag.strategy_id === strategy.id)
    }));
  }, [strategies, dashboardTags]);

  const activeStrategies = strategiesWithTags?.filter(s => s.status === 'active' && !s.is_hidden) || [];
  const closedStrategies = strategiesWithTags?.filter(s => s.status === 'closed' && !s.is_hidden) || [];

  // --- Mutations ---

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not found");
      
      const { error } = await supabase.from('strategies').insert({
        name: data.name,
        description: data.description,
        capital_allocation: parseFloat(data.capital_allocation) || 0,
        user_id: user.id
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['strategies'] });
      setIsCreateOpen(false);
      setFormData({ name: "", description: "", capital_allocation: "0" });
      showSuccess("Strategy created");
    },
    onError: (error) => showError(error.message)
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string, status: 'active' | 'closed' }) => {
      const { error } = await supabase.from('strategies').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['strategies'] });
      showSuccess("Strategy status updated");
    }
  });

  const updateStrategyMutation = useMutation({
    mutationFn: async (data: typeof formData & { id: string }) => {
      const { error } = await supabase.from('strategies').update({
        name: data.name,
        description: data.description,
        capital_allocation: parseFloat(data.capital_allocation) || 0
      }).eq('id', data.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['strategies'] });
      setIsEditOpen(false);
      showSuccess("Strategy updated");
    },
    onError: (error) => showError(error.message)
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => supabase.from('strategies').delete().eq('id', id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['strategies'] });
      showSuccess("Strategy deleted");
    }
  });

  // --- Handlers ---

  const handleCreate = () => {
    if (!formData.name) return showError("Name is required");
    createMutation.mutate(formData);
  };

  const handleEditSubmit = () => {
    if (!selectedStrategy) return;
    updateStrategyMutation.mutate({ ...formData, id: selectedStrategy.id });
  };

  const openEdit = (strategy: any) => {
    setSelectedStrategy(strategy);
    setFormData({
      name: strategy.name,
      description: strategy.description || "",
      capital_allocation: strategy.capital_allocation?.toString() || "0"
    });
    setIsEditOpen(true);
  };

  // --- Render Helpers ---

  const formatCurrency = (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

  const StrategyCard = ({ strategy }: { strategy: any }) => {
    const isTotalPositive = strategy.total_pnl >= 0;
    const roi = strategy.capital_allocation > 0 
      ? (strategy.total_pnl / strategy.capital_allocation) * 100 
      : 0;

    return (
      <Card className="flex flex-col h-full hover:shadow-md transition-shadow">
        <CardHeader className="pb-3">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <CardTitle className="text-lg flex items-center gap-2">
                {strategy.name}
                {strategy.status === 'closed' && <Badge variant="secondary" className="text-xs">Closed</Badge>}
              </CardTitle>
              <CardDescription className="line-clamp-1 text-xs">
                {strategy.description || "No description"}
              </CardDescription>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
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
                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => { if(confirm('Delete strategy? This cannot be undone.')) deleteMutation.mutate(strategy.id) }}>
                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        
        <CardContent className="flex-1 pb-4">
          {/* Main Metrics */}
          <div className="mb-4">
            <div className="text-sm text-muted-foreground mb-1">Total P&L</div>
            <div className="flex items-baseline gap-3">
              <span className={`text-3xl font-bold ${isTotalPositive ? 'text-green-500' : 'text-red-500'}`}>
                {formatCurrency(strategy.total_pnl)}
              </span>
              {strategy.capital_allocation > 0 && (
                 <Badge variant={roi >= 0 ? "default" : "destructive"} className={roi >= 0 ? "bg-green-500/15 text-green-600 hover:bg-green-500/25 border-green-200" : ""}>
                   {roi.toFixed(1)}% ROI
                 </Badge>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
            <div>
              <span className="text-muted-foreground block text-xs">Capital Allocated</span>
              <span className="font-medium">{formatCurrency(strategy.capital_allocation)}</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-xs">Total Trades</span>
              <span className="font-medium">{strategy.trade_count || 0}</span>
            </div>
          </div>

          {/* Dynamic Tag Widgets */}
          {strategy.dashboard_tags && strategy.dashboard_tags.length > 0 && (
            <div className="bg-muted/30 rounded-lg p-2.5 space-y-2">
              <div className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Target className="h-3 w-3" /> Breakdown
              </div>
              <div className="grid grid-cols-2 gap-2">
                {strategy.dashboard_tags.map((tag: any) => (
                  <div key={tag.tag_id} className="bg-background/80 p-2 rounded border shadow-sm">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider truncate mb-0.5" title={tag.tag_name}>
                      {tag.tag_name}
                    </div>
                    <div className={`text-sm font-bold font-mono ${tag.total_pnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
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

  const isLoading = strategiesLoading || tagsLoading;

  return (
    <DashboardLayout>
      <div className="space-y-8 pb-10">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Strategies</h2>
            <p className="text-muted-foreground">Manage your trading campaigns and track ROI.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => showSuccess("Benchmark sync feature coming soon.")}>
               Sync Benchmarks
            </Button>
            <Button onClick={() => { setFormData({ name: "", description: "", capital_allocation: "0" }); setIsCreateOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" /> New Strategy
            </Button>
          </div>
        </div>

        {/* Create Dialog */}
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Strategy</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} placeholder="e.g., TSLA Wheel" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cap">Allocated Capital ($)</Label>
                <Input id="cap" type="number" value={formData.capital_allocation} onChange={(e) => setFormData({...formData, capital_allocation: e.target.value})} placeholder="5000" />
                <p className="text-xs text-muted-foreground">Used to calculate ROI.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="desc">Description</Label>
                <Textarea id="desc" value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleCreate} disabled={createMutation.isPending}>Create Strategy</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Strategy</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Name</Label>
                <Input id="edit-name" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-cap">Allocated Capital ($)</Label>
                <Input id="edit-cap" type="number" value={formData.capital_allocation} onChange={(e) => setFormData({...formData, capital_allocation: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-desc">Description</Label>
                <Textarea id="edit-desc" value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleEditSubmit} disabled={updateStrategyMutation.isPending}>Save Changes</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {isLoading ? (
          <div className="text-center py-12">Loading strategies...</div>
        ) : (
          <>
            {/* Active Strategies Section */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                <h3 className="text-xl font-semibold">Active Strategies</h3>
                <Badge variant="outline" className="ml-2">{activeStrategies.length}</Badge>
              </div>
              
              {activeStrategies.length === 0 ? (
                <div className="text-center py-10 border border-dashed rounded-lg bg-muted/5">
                  <p className="text-muted-foreground">No active strategies found.</p>
                </div>
              ) : (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3">
                  {activeStrategies.map(strategy => (
                    <StrategyCard key={strategy.id} strategy={strategy} />
                  ))}
                </div>
              )}
            </div>

            <Separator />

            {/* Closed Strategies Section */}
            {closedStrategies.length > 0 && (
              <div className="space-y-4 opacity-80 hover:opacity-100 transition-opacity">
                <div className="flex items-center gap-2">
                  <Archive className="h-5 w-5 text-muted-foreground" />
                  <h3 className="text-xl font-semibold text-muted-foreground">Closed Strategies</h3>
                  <Badge variant="outline" className="ml-2">{closedStrategies.length}</Badge>
                </div>
                
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3">
                  {closedStrategies.map(strategy => (
                    <StrategyCard key={strategy.id} strategy={strategy} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Plus, Trash2, TrendingUp, TrendingDown, Target, ArrowRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { showSuccess, showError } from "@/utils/toast";
import { Badge } from "@/components/ui/badge";

export default function Strategies() {
  const [isOpen, setIsOpen] = useState(false);
  const [newStrategy, setNewStrategy] = useState({ name: "", description: "" });
  const queryClient = useQueryClient();

  // Fetch strategies with their trade stats
  const { data: strategies, isLoading } = useQuery({
    queryKey: ['strategies'],
    queryFn: async () => {
      // Get strategies
      const { data: strategiesData, error: strategiesError } = await supabase
        .from('strategies')
        .select('*')
        .order('created_at', { ascending: false });

      if (strategiesError) throw strategiesError;

      // Get trade aggregates per strategy
      // Note: In a larger app, we'd use a database view or RPC for this
      const { data: tradesData, error: tradesError } = await supabase
        .from('trades')
        .select('strategy_id, amount, action');

      if (tradesError) throw tradesError;

      // Combine data
      return strategiesData.map(strategy => {
        const strategyTrades = tradesData.filter(t => t.strategy_id === strategy.id);
        const totalPnL = strategyTrades.reduce((sum, t) => sum + Number(t.amount), 0);
        const tradeCount = strategyTrades.length;
        const isOpen = strategyTrades.length > 0 && !strategyTrades.every(t => t.action.includes('CLOSE') || t.action.includes('EXPIRE'));
        
        return {
          ...strategy,
          totalPnL,
          tradeCount,
          status: isOpen ? 'Open' : 'Closed'
        };
      });
    }
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; description: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not found");
      
      const { error } = await supabase.from('strategies').insert({
        ...data,
        user_id: user.id
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['strategies'] });
      setIsOpen(false);
      setNewStrategy({ name: "", description: "" });
      showSuccess("Strategy created successfully");
    },
    onError: (error) => {
      showError(error.message);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('strategies').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['strategies'] });
      showSuccess("Strategy deleted");
    }
  });

  const handleCreate = () => {
    if (!newStrategy.name) {
      showError("Strategy name is required");
      return;
    }
    createMutation.mutate(newStrategy);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Strategies</h2>
            <p className="text-muted-foreground">Group your trades to track specific campaigns.</p>
          </div>
          
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" /> New Strategy
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Strategy</DialogTitle>
                <DialogDescription>
                  Create a container to group related trades (e.g., "Iron Condor AAPL").
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Name</Label>
                  <Input 
                    id="name" 
                    placeholder="e.g. SPY Wheel Strategy" 
                    value={newStrategy.name}
                    onChange={(e) => setNewStrategy({ ...newStrategy, name: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="desc">Description (Optional)</Label>
                  <Textarea 
                    id="desc" 
                    placeholder="Notes about this strategy..."
                    value={newStrategy.description}
                    onChange={(e) => setNewStrategy({ ...newStrategy, description: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
                <Button onClick={handleCreate} disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Creating..." : "Create"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="text-center py-10">Loading strategies...</div>
        ) : strategies?.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 border border-dashed rounded-lg bg-muted/10 text-center">
            <Target className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">No Strategies Yet</h3>
            <p className="text-muted-foreground max-w-sm mb-4">
              Create a strategy to start grouping your trades and tracking P&L for specific setups.
            </p>
            <Button onClick={() => setIsOpen(true)}>Create Your First Strategy</Button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {strategies?.map((strategy) => (
              <Card key={strategy.id} className="flex flex-col">
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg">{strategy.name}</CardTitle>
                      <CardDescription className="line-clamp-1 mt-1">
                        {strategy.description || "No description"}
                      </CardDescription>
                    </div>
                    {strategy.totalPnL >= 0 ? (
                      <TrendingUp className="h-5 w-5 text-green-500" />
                    ) : (
                      <TrendingDown className="h-5 w-5 text-red-500" />
                    )}
                  </div>
                </CardHeader>
                <CardContent className="pb-2 flex-1">
                  <div className="grid grid-cols-2 gap-4 mt-2">
                    <div>
                      <p className="text-xs text-muted-foreground">Net P&L</p>
                      <p className={`text-xl font-bold ${strategy.totalPnL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(strategy.totalPnL)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Trades</p>
                      <p className="text-xl font-bold">{strategy.tradeCount}</p>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="pt-4 border-t flex justify-between">
                   <div className="flex gap-2">
                      {/* Placeholder for status logic */}
                      <Badge variant="secondary">{strategy.status}</Badge>
                   </div>
                   <div className="flex gap-2">
                     <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => {
                        if(confirm('Are you sure? This will unlink all trades from this strategy.')) {
                          deleteMutation.mutate(strategy.id);
                        }
                     }}>
                        <Trash2 className="h-4 w-4" />
                     </Button>
                     <Button variant="ghost" size="icon">
                        <ArrowRight className="h-4 w-4" />
                     </Button>
                   </div>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
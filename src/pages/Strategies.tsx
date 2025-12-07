import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Plus, Trash2, TrendingUp, TrendingDown, Target, Eye, Tag } from "lucide-react";
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
import { Separator } from "@/components/ui/separator";

export default function Strategies() {
  const [isOpen, setIsOpen] = useState(false);
  const [newStrategy, setNewStrategy] = useState({ name: "", description: "" });
  const queryClient = useQueryClient();

  const { data: strategies, isLoading: strategiesLoading } = useQuery({
    queryKey: ['strategies'],
    queryFn: async () => {
      const { data, error } = await supabase.from('strategy_performance').select('*').order('realized_pnl', { ascending: false });
      if (error) throw error;
      return data;
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

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; description: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not found");
      const { error } = await supabase.from('strategies').insert({ ...data, user_id: user.id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['strategies'] });
      setIsOpen(false);
      setNewStrategy({ name: "", description: "" });
      showSuccess("Strategy created");
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

  const handleCreate = () => {
    if (!newStrategy.name) {
      showError("Strategy name is required");
      return;
    }
    createMutation.mutate(newStrategy);
  };

  const isLoading = strategiesLoading || tagsLoading;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Strategies</h2>
            <p className="text-muted-foreground">Group your trades to track specific campaigns.</p>
          </div>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>{/* ... Dialog ... */}</Dialog>
        </div>

        {isLoading ? <div className="text-center py-10">Loading...</div> : strategiesWithTags?.length === 0 ? (
          <div className="text-center p-12 border-dashed rounded-lg bg-muted/10"><Target className="h-12 w-12 text-muted-foreground mx-auto mb-4" /><h3 className="text-lg font-medium">No Strategies Yet</h3><p className="text-muted-foreground max-w-sm mx-auto mb-4">Create a strategy to start grouping trades.</p><Button onClick={() => setIsOpen(true)}>Create First Strategy</Button></div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {strategiesWithTags?.map((strategy) => {
              const isTotalPositive = strategy.total_pnl >= 0;
              const unrealizedPnl = strategy.total_pnl - strategy.realized_pnl;
              return (
                <Card key={strategy.id} className="flex flex-col">
                  <CardHeader className="pb-4">
                    <div className="flex justify-between items-start">
                      <div><CardTitle className="text-lg">{strategy.name}</CardTitle><CardDescription className="line-clamp-1 mt-1">{strategy.description || "No description"}</CardDescription></div>
                      {isTotalPositive ? <TrendingUp className="h-5 w-5 text-green-500" /> : <TrendingDown className="h-5 w-5 text-red-500" />}
                    </div>
                  </CardHeader>
                  <CardContent className="pb-4 flex-1">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <p className="text-xs text-muted-foreground">Total P&L (Unrealized)</p>
                            <p className={`text-2xl font-bold ${isTotalPositive ? 'text-green-500' : 'text-red-500'}`}>{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(strategy.total_pnl)}</p>
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground">Realized P&L</p>
                            <p className="text-lg font-semibold">{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(strategy.realized_pnl)}</p>
                        </div>
                    </div>
                    {strategy.dashboard_tags && strategy.dashboard_tags.length > 0 && (
                      <>
                        <Separator className="my-4" />
                        <div className="space-y-3">
                          {strategy.dashboard_tags.map(tag => (
                            <div key={tag.tag_id} className="flex justify-between items-center">
                              <div className="flex items-center gap-2"><Tag className="h-4 w-4 text-muted-foreground" /><span className="text-sm font-medium">{tag.tag_name}</span></div>
                              <span className={`text-sm font-bold ${tag.total_pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(tag.total_pnl)}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </CardContent>
                  <CardFooter className="pt-4 border-t flex justify-between items-center">
                    <Badge variant="secondary">{strategy.trade_count} Closed Trades</Badge>
                    <div className="flex gap-2">
                      <Button asChild variant="outline" size="sm"><Link to={`/strategies/${strategy.id}`}><Eye className="mr-2 h-4 w-4" /> View</Link></Button>
                      <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => { if(confirm('Are you sure?')) { deleteMutation.mutate(strategy.id); }}}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
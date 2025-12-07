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
import { Loader2, Save, Plus, ArrowLeft, Unlink, Search, Tag, Trash2, Settings, Eye, EyeOff, Calculator } from "lucide-react";
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

interface Trade {
  id: string;
  date: string;
  symbol: string;
  action: string;
  amount: number;
  tag_id: string | null;
}

interface Tag {
  id: string;
  name: string;
  show_on_dashboard: boolean;
}

export default function StrategyDetail() {
  const { strategyId } = useParams<{ strategyId: string }>();
  const queryClient = useQueryClient();
  const [isAddTradesOpen, setIsAddTradesOpen] = useState(false);
  const [selectedUnassigned, setSelectedUnassigned] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [newTagName, setNewTagName] = useState("");
  const [selectedAssigned, setSelectedAssigned] = useState<string[]>([]);

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
      const { data, error } = await supabase.from('trades').select('id, date, symbol, action, amount, tag_id').eq('strategy_id', strategyId!).order('date', { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  const { data: unassignedTrades } = useQuery<Trade[]>({
    queryKey: ['unassignedTrades'],
    queryFn: async () => {
      const { data, error } = await supabase.from('trades').select('id, date, symbol, action, amount, tag_id').is('strategy_id', null).order('date', { ascending: false });
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

  const updateTradeTagMutation = useMutation({
    mutationFn: ({ tradeIds, tagId }: { tradeIds: string[], tagId: string | null }) => supabase.from('trades').update({ tag_id: tagId }).in('id', tradeIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignedTrades', strategyId] });
      showSuccess("Trade(s) updated.");
      setSelectedAssigned([]);
    },
    onError: (err) => showError(err.message)
  });

  // --- HANDLERS ---
  const handleSave = () => updateStrategyMutation.mutate(formState);
  const handleAddSelected = () => assignTradesMutation.mutate(selectedUnassigned);
  const handleCreateTag = () => {
    if (newTagName.trim()) createTagMutation.mutate(newTagName.trim());
  };

  const filteredUnassignedTrades = useMemo(() => unassignedTrades?.filter(t => t.symbol.toLowerCase().includes(searchTerm.toLowerCase())), [unassignedTrades, searchTerm]);
  const groupedAssignedTrades = useMemo(() => {
    if (!assignedTrades) return {};
    const groups: Record<string, Trade[]> = { 'untagged': [] };
    tags?.forEach(tag => groups[tag.id] = []);
    
    assignedTrades.forEach(trade => {
      const key = trade.tag_id || 'untagged';
      if (groups[key]) {
        groups[key].push(trade);
      } else {
        groups['untagged'].push(trade);
      }
    });
    return groups;
  }, [assignedTrades, tags]);

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
                {tags?.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No tags yet. Create one to organize trades.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div><CardTitle>Assigned Trades</CardTitle><CardDescription>Trades in this strategy, grouped by tag.</CardDescription></div>
            <div className="flex gap-2">
              {selectedAssigned.length > 0 && (
                <Select onValueChange={(tagId) => updateTradeTagMutation.mutate({ tradeIds: selectedAssigned, tagId: tagId === 'none' ? null : tagId })}>
                  <SelectTrigger className="w-[180px]"><SelectValue placeholder="Assign Tag..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Untag</SelectItem>
                    {tags?.map(tag => <SelectItem key={tag.id} value={tag.id}>{tag.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
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
                            {filteredUnassignedTrades?.length === 0 && <TableRow><TableCell colSpan={5} className="text-center h-24 text-muted-foreground">No unassigned trades found.</TableCell></TableRow>}
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
              <div className="space-y-6">
                {Object.entries(groupedAssignedTrades).map(([tagId, trades]) => {
                  if (trades.length === 0) return null;
                  const tagName = tagId === 'untagged' ? 'Untagged' : tags?.find(t => t.id === tagId)?.name;
                  return (
                    <div key={tagId}>
                      <h4 className="font-semibold mb-2 flex items-center gap-2">
                        {tagId !== 'untagged' && <Tag className="h-4 w-4 text-muted-foreground" />}
                        {tagName} 
                        <Badge variant="secondary" className="ml-2 text-xs">{trades.length}</Badge>
                      </h4>
                      <div className="border rounded-md overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-12"><Checkbox onCheckedChange={(checked) => setSelectedAssigned(p => checked ? [...p, ...trades.map(t => t.id)] : p.filter(id => !trades.map(t => t.id).includes(id)))} /></TableHead>
                              <TableHead>Date</TableHead><TableHead>Symbol</TableHead><TableHead>Action</TableHead><TableHead className="text-right">Amount</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {trades.map(trade => (
                              <TableRow key={trade.id} data-state={selectedAssigned.includes(trade.id) && "selected"}>
                                <TableCell><Checkbox checked={selectedAssigned.includes(trade.id)} onCheckedChange={(checked) => setSelectedAssigned(p => checked ? [...p, trade.id] : p.filter(id => id !== trade.id))} /></TableCell>
                                <TableCell>{format(new Date(trade.date), 'MMM d, yyyy')}</TableCell>
                                <TableCell><Badge variant="outline" className="font-mono">{trade.symbol}</Badge></TableCell>
                                <TableCell>{trade.action}</TableCell>
                                <TableCell className={`text-right font-bold ${trade.amount >= 0 ? 'text-green-500' : 'text-red-500'}`}>{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(trade.amount)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
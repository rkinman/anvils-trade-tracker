import { useState } from "react";
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
import { Search, Filter, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { showSuccess, showError } from "@/utils/toast";

export default function TradeHistory() {
  const [searchTerm, setSearchTerm] = useState("");
  const queryClient = useQueryClient();

  // Fetch Trades
  const { data: trades, isLoading: tradesLoading } = useQuery({
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
      return data;
    }
  });

  // Fetch Strategies for the dropdown
  const { data: strategies } = useQuery({
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

  // Mutation to update strategy
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
      queryClient.invalidateQueries({ queryKey: ['strategies'] }); // Refresh strategy stats too
      showSuccess("Trade updated");
    },
    onError: (err) => {
      showError(err.message);
    }
  });

  const handleStrategyChange = (tradeId: string, value: string) => {
    const strategyId = value === "none" ? null : value;
    updateStrategyMutation.mutate({ tradeId, strategyId });
  };

  const filteredTrades = trades?.filter(trade => 
    trade.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
    trade.action.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Trade History</h2>
          <p className="text-muted-foreground">View all transactions and assign them to strategies.</p>
        </div>

        <div className="flex items-center gap-4">
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
          <Button variant="outline">
            <Filter className="mr-2 h-4 w-4" /> Filter
          </Button>
        </div>

        <div className="border rounded-md bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Symbol</TableHead>
                <TableHead>Action</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Strategy</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tradesLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-10">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : filteredTrades?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                    No trades found. Import some data to get started.
                  </TableCell>
                </TableRow>
              ) : (
                filteredTrades?.map((trade) => (
                  <TableRow key={trade.id}>
                    <TableCell className="font-medium">
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
                    <TableCell className="text-right">${Number(trade.price).toFixed(2)}</TableCell>
                    <TableCell className={`text-right font-bold ${
                      Number(trade.amount) >= 0 ? "text-green-500" : "text-red-500"
                    }`}>
                      {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(trade.amount)}
                    </TableCell>
                    <TableCell>
                      <Select 
                        defaultValue={trade.strategy_id || "none"} 
                        onValueChange={(val) => handleStrategyChange(trade.id, val)}
                      >
                        <SelectTrigger className="w-[180px] h-8">
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
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </DashboardLayout>
  );
}
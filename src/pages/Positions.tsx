import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Upload, CheckCircle, AlertCircle, Loader2, Info } from "lucide-react";
import { parsePositionsCSV } from "@/utils/positionsCsvParser";
import { parseSymbolToCanonical as parseTradeSymbol } from "@/utils/csvParser"; // Use the trade symbol parser
import { supabase } from "@/integrations/supabase/client";
import { showSuccess, showError } from "@/utils/toast";

export default function Positions() {
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<{ matched: number; unmatched: number } | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setStats(null);

    try {
      // 1. Parse the uploaded positions CSV
      const parsedPositions = await parsePositionsCSV(file);
      const positionsMap = new Map(parsedPositions.map(p => [p.canonicalSymbol, p]));

      // 2. Fetch all open trades from the database
      const { data: openTrades, error: fetchError } = await supabase
        .from('trades')
        .select('*')
        .is('pair_id', null)
        .like('action', '%OPEN%');

      if (fetchError) throw fetchError;

      // 3. Match trades to positions and prepare updates
      const updates: { id: string; mark_price: number }[] = [];
      const matchedTradeIds = new Set<string>();

      for (const trade of openTrades) {
        const tradeCanonical = parseTradeSymbol(trade.symbol, trade.asset_type);
        const position = positionsMap.get(tradeCanonical);

        if (position) {
          updates.push({
            id: trade.id,
            mark_price: position.mark,
          });
          matchedTradeIds.add(trade.id);
        }
      }
      
      // Also clear mark_price for any open trades NOT in the positions file (they've been closed)
      const tradesToClear = openTrades.filter(t => !matchedTradeIds.has(t.id) && t.mark_price !== null);
      for (const trade of tradesToClear) {
        updates.push({ id: trade.id, mark_price: null! });
      }

      // 4. Batch update the trades table
      if (updates.length > 0) {
        const { error: updateError } = await supabase.from('trades').upsert(updates);
        if (updateError) throw updateError;
      }

      // 5. Set stats for UI feedback
      const matchedCount = new Set(updates.map(u => u.id)).size;
      setStats({
        matched: matchedCount,
        unmatched: openTrades.length - matchedCount,
      });

      showSuccess(`Successfully updated ${matchedCount} open positions.`);

    } catch (error: any) {
      console.error(error);
      showError(error.message || "Failed to process positions file.");
    } finally {
      setLoading(false);
      if (e.target) e.target.value = ""; // Reset file input
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Update Open Positions</h2>
          <p className="text-muted-foreground">Upload your open positions CSV to calculate unrealized P&L.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Upload Positions CSV</CardTitle>
            <CardDescription>
              This updates the "Mark Price" for your open trades to reflect current market values.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center p-10 border-2 border-dashed rounded-xl">
              <div className="mb-4 p-4 bg-primary/10 rounded-full"><Upload className="h-8 w-8 text-primary" /></div>
              <h3 className="text-lg font-medium mb-2">Upload your Positions File</h3>
              <p className="text-sm text-muted-foreground mb-6 text-center max-w-sm">
                The system will automatically match positions to open trades and update P&L.
              </p>
              <Input id="positions-upload" type="file" accept=".csv" className="hidden" onChange={handleFileUpload} disabled={loading} />
              <Button asChild disabled={loading} size="lg">
                <label htmlFor="positions-upload" className="cursor-pointer">
                  {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processing...</> : "Select Positions CSV"}
                </label>
              </Button>
            </div>

            {stats && (
              <div className="mt-6 grid gap-4">
                <Alert>
                  <CheckCircle className="h-4 w-4" />
                  <AlertTitle>Processing Complete</AlertTitle>
                  <AlertDescription>
                    <p>{stats.matched} open positions were updated with the latest market prices.</p>
                    <p>{stats.unmatched} previously open positions were not in the file and are now considered closed.</p>
                  </AlertDescription>
                </Alert>
              </div>
            )}
             <Alert className="mt-6" variant="default">
                <Info className="h-4 w-4" />
                <AlertTitle>How it Works</AlertTitle>
                <AlertDescription>
                  Any open trade in your history that is NOT in the uploaded positions file will have its unrealized P&L reset to zero, as it's assumed to be closed.
                </AlertDescription>
              </Alert>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
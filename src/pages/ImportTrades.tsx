import { useState, useRef } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Upload, FileText, CheckCircle, AlertCircle, Loader2, Info, TrendingUp } from "lucide-react";
import { parseTradeCSV } from "@/utils/csvParser";
import { parsePositionsCSV } from "@/utils/positionsCsvParser";
import { parseSymbolToCanonical as parseTradeSymbol } from "@/utils/csvParser";
import { supabase } from "@/integrations/supabase/client";
import { showSuccess, showError } from "@/utils/toast";

export default function ImportTrades() {
  // State for Trade Imports
  const [tradeLoading, setTradeLoading] = useState(false);
  const [tradeStats, setTradeStats] = useState<{ total: number; inserted: number; duplicates: number } | null>(null);
  const tradeFileInputRef = useRef<HTMLInputElement>(null);

  // State for Position Imports
  const [positionLoading, setPositionLoading] = useState(false);
  const [positionStats, setPositionStats] = useState<{ matched: number; unmatched: number; updated: number } | null>(null);
  const positionFileInputRef = useRef<HTMLInputElement>(null);

  const handleTradeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setTradeLoading(true);
    setTradeStats(null);

    try {
      const trades = await parseTradeCSV(file);
      if (trades.length === 0) throw new Error("No valid trades found in CSV.");

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      let insertedCount = 0;
      let duplicateCount = 0;

      for (const trade of trades) {
        const { error } = await supabase.from('trades').insert({ ...trade, user_id: user.id });
        if (error) {
          if (error.code === '23505') duplicateCount++;
          else console.error("Error inserting trade:", error);
        } else {
          insertedCount++;
        }
      }

      setTradeStats({ total: trades.length, inserted: insertedCount, duplicates: duplicateCount });
      if (insertedCount > 0) showSuccess(`Successfully imported ${insertedCount} trades!`);
      else if (duplicateCount > 0) showSuccess("Import complete. No new trades found.");

    } catch (error: any) {
      console.error(error);
      showError(error.message || "Failed to import trades.");
    } finally {
      setTradeLoading(false);
      if (tradeFileInputRef.current) tradeFileInputRef.current.value = "";
    }
  };

  const handlePositionUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPositionLoading(true);
    setPositionStats(null);

    try {
      console.log("📊 Starting position upload...");
      
      // 1. Parse the "Snapshot" CSV
      const parsedPositions = await parsePositionsCSV(file);
      console.log(`✅ Parsed ${parsedPositions.length} positions from CSV`);
      
      const positionsMap = new Map(parsedPositions.map(p => [p.canonicalSymbol, p]));

      // 2. Fetch all currently "Open" trades from the database ledger
      const { data: openTrades, error: fetchError } = await supabase
        .from('trades')
        .select('*')
        .is('pair_id', null)
        .like('action', '%OPEN%');
      
      if (fetchError) throw fetchError;
      console.log(`📋 Found ${openTrades?.length || 0} open trades in database`);

      const updates: { id: string; mark_price: number | null }[] = [];
      const matchedTradeIds = new Set<string>();
      let matchCount = 0;

      // 3. Match Logic - Match open trades with positions
      for (const trade of openTrades || []) {
        const tradeCanonical = parseTradeSymbol(trade.symbol, trade.asset_type);
        const position = positionsMap.get(tradeCanonical);
        
        console.log(`🔍 Checking trade: ${trade.symbol} (${tradeCanonical})`);
        
        if (position) {
          console.log(`✅ MATCH FOUND! Mark: $${position.mark}`);
          updates.push({ 
            id: trade.id, 
            mark_price: position.mark
          });
          matchedTradeIds.add(trade.id);
          matchCount++;
        } else {
          console.log(`❌ No position found for ${tradeCanonical}`);
        }
      }
      
      // 4. Ghost Logic (Clear missing positions)
      const tradesToClear = (openTrades || []).filter(t => !matchedTradeIds.has(t.id) && (t.mark_price !== null));
      console.log(`🧹 Clearing ${tradesToClear.length} positions no longer in snapshot`);
      
      for (const trade of tradesToClear) {
        updates.push({ 
          id: trade.id, 
          mark_price: null
        });
      }

      // 5. Execute Updates
      console.log(`💾 Executing ${updates.length} database updates...`);
      
      if (updates.length > 0) {
        let successCount = 0;
        let failCount = 0;
        let firstError = null;

        for (const update of updates) {
            const { error } = await supabase
              .from('trades')
              .update({ 
                mark_price: update.mark_price
              })
              .eq('id', update.id);
            
            if (error) {
                console.error("❌ Update failed for ID:", update.id, error);
                failCount++;
                if (!firstError) firstError = error;
            } else {
                successCount++;
            }
        }

        console.log(`✅ Successfully updated ${successCount} trades`);
        
        if (failCount > 0) {
            console.error("⚠️ Failed updates:", failCount);
            throw new Error(`Failed to update ${failCount} positions. First error: ${firstError?.message}`);
        }
      }

      const unmatchedCount = (openTrades?.length || 0) - matchCount;
      setPositionStats({ matched: matchCount, unmatched: unmatchedCount, updated: updates.length });
      
      showSuccess(`✅ Updated ${matchCount} positions. Cleared ${tradesToClear.length} closed positions.`);
      
      console.log("🎉 Position upload complete!");

    } catch (error: any) {
      console.error("💥 Position upload error:", error);
      showError(error.message || "Failed to process positions file.");
    } finally {
      setPositionLoading(false);
      if (positionFileInputRef.current) positionFileInputRef.current.value = "";
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Import Data</h2>
          <p className="text-muted-foreground">Upload your broker's CSV files to track your performance.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Upload Transactions CSV</CardTitle>
            <CardDescription>Supports standard broker formats. Duplicates are automatically detected and skipped.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center p-10 border-2 border-dashed rounded-xl hover:bg-muted/50 transition-colors">
              <div className="mb-4 p-4 bg-primary/10 rounded-full"><Upload className="h-8 w-8 text-primary" /></div>
              <h3 className="text-lg font-medium mb-2">Upload Transactions</h3>
              <p className="text-sm text-muted-foreground mb-6">Select your transactions.csv file.</p>
              <Input ref={tradeFileInputRef} type="file" accept=".csv" className="hidden" onChange={handleTradeUpload} id="csv-upload" disabled={tradeLoading} />
              <Button asChild disabled={tradeLoading} size="lg">
                <label htmlFor="csv-upload" className="cursor-pointer">
                  {tradeLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processing...</> : "Select CSV File"}
                </label>
              </Button>
            </div>
            {tradeStats && (
              <div className="mt-6 grid gap-4">
                <Alert variant={tradeStats.inserted > 0 ? "default" : "destructive"} className="bg-muted/50">
                  <FileText className="h-4 w-4" /><AlertTitle>Import Summary</AlertTitle><AlertDescription>Processed {tradeStats.total} rows.</AlertDescription>
                </Alert>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    <div><p className="text-2xl font-bold text-green-500">{tradeStats.inserted}</p><p className="text-xs text-muted-foreground">New Trades</p></div>
                  </div>
                  <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg flex items-center gap-3">
                    <AlertCircle className="h-5 w-5 text-yellow-500" />
                    <div><p className="text-2xl font-bold text-yellow-500">{tradeStats.duplicates}</p><p className="text-xs text-muted-foreground">Duplicates Skipped</p></div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Update Open Positions</CardTitle>
            <CardDescription>Upload your open positions CSV (Snapshot) to sync P&L.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center p-10 border-2 border-dashed rounded-xl hover:bg-muted/50 transition-colors">
              <div className="mb-4 p-4 bg-primary/10 rounded-full"><TrendingUp className="h-8 w-8 text-primary" /></div>
              <h3 className="text-lg font-medium mb-2">Upload Positions</h3>
              <p className="text-sm text-muted-foreground mb-6">Select your positions.csv file.</p>
              <Input ref={positionFileInputRef} id="positions-upload" type="file" accept=".csv" className="hidden" onChange={handlePositionUpload} disabled={positionLoading} />
              <Button asChild disabled={positionLoading} size="lg">
                <label htmlFor="positions-upload" className="cursor-pointer">
                  {positionLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processing...</> : "Select Positions CSV"}
                </label>
              </Button>
            </div>
            {positionStats && (
              <div className="mt-6 grid gap-4">
                <Alert><CheckCircle className="h-4 w-4" /><AlertTitle>Processing Complete</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc list-inside space-y-1 mt-2">
                      <li><strong>{positionStats.matched}</strong> positions matched and updated with current prices.</li>
                      <li><strong>{positionStats.unmatched}</strong> open trades not found in snapshot (may be closed).</li>
                      <li><strong>{positionStats.updated}</strong> total database updates performed.</li>
                    </ul>
                  </AlertDescription>
                </Alert>
              </div>
            )}
            <Alert className="mt-6" variant="default">
              <Info className="h-4 w-4" /><AlertTitle>How It Works</AlertTitle>
              <AlertDescription>
                This upload acts as a <strong>snapshot</strong> of your current positions. The system will:
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li>Match positions by symbol and update their current market prices</li>
                  <li>Calculate unrealized P&L automatically</li>
                  <li>Clear mark prices for positions no longer in the snapshot</li>
                </ul>
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
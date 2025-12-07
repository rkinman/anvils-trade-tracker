import { useState, useRef } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Upload, FileText, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { parseTradeCSV, ParsedTrade } from "@/utils/csvParser";
import { supabase } from "@/integrations/supabase/client";
import { showSuccess, showError } from "@/utils/toast";

export default function ImportTrades() {
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<{ total: number; inserted: number; duplicates: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setStats(null);

    try {
      // 1. Parse CSV
      const trades = await parseTradeCSV(file);
      
      if (trades.length === 0) {
        throw new Error("No valid trades found in CSV.");
      }

      // 2. Get User ID
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      let insertedCount = 0;
      let duplicateCount = 0;

      // 3. Insert in batches to handle duplicate errors gracefully row by row
      // We do this to count duplicates accurately instead of one big fail
      // For large files, we might batch this differently, but for personal trading, loop is fine.
      
      for (const trade of trades) {
        const { error } = await supabase
          .from('trades')
          .insert({
            ...trade,
            user_id: user.id
          });

        if (error) {
          // Check for unique constraint violation (code 23505 for Postgres)
          if (error.code === '23505') {
            duplicateCount++;
          } else {
            console.error("Error inserting trade:", error);
          }
        } else {
          insertedCount++;
        }
      }

      setStats({
        total: trades.length,
        inserted: insertedCount,
        duplicates: duplicateCount
      });

      if (insertedCount > 0) {
        showSuccess(`Successfully imported ${insertedCount} trades!`);
      } else if (duplicateCount > 0) {
        showSuccess("Import complete. No new trades found (all duplicates).");
      }

    } catch (error: any) {
      console.error(error);
      showError(error.message || "Failed to import trades.");
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Import Trades</h2>
          <p className="text-muted-foreground">Upload your broker's CSV file to track your performance.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Upload Transactions CSV</CardTitle>
            <CardDescription>
              Supports standard broker formats. Duplicates are automatically detected and skipped.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center p-10 border-2 border-dashed border-muted-foreground/25 rounded-xl bg-muted/5 hover:bg-muted/10 transition-colors">
              <div className="mb-4 p-4 bg-primary/10 rounded-full">
                <Upload className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-lg font-medium mb-2">Click to Upload</h3>
              <p className="text-sm text-muted-foreground mb-6 text-center max-w-sm">
                Select your transactions.csv file. The parser will handle Buy/Sell actions and Open/Close designations.
              </p>
              
              <Input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileUpload}
                id="csv-upload"
                disabled={loading}
              />
              
              <Button asChild disabled={loading} size="lg">
                <label htmlFor="csv-upload" className="cursor-pointer">
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    "Select CSV File"
                  )}
                </label>
              </Button>
            </div>

            {stats && (
              <div className="mt-6 grid gap-4">
                <Alert variant={stats.inserted > 0 ? "default" : "destructive"} className="bg-muted/50">
                  <FileText className="h-4 w-4" />
                  <AlertTitle>Import Summary</AlertTitle>
                  <AlertDescription>
                    Processed {stats.total} rows.
                  </AlertDescription>
                </Alert>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    <div>
                      <p className="text-2xl font-bold text-green-500">{stats.inserted}</p>
                      <p className="text-xs text-muted-foreground">New Trades</p>
                    </div>
                  </div>
                  
                  <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg flex items-center gap-3">
                    <AlertCircle className="h-5 w-5 text-yellow-500" />
                    <div>
                      <p className="text-2xl font-bold text-yellow-500">{stats.duplicates}</p>
                      <p className="text-xs text-muted-foreground">Duplicates Skipped</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
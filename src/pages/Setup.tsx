import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createClient } from "@supabase/supabase-js";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  CheckCircle, AlertCircle, Database, Server, Key, Loader2,
  Copy, ExternalLink, ArrowRight, Terminal, Sparkles, Wrench
} from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";
import { toast } from "sonner";
import { executeSqlViaManagementApi, fetchSchemaContent, getProjectRefFromUrl } from "@/utils/setupHelpers";

type SetupMode = "selection" | "manual" | "auto";
type Step = "credentials" | "schema" | "finish";

export default function Setup() {
  const [mode, setMode] = useState<SetupMode>("selection");
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const [accessToken, setAccessToken] = useState("");

  // Status states
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("credentials");

  const navigate = useNavigate();
  const { theme } = useTheme();

  useEffect(() => {
    const storedUrl = localStorage.getItem("supabase_url");
    const storedKey = localStorage.getItem("supabase_key");
    if (storedUrl) setUrl(storedUrl);
    if (storedKey) setKey(storedKey);
  }, []);

  // --- Handlers ---

  const handleConnect = async () => {
    setIsChecking(true);
    setError(null);

    try {
      if (!url || !key) throw new Error("Please enter both URL and Anon Key.");
      if (!url.startsWith("https://")) throw new Error("URL must start with https://");

      // 1. Verify credentials work
      const tempClient = createClient(url, key);
      const { error: authError } = await tempClient.auth.getSession();

      if (authError && authError.message !== "Auth session missing!") {
        console.warn("Auth check warning:", authError);
      }

      // 2. Save to local storage
      localStorage.setItem("supabase_url", url);
      localStorage.setItem("supabase_key", key);

      toast.success("Connected to Supabase!");

      // 3. Routing based on mode
      if (mode === "auto") {
        await handleAutoSetup();
      } else {
        setStep("schema");
      }

    } catch (err: any) {
      setError(err.message || "Failed to connect to Supabase.");
    } finally {
      setIsChecking(false);
    }
  };

  const handleAutoSetup = async () => {
    try {
      if (!accessToken) throw new Error("Personal Access Token is required for auto-setup.");

      const projectRef = getProjectRefFromUrl(url);
      if (!projectRef) throw new Error("Could not parse Project Ref from URL.");

      toast.info("Fetching schema...");
      const schemaSql = await fetchSchemaContent();

      toast.info("Executing SQL via Management API...");
      await executeSqlViaManagementApi(projectRef, accessToken, schemaSql);

      toast.success("Database initialized successfully!");
      setStep("finish");

    } catch (err: any) {
      console.error(err);
      setError(`Auto-setup failed: ${err.message}. You may need to use Manual Mode if CORS blocks this request.`);
      // Stay on credentials step but show error
    }
  };

  const handleFinish = () => {
    window.location.href = "/";
  };

  const copySchema = async () => {
    try {
      const text = await fetchSchemaContent();
      await navigator.clipboard.writeText(text);
      toast.success("SQL Schema copied to clipboard!");
    } catch (e) {
      toast.error("Failed to load schema file.");
    }
  };

  // --- Render Steps ---

  if (mode === "selection") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-background">
        <div className="w-full max-w-3xl space-y-8 animate-in fade-in zoom-in duration-500">
          <div className="text-center space-y-2">
            <h1 className="text-4xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-purple-400">
              Welcome to TradeTracker
            </h1>
            <p className="text-muted-foreground text-lg">
              Choose how you want to set up your environment.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Auto Option */}
            <Card
              className="relative cursor-pointer hover:border-primary transition-all hover:shadow-lg border-2 border-primary/20 bg-gradient-to-br from-background to-primary/5"
              onClick={() => setMode("auto")}
            >
              <div className="absolute -top-3 -right-3 bg-primary text-primary-foreground text-xs px-3 py-1 rounded-full shadow-sm font-semibold">
                RECOMMENDED
              </div>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  Automatic Setup
                </CardTitle>
                <CardDescription>
                  Best for Personal Use
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-muted-foreground">
                <p>
                  We will connect to Supabase and create the tables for you automatically.
                </p>
                <ul className="space-y-2">
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span>Fastest setup (2 mins)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span>Hands-free table creation</span>
                  </li>
                </ul>
              </CardContent>
            </Card>

            {/* Manual Option */}
            <Card
              className="cursor-pointer hover:border-primary transition-all hover:shadow-lg border-2"
              onClick={() => setMode("manual")}
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wrench className="h-5 w-5 text-muted-foreground" />
                  Manual Setup
                </CardTitle>
                <CardDescription>
                  Best for Control / Security
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-muted-foreground">
                <p>
                  You will copy the SQL schema and run it yourself in the Supabase Dashboard.
                </p>
                <ul className="space-y-2">
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-muted-foreground" />
                    <span>No Access Token needed</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-muted-foreground" />
                    <span>Learn how the DB works</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // --- Main Setup Form (Shared UI for Creds) ---

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-background">
      <div className="w-full max-w-2xl space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

        <Button
          variant="ghost"
          className="absolute top-4 left-4"
          onClick={() => { setMode("selection"); setStep("credentials"); setError(null); }}
        >
          &larr; Back to Selection
        </Button>

        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">
            {mode === "auto" ? "Automatic Setup" : "Manual Setup"}
          </h1>
          <p className="text-muted-foreground">
            {step === "credentials"
              ? "Let's connect to your database."
              : step === "schema"
                ? "Initialize the database tables."
                : "You are ready to go!"}
          </p>
        </div>

        <Card className="border-2 shadow-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5 text-primary" />
              {step === "credentials" ? "Connection Details" : step === "schema" ? "Run SQL Migration" : "Complete"}
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-6">

            {/* --- STEP 1: CREDENTIALS --- */}
            {step === "credentials" && (
              <>
                <div className="bg-secondary/30 p-4 rounded-lg border border-dashed border-secondary-foreground/20 flex justify-between items-center">
                  <div className="text-sm">
                    <span className="font-semibold block">Need a project?</span>
                    <span className="text-muted-foreground">Create a free Supabase project first.</span>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => window.open('https://database.new', '_blank')}>
                    Create Project <ExternalLink className="ml-2 h-3 w-3" />
                  </Button>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="url">Project URL</Label>
                    <Input
                      id="url"
                      placeholder="https://your-project.supabase.co"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      className="font-mono"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="key">Anon / Public Key</Label>
                    <Input
                      id="key"
                      type="password"
                      placeholder="eyJ..."
                      value={key}
                      onChange={(e) => setKey(e.target.value)}
                      className="font-mono"
                    />
                  </div>

                  {mode === "auto" && (
                    <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                      <div className="flex justify-between">
                        <Label htmlFor="token" className="text-primary font-medium">Personal Access Token</Label>
                        <a href="https://supabase.com/dashboard/account/tokens" target="_blank" className="text-xs hover:underline text-muted-foreground">Get Token &rarr;</a>
                      </div>
                      <Input
                        id="token"
                        type="password"
                        placeholder="sbp_..."
                        value={accessToken}
                        onChange={(e) => setAccessToken(e.target.value)}
                        className="font-mono border-primary/30 focus:border-primary"
                      />
                      <p className="text-[10px] text-muted-foreground">
                        Required to create tables automatically. We do not store this.
                      </p>
                    </div>
                  )}
                </div>

                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Setup Failed</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
              </>
            )}

            {/* --- STEP 2: SCHEMA (Manual Mode Only) --- */}
            {step === "schema" && (
              <div className="space-y-6">
                <Alert className="bg-blue-500/10 border-blue-500/20 text-blue-700 dark:text-blue-400">
                  <CheckCircle className="h-4 w-4" />
                  <AlertTitle>Connected Successfully</AlertTitle>
                  <AlertDescription>Now run the SQL to create your tables.</AlertDescription>
                </Alert>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Button
                    variant="outline"
                    className="h-auto py-4 justify-between"
                    onClick={() => window.open('https://supabase.com/dashboard/project/_/sql/new', '_blank')}
                  >
                    <span>1. Open SQL Editor</span>
                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                  </Button>
                  <Button
                    variant="default"
                    className="h-auto py-4 justify-between"
                    onClick={copySchema}
                  >
                    <span>2. Copy SQL Schema</span>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <div className="text-sm text-center text-muted-foreground">
                  After running the SQL, click "Finish Setup" below.
                </div>
              </div>
            )}

            {/* --- STEP 3: FINISH --- */}
            {step === "finish" && (
              <div className="space-y-6 py-6 text-center">
                <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                  <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-semibold">All Set!</h3>
                  <p className="text-muted-foreground">Your trading journal is ready to use.</p>
                </div>
              </div>
            )}

          </CardContent>

          <CardFooter className="flex justify-end pt-2 border-t bg-muted/10 p-6">
            {step === "credentials" && (
              <Button onClick={handleConnect} disabled={isChecking} className="w-full sm:w-auto">
                {isChecking
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {mode === "auto" ? "Building Database..." : "Connecting..."}</>
                  : "Continue"
                }
              </Button>
            )}

            {(step === "schema" || step === "finish") && (
              <Button onClick={handleFinish} className="w-full bg-green-600 hover:bg-green-700">
                Finish Setup
              </Button>
            )}
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
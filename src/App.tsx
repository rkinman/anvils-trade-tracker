import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "./components/ThemeProvider";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Setup from "./pages/Setup";
import NotFound from "./pages/NotFound";
import ImportTrades from "./pages/ImportTrades";
import Strategies from "./pages/Strategies";
import StrategyDetail from "./pages/StrategyDetail";
import TradeHistory from "./pages/TradeHistory";
import Settings from "./pages/Settings";
import PutCamp from "./pages/PutCamp";
import { AuthProvider, useAuth } from "@/components/AuthProvider";
import { Loader2 } from "lucide-react";
import { isSupabaseConfigured } from "@/integrations/supabase/client";

const queryClient = new QueryClient();

// Wrapper to ensure Supabase is configured
const ConfigGuard = ({ children }: { children: React.ReactNode }) => {
  const configured = isSupabaseConfigured();
  if (!configured) {
    return <Navigate to="/setup" replace />;
  }
  return <>{children}</>;
};

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <ThemeProvider defaultTheme="dark" storageKey="trade-tracker-theme">
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter
            future={{
              v7_startTransition: true,
              v7_relativeSplatPath: true,
            }}
          >
            <Routes>
              {/* Setup Route - Public */}
              <Route path="/setup" element={<Setup />} />

              {/* All other routes require configuration */}
              <Route path="/login" element={<ConfigGuard><Login /></ConfigGuard>} />
              
              <Route
                path="/"
                element={
                  <ConfigGuard>
                    <ProtectedRoute>
                      <Index />
                    </ProtectedRoute>
                  </ConfigGuard>
                }
              />
              <Route
                path="/import"
                element={
                  <ConfigGuard>
                    <ProtectedRoute>
                      <ImportTrades />
                    </ProtectedRoute>
                  </ConfigGuard>
                }
              />
               <Route
                path="/strategies"
                element={
                  <ConfigGuard>
                    <ProtectedRoute>
                      <Strategies />
                    </ProtectedRoute>
                  </ConfigGuard>
                }
              />
              <Route
                path="/strategies/:strategyId"
                element={
                  <ConfigGuard>
                    <ProtectedRoute>
                      <StrategyDetail />
                    </ProtectedRoute>
                  </ConfigGuard>
                }
              />
               <Route
                path="/put-camp"
                element={
                  <ConfigGuard>
                    <ProtectedRoute>
                      <PutCamp />
                    </ProtectedRoute>
                  </ConfigGuard>
                }
              />
               <Route
                path="/history"
                element={
                  <ConfigGuard>
                    <ProtectedRoute>
                      <TradeHistory />
                    </ProtectedRoute>
                  </ConfigGuard>
                }
              />
               <Route
                path="/settings"
                element={
                  <ConfigGuard>
                    <ProtectedRoute>
                      <Settings />
                    </ProtectedRoute>
                  </ConfigGuard>
                }
              />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </ThemeProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App; 

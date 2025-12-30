import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "./components/ThemeProvider";
import Index from "./pages/Index";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import ImportTrades from "./pages/ImportTrades";
import Strategies from "./pages/Strategies";
import StrategyDetail from "./pages/StrategyDetail";
import TradeHistory from "./pages/TradeHistory";
import Settings from "./pages/Settings";
import PutCamp from "./pages/PutCamp"; // Import the new page
import { AuthProvider, useAuth } from "@/components/AuthProvider";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient();

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
              <Route path="/login" element={<Login />} />
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <Index />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/import"
                element={
                  <ProtectedRoute>
                    <ImportTrades />
                  </ProtectedRoute>
                }
              />
               <Route
                path="/strategies"
                element={
                  <ProtectedRoute>
                    <Strategies />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/strategies/:strategyId"
                element={
                  <ProtectedRoute>
                    <StrategyDetail />
                  </ProtectedRoute>
                }
              />
               <Route
                path="/put-camp"
                element={
                  <ProtectedRoute>
                    <PutCamp />
                  </ProtectedRoute>
                }
              />
               <Route
                path="/history"
                element={
                  <ProtectedRoute>
                    <TradeHistory />
                  </ProtectedRoute>
                }
              />
               <Route
                path="/settings"
                element={
                  <ProtectedRoute>
                    <Settings />
                  </ProtectedRoute>
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
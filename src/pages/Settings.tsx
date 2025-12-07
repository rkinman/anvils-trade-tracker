import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { showSuccess, showError } from "@/utils/toast";
import { Loader2, Save } from "lucide-react";

export default function Settings() {
  const [title, setTitle] = useState("");
  const queryClient = useQueryClient();

  // Fetch current profile
  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No user");

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      
      if (error) throw error;
      return data;
    },
  });

  // Update local state when profile loads
  useEffect(() => {
    if (profile?.app_title) {
      setTitle(profile.app_title);
    }
  }, [profile]);

  const updateProfileMutation = useMutation({
    mutationFn: async (newTitle: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No user");

      const { error } = await supabase
        .from('profiles')
        .update({ app_title: newTitle })
        .eq('id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      showSuccess("Settings saved successfully");
    },
    onError: (err) => {
      showError(err.message);
    }
  });

  const handleSave = () => {
    if (!title.trim()) {
      showError("Title cannot be empty");
      return;
    }
    updateProfileMutation.mutate(title);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Settings</h2>
          <p className="text-muted-foreground">Manage your account preferences and application customization.</p>
        </div>

        <div className="grid gap-6 max-w-2xl">
          <Card>
            <CardHeader>
              <CardTitle>Application Customization</CardTitle>
              <CardDescription>
                Personalize how the application looks and feels.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="app-title">Application Title</Label>
                <Input 
                  id="app-title" 
                  placeholder="TradeTracker" 
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
                <p className="text-sm text-muted-foreground">
                  This name will appear in the sidebar and browser tab.
                </p>
              </div>
            </CardContent>
            <CardFooter>
              <Button onClick={handleSave} disabled={updateProfileMutation.isPending || isLoading}>
                {updateProfileMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save Changes
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
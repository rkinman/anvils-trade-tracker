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
import { Loader2, Save, Plus, ArrowLeft, Search, Tag, Trash2, ChevronDown, ChevronRight, Calculator, Briefcase, Link as LinkIcon, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
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
import { cn } from "@/lib/utils";

// Rest of the component remains the same as in the previous implementation
// ...

export default function StrategyDetail() {
  // ... existing code ...

  return (
    <DashboardLayout>
      <div className="space-y-6 pb-20">
        {/* Existing code */}
        {Object.entries(groupedTradesByTag).map(([tagId, tagGroup]) => (
          <div key={tagId}>
            {/* Existing code */}
            {tagGroup.trades.map(group => {
              const isExpanded = expandedGroups.has(group.id);
              return (
                <div key={group.id}>
                  {/* Existing code */}
                  {isExpanded && (
                    <TableRow className="bg-muted/5 hover:bg-muted/5">
                      <TableCell colSpan={8} className="p-0">
                        <div className="border-t border-b bg-muted/10 py-2">
                          <Table>
                            {/* Existing code */}
                          </Table>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </DashboardLayout>
  );
}
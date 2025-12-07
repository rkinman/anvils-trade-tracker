import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ynsxtcmceyzfwoealwtf.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inluc3h0Y21jZXl6ZndvZWFsd3RmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUxMTM4OTIsImV4cCI6MjA4MDY4OTg5Mn0.WK9-lvW5CoyjJg-WvNZvX7PU2F2r4g3dVFGlEzxBc_M';

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});
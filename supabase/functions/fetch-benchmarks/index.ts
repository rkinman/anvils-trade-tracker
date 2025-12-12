import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper to convert UNIX timestamp (seconds) to YYYY-MM-DD date string
function timestampToDate(ts: number): string {
  const date = new Date(ts * 1000);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabaseUserClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseUserClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { tickers, startDate } = await req.json();
    const userId = user.id;
    if (!tickers || !Array.isArray(tickers) || tickers.length === 0 || !startDate) {
      return new Response(JSON.stringify({ error: 'Missing required parameters' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const allPricesToInsert = [];
    const failedTickers: { ticker: string, reason: string }[] = [];
    const period1 = Math.floor(new Date(startDate).getTime() / 1000);
    // Add 24 hours (86400000ms) to period2 to ensure we include today's candle if available
    const period2 = Math.floor((Date.now() + 86400000) / 1000); 
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

    for (const ticker of tickers) {
      try {
        console.log(`Fetching data for ${ticker}...`);
        const url = `https://query2.finance.yahoo.com/v8/finance/chart/${ticker}?period1=${period1}&period2=${period2}&interval=1d&includeAdjustedClose=true`;
        const response = await fetch(url, { headers: { "User-Agent": userAgent } });

        if (!response.ok) {
          throw new Error(`Yahoo API returned status ${response.status} for ${ticker}`);
        }

        const json = await response.json();
        const result = json?.chart?.result?.[0];
        if (!result || !result.timestamp || !result.indicators?.adjclose?.[0]?.adjclose) {
          console.warn(`No valid data in Yahoo API response for ${ticker}`);
          continue;
        }

        const timestamps = result.timestamp;
        const adjClosePrices = result.indicators.adjclose[0].adjclose;

        const historicalData = timestamps
          .map((ts: number, i: number) => ({
            date: timestampToDate(ts),
            price: adjClosePrices[i],
          }))
          .filter((item: { date: string; price: number | null }) => item.price !== null && item.price > 0);
        
        if (historicalData.length === 0) continue;

        // Note: We are storing RAW prices now, not normalized prices.
        const pricesToInsert = historicalData.map((item: { date: string; price: number }) => ({
          user_id: userId,
          date: item.date,
          ticker: ticker.toUpperCase(),
          price: item.price, 
        }));
        allPricesToInsert.push(...pricesToInsert);

      } catch (fetchError) {
        console.error(`Error fetching ${ticker}:`, fetchError);
        failedTickers.push({ ticker, reason: fetchError.message });
      }
    }

    if (allPricesToInsert.length > 0) {
      const { error } = await supabaseAdmin
        .from('benchmark_prices')
        .upsert(allPricesToInsert, { onConflict: 'user_id, date, ticker' });
      if (error) throw new Error(`Supabase upsert error: ${error.message}`);
    }

    const responseMessage = failedTickers.length > 0
      ? `Sync partially complete. Added ${allPricesToInsert.length} price points. Failed: ${failedTickers.map(f => f.ticker).join(', ')}`
      : `Sync complete. Added ${allPricesToInsert.length} price points.`;

    return new Response(JSON.stringify({ message: responseMessage, pricesAdded: allPricesToInsert.length, failed: failedTickers }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
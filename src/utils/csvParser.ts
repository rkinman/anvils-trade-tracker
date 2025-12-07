import Papa from 'papaparse';
import { format, parse } from 'date-fns';

// Helper to create a simple hash for duplicate detection
export const generateImportHash = (row: any): string => {
  const str = JSON.stringify({
    symbol: row.Symbol,
    date: row.Date || row.Time,
    action: row.Action,
    qty: row.Quantity,
    price: row['Average Price'] || row.Price,
    amount: row.Value || row.Amount
  });
  
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(16);
};

// Parses tastytrade trade history symbols into a standardized format.
// Example Input: 'SPY 12/18/26 C670' -> Output: 'SPY:2026-12-18:670.00:C'
export const parseSymbolToCanonical = (symbol: string, type: string): string => {
  if (type !== 'OPTION' && type !== 'FUTURES_OPTION') {
    return symbol.trim();
  }
  
  const parts = symbol.trim().split(/\s+/);
  if (parts.length < 3) return symbol.trim();

  try {
    const underlying = parts[0];
    const dateStr = parts[1];
    const optionPart = parts[2];

    const expDate = parse(dateStr, 'MM/dd/yy', new Date());
    const formattedDate = format(expDate, 'yyyy-MM-dd');
    
    const callPut = optionPart.charAt(0).toUpperCase();
    const strike = parseFloat(optionPart.substring(1));

    return `${underlying}:${formattedDate}:${strike.toFixed(2)}:${callPut}`;
  } catch (e) {
    console.warn(`Could not parse trade symbol: ${symbol}`);
    return symbol.trim();
  }
};


export interface ParsedTrade {
  symbol: string;
  date: string;
  action: string;
  quantity: number;
  price: number;
  fees: number;
  amount: number;
  asset_type: string;
  import_hash: string;
  multiplier: number;
}

// Helper to sanitize and parse currency strings like "$1.23" or "($45.67)"
const sanitizeCurrency = (value: string | undefined): number => {
  if (!value) return 0;
  let sanitized = value.trim();
  
  const isNegative = sanitized.startsWith('(') && sanitized.endsWith(')');
  
  // Remove non-numeric characters except for the decimal point and minus sign.
  // This will strip commas, quotes, dollar signs etc.
  sanitized = sanitized.replace(/[^0-9.-]+/g, "");
  
  let number = parseFloat(sanitized);
  
  if (isNaN(number)) return 0;
  
  return isNegative ? -Math.abs(number) : number;
};

export const parseTradeCSV = (file: File): Promise<ParsedTrade[]> => {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const trades: ParsedTrade[] = (results.data as any[])
            .filter((row: any) => row.Type === 'Trade' && row.Symbol) // Explicitly filter for trades
            .map((row: any) => {
              const quantity = parseFloat(row.Quantity || '0');
              // 'Average Price' in tastytrade CSV is price per contract/lot, not per share for options.
              const pricePerContract = sanitizeCurrency(row['Average Price']);
              const amount = sanitizeCurrency(row.Value);
              const commissions = sanitizeCurrency(row.Commissions);
              const fees = sanitizeCurrency(row.Fees);
              
              let multiplier = parseFloat(row.Multiplier);
              if (isNaN(multiplier) || multiplier === 0) {
                const instrumentType = row['Instrument Type'] || '';
                if (instrumentType.includes('Option')) {
                  multiplier = 100;
                } else {
                  multiplier = 1;
                }
              }

              // The UI displays per-share price by calculating `database_price / multiplier`.
              // 'Average Price' from the CSV is already the value we want to store as `price`.
              const price = pricePerContract;

              const asset_type = multiplier === 100 ? 'OPTION' : 'STOCK';

              return {
                symbol: row.Symbol,
                date: new Date(row.Date || row.Time).toISOString(),
                action: row.Action?.toUpperCase() || 'UNKNOWN',
                quantity: Math.abs(quantity),
                price,
                fees: Math.abs(commissions) + Math.abs(fees),
                amount,
                asset_type,
                multiplier,
                import_hash: generateImportHash(row)
              };
            });
          
          resolve(trades);
        } catch (err) {
          reject(err);
        }
      },
      error: (error) => {
        reject(error);
      }
    });
  });
};
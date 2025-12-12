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
// Example Input: 'NVDA   241220C00140000' -> Output: 'NVDA:2024-12-20:140.00:C'
// Example Input: './ESH6 EWF6  260130P5925' -> Output: './ESH6 EWF6:2026-01-30:5925.00:P'
export const parseSymbolToCanonical = (symbol: string, type: string): string => {
  console.log(`🔍 Trade CSV - Parsing symbol: "${symbol}" of type: "${type}"`);
  
  if (type !== 'OPTION' && type !== 'FUTURES_OPTION') {
    const result = symbol.trim();
    console.log(`✅ Stock symbol: ${result}`);
    return result;
  }
  
  const trimmed = symbol.trim();
  
  // Updated regex to support complex futures symbols (characters, slashes, numbers, spaces in underlying)
  // Matches: UNDERLYING + SPACES + YYMMDD + TYPE + STRIKE
  const occMatch = trimmed.match(/^(.+?)\s+(\d{6})([CP])(\d+)$/);
  
  if (occMatch) {
    try {
      const [, underlying, dateStr, callPut, strikeStr] = occMatch;
      
      console.log(`📊 OCC format - underlying=${underlying}, date=${dateStr}, type=${callPut}, strike=${strikeStr}`);
      
      const expDate = parse(dateStr, 'yyMMdd', new Date());
      const formattedDate = format(expDate, 'yyyy-MM-dd');
      
      let strike = 0;
      if (strikeStr.length === 8) {
         strike = parseFloat(strikeStr) / 1000;
      } else {
         strike = parseFloat(strikeStr);
      }

      const canonical = `${underlying}:${formattedDate}:${strike.toFixed(2)}:${callPut}`;
      console.log(`✅ OCC canonical: ${canonical}`);
      return canonical;
    } catch (e) {
      console.warn(`⚠️ Could not parse OCC format: ${symbol}`, e);
    }
  }
  
  // Try the human-readable format: 'SPY 12/18/26 C670'
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 3) {
    try {
      const underlying = parts[0];
      const dateStr = parts[1];
      const optionPart = parts[2];

      console.log(`📊 Human format - underlying=${underlying}, date=${dateStr}, option=${optionPart}`);

      const expDate = parse(dateStr, 'MM/dd/yy', new Date());
      const formattedDate = format(expDate, 'yyyy-MM-dd');
      
      const callPut = optionPart.charAt(0).toUpperCase();
      const strike = parseFloat(optionPart.substring(1));

      const canonical = `${underlying}:${formattedDate}:${strike.toFixed(2)}:${callPut}`;
      console.log(`✅ Human canonical: ${canonical}`);
      return canonical;
    } catch (e) {
      console.warn(`⚠️ Could not parse human format: ${symbol}`);
    }
  }

  console.warn(`❌ Could not parse trade symbol: ${symbol}`);
  return trimmed;
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
          console.log(`📋 Trade CSV raw data:`, results.data);
          
          const trades: ParsedTrade[] = (results.data as any[])
            .filter((row: any) => {
              const isValidTrade = row.Type === 'Trade' && row.Symbol;
              console.log(`🔍 Trade filter - Type: "${row.Type}", Symbol: "${row.Symbol}", valid: ${isValidTrade}`);
              return isValidTrade;
            })
            .map((row: any) => {
              console.log(`🔄 Processing trade row:`, row);
              
              const quantity = parseFloat(row.Quantity || '0');
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

              const price = pricePerContract;
              const asset_type = multiplier === 100 ? 'OPTION' : 'STOCK';

              const trade = {
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
              
              console.log(`✅ Parsed trade:`, trade);
              return trade;
            });
          
          console.log(`🎉 Final trades array:`, trades);
          resolve(trades);
        } catch (err) {
          console.error(`💥 Error parsing trade CSV:`, err);
          reject(err);
        }
      },
      error: (error) => {
        console.error(`💥 Papa Parse error:`, error);
        reject(error);
      }
    });
  });
};
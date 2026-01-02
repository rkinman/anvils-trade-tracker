import Papa from 'papaparse';
import { format, parse } from 'date-fns';

export interface ParsedPosition {
  canonicalSymbol: string;
  symbol: string;
  type: 'STOCK' | 'OPTION' | 'FUTURES_OPTION';
  quantity: number;
  mark: number;
  pnl: number | null;
}

// Helper to sanitize and parse currency strings like "$1,125.00", "-13.75", or "($45.67)"
const sanitizeCurrency = (value: string | undefined): number => {
  if (!value) return 0;
  let sanitized = value.toString().trim();
  
  // Handle parenthesis for negative values common in accounting
  const isAccountingNegative = sanitized.startsWith('(') && sanitized.endsWith(')');
  
  // Remove non-numeric characters except for the decimal point and minus sign.
  // This will strip commas, quotes, dollar signs etc.
  sanitized = sanitized.replace(/[^0-9.-]+/g, "");
  
  let number = parseFloat(sanitized);
  
  // Ensure we always return a valid finite number
  if (isNaN(number) || !isFinite(number)) return 0;
  
  return isAccountingNegative ? -Math.abs(number) : number;
};

// Parses complex option symbols from tastytrade into a standardized, comparable format.
// Example Input: 'NVDA   241220C00140000' -> Output: 'NVDA:2024-12-20:140.00:C'
// Example Input: './ESH6 EWF6  260130P5925' -> Output: './ESH6 EWF6:2026-01-30:5925.00:P'
export const parseSymbolToCanonical = (symbol: string, type: string): string => {
  // console.log(`🔍 Parsing symbol: "${symbol}" of type: "${type}"`);
  
  if (type !== 'OPTION' && type !== 'FUTURES_OPTION') {
    // console.log(`✅ Stock symbol: ${symbol.trim()}`);
    return symbol.trim();
  }

  // Handle option symbols - they can have spaces
  const trimmed = symbol.trim();
  
  // New regex allows for characters, numbers, slashes, and spaces in the underlying part (non-greedy)
  // Look for the pattern: (Underlying) + (Spaces) + YYMMDD(C/P)XXXXXXXX
  // The Underlying part is anything before the date-type-strike block at the end.
  const optionMatch = trimmed.match(/^(.+?)\s+(\d{6})([CP])(\d+)$/);
  
  if (!optionMatch) {
    console.log(`❌ Could not parse option symbol: ${symbol}`);
    return trimmed;
  }

  try {
    const [, underlying, dateStr, callPut, strikeStr] = optionMatch;
    
    // console.log(`📊 Parsed components: underlying=${underlying}, date=${dateStr}, type=${callPut}, strike=${strikeStr}`);
    
    // Parse date: YYMMDD format
    const expDate = parse(dateStr, 'yyMMdd', new Date());
    const formattedDate = format(expDate, 'yyyy-MM-dd');
    
    // Determine divisor for strike price based on length or standard conventions
    // Tastytrade standard equity options usually have 8 digits implied 3 decimals? Or 1000 multiplier?
    // Standard OCC is 8 digits, implied 3 decimal places (divide by 1000).
    // Futures options might differ, but let's assume the string representation in CSV usually follows the same padding.
    // However, for futures like ./ESH6 the strike 5925 might be represented differently. 
    // In the log: 5925 matches (\d+). If it's just "5925", it's likely whole number.
    // If it's "00592500", it's scaled.
    
    let strike = 0;
    // Heuristic: If strike string is 8 chars, assume standard OCC (div 1000)
    // If it is shorter, it might be unpadded futures strike.
    if (strikeStr.length === 8) {
       strike = parseFloat(strikeStr) / 1000;
    } else {
       // For futures like ./ESH6 ... 5925, it might just be the raw strike.
       strike = parseFloat(strikeStr);
    }

    const canonical = `${underlying}:${formattedDate}:${strike.toFixed(2)}:${callPut}`;
    // console.log(`✅ Canonical symbol: ${canonical}`);
    
    return canonical;
  } catch (e) {
    console.error(`💥 Error parsing option symbol: ${symbol}`, e);
    return trimmed;
  }
};

export const parsePositionsCSV = (file: File): Promise<ParsedPosition[]> => {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(), // Trim headers to avoid issues with extra spaces
      complete: (results) => {
        try {
          console.log(`📋 Raw CSV headers:`, results.meta.fields);
          // console.log(`📋 Raw CSV data sample:`, results.data.slice(0, 2));
          
          const positions: ParsedPosition[] = (results.data as any[])
            .filter(row => {
              // Ensure we have a symbol. Some exports might have summary rows.
              const hasSymbol = row.Symbol && row.Symbol.toString().trim() !== '';
              return hasSymbol;
            })
            .map((row: any) => {
              const type = row.Type?.toUpperCase() || 'STOCK';
              
              // Map headers based on the provided CSV format
              // Priority given to 'P/L Open' as seen in the user's file
              const pnlRaw = row['P/L Open'] || row['Profit/Loss'] || row['Unrealized P&L'] || row['P&L'];
              const markRaw = row['Mark'] || row['Market Value'] || row['Current Price'] || row['Price'];
              const qtyRaw = row['Quantity'] || row['Qty'];

              // Parse PnL specially to preserve null if missing (vs 0)
              let pnl: number | null = null;
              if (pnlRaw !== undefined && pnlRaw !== null && pnlRaw.toString().trim() !== '') {
                pnl = sanitizeCurrency(pnlRaw);
              }

              const position = {
                canonicalSymbol: parseSymbolToCanonical(row.Symbol, type),
                symbol: row.Symbol,
                type,
                quantity: sanitizeCurrency(qtyRaw),
                mark: sanitizeCurrency(markRaw),
                pnl
              };
              
              return position;
            });
            
          console.log(`🎉 Final positions parsed: ${positions.length}`);
          resolve(positions);
        } catch (err) {
          console.error(`💥 Error parsing positions CSV:`, err);
          reject(new Error("Failed to parse positions CSV."));
        }
      },
      error: (error) => {
        console.error(`💥 Papa Parse error:`, error);
        reject(error);
      },
    });
  });
}; 

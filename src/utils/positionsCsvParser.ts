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

// Helper to sanitize and parse currency strings like "$1.23" or "($45.67)"
const sanitizeCurrency = (value: string | undefined): number => {
  if (!value) return 0;
  let sanitized = value.toString().trim();
  
  const isNegative = sanitized.startsWith('(') && sanitized.endsWith(')');
  
  // Remove non-numeric characters except for the decimal point and minus sign.
  // This will strip commas, quotes, dollar signs etc.
  sanitized = sanitized.replace(/[^0-9.-]+/g, "");
  
  let number = parseFloat(sanitized);
  
  if (isNaN(number)) return 0;
  
  return isNegative ? -Math.abs(number) : number;
};

// Parses complex option symbols from tastytrade into a standardized, comparable format.
// Example Input: 'SPY   261218P00670000' -> Output: 'SPY:2026-12-18:670:P'
// Example Input: 'BOXX' -> Output: 'BOXX'
export const parseSymbolToCanonical = (symbol: string, type: string): string => {
  if (type !== 'OPTION' && type !== 'FUTURES_OPTION') {
    return symbol.trim();
  }

  const parts = symbol.trim().split(/\s+/);
  if (parts.length < 2) return symbol.trim(); // Not a standard option format

  const underlying = parts[0];
  const optionPart = parts[parts.length - 1]; // Handle cases with spaces in underlying

  if (optionPart.length < 15) return symbol.trim(); // Not OCC format

  try {
    const dateStr = optionPart.substring(0, 6);
    const callPut = optionPart.substring(6, 7);
    const strikeStr = optionPart.substring(7);

    const expDate = parse(dateStr, 'yyMMdd', new Date());
    const formattedDate = format(expDate, 'yyyy-MM-dd');
    
    const strike = parseFloat(strikeStr) / 1000;

    return `${underlying}:${formattedDate}:${strike.toFixed(2)}:${callPut}`;
  } catch (e) {
    console.warn(`Could not parse option symbol: ${symbol}`);
    return symbol.trim();
  }
};

export const parsePositionsCSV = (file: File): Promise<ParsedPosition[]> => {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const positions: ParsedPosition[] = (results.data as any[])
            .filter(row => row.Symbol)
            .map((row: any) => {
              const type = row.Type?.toUpperCase() || 'STOCK';
              
              // Handle various CSV headers for P&L and Mark
              const pnlRaw = row['P/L Open'] || row['Profit/Loss'] || row['Unrealized P&L'];
              const markRaw = row['Mark'] || row['Market Value'] || row['Current Price'];
              const qtyRaw = row['Quantity'] || row['Qty'];

              return {
                canonicalSymbol: parseSymbolToCanonical(row.Symbol, type),
                symbol: row.Symbol,
                type,
                quantity: sanitizeCurrency(qtyRaw), // Use sanitizeCurrency here too for consistency
                mark: sanitizeCurrency(markRaw),
                pnl: pnlRaw ? sanitizeCurrency(pnlRaw) : null
              };
            });
          resolve(positions);
        } catch (err) {
          reject(new Error("Failed to parse positions CSV."));
        }
      },
      error: (error) => reject(error),
    });
  });
};
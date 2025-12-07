import Papa from 'papaparse';

// Helper to create a simple hash for duplicate detection
export const generateImportHash = (row: any): string => {
  const str = JSON.stringify({
    symbol: row.Symbol,
    date: row.Date || row.Time,
    action: row.Action,
    qty: row.Quantity,
    price: row.Price,
    amount: row.Amount
  });
  
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(16);
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

export const parseTradeCSV = (file: File): Promise<ParsedTrade[]> => {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const trades: ParsedTrade[] = results.data
            .filter((row: any) => row.Symbol && row.Date) // Basic validation
            .map((row: any) => {
              // Normalize data
              const quantity = parseFloat(row.Quantity || '0');
              const price = parseFloat(row.Price || '0');
              const fees = parseFloat(row.Fees || row.Commission || '0');
              const amount = parseFloat(row.Amount || '0');
              
              // Determine Asset Type (Simple heuristic)
              // Options usually have expiration dates or specific formats in symbols, 
              // but for now we default to OPTION as per user context, or STOCK if quantity is large/price is specific.
              // We'll trust the user primarily trades options as requested.
              const asset_type = row.Symbol.length > 5 ? 'OPTION' : 'STOCK'; 
              const multiplier = asset_type === 'OPTION' ? 100 : 1;

              return {
                symbol: row.Symbol,
                date: new Date(row.Date).toISOString(),
                action: row.Action?.toUpperCase() || 'UNKNOWN',
                quantity,
                price,
                fees: Math.abs(fees),
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
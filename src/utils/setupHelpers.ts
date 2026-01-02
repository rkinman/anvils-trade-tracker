
/**
 * Fetches the schema.sql file content from the public directory
 */
export async function fetchSchemaContent(): Promise<string> {
  const response = await fetch("/schema.sql");
  if (!response.ok) {
    throw new Error("Failed to load schema file.");
  }
  return await response.text();
}

/**
 * Attempts to execute SQL using the Supabase Management API.
 * NOTE: This is subject to CORS policies. If called from a browser,
 * it may fail if api.supabase.com does not allow the origin.
 */
export async function executeSqlViaManagementApi(
  projectRef: string, 
  accessToken: string, 
  sql: string
): Promise<void> {
  const url = `https://api.supabase.com/v1/projects/${projectRef}/query`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify({ query: sql })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `API Request failed: ${response.status} ${response.statusText}`);
  }
}

/**
 * Parses the project ref from a Supabase URL
 * e.g. https://xyz.supabase.co -> xyz
 */
export function getProjectRefFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const parts = urlObj.hostname.split('.');
    if (parts.length > 0) return parts[0];
    return null;
  } catch (e) {
    return null;
  }
}
 

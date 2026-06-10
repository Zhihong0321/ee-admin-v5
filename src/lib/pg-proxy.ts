// Postgres Proxy client for querying the database via HTTP proxy

const PROXY_URL = 'https://pg-proxy-production.up.railway.app';
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3Nzg5MTY4MzAsImV4cCI6MTc3ODkyMDQzMCwiZGJfbmFtZSI6InByb2RfbWFpbiIsImFjY2VzcyI6InJlYWRfb25seSIsInByb3h5X3VybCI6Imh0dHBzOi8vcGctcHJveHktcHJvZHVjdGlvbi51cC5yYWlsd2F5LmFwcC8iLCJhcGlfZG9jc191cmwiOiJodHRwczovL3BnLXByb3h5LXByb2R1Y3Rpb24udXAucmFpbHdheS5hcHAvZG9jcyJ9.5hB6-6wjlM9H-KYPEggLOFZSvvtpSl5ZYPAxHYPiZa4';

interface ProxyQueryResult {
  command: string;
  rowCount: number;
  rows: unknown[];
  db_name: string;
  access: string;
}

export async function queryProxy(sql: string, params: unknown[] = []): Promise<ProxyQueryResult> {
  const response = await fetch(`${PROXY_URL}/api/sql`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      db_name: 'prod_main',
      sql,
      params,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Proxy query failed: ${response.status} - ${errorText}`);
  }

  return response.json();
}

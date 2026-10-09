import 'server-only';
import { importPKCS8, SignJWT } from 'jose';
import { randomUUID } from 'crypto';
import { SCHEMA, type TableName, type RecordRow } from './schema';

/** Google Sheets is the only records database. Credentials remain on the server. */
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
let tokenCache: { token: string; expires: number } | null = null;

function config() {
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!spreadsheetId || !email || !key) {
    throw new Error('Google Sheets service account is not configured');
  }
  return { spreadsheetId, email, key };
}

async function accessToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expires) return tokenCache.token;
  const { email, key } = config();
  const privateKey = await importPKCS8(key, 'RS256');
  const assertion = await new SignJWT({ scope: SHEETS_SCOPE })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(email)
    .setAudience(TOKEN_ENDPOINT)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey);
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Google service-account authorization failed (${response.status})`);
  const result = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!result.access_token) throw new Error('Google authorization returned no access token');
  tokenCache = {
    token: result.access_token,
    expires: Date.now() + Math.max(60, (result.expires_in ?? 3600) - 90) * 1000,
  };
  return result.access_token;
}

function col(n: number): string {
  let out = '';
  while (n) {
    n--;
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26);
  }
  return out;
}

function rangeFor(table: TableName, cells: string): string {
  return `'${table}'!${cells}`;
}

async function sheetRequest(
  range: string,
  method: 'GET' | 'POST' | 'PUT' = 'GET',
  values?: string[][],
): Promise<{ values?: string[][] }> {
  const { spreadsheetId } = config();
  const endpoint = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}${method === 'POST' ? ':append' : ''}`,
  );
  if (method === 'POST') {
    endpoint.searchParams.set('valueInputOption', 'RAW');
    endpoint.searchParams.set('insertDataOption', 'INSERT_ROWS');
  } else if (method === 'PUT') {
    endpoint.searchParams.set('valueInputOption', 'RAW');
  }
  const response = await fetch(endpoint.toString(), {
    method,
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      ...(method === 'GET' ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(method === 'GET' ? {} : { body: JSON.stringify({ values }) }),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Google Sheets request failed (${response.status}) for ${range}`);
  return (await response.json()) as { values?: string[][] };
}

export async function getRows(table: TableName): Promise<RecordRow[]> {
  const keys = SCHEMA[table] as readonly string[];
  const result = await sheetRequest(rangeFor(table, 'A:AZ'));
  const rows = result.values || [];
  if (!rows.length) throw new Error(`Missing sheet or headers: ${table}`);
  if (keys.some((key, index) => rows[0][index] !== key)) {
    throw new Error(`Column mismatch in ${table}. Use the supplied template.`);
  }
  return rows.slice(1).filter((row) => row[0]).map((row) =>
    Object.fromEntries(keys.map((key, i) => [key, String(row[i] ?? '')])),
  );
}

export async function append(table: TableName, record: RecordRow): Promise<RecordRow> {
  const keys = SCHEMA[table] as readonly string[];
  const now = new Date().toISOString();
  const saved: RecordRow = { ...record, id: randomUUID(), created_at: now, updated_at: now };
  await sheetRequest(rangeFor(table, `A:${col(keys.length)}`), 'POST', [keys.map((key) => saved[key] ?? '')]);
  return saved;
}

export async function update(table: TableName, id: string, patch: RecordRow): Promise<RecordRow> {
  const keys = SCHEMA[table] as readonly string[];
  const rows = await getRows(table);
  const index = rows.findIndex((row) => row.id === id);
  if (index < 0) throw new Error('Record not found');
  const current = rows[index];
  const saved = { ...current, ...patch, id, created_at: current.created_at, updated_at: new Date().toISOString() };
  await sheetRequest(
    rangeFor(table, `A${index + 2}:${col(keys.length)}${index + 2}`),
    'PUT',
    [keys.map((key) => saved[key] ?? '')],
  );
  return saved;
}

export async function audit(actor: string, action: string, table: string, recordId: string): Promise<void> {
  try {
    await append('Audit_Log', { actor, action, table, record_id: recordId, at: new Date().toISOString() });
  } catch (e) {
    console.error('Audit write failed', e);
    throw new Error('Audit write failed; check configuration');
  }
}

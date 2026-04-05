import { createClient } from '@supabase/supabase-js'

if (typeof window !== 'undefined') {
  throw new Error('supabaseAdmin must only be imported on the server')
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL');
if (!SERVICE_KEY) throw new Error('Missing SUPABASE_SERVICE_KEY');

// Server-side client (API routes only) — full access via service key.
// This file must NEVER be imported from client-side code ('use client').
export const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY);

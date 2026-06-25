// ── Supabase configuration ────────────────────────────────────
const SUPABASE_URL         = 'https://uoqscftixhpdznjjghpa.supabase.co';
const SUPABASE_ANON        = 'sb_publishable_TWubklssPT1o8Cf6JeE65w_Zzx8IUt5';
const SUPABASE_SERVICE_KEY = 'sb_secret_gzlaV5M4HNZHgDNVwaPu1w_HjmpkMqW';

const sb      = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
const sbAdmin = supabase.createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

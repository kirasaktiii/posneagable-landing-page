const FALLBACK_SUPABASE_URL = "https://xibphltzzayddzaltyqd.supabase.co";
const FALLBACK_SUPABASE_ANON_KEY =
  "sb_publishable_YwKLp-iU1krV6AwWvAjxvA_rarL3gkT";

export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  process.env.SUPABASE_URL ??
  FALLBACK_SUPABASE_URL;

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.SUPABASE_ANON_KEY ??
  FALLBACK_SUPABASE_ANON_KEY;

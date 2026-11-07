import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { requireSupabaseConfig, type Env } from "./env";

export function createAnonClient(env: Env): SupabaseClient {
  const config = requireSupabaseConfig(env);
  return createClient(config.url, config.anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export function createAdminClient(env: Env): SupabaseClient {
  const config = requireSupabaseConfig(env);
  return createClient(config.url, config.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

import { createBrowserClient } from "@supabase/ssr";

import { getSupabaseConfig } from "./env";

export function createClient() {
  const { url, key } = getSupabaseConfig();
  return createBrowserClient(url, key);
}

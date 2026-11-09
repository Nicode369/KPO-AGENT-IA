import { NextResponse, type NextRequest } from "next/server";

import { recordAuditEvent } from "@/lib/audit/log";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const next = requestUrl.searchParams.get("next");
  const destination = next?.startsWith("/") && !next.startsWith("//") ? next : "/app";
  const code = requestUrl.searchParams.get("code");

  if (!code || !isSupabaseConfigured()) {
    return NextResponse.redirect(new URL("/login?error=invalid_link", request.url));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    await recordAuditEvent({
      eventType: "auth_callback_failed",
      metadata: { reason: "invalid_code" },
    });
    return NextResponse.redirect(new URL("/login?error=invalid_link", request.url));
  }

  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  const email =
    typeof claimsData?.claims?.email === "string" ? claimsData.claims.email : null;

  await recordAuditEvent({
    eventType:
      destination === "/reset-password"
        ? "auth_password_recovery_started"
        : "auth_email_verified",
    actorId: typeof userId === "string" ? userId : null,
    actorEmail: email,
    metadata: { destination },
  });

  return NextResponse.redirect(new URL(destination, request.url));
}

"use server";

import { redirect } from "next/navigation";

import { recordAuditEvent } from "@/lib/audit/log";
import {
  demoEmail,
  demoGroupSlug,
  demoPassword,
  isDemoVariant,
} from "@/lib/auth/demo";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function signUpErrorCode(error: { code?: string; status?: number; message?: string }) {
  if (error.status === 429 || error.code === "over_email_send_rate_limit" || error.code === "email_send_rate_limit") {
    return "email_rate_limit";
  }
  if (error.code === "weak_password") return "weak_password";
  if (error.code === "email_exists" || error.code === "user_already_exists") return "email_taken";
  if (error.code === "signup_disabled") return "signup_disabled";
  if (error.code === "email_address_invalid") return "invalid_email";
  if (error.code === "23514" || /invitation/i.test(error.message ?? "")) return "invalid_invitation";
  if (/Database error saving new user/i.test(error.message ?? "")) return "registration_database";
  return "registration_failed";
}

export async function signIn(formData: FormData) {
  if (!isSupabaseConfigured()) redirect("/login?error=not_configured");

  const email = field(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) redirect("/login?error=credentials");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    await recordAuditEvent({
      eventType: "auth_login_failed",
      actorEmail: email,
      metadata: { reason: "invalid_credentials" },
    });
    redirect("/login?error=credentials");
  }

  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (typeof userId !== "string") {
    await supabase.auth.signOut();
    await recordAuditEvent({
      eventType: "auth_login_blocked",
      actorEmail: email,
      metadata: { reason: "missing_session" },
    });
    redirect("/login?error=inactive");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_active, is_superadmin")
    .eq("id", userId)
    .maybeSingle();

  if (!profile?.is_active) {
    await supabase.auth.signOut();
    await recordAuditEvent({
      eventType: "auth_login_blocked",
      actorId: userId,
      actorEmail: email,
      metadata: { reason: "inactive" },
    });
    redirect("/login?error=inactive");
  }

  if (!profile.is_superadmin) {
    const { data: membership } = await supabase
      .from("group_memberships")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    if (!membership) {
      await supabase.auth.signOut();
      await recordAuditEvent({
        eventType: "auth_login_blocked",
        actorId: userId,
        actorEmail: email,
        metadata: { reason: "no_membership" },
      });
      redirect("/login?error=inactive");
    }
  }

  await recordAuditEvent({
    eventType: "auth_login_success",
    actorId: userId,
    actorEmail: email,
    metadata: { is_superadmin: profile.is_superadmin },
  });

  redirect("/app");
}

export async function startDemo(formData: FormData) {
  if (!isSupabaseConfigured()) redirect("/login?error=not_configured");

  const requestedVariant = field(formData, "demo");
  if (!isDemoVariant(requestedVariant)) {
    await recordAuditEvent({
      eventType: "auth_demo_unavailable",
      metadata: { reason: "invalid_variant" },
    });
    redirect("/login?error=demo_unavailable");
  }

  const variant = requestedVariant;
  const email = demoEmail(variant)?.toLowerCase();
  const password = demoPassword(variant);
  const groupSlug = demoGroupSlug(variant);

  if (!email || !password) {
    await recordAuditEvent({
      eventType: "auth_demo_unavailable",
      metadata: { reason: "missing_configuration", demo: variant },
    });
    redirect("/login?error=demo_unavailable");
  }

  const supabase = await createClient();
  await supabase.auth.signOut();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    await recordAuditEvent({
      eventType: "auth_demo_unavailable",
      actorEmail: email,
      metadata: { reason: "sign_in_failed", demo: variant },
    });
    redirect("/login?error=demo_unavailable");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_active")
    .eq("id", data.user.id)
    .maybeSingle();

  const { data: group } = await supabase
    .from("groups")
    .select("id")
    .eq("slug", groupSlug)
    .maybeSingle();

  const { data: membership } = group
    ? await supabase
        .from("group_memberships")
        .select("id")
        .eq("group_id", group.id)
        .eq("user_id", data.user.id)
        .eq("status", "active")
        .maybeSingle()
    : { data: null };

  if (!profile?.is_active || !group || !membership) {
    await supabase.auth.signOut();
    await recordAuditEvent({
      eventType: "auth_demo_unavailable",
      actorId: data.user.id,
      actorEmail: email,
      metadata: {
        reason: !group ? "missing_group" : !membership ? "missing_membership" : "inactive",
        demo: variant,
      },
    });
    redirect("/login?error=demo_unavailable");
  }

  await recordAuditEvent({
    eventType: "auth_demo_started",
    actorId: data.user.id,
    actorEmail: email,
    targetType: "group",
    targetId: group.id,
    metadata: { group_slug: groupSlug, demo: variant },
  });

  redirect("/app?demo=1");
}

export async function signUp(formData: FormData) {
  if (!isSupabaseConfigured()) redirect("/register?error=not_configured");

  const email = field(formData, "email").toLowerCase();
  const fullName = field(formData, "full_name");
  const invitationCode = field(formData, "invitation_code").toUpperCase();
  const password = String(formData.get("password") ?? "");
  const passwordConfirmation = String(formData.get("password_confirmation") ?? "");

  if (!email || !fullName || !invitationCode || password.length < 6) {
    redirect("/register?error=invalid_form");
  }
  if (password !== passwordConfirmation) redirect("/register?error=password_mismatch");

  const supabase = await createClient();
  const origin = process.env.APP_ORIGIN ?? "http://localhost:3000";
  const redirectTo = new URL("/auth/callback?next=/app", origin).toString();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: redirectTo,
      data: {
        full_name: fullName,
        invitation_code: invitationCode,
      },
    },
  });

  // The UI shows a specific, actionable message without exposing account state.
  if (error) {
    const reason = signUpErrorCode(error);
    console.error("[signUp] Supabase error", {
      code: error.code,
      status: error.status,
      message: error.message,
    });
    await recordAuditEvent({
      eventType: "auth_signup_failed",
      actorEmail: email,
      metadata: { reason },
    });
    redirect(`/register?error=${reason}`);
  }
  redirect(data.session ? "/app" : "/verify-email");
}

export async function requestPasswordReset(formData: FormData) {
  if (!isSupabaseConfigured()) redirect("/forgot-password?error=not_configured");

  const email = field(formData, "email").toLowerCase();
  if (!email) redirect("/forgot-password?error=invalid_form");

  const supabase = await createClient();
  const origin = process.env.APP_ORIGIN ?? "http://localhost:3000";
  const redirectTo = new URL("/auth/callback?next=/reset-password", origin).toString();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

  if (error) {
    await recordAuditEvent({
      eventType: "auth_password_reset_failed",
      actorEmail: email,
      metadata: { reason: "request_failed" },
    });
    redirect("/forgot-password?error=request_failed");
  }

  await recordAuditEvent({
    eventType: "auth_password_reset_requested",
    actorEmail: email,
  });
  redirect("/forgot-password?sent=1");
}

export async function updatePassword(formData: FormData) {
  if (!isSupabaseConfigured()) redirect("/reset-password?error=not_configured");

  const password = String(formData.get("password") ?? "");
  const passwordConfirmation = String(formData.get("password_confirmation") ?? "");
  if (password.length < 6) redirect("/reset-password?error=weak_password");
  if (password !== passwordConfirmation) redirect("/reset-password?error=password_mismatch");

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims?.sub) redirect("/reset-password?error=invalid_link");

  const userId = claimsData.claims.sub;
  const email =
    typeof claimsData.claims.email === "string" ? claimsData.claims.email : null;

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    await recordAuditEvent({
      eventType: "auth_password_update_failed",
      actorId: userId,
      actorEmail: email,
      metadata: { reason: "update_failed" },
    });
    redirect("/reset-password?error=update_failed");
  }

  await recordAuditEvent({
    eventType: "auth_password_updated",
    actorId: userId,
    actorEmail: email,
  });

  await supabase.auth.signOut();
  redirect("/login?updated=1");
}

export async function signOut() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const { data: claimsData } = await supabase.auth.getClaims();
    const userId = claimsData?.claims?.sub;
    const email =
      typeof claimsData?.claims?.email === "string" ? claimsData.claims.email : null;

    await supabase.auth.signOut();
    await recordAuditEvent({
      eventType: "auth_logout",
      actorId: typeof userId === "string" ? userId : null,
      actorEmail: email,
    });
  }
  redirect("/");
}

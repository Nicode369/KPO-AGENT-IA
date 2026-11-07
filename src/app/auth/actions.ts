"use server";

import { redirect } from "next/navigation";

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
  if (error) redirect("/login?error=credentials");

  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (typeof userId !== "string") {
    await supabase.auth.signOut();
    redirect("/login?error=inactive");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_active, is_superadmin")
    .eq("id", userId)
    .maybeSingle();

  if (!profile?.is_active) {
    await supabase.auth.signOut();
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
      redirect("/login?error=inactive");
    }
  }

  redirect("/app");
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
    console.error("[signUp] Supabase error", {
      code: error.code,
      status: error.status,
      message: error.message,
    });
    redirect(`/register?error=${signUpErrorCode(error)}`);
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

  if (error) redirect("/forgot-password?error=request_failed");
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

  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect("/reset-password?error=update_failed");

  await supabase.auth.signOut();
  redirect("/login?updated=1");
}

export async function signOut() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}

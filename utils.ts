// backend/supabase/functions/_shared/utils.ts
// Utilitaires partagés entre toutes les Edge Functions

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── CORS Headers ────────────────────────────────────────────────────────────
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};

// ─── Standard JSON responses ──────────────────────────────────────────────────
export function ok(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ success: true, data }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function err(message: string, status = 400): Response {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function handleOptions(): Response {
  return new Response(null, { status: 204, headers: corsHeaders });
}

// ─── Supabase Admin client (contourne RLS) ────────────────────────────────────
export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );
}

// ─── Supabase client avec le JWT de l'utilisateur ────────────────────────────
export function userClient(req: Request): SupabaseClient {
  const authHeader = req.headers.get("Authorization") ?? "";
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
}

// ─── Récupère le profil de l'utilisateur authentifié ─────────────────────────
export async function getAuthProfile(
  req: Request
): Promise<{ id: string; role: string; full_name: string } | null> {
  const client = userClient(req);
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return null;

  const { data: profile } = await adminClient()
    .from("profiles")
    .select("id, role, full_name")
    .eq("id", user.id)
    .single();

  return profile ?? null;
}

// ─── Guards de rôle ───────────────────────────────────────────────────────────
export async function requireRole(
  req: Request,
  ...roles: string[]
): Promise<{ id: string; role: string; full_name: string } | Response> {
  const profile = await getAuthProfile(req);
  if (!profile) return err("Non authentifié.", 401);
  if (!roles.includes(profile.role))
    return err(`Accès refusé. Rôle requis: ${roles.join(" ou ")}.`, 403);
  return profile;
}

// ─── Parse body JSON avec fallback ───────────────────────────────────────────
export async function parseBody<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

// ─── Validation helpers ───────────────────────────────────────────────────────
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

// ─── Créer une notification ───────────────────────────────────────────────────
export async function createNotification(
  userId: string,
  type: string,
  title: string,
  message: string,
  relatedId?: string
): Promise<void> {
  await adminClient().from("notifications").insert({
    user_id: userId,
    type,
    title,
    message,
    related_id: relatedId ?? null,
    is_read: false,
  });
}

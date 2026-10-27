// backend/supabase/functions/notifications-send/index.ts
//
// GET   /functions/v1/notifications-send         → Lister mes notifications
// PATCH /functions/v1/notifications-send?id=xxx  → Marquer comme lue
// PATCH /functions/v1/notifications-send?all=true → Tout marquer comme lu
// POST  /functions/v1/notifications-send         → (admin) Envoyer notif manuelle

import {
  corsHeaders,
  ok,
  err,
  handleOptions,
  adminClient,
  requireRole,
  parseBody,
  createNotification,
} from "../_shared/utils.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return handleOptions();

  const url  = new URL(req.url);
  const notifId  = url.searchParams.get("id");
  const markAll  = url.searchParams.get("all") === "true";
  const supabase = adminClient();

  // ── GET : liste des notifications de l'utilisateur ───────────────────────
  if (req.method === "GET") {
    const profile = await requireRole(req, "student", "company", "admin");
    if (profile instanceof Response) return profile;

    const onlyUnread = url.searchParams.get("unread") === "true";
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50"), 100);

    let query = supabase
      .from("notifications")
      .select("*")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (onlyUnread) query = query.eq("is_read", false);

    const { data, error } = await query;
    if (error) return err(error.message, 500);

    const unreadCount = (data ?? []).filter((n: { is_read: boolean }) => !n.is_read).length;
    return ok({ notifications: data, unread_count: unreadCount });
  }

  // ── PATCH : marquer comme lue(s) ─────────────────────────────────────────
  if (req.method === "PATCH") {
    const profile = await requireRole(req, "student", "company", "admin");
    if (profile instanceof Response) return profile;

    if (markAll) {
      // Tout marquer comme lu
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", profile.id)
        .eq("is_read", false);

      if (error) return err(error.message, 500);
      return ok({ message: "Toutes les notifications marquées comme lues." });
    }

    if (!notifId) return err("Paramètre 'id' requis (ou 'all=true').");

    // Vérifier que la notification appartient à l'utilisateur
    const { data: notif } = await supabase
      .from("notifications")
      .select("id, user_id")
      .eq("id", notifId)
      .single();

    if (!notif) return err("Notification introuvable.", 404);
    if (notif.user_id !== profile.id && profile.role !== "admin")
      return err("Accès refusé.", 403);

    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", notifId);

    if (error) return err(error.message, 500);
    return ok({ message: "Notification marquée comme lue." });
  }

  // ── POST : envoi manuel (admin → utilisateur ciblé) ───────────────────────
  if (req.method === "POST") {
    const profile = await requireRole(req, "admin");
    if (profile instanceof Response) return profile;

    const body = await parseBody<{
      user_id?: string;     // cibler un utilisateur précis
      role?: string;        // ou cibler tous les utilisateurs d'un rôle
      type: string;
      title: string;
      message: string;
      related_id?: string;
    }>(req);

    if (!body) return err("Corps JSON invalide.");
    if (!body.title || !body.message) return err("Champs 'title' et 'message' requis.");
    if (!body.user_id && !body.role) return err("'user_id' ou 'role' requis.");

    if (body.user_id) {
      // Notification à un utilisateur spécifique
      await createNotification(
        body.user_id,
        body.type ?? "admin_message",
        body.title,
        body.message,
        body.related_id
      );
      return ok({ sent_to: 1, message: "Notification envoyée." });
    }

    // Notification broadcast par rôle
    const validRoles = ["student", "company", "admin"];
    if (!validRoles.includes(body.role!))
      return err(`Rôle invalide. Valeurs: ${validRoles.join(", ")}`);

    const { data: users } = await supabase
      .from("profiles")
      .select("id")
      .eq("role", body.role!);

    const targets = users ?? [];

    await Promise.all(
      targets.map((u: { id: string }) =>
        createNotification(
          u.id,
          body.type ?? "admin_broadcast",
          body.title,
          body.message,
          body.related_id
        )
      )
    );

    return ok({
      sent_to: targets.length,
      role: body.role,
      message: `Notification envoyée à ${targets.length} utilisateur(s).`,
    }, 201);
  }

  return err("Méthode non autorisée.", 405);
});

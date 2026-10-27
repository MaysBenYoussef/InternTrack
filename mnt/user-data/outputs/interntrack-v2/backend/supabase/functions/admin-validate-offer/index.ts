// backend/supabase/functions/admin-validate-offer/index.ts
//
// PATCH /functions/v1/admin-validate-offer?id=xxx
// Body: { action: "approve" | "reject", reason?: string }
//
// Réservé aux administrateurs uniquement.
// Valide ou rejette une offre soumise par une entreprise,
// puis envoie une notification à l'entreprise.

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
  if (req.method !== "PATCH") return err("Méthode non autorisée (PATCH requis).", 405);

  // ── Authentification admin obligatoire ────────────────────────────────────
  const profile = await requireRole(req, "admin");
  if (profile instanceof Response) return profile;

  const url = new URL(req.url);
  const offerId = url.searchParams.get("id");
  if (!offerId) return err("Paramètre 'id' requis.");

  const body = await parseBody<{ action: string; reason?: string }>(req);
  if (!body?.action) return err("Champ 'action' requis (approve | reject).");

  if (!["approve", "reject"].includes(body.action))
    return err("Action invalide. Valeurs: approve | reject.");

  const supabase = adminClient();

  // ── Récupérer l'offre ─────────────────────────────────────────────────────
  const { data: offer } = await supabase
    .from("internship_offers")
    .select("id, title, status, company_id, companies(company_name)")
    .eq("id", offerId)
    .single();

  if (!offer) return err("Offre introuvable.", 404);

  if (offer.status !== "pending")
    return err(`Cette offre est déjà dans l'état "${offer.status}". Seules les offres 'pending' peuvent être traitées.`);

  const newStatus = body.action === "approve" ? "approved" : "rejected";

  // ── Mettre à jour le statut ───────────────────────────────────────────────
  const { data: updated, error } = await supabase
    .from("internship_offers")
    .update({
      status:     newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", offerId)
    .select()
    .single();

  if (error) return err(error.message, 500);

  // ── Notifier l'entreprise ─────────────────────────────────────────────────
  const companyName = offer.companies?.company_name ?? "Votre entreprise";

  if (body.action === "approve") {
    await createNotification(
      offer.company_id,
      "offer_approved",
      "Offre approuvée ✅",
      `Votre offre "${offer.title}" a été validée par l'administration. Elle est maintenant visible par tous les étudiants.`,
      offerId
    );
  } else {
    const reason = body.reason
      ? ` Motif: ${body.reason}`
      : " Veuillez la modifier et la soumettre à nouveau.";
    await createNotification(
      offer.company_id,
      "offer_rejected",
      "Offre non validée ❌",
      `Votre offre "${offer.title}" n'a pas été approuvée par l'administration.${reason}`,
      offerId
    );
  }

  // ── Log admin ─────────────────────────────────────────────────────────────
  // (optionnel : traçabilité des actions admin)
  await supabase.from("notifications").insert({
    user_id:    profile.id,
    type:       "admin_action_log",
    title:      `Action admin: ${newStatus}`,
    message:    `Admin "${profile.full_name}" a ${newStatus === "approved" ? "approuvé" : "rejeté"} l'offre "${offer.title}" (${companyName}).`,
    related_id: offerId,
    is_read:    true,
  });

  return ok({
    offer_id: offerId,
    new_status: newStatus,
    message: `Offre ${newStatus === "approved" ? "approuvée" : "rejetée"} avec succès.`,
    offer: updated,
  });
});

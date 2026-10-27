// backend/supabase/functions/applications-manage/index.ts
//
// Routes:
//   POST  /functions/v1/applications-manage           → Postuler (student)
//   GET   /functions/v1/applications-manage           → Lister candidatures
//   PATCH /functions/v1/applications-manage?id=xxx   → Changer statut (company/admin)

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

  const url = new URL(req.url);
  const appId = url.searchParams.get("id");
  const supabase = adminClient();

  // ── POST : Postuler à une offre ───────────────────────────────────────────
  if (req.method === "POST") {
    const profile = await requireRole(req, "student");
    if (profile instanceof Response) return profile;

    const body = await parseBody<{
      offer_id: string;
      cover_letter: string;
      cv_url?: string;
    }>(req);
    if (!body) return err("Corps JSON invalide.");

    const { offer_id, cover_letter, cv_url } = body;

    // Validation
    if (!offer_id)       return err("Champ 'offer_id' requis.");
    if (!cover_letter?.trim()) return err("La lettre de motivation est obligatoire.");
    if (cover_letter.trim().length < 100)
      return err("La lettre de motivation est trop courte (minimum 100 caractères).");

    // Vérifier que l'offre existe et est approuvée
    const { data: offer } = await supabase
      .from("internship_offers")
      .select("id, title, status, company_id, companies(company_name)")
      .eq("id", offer_id)
      .single();

    if (!offer) return err("Offre introuvable.", 404);
    if (offer.status !== "approved")
      return err("Cette offre n'est plus disponible.");

    // Vérifier qu'il n'a pas déjà postulé
    const { data: existing } = await supabase
      .from("applications")
      .select("id")
      .eq("student_id", profile.id)
      .eq("offer_id", offer_id)
      .maybeSingle();

    if (existing) return err("Vous avez déjà postulé à cette offre.", 409);

    // Créer la candidature
    const { data: application, error } = await supabase
      .from("applications")
      .insert({
        student_id:    profile.id,
        offer_id,
        cover_letter:  cover_letter.trim(),
        cv_url:        cv_url ?? null,
        status:        "pending",
      })
      .select()
      .single();

    if (error) return err(error.message, 500);

    // Notifier l'entreprise
    await createNotification(
      offer.company_id,
      "application_received",
      "Nouvelle candidature reçue 📬",
      `${profile.full_name} a postulé pour "${offer.title}".`,
      application.id
    );

    // Notifier l'étudiant (confirmation)
    await createNotification(
      profile.id,
      "application_sent",
      "Candidature envoyée ✅",
      `Votre candidature pour "${offer.title}" a bien été transmise. Vous serez notifié dès qu'elle sera examinée.`,
      application.id
    );

    return ok(application, 201);
  }

  // ── GET : lister les candidatures ────────────────────────────────────────
  if (req.method === "GET") {
    const profile = await requireRole(req, "student", "company", "admin");
    if (profile instanceof Response) return profile;

    let query = supabase
      .from("applications")
      .select(
        `id, status, cover_letter, cv_url, applied_at, updated_at,
         internship_offers(id, title, domain, location, company_id,
           companies(company_name, logo_url)),
         students(id, profiles(full_name, phone),
           university, field_of_study, skills)`
      )
      .order("applied_at", { ascending: false });

    if (profile.role === "student") {
      query = query.eq("student_id", profile.id);
    } else if (profile.role === "company") {
      // Filtrer par les offres de cette entreprise
      query = query.eq("internship_offers.companies.id", profile.id);
    }
    // admin voit tout

    const statusFilter = url.searchParams.get("status");
    if (statusFilter) query = query.eq("status", statusFilter);

    const { data, error } = await query;
    if (error) return err(error.message, 500);

    return ok({ applications: data, total: data?.length ?? 0 });
  }

  // ── PATCH : changer le statut d'une candidature ───────────────────────────
  if (req.method === "PATCH") {
    if (!appId) return err("Paramètre 'id' requis.");

    const profile = await requireRole(req, "company", "admin");
    if (profile instanceof Response) return profile;

    const body = await parseBody<{ status: string; company_notes?: string }>(req);
    if (!body?.status) return err("Champ 'status' requis.");

    const validStatuses = ["reviewed", "accepted", "rejected"];
    if (!validStatuses.includes(body.status))
      return err(`Statut invalide. Valeurs: ${validStatuses.join(", ")}`);

    // Récupérer la candidature + offre + étudiant
    const { data: app } = await supabase
      .from("applications")
      .select(
        `id, status, student_id,
         internship_offers(id, title, company_id, companies(company_name))`
      )
      .eq("id", appId)
      .single();

    if (!app) return err("Candidature introuvable.", 404);

    // Vérifier que l'entreprise est bien propriétaire de l'offre
    if (profile.role === "company" &&
        app.internship_offers?.company_id !== profile.id)
      return err("Accès refusé à cette candidature.", 403);

    // Mise à jour
    const { data: updated, error } = await supabase
      .from("applications")
      .update({
        status:        body.status,
        company_notes: body.company_notes ?? null,
        updated_at:    new Date().toISOString(),
      })
      .eq("id", appId)
      .select()
      .single();

    if (error) return err(error.message, 500);

    // ── Notifications selon le nouveau statut ─────────────────────────────
    const offerTitle = app.internship_offers?.title ?? "l'offre";
    const companyName = app.internship_offers?.companies?.company_name ?? "l'entreprise";

    const notifMap: Record<string, { title: string; msg: string }> = {
      reviewed: {
        title: "Candidature en cours d'examen 👁️",
        msg: `${companyName} examine actuellement votre candidature pour "${offerTitle}".`,
      },
      accepted: {
        title: "Candidature acceptée ! 🎉",
        msg: `Félicitations ! Votre candidature pour "${offerTitle}" chez ${companyName} a été acceptée. Attendez leur contact.`,
      },
      rejected: {
        title: "Candidature non retenue",
        msg: `Votre candidature pour "${offerTitle}" n'a pas été retenue. Ne vous découragez pas, continuez à postuler !`,
      },
    };

    const notif = notifMap[body.status];
    if (notif) {
      await createNotification(
        app.student_id,
        `application_${body.status}`,
        notif.title,
        notif.msg,
        appId
      );
    }

    return ok(updated);
  }

  return err("Méthode non autorisée.", 405);
});

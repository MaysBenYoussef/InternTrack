// backend/supabase/functions/offers-manage/index.ts
//
// Routes:
//   POST   /functions/v1/offers-manage          → Créer une offre (company)
//   GET    /functions/v1/offers-manage           → Lister les offres (filtrées)
//   PATCH  /functions/v1/offers-manage?id=xxx   → Modifier une offre (company owner)
//   DELETE /functions/v1/offers-manage?id=xxx   → Clôturer une offre (company owner)

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

interface OfferPayload {
  title: string;
  description: string;
  domain: string;
  location: string;
  duration_months: number;
  start_date?: string;
  compensation?: number;
  required_skills?: string[];
  required_level?: string;
  is_remote?: boolean;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return handleOptions();

  const url = new URL(req.url);
  const offerId = url.searchParams.get("id");
  const supabase = adminClient();

  // ── GET : lister les offres approuvées avec filtres ───────────────────────
  if (req.method === "GET") {
    const domain    = url.searchParams.get("domain") ?? "";
    const location  = url.searchParams.get("location") ?? "";
    const search    = url.searchParams.get("search") ?? "";
    const remote    = url.searchParams.get("remote");
    const page      = parseInt(url.searchParams.get("page") ?? "1");
    const limit     = Math.min(parseInt(url.searchParams.get("limit") ?? "20"), 50);
    const from      = (page - 1) * limit;

    let query = supabase
      .from("internship_offers")
      .select(
        `id, title, description, domain, location, duration_months,
         compensation, required_skills, required_level, is_remote,
         start_date, created_at, views_count,
         companies(company_name, industry, location, logo_url, is_verified)`,
        { count: "exact" }
      )
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .range(from, from + limit - 1);

    if (domain)   query = query.eq("domain", domain);
    if (remote === "true") query = query.eq("is_remote", true);
    if (location) query = query.ilike("location", `%${location}%`);
    if (search)   query = query.or(
      `title.ilike.%${search}%,description.ilike.%${search}%`
    );

    const { data, error, count } = await query;
    if (error) return err(error.message, 500);

    // Incrémenter views_count si un offerId spécifique est demandé
    if (offerId) {
      await supabase.rpc("increment_offer_views", { offer_id: offerId });
    }

    return ok({ offers: data, total: count, page, limit });
  }

  // ── POST : créer une offre ────────────────────────────────────────────────
  if (req.method === "POST") {
    const profile = await requireRole(req, "company");
    if (profile instanceof Response) return profile;

    const body = await parseBody<OfferPayload>(req);
    if (!body) return err("Corps JSON invalide.");

    // Validation métier
    const required = ["title", "description", "domain", "location", "duration_months"];
    for (const field of required) {
      if (!body[field as keyof OfferPayload])
        return err(`Champ obligatoire manquant: ${field}`);
    }
    if (body.duration_months < 1 || body.duration_months > 24)
      return err("La durée doit être entre 1 et 24 mois.");
    if (body.compensation !== undefined && body.compensation < 0)
      return err("La gratification ne peut pas être négative.");
    if (body.title.length > 150)
      return err("Le titre ne doit pas dépasser 150 caractères.");

    const { data, error } = await supabase.from("internship_offers").insert({
      company_id:       profile.id,
      title:            body.title.trim(),
      description:      body.description.trim(),
      domain:           body.domain,
      location:         body.location.trim(),
      duration_months:  body.duration_months,
      start_date:       body.start_date ?? null,
      compensation:     body.compensation ?? null,
      required_skills:  body.required_skills ?? [],
      required_level:   body.required_level ?? null,
      is_remote:        body.is_remote ?? false,
      status:           "pending", // toujours en attente de validation admin
    }).select().single();

    if (error) return err(error.message, 500);

    // Notifier tous les admins qu'une nouvelle offre attend validation
    const { data: admins } = await supabase
      .from("profiles").select("id").eq("role", "admin");

    await Promise.all(
      (admins ?? []).map((admin) =>
        createNotification(
          admin.id,
          "new_offer_pending",
          "Nouvelle offre à valider",
          `L'entreprise "${profile.full_name}" a soumis l'offre "${body.title}".`,
          data.id
        )
      )
    );

    return ok(data, 201);
  }

  // ── PATCH : modifier une offre ────────────────────────────────────────────
  if (req.method === "PATCH") {
    if (!offerId) return err("Paramètre 'id' requis.");

    const profile = await requireRole(req, "company", "admin");
    if (profile instanceof Response) return profile;

    // Vérifier que l'offre appartient à cette entreprise (sauf admin)
    if (profile.role === "company") {
      const { data: existing } = await supabase
        .from("internship_offers").select("company_id").eq("id", offerId).single();
      if (!existing || existing.company_id !== profile.id)
        return err("Offre introuvable ou accès refusé.", 403);
    }

    const body = await parseBody<Partial<OfferPayload & { status: string }>>(req);
    if (!body) return err("Corps JSON invalide.");

    // Une entreprise ne peut pas changer le statut directement
    if (profile.role === "company") delete body.status;

    const { data, error } = await supabase
      .from("internship_offers")
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq("id", offerId)
      .select().single();

    if (error) return err(error.message, 500);
    return ok(data);
  }

  // ── DELETE (clôturer) ─────────────────────────────────────────────────────
  if (req.method === "DELETE") {
    if (!offerId) return err("Paramètre 'id' requis.");

    const profile = await requireRole(req, "company", "admin");
    if (profile instanceof Response) return profile;

    if (profile.role === "company") {
      const { data: existing } = await supabase
        .from("internship_offers").select("company_id").eq("id", offerId).single();
      if (!existing || existing.company_id !== profile.id)
        return err("Offre introuvable ou accès refusé.", 403);
    }

    const { error } = await supabase
      .from("internship_offers")
      .update({ status: "closed", updated_at: new Date().toISOString() })
      .eq("id", offerId);

    if (error) return err(error.message, 500);
    return ok({ message: "Offre clôturée avec succès." });
  }

  return err("Méthode non autorisée.", 405);
});

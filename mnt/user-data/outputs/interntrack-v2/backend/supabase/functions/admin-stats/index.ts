// backend/supabase/functions/admin-stats/index.ts
//
// GET /functions/v1/admin-stats
// Génère les statistiques complètes de la plateforme pour le dashboard admin.
// Réservé aux administrateurs.

import {
  corsHeaders,
  ok,
  err,
  handleOptions,
  adminClient,
  requireRole,
} from "../_shared/utils.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return handleOptions();
  if (req.method !== "GET") return err("Méthode non autorisée.", 405);

  // ── Auth admin ────────────────────────────────────────────────────────────
  const profile = await requireRole(req, "admin");
  if (profile instanceof Response) return profile;

  const supabase = adminClient();

  // ── Requêtes parallèles pour performance ──────────────────────────────────
  const [
    { count: totalUsers },
    { count: totalStudents },
    { count: totalCompanies },
    { count: totalOffers },
    { count: pendingOffers },
    { count: approvedOffers },
    { count: totalApplications },
    { data: appsByStatus },
    { data: offersByDomain },
    { data: recentActivity },
    { data: topCompanies },
    { data: activeInterns },
  ] = await Promise.all([
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "student"),
    supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "company"),
    supabase.from("internship_offers").select("*", { count: "exact", head: true }),
    supabase.from("internship_offers").select("*", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("internship_offers").select("*", { count: "exact", head: true }).eq("status", "approved"),
    supabase.from("applications").select("*", { count: "exact", head: true }),

    // Candidatures groupées par statut
    supabase.from("applications").select("status"),

    // Offres groupées par domaine
    supabase.from("internship_offers")
      .select("domain")
      .eq("status", "approved"),

    // Activité récente (10 dernières actions)
    supabase.from("applications")
      .select(`applied_at, status,
        students(profiles(full_name)),
        internship_offers(title, companies(company_name))`)
      .order("applied_at", { ascending: false })
      .limit(10),

    // Top entreprises (par nombre d'offres approuvées)
    supabase.from("internship_offers")
      .select("company_id, companies(company_name)")
      .eq("status", "approved"),

    // Étudiants actuellement en stage (candidatures acceptées)
    supabase.from("applications")
      .select("id, updated_at, students(profiles(full_name)), internship_offers(title, companies(company_name))")
      .eq("status", "accepted")
      .order("updated_at", { ascending: false })
      .limit(20),
  ]);

  // ── Calcul des agrégats ───────────────────────────────────────────────────

  // Candidatures par statut
  const applicationsByStatus = {
    pending:  0,
    reviewed: 0,
    accepted: 0,
    rejected: 0,
  };
  (appsByStatus ?? []).forEach((a: { status: string }) => {
    if (a.status in applicationsByStatus)
      applicationsByStatus[a.status as keyof typeof applicationsByStatus]++;
  });

  // Offres par domaine
  const domainCounts: Record<string, number> = {};
  (offersByDomain ?? []).forEach((o: { domain: string }) => {
    domainCounts[o.domain] = (domainCounts[o.domain] ?? 0) + 1;
  });
  const offersByDomainSorted = Object.entries(domainCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([domain, count]) => ({ domain, count }));

  // Top entreprises
  const companyCounts: Record<string, number> = {};
  (topCompanies ?? []).forEach((o: { companies: { company_name: string } }) => {
    const name = o.companies?.company_name ?? "Inconnue";
    companyCounts[name] = (companyCounts[name] ?? 0) + 1;
  });
  const topCompaniesSorted = Object.entries(companyCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([company_name, offers_count]) => ({ company_name, offers_count }));

  // Taux de conversion
  const conversionRate = totalApplications
    ? Math.round((applicationsByStatus.accepted / totalApplications!) * 100)
    : 0;

  // ── Réponse finale ────────────────────────────────────────────────────────
  return ok({
    kpis: {
      total_users:        totalUsers ?? 0,
      total_students:     totalStudents ?? 0,
      total_companies:    totalCompanies ?? 0,
      total_offers:       totalOffers ?? 0,
      pending_offers:     pendingOffers ?? 0,
      approved_offers:    approvedOffers ?? 0,
      total_applications: totalApplications ?? 0,
      active_interns:     activeInterns?.length ?? 0,
      conversion_rate:    conversionRate,
    },
    charts: {
      applications_by_status: applicationsByStatus,
      offers_by_domain:       offersByDomainSorted,
      top_companies:          topCompaniesSorted,
    },
    recent_activity: (recentActivity ?? []).map((a: Record<string, unknown>) => ({
      date:         a.applied_at,
      status:       a.status,
      student_name: (a.students as Record<string, unknown>)?.profiles?.full_name ?? "—",
      offer_title:  (a.internship_offers as Record<string, unknown>)?.title ?? "—",
      company_name: (a.internship_offers as Record<string, unknown>)?.companies?.company_name ?? "—",
    })),
    active_interns: activeInterns ?? [],
    generated_at: new Date().toISOString(),
  });
});

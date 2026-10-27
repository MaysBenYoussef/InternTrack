// frontend/api.js
// ─────────────────────────────────────────────────────────────────────────────
// Client API InternTrack — Couche d'abstraction entre le frontend et les
// Supabase Edge Functions (backend).
//
// Usage dans index.html :
//   <script src="api.js"></script>
//   const offers = await API.offers.list({ domain: 'Web', search: 'react' });
// ─────────────────────────────────────────────────────────────────────────────

const SUPABASE_URL     = 'https://YOUR_PROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';
const FN_BASE          = `${SUPABASE_URL}/functions/v1`;

// ── Requête générique vers une Edge Function ──────────────────────────────────
async function callEdgeFunction(path, options = {}) {
  const { method = 'GET', body, params, requireAuth = true } = options;

  // Construire l'URL avec query params
  const url = new URL(`${FN_BASE}/${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    });
  }

  // Headers
  const headers = {
    'Content-Type':  'application/json',
    'apikey':        SUPABASE_ANON_KEY,
  };

  // Ajouter le JWT si authentifié
  if (requireAuth) {
    const { createClient } = supabase;
    const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: { session } } = await db.auth.getSession();
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }
  }

  const response = await fetch(url.toString(), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await response.json();

  if (!response.ok || !json.success) {
    const errorMsg = json.error || `Erreur HTTP ${response.status}`;
    throw new Error(errorMsg);
  }

  return json.data;
}

// ─────────────────────────────────────────────────────────────────────────────
// API Object — toutes les méthodes disponibles côté frontend
// ─────────────────────────────────────────────────────────────────────────────
const API = {

  // ── Auth ────────────────────────────────────────────────────────────────────
  auth: {
    /**
     * Inscrire un nouvel utilisateur via Edge Function (validation métier côté backend)
     * @param {object} payload - { email, password, full_name, role, ...role_specific }
     */
    register: (payload) =>
      callEdgeFunction('auth-register', {
        method: 'POST',
        body: payload,
        requireAuth: false,
      }),

    /**
     * Connexion directe via Supabase Auth (pas d'Edge Function nécessaire)
     */
    login: async (email, password) => {
      const { createClient } = supabase;
      const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const { data, error } = await db.auth.signInWithPassword({ email, password });
      if (error) throw new Error(
        error.message === 'Invalid login credentials'
          ? 'Email ou mot de passe incorrect.'
          : error.message
      );
      return data;
    },

    logout: async () => {
      const { createClient } = supabase;
      const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      await db.auth.signOut();
    },
  },

  // ── Offres ──────────────────────────────────────────────────────────────────
  offers: {
    /**
     * Lister les offres approuvées avec filtres
     * @param {object} filters - { domain, location, search, remote, page, limit }
     */
    list: (filters = {}) =>
      callEdgeFunction('offers-manage', {
        params: filters,
        requireAuth: false,
      }),

    /**
     * Créer une nouvelle offre (company uniquement)
     * @param {object} offerData - { title, description, domain, location, ... }
     */
    create: (offerData) =>
      callEdgeFunction('offers-manage', {
        method: 'POST',
        body: offerData,
      }),

    /**
     * Modifier une offre existante
     * @param {string} offerId
     * @param {object} updates
     */
    update: (offerId, updates) =>
      callEdgeFunction('offers-manage', {
        method: 'PATCH',
        params: { id: offerId },
        body: updates,
      }),

    /**
     * Clôturer une offre
     * @param {string} offerId
     */
    close: (offerId) =>
      callEdgeFunction('offers-manage', {
        method: 'DELETE',
        params: { id: offerId },
      }),
  },

  // ── Candidatures ────────────────────────────────────────────────────────────
  applications: {
    /**
     * Postuler à une offre (student uniquement)
     * @param {string} offerId
     * @param {string} coverLetter
     * @param {string} cvUrl - optionnel
     */
    apply: (offerId, coverLetter, cvUrl = '') =>
      callEdgeFunction('applications-manage', {
        method: 'POST',
        body: { offer_id: offerId, cover_letter: coverLetter, cv_url: cvUrl },
      }),

    /**
     * Lister les candidatures (résultat filtré par rôle côté backend)
     * @param {object} filters - { status }
     */
    list: (filters = {}) =>
      callEdgeFunction('applications-manage', { params: filters }),

    /**
     * Changer le statut d'une candidature (company/admin)
     * @param {string} appId
     * @param {'reviewed'|'accepted'|'rejected'} status
     * @param {string} notes - optionnel
     */
    updateStatus: (appId, status, notes = '') =>
      callEdgeFunction('applications-manage', {
        method: 'PATCH',
        params: { id: appId },
        body: { status, company_notes: notes },
      }),
  },

  // ── Admin ───────────────────────────────────────────────────────────────────
  admin: {
    /**
     * Valider ou rejeter une offre
     * @param {string} offerId
     * @param {'approve'|'reject'} action
     * @param {string} reason - optionnel, pour un rejet
     */
    validateOffer: (offerId, action, reason = '') =>
      callEdgeFunction('admin-validate-offer', {
        method: 'PATCH',
        params: { id: offerId },
        body: { action, reason },
      }),

    /**
     * Obtenir les statistiques complètes de la plateforme
     */
    getStats: () =>
      callEdgeFunction('admin-stats'),
  },

  // ── Notifications ────────────────────────────────────────────────────────────
  notifications: {
    /**
     * Lister les notifications de l'utilisateur connecté
     * @param {object} options - { unread: bool, limit: number }
     */
    list: (options = {}) =>
      callEdgeFunction('notifications-send', { params: options }),

    /**
     * Marquer une notification comme lue
     * @param {string} notifId
     */
    markRead: (notifId) =>
      callEdgeFunction('notifications-send', {
        method: 'PATCH',
        params: { id: notifId },
      }),

    /**
     * Tout marquer comme lu
     */
    markAllRead: () =>
      callEdgeFunction('notifications-send', {
        method: 'PATCH',
        params: { all: 'true' },
      }),

    /**
     * (Admin) Envoyer une notification manuelle
     * @param {object} payload - { user_id | role, title, message, type }
     */
    send: (payload) =>
      callEdgeFunction('notifications-send', {
        method: 'POST',
        body: payload,
      }),
  },
};

// Export pour usage en module (Node/bundler) ou global (browser)
if (typeof module !== 'undefined') module.exports = { API };

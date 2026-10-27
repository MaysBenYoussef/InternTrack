# InternTrack — Documentation complète

## Architecture du projet

```
interntrack-v2/
│
├── frontend/                          # Interface utilisateur (HTML/CSS/JS)
│   ├── index.html                     # Application SPA complète
│   └── api.js                         # Client API → Edge Functions
│
└── backend/
    └── supabase/
        ├── config.toml                # Config CLI Supabase
        ├── migrations/
        │   └── 001_initial_schema.sql # Schéma BDD + RLS + triggers + index
        ├── seed/
        │   └── seed.sql               # Données de test
        └── functions/
            ├── _shared/
            │   └── utils.ts           # Utilitaires partagés (auth, CORS, notifs)
            ├── auth-register/
            │   └── index.ts           # POST  — Inscription avec validation métier
            ├── offers-manage/
            │   └── index.ts           # CRUD  — Gestion des offres
            ├── applications-manage/
            │   └── index.ts           # CRUD  — Gestion des candidatures
            ├── admin-validate-offer/
            │   └── index.ts           # PATCH — Validation admin des offres
            ├── admin-stats/
            │   └── index.ts           # GET   — Statistiques plateforme
            └── notifications-send/
                └── index.ts           # CRUD  — Gestion des notifications
```

---

## Stack technique

| Couche | Technologie |
|--------|-------------|
| Frontend | HTML5 / CSS3 / Vanilla JS |
| Backend | Supabase Edge Functions (Deno + TypeScript) |
| Base de données | PostgreSQL (via Supabase) |
| Authentification | Supabase Auth (JWT) |
| Sécurité BDD | Row Level Security (RLS) |
| Déploiement | Supabase Cloud + Netlify/Vercel |

---

## Routes des Edge Functions (API REST)

### `auth-register`
| Méthode | Route | Rôle requis | Description |
|---------|-------|-------------|-------------|
| POST | `/functions/v1/auth-register` | — | Inscription étudiant/entreprise |

### `offers-manage`
| Méthode | Route | Rôle requis | Description |
|---------|-------|-------------|-------------|
| GET | `/functions/v1/offers-manage` | — | Lister offres (filtres: domain, location, search, remote, page) |
| POST | `/functions/v1/offers-manage` | company | Créer une offre |
| PATCH | `/functions/v1/offers-manage?id=xxx` | company/admin | Modifier une offre |
| DELETE | `/functions/v1/offers-manage?id=xxx` | company/admin | Clôturer une offre |

### `applications-manage`
| Méthode | Route | Rôle requis | Description |
|---------|-------|-------------|-------------|
| POST | `/functions/v1/applications-manage` | student | Postuler à une offre |
| GET | `/functions/v1/applications-manage` | all | Lister candidatures (filtrées par rôle) |
| PATCH | `/functions/v1/applications-manage?id=xxx` | company/admin | Changer statut |

### `admin-validate-offer`
| Méthode | Route | Rôle requis | Description |
|---------|-------|-------------|-------------|
| PATCH | `/functions/v1/admin-validate-offer?id=xxx` | admin | Approuver/rejeter une offre |

### `admin-stats`
| Méthode | Route | Rôle requis | Description |
|---------|-------|-------------|-------------|
| GET | `/functions/v1/admin-stats` | admin | Statistiques complètes plateforme |

### `notifications-send`
| Méthode | Route | Rôle requis | Description |
|---------|-------|-------------|-------------|
| GET | `/functions/v1/notifications-send` | all | Lister mes notifications |
| PATCH | `/functions/v1/notifications-send?id=xxx` | all | Marquer comme lue |
| PATCH | `/functions/v1/notifications-send?all=true` | all | Tout marquer comme lu |
| POST | `/functions/v1/notifications-send` | admin | Envoyer notification manuelle |

---

## Installation et déploiement

### Prérequis
```bash
npm install -g supabase
supabase --version   # >= 1.150
```

### 1. Créer un projet Supabase
1. Aller sur [supabase.com](https://supabase.com) → New Project
2. Choisir région Europe West (recommandé)
3. Noter le `Project URL` et les clés API

### 2. Initialiser le CLI Supabase
```bash
cd backend/
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```

### 3. Appliquer la migration (schéma BDD)
```bash
# Option A — Via CLI (recommandé)
supabase db push

# Option B — Manuellement dans SQL Editor
# Copier-coller le contenu de migrations/001_initial_schema.sql
```

### 4. Déployer les Edge Functions
```bash
# Déployer toutes les fonctions
supabase functions deploy auth-register
supabase functions deploy offers-manage
supabase functions deploy applications-manage
supabase functions deploy admin-validate-offer
supabase functions deploy admin-stats
supabase functions deploy notifications-send

# Ou tout en une commande :
supabase functions deploy
```

### 5. Variables d'environnement des Edge Functions
Les variables suivantes sont automatiquement injectées par Supabase :
- `SUPABASE_URL` — URL du projet
- `SUPABASE_ANON_KEY` — Clé publique
- `SUPABASE_SERVICE_ROLE_KEY` — Clé admin (⚠️ ne jamais exposer côté frontend)

### 6. Configurer le frontend
Dans `frontend/index.html` et `frontend/api.js`, remplacer :
```js
const SUPABASE_URL      = 'https://YOUR_PROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';
```

### 7. Créer l'administrateur
```bash
# Dans Supabase Dashboard → Table Editor → profiles
# Changer role de 'student' à 'admin' pour votre compte
```

### 8. Déployer le frontend
```bash
# Netlify (glisser-déposer le dossier frontend/)
# Vercel
cd frontend/
vercel deploy

# GitHub Pages
# Pousser le contenu de frontend/ sur la branche gh-pages
```

---

## Développement local

```bash
cd backend/

# Démarrer Supabase en local (Docker requis)
supabase start

# Tester une Edge Function en local
supabase functions serve auth-register --no-verify-jwt

# Tester avec curl
curl -X POST http://localhost:54321/functions/v1/auth-register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "full_name": "Test User",
    "role": "student"
  }'
```

---

## Sécurité

- **RLS activé** sur toutes les tables — aucune donnée n'est accessible sans règle explicite
- **service_role** utilisé uniquement dans les Edge Functions (jamais exposé au frontend)
- **JWT vérifié** automatiquement par Supabase pour chaque appel d'Edge Function
- **Validation métier** centralisée dans les Edge Functions (pas de logique critique côté client)
- **Guards de rôle** dans chaque Edge Function via `requireRole()`

---

## Exemple d'utilisation de l'API frontend

```js
// Charger les offres
const { offers, total } = await API.offers.list({ domain: 'Web', search: 'react' });

// Postuler
await API.applications.apply(offerId, 'Ma lettre de motivation...', 'https://cv.example.com');

// Admin — valider une offre
await API.admin.validateOffer(offerId, 'approve');

// Admin — obtenir les stats
const stats = await API.admin.getStats();
console.log(stats.kpis.total_users, stats.charts.offers_by_domain);

// Notifications
const { notifications, unread_count } = await API.notifications.list({ unread: true });
await API.notifications.markAllRead();
```

-- =============================================================
-- Migration 001 — Schéma complet InternTrack
-- Fichier: backend/supabase/migrations/001_initial_schema.sql
-- =============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── profiles ──────────────────────────────────────────────────
CREATE TABLE public.profiles (
  id         UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  role       TEXT NOT NULL CHECK (role IN ('student','company','admin')),
  full_name  TEXT,
  phone      TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── students ──────────────────────────────────────────────────
CREATE TABLE public.students (
  id             UUID REFERENCES public.profiles(id) ON DELETE CASCADE PRIMARY KEY,
  university     TEXT,
  field_of_study TEXT,
  year_of_study  INTEGER CHECK (year_of_study BETWEEN 1 AND 8),
  skills         TEXT[],
  bio            TEXT,
  cv_url         TEXT,
  linkedin_url   TEXT,
  github_url     TEXT
);

-- ── companies ─────────────────────────────────────────────────
CREATE TABLE public.companies (
  id           UUID REFERENCES public.profiles(id) ON DELETE CASCADE PRIMARY KEY,
  company_name TEXT NOT NULL,
  industry     TEXT,
  description  TEXT,
  website      TEXT,
  logo_url     TEXT,
  location     TEXT,
  size         TEXT CHECK (size IN ('1-10','11-50','51-200','201-500','500+')),
  is_verified  BOOLEAN DEFAULT FALSE
);

-- ── internship_offers ─────────────────────────────────────────
CREATE TABLE public.internship_offers (
  id                UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  company_id        UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  title             TEXT NOT NULL,
  description       TEXT NOT NULL,
  domain            TEXT NOT NULL,
  location          TEXT NOT NULL,
  duration_months   INTEGER NOT NULL CHECK (duration_months BETWEEN 1 AND 24),
  start_date        DATE,
  compensation      NUMERIC(10,2),
  compensation_currency TEXT DEFAULT 'EUR',
  required_skills   TEXT[],
  required_level    TEXT CHECK (required_level IN ('Bac+1','Bac+2','Bac+3','Bac+4','Bac+5','Bac+8')),
  is_remote         BOOLEAN DEFAULT FALSE,
  status            TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','closed')),
  views_count       INTEGER DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  expires_at        TIMESTAMPTZ
);

-- ── applications ──────────────────────────────────────────────
CREATE TABLE public.applications (
  id            UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  student_id    UUID REFERENCES public.students(id) ON DELETE CASCADE NOT NULL,
  offer_id      UUID REFERENCES public.internship_offers(id) ON DELETE CASCADE NOT NULL,
  cover_letter  TEXT,
  cv_url        TEXT,
  status        TEXT DEFAULT 'pending' CHECK (status IN ('pending','reviewed','accepted','rejected')),
  company_notes TEXT,
  applied_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, offer_id)
);

-- ── notifications ─────────────────────────────────────────────
CREATE TABLE public.notifications (
  id         UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id    UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  type       TEXT NOT NULL,
  title      TEXT NOT NULL,
  message    TEXT NOT NULL,
  is_read    BOOLEAN DEFAULT FALSE,
  related_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── messages ──────────────────────────────────────────────────
CREATE TABLE public.messages (
  id             UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  sender_id      UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  receiver_id    UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  application_id UUID REFERENCES public.applications(id) ON DELETE CASCADE,
  content        TEXT NOT NULL,
  is_read        BOOLEAN DEFAULT FALSE,
  sent_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ── internship_tracking ───────────────────────────────────────
CREATE TABLE public.internship_tracking (
  id                 UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  application_id     UUID REFERENCES public.applications(id) ON DELETE CASCADE UNIQUE NOT NULL,
  start_date         DATE,
  end_date           DATE,
  supervisor_name    TEXT,
  supervisor_email   TEXT,
  student_report_url TEXT,
  company_evaluation TEXT CHECK (company_evaluation IN ('excellent','good','average','poor')),
  admin_notes        TEXT,
  status             TEXT DEFAULT 'ongoing' CHECK (status IN ('ongoing','completed','interrupted')),
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================
-- RLS
-- =============================================================
ALTER TABLE public.profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internship_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internship_tracking ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "profiles_select_all"   ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles_insert_own"   ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own"   ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- students
CREATE POLICY "students_select_auth"  ON public.students FOR SELECT TO authenticated USING (true);
CREATE POLICY "students_insert_own"   ON public.students FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "students_update_own"   ON public.students FOR UPDATE USING (auth.uid() = id);

-- companies
CREATE POLICY "companies_select_all"  ON public.companies FOR SELECT USING (true);
CREATE POLICY "companies_insert_own"  ON public.companies FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "companies_update_own"  ON public.companies FOR UPDATE USING (auth.uid() = id);

-- internship_offers
CREATE POLICY "offers_select_public"  ON public.internship_offers FOR SELECT
  USING (status = 'approved' OR auth.uid() = company_id
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "offers_insert_company" ON public.internship_offers FOR INSERT
  WITH CHECK (auth.uid() = company_id);
CREATE POLICY "offers_update_owner"   ON public.internship_offers FOR UPDATE
  USING (auth.uid() = company_id
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- applications
CREATE POLICY "apps_select_involved"  ON public.applications FOR SELECT
  USING (auth.uid() = student_id
    OR EXISTS (SELECT 1 FROM internship_offers WHERE id = offer_id AND company_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "apps_insert_student"   ON public.applications FOR INSERT
  WITH CHECK (auth.uid() = student_id);
CREATE POLICY "apps_update_involved"  ON public.applications FOR UPDATE
  USING (EXISTS (SELECT 1 FROM internship_offers WHERE id = offer_id AND company_id = auth.uid())
    OR auth.uid() = student_id
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- notifications (les Edge Functions utilisent service_role, donc pas de restriction RLS sur elles)
CREATE POLICY "notifs_select_own"     ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "notifs_insert_auth"    ON public.notifications FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "notifs_update_own"     ON public.notifications FOR UPDATE USING (auth.uid() = user_id);

-- messages
CREATE POLICY "msgs_select_parties"   ON public.messages FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
CREATE POLICY "msgs_insert_sender"    ON public.messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender_id);

-- tracking
CREATE POLICY "tracking_admin_all"    ON public.internship_tracking FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "tracking_select_involved" ON public.internship_tracking FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM applications a
    JOIN internship_offers o ON a.offer_id = o.id
    WHERE a.id = application_id
      AND (a.student_id = auth.uid() OR o.company_id = auth.uid())
  ));

-- =============================================================
-- FUNCTIONS & TRIGGERS
-- =============================================================

-- Auto-création du profil à l'inscription
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, role, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'role', 'student'),
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  ) ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at automatique
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_updated_at   BEFORE UPDATE ON public.profiles          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_offers_updated_at     BEFORE UPDATE ON public.internship_offers  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_apps_updated_at       BEFORE UPDATE ON public.applications       FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Incrément vues offre (appelé par offers-manage Edge Function)
CREATE OR REPLACE FUNCTION public.increment_offer_views(offer_id UUID)
RETURNS VOID AS $$
  UPDATE public.internship_offers SET views_count = views_count + 1 WHERE id = offer_id;
$$ LANGUAGE sql SECURITY DEFINER;

-- =============================================================
-- INDEX pour performances
-- =============================================================
CREATE INDEX idx_offers_status      ON public.internship_offers(status);
CREATE INDEX idx_offers_domain      ON public.internship_offers(domain);
CREATE INDEX idx_offers_company     ON public.internship_offers(company_id);
CREATE INDEX idx_apps_student       ON public.applications(student_id);
CREATE INDEX idx_apps_offer         ON public.applications(offer_id);
CREATE INDEX idx_apps_status        ON public.applications(status);
CREATE INDEX idx_notifs_user        ON public.notifications(user_id);
CREATE INDEX idx_notifs_unread      ON public.notifications(user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX idx_messages_receiver  ON public.messages(receiver_id);

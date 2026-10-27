-- =============================================================
-- Seed data — Données de test InternTrack
-- backend/supabase/seed/seed.sql
-- =============================================================
-- ⚠️  À exécuter APRÈS avoir créé manuellement les comptes Auth
--     via le Dashboard Supabase ou l'API Auth Admin.
--     Remplacez les UUIDs ci-dessous par les vrais IDs.
-- =============================================================

-- Exemple d'IDs (à remplacer)
-- Admin    : 00000000-0000-0000-0000-000000000001
-- Student1 : 00000000-0000-0000-0000-000000000002
-- Student2 : 00000000-0000-0000-0000-000000000003
-- Company1 : 00000000-0000-0000-0000-000000000004
-- Company2 : 00000000-0000-0000-0000-000000000005

DO $$
DECLARE
  admin_id    UUID := '00000000-0000-0000-0000-000000000001';
  student1_id UUID := '00000000-0000-0000-0000-000000000002';
  student2_id UUID := '00000000-0000-0000-0000-000000000003';
  company1_id UUID := '00000000-0000-0000-0000-000000000004';
  company2_id UUID := '00000000-0000-0000-0000-000000000005';
  offer1_id   UUID;
  offer2_id   UUID;
  offer3_id   UUID;
BEGIN

  -- ── Profiles ──────────────────────────────────────────────
  INSERT INTO public.profiles (id, role, full_name) VALUES
    (admin_id,    'admin',   'Administrateur UPMC'),
    (student1_id, 'student', 'Nour Benali'),
    (student2_id, 'student', 'Amine Tahir'),
    (company1_id, 'company', 'TechCorp France'),
    (company2_id, 'company', 'DataVision SAS')
  ON CONFLICT (id) DO NOTHING;

  -- ── Students ──────────────────────────────────────────────
  INSERT INTO public.students (id, university, field_of_study, year_of_study, skills, bio) VALUES
    (student1_id, 'Université Paris Sorbonne', 'Informatique - IA', 4,
     ARRAY['Python','Machine Learning','React','SQL','Docker'],
     'Étudiant passionné par l''IA et le développement web. Cherche un stage stimulant.'),
    (student2_id, 'Université Paris-Saclay', 'Data Science', 5,
     ARRAY['Python','R','Pandas','TensorFlow','Power BI'],
     'Data scientist en devenir, passionné par l''analyse de données.')
  ON CONFLICT (id) DO NOTHING;

  -- ── Companies ─────────────────────────────────────────────
  INSERT INTO public.companies (id, company_name, industry, description, location, size, is_verified) VALUES
    (company1_id, 'TechCorp France', 'Technologies', 'Leader français en solutions cloud et IA pour entreprises.', 'Paris, France', '201-500', TRUE),
    (company2_id, 'DataVision SAS',  'Data & Analytics', 'Cabinet de conseil spécialisé en data engineering et visualisation.', 'Lyon, France', '51-200', TRUE)
  ON CONFLICT (id) DO NOTHING;

  -- ── Internship Offers ─────────────────────────────────────
  INSERT INTO public.internship_offers
    (id, company_id, title, description, domain, location, duration_months,
     compensation, required_skills, required_level, is_remote, status)
  VALUES
    (uuid_generate_v4(), company1_id,
     'Stage Développeur Full-Stack React/Node.js',
     'Rejoignez notre équipe produit pour développer des fonctionnalités sur notre plateforme SaaS. Vous travaillerez sur le frontend React et le backend Node.js dans un environnement Agile.',
     'Web', 'Paris, France', 6, 800,
     ARRAY['React','Node.js','TypeScript','PostgreSQL'], 'Bac+4', FALSE, 'approved')
  RETURNING id INTO offer1_id;

  INSERT INTO public.internship_offers
    (id, company_id, title, description, domain, location, duration_months,
     compensation, required_skills, required_level, is_remote, status)
  VALUES
    (uuid_generate_v4(), company1_id,
     'Stage Data Scientist — NLP & Computer Vision',
     'Au sein de notre laboratoire R&D, vous développerez des modèles de machine learning pour l''analyse de documents et la reconnaissance d''images. Encadrement par des chercheurs expérimentés.',
     'Intelligence Artificielle', 'Paris, France', 6, 1000,
     ARRAY['Python','TensorFlow','PyTorch','scikit-learn','NLP'], 'Bac+5', TRUE, 'approved')
  RETURNING id INTO offer2_id;

  INSERT INTO public.internship_offers
    (id, company_id, title, description, domain, location, duration_months,
     compensation, required_skills, required_level, is_remote, status)
  VALUES
    (uuid_generate_v4(), company2_id,
     'Stage Ingénieur Data / ETL',
     'Vous intégrerez l''équipe data pour concevoir et maintenir des pipelines ETL, optimiser les performances de notre data warehouse et créer des tableaux de bord analytiques.',
     'Data Science', 'Lyon, France', 5, 750,
     ARRAY['Python','SQL','dbt','Airflow','Power BI'], 'Bac+4', FALSE, 'approved')
  RETURNING id INTO offer3_id;

  -- ── Applications ──────────────────────────────────────────
  INSERT INTO public.applications
    (student_id, offer_id, cover_letter, status)
  VALUES
    (student1_id, offer1_id,
     'Bonjour, étudiant en 4ème année d''informatique, je suis passionné par le développement web et je souhaite mettre en pratique mes compétences React et Node.js dans un environnement professionnel stimulant.',
     'pending'),
    (student2_id, offer2_id,
     'Diplômé en Data Science, je maîtrise Python, TensorFlow et les techniques NLP. Ce stage représente une opportunité idéale pour approfondir mes compétences en IA au sein d''une équipe de recherche.',
     'reviewed'),
    (student1_id, offer3_id,
     'Très intéressé par le poste d''ingénieur data, j''ai développé plusieurs pipelines ETL lors de mes projets académiques et je suis à l''aise avec SQL et Python.',
     'accepted')
  ON CONFLICT (student_id, offer_id) DO NOTHING;

  -- ── Notifications de bienvenue ────────────────────────────
  INSERT INTO public.notifications (user_id, type, title, message) VALUES
    (student1_id, 'welcome', 'Bienvenue sur InternTrack! 🎓',
     'Votre compte étudiant est prêt. Complétez votre profil pour augmenter vos chances!'),
    (student2_id, 'welcome', 'Bienvenue sur InternTrack! 🎓',
     'Votre compte étudiant est prêt. Commencez à explorer les offres!'),
    (company1_id, 'welcome', 'Bienvenue sur InternTrack! 🏢',
     'Votre compte entreprise est actif. Publiez votre première offre dès maintenant.'),
    (company2_id, 'welcome', 'Bienvenue sur InternTrack! 🏢',
     'Bienvenue DataVision SAS! Vos offres seront visibles après validation.')
  ;

END $$;

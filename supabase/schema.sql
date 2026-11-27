-- ============================================================================
-- EFA RESTO-LIVRO — Schéma Complet PostgreSQL + RLS + Triggers + Realtime
-- À coller et exécuter dans l'Éditeur SQL de Supabase
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. TABLE FORMULES (Tarifs & Limites strictes modifiables par Super-Admin)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.formules (
  id text PRIMARY KEY CHECK (id IN ('bar', 'resto', 'premium')),
  nom text NOT NULL,
  description text NOT NULL,
  prix_mensuel integer NOT NULL CHECK (prix_mensuel >= 0),
  prix_annuel integer NOT NULL CHECK (prix_annuel >= 0),
  max_employes integer NOT NULL,
  max_appareils integer NOT NULL,
  max_tables integer, -- NULL = illimité
  max_produits integer, -- NULL = illimité
  max_chambres integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.formules (id, nom, description, prix_mensuel, prix_annuel, max_employes, max_appareils, max_tables, max_produits, max_chambres)
VALUES
  ('bar', 'Formules BAR', 'Boissons seulement · Serveur, Caissier, Stock Boissons, Paiement', 7500, 75000, 3, 3, 10, 30, 0),
  ('resto', 'Formules RESTO', 'Bar + Menu Plats + Cuisine + Crédit Client + Stats + Livraison', 20000, 200000, 9, 8, 25, 80, 0),
  ('premium', 'Formules PREMIUM', 'Tout RESTO + Module Hôtel Complet (Chambres, Check-in/out, Ménage)', 35000, 350000, 20, 15, NULL, NULL, 50)
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. TABLE ETABLISSEMENTS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.etablissements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom text NOT NULL,
  code_etablissement text UNIQUE NOT NULL,
  telephone text,
  adresse text,
  ville text DEFAULT 'Lomé',
  formule text NOT NULL DEFAULT 'bar' REFERENCES public.formules(id),
  cycle_abonnement text NOT NULL DEFAULT 'mensuel' CHECK (cycle_abonnement IN ('mensuel', 'annuel')),
  statut_abonnement text NOT NULL DEFAULT 'essai' CHECK (statut_abonnement IN ('essai', 'actif', 'expire', 'bloque')),
  essai_debut timestamptz NOT NULL DEFAULT now(),
  essai_fin timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  abonnement_fin timestamptz,
  est_bloque boolean NOT NULL DEFAULT false,
  nb_tables integer NOT NULL DEFAULT 10,
  zones_livraison jsonb NOT NULL DEFAULT '[
    {"quartier":"Centre-ville","frais":500},
    {"quartier":"Bè","frais":500},
    {"quartier":"Agoè","frais":1000},
    {"quartier":"Adidogomé","frais":1000},
    {"quartier":"Tokoin","frais":500}
  ]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 3. TABLE PROFILS (Lien 1-1 avec auth.users)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profils (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  etablissement_id uuid REFERENCES public.etablissements(id) ON DELETE CASCADE,
  nom text NOT NULL,
  email text,
  telephone text,
  role text NOT NULL CHECK (role IN ('super_admin', 'patron', 'caissier', 'serveur', 'cuisinier', 'livreur', 'receptionniste', 'menage')),
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 4. TABLE EMPLOYES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.employes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  etablissement_id uuid NOT NULL REFERENCES public.etablissements(id) ON DELETE CASCADE,
  profil_id uuid REFERENCES public.profils(id) ON DELETE SET NULL,
  nom text NOT NULL,
  telephone text,
  email text,
  role text NOT NULL CHECK (role IN ('patron', 'caissier', 'serveur', 'cuisinier', 'livreur', 'receptionniste', 'menage')),
  pin_code text NOT NULL DEFAULT '1234',
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 5. TABLE STOCK
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  etablissement_id uuid NOT NULL REFERENCES public.etablissements(id) ON DELETE CASCADE,
  nom text NOT NULL,
  categorie text NOT NULL DEFAULT 'cuisine' CHECK (categorie IN ('boisson', 'cuisine', 'hotel', 'autre')),
  unite text NOT NULL DEFAULT 'unité',
  quantite numeric(12,2) NOT NULL DEFAULT 0,
  seuil_alerte numeric(12,2) NOT NULL DEFAULT 5,
  prix_achat_unitaire integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 6. TABLE APPROVISIONNEMENTS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.approvisionnements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  etablissement_id uuid NOT NULL REFERENCES public.etablissements(id) ON DELETE CASCADE,
  stock_id uuid NOT NULL REFERENCES public.stock(id) ON DELETE CASCADE,
  quantite numeric(12,2) NOT NULL CHECK (quantite > 0),
  prix_achat_unitaire integer NOT NULL DEFAULT 0,
  montant_total integer NOT NULL DEFAULT 0,
  fournisseur text,
  note text,
  cree_par text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 7. TABLE MENUS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.menus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  etablissement_id uuid NOT NULL REFERENCES public.etablissements(id) ON DELETE CASCADE,
  nom text NOT NULL,
  categorie text NOT NULL CHECK (categorie IN ('boisson', 'plat', 'grillade')),
  prix integer NOT NULL CHECK (prix >= 0),
  cout_revient integer NOT NULL DEFAULT 0,
  photo_url text,
  est_plat_du_jour boolean NOT NULL DEFAULT false,
  est_epuise boolean NOT NULL DEFAULT false,
  recette jsonb NOT NULL DEFAULT '[]'::jsonb,
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 8. TABLE CHAMBRES (PREMIUM UNIQUEMENT)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chambres (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  etablissement_id uuid NOT NULL REFERENCES public.etablissements(id) ON DELETE CASCADE,
  numero text NOT NULL,
  type_chambre text NOT NULL DEFAULT 'Standard' CHECK (type_chambre IN ('Standard', 'Deluxe', 'Suite', 'Ventilateur', 'Climatisé')),
  prix_heure integer NOT NULL DEFAULT 5000,
  prix_nuit integer NOT NULL DEFAULT 20000,
  prix_journee integer NOT NULL DEFAULT 15000,
  statut text NOT NULL DEFAULT 'LIBRE' CHECK (statut IN ('LIBRE', 'OCCUPEE', 'EN_NETTOYAGE', 'RESERVEE', 'HORS_SERVICE')),
  photo_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(etablissement_id, numero)
);

-- ----------------------------------------------------------------------------
-- 9. TABLE RESERVATIONS (PREMIUM UNIQUEMENT)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  etablissement_id uuid NOT NULL REFERENCES public.etablissements(id) ON DELETE CASCADE,
  chambre_id uuid NOT NULL REFERENCES public.chambres(id) ON DELETE CASCADE,
  client_nom text NOT NULL,
  client_tel text NOT NULL,
  date_arrivee timestamptz NOT NULL,
  date_depart timestamptz NOT NULL,
  type_sejour text NOT NULL DEFAULT 'Nuit' CHECK (type_sejour IN ('Heure', 'Nuit', 'Journée')),
  acompte integer NOT NULL DEFAULT 0,
  statut text NOT NULL DEFAULT 'CONFIRMEE' CHECK (statut IN ('CONFIRMEE', 'HONOREE', 'ANNULEE')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 10. TABLE SEJOURS (Check-in / Check-out - PREMIUM UNIQUEMENT)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sejours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  etablissement_id uuid NOT NULL REFERENCES public.etablissements(id) ON DELETE CASCADE,
  chambre_id uuid NOT NULL REFERENCES public.chambres(id) ON DELETE CASCADE,
  chambre_numero text NOT NULL,
  client_nom text NOT NULL,
  client_tel text NOT NULL,
  piece_identite text NOT NULL,
  nb_personnes integer NOT NULL DEFAULT 1,
  type_sejour text NOT NULL CHECK (type_sejour IN ('Heure', 'Nuit', 'Journée')),
  duree_prevue integer NOT NULL DEFAULT 1,
  prix_unitaire integer NOT NULL DEFAULT 0,
  montant_chambre integer NOT NULL DEFAULT 0,
  supplement_prolongation integer NOT NULL DEFAULT 0,
  acompte_verse integer NOT NULL DEFAULT 0,
  heure_arrivee timestamptz NOT NULL DEFAULT now(),
  heure_depart_prevue timestamptz NOT NULL,
  heure_depart_reelle timestamptz,
  statut text NOT NULL DEFAULT 'EN_COURS' CHECK (statut IN ('EN_COURS', 'TERMINE')),
  receptionniste_nom text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 11. TABLE COMMANDES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.commandes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  etablissement_id uuid NOT NULL REFERENCES public.etablissements(id) ON DELETE CASCADE,
  numero_bon text NOT NULL,
  type_service text NOT NULL CHECK (type_service IN ('Table', 'Terrasse', 'A Emporter', 'Chambre', 'Livraison')),
  cible text NOT NULL,
  chambre_id uuid REFERENCES public.chambres(id) ON DELETE SET NULL,
  sejour_id uuid REFERENCES public.sejours(id) ON DELETE SET NULL,
  serveur_id uuid REFERENCES public.employes(id) ON DELETE SET NULL,
  serveur_nom text NOT NULL,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  montant_items integer NOT NULL DEFAULT 0,
  frais_livraison integer NOT NULL DEFAULT 0,
  montant_total integer NOT NULL DEFAULT 0,
  statut_caisse text NOT NULL DEFAULT 'EN_ATTENTE' CHECK (statut_caisse IN ('EN_ATTENTE', 'VALIDEE', 'ENCAISSEE', 'CREDIT', 'SUR_CHAMBRE', 'ANNULEE')),
  statut_cuisine text NOT NULL DEFAULT 'EN_ATTENTE' CHECK (statut_cuisine IN ('EN_ATTENTE', 'EN_PREPARATION', 'PRET', 'SERVI')),
  stock_deduit boolean NOT NULL DEFAULT false,
  caissier_nom text,
  client_nom text,
  client_tel text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  validated_at timestamptz,
  paid_at timestamptz
);

-- ----------------------------------------------------------------------------
-- 12. TABLE PAIEMENTS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.paiements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  etablissement_id uuid NOT NULL REFERENCES public.etablissements(id) ON DELETE CASCADE,
  commande_id uuid REFERENCES public.commandes(id) ON DELETE SET NULL,
  sejour_id uuid REFERENCES public.sejours(id) ON DELETE SET NULL,
  type_paiement text NOT NULL DEFAULT 'commande' CHECK (type_paiement IN ('commande', 'sejour_checkout', 'reglement_credit', 'acompte_reservation')),
  mode_paiement text NOT NULL CHECK (mode_paiement IN ('Especes', 'Mixx by Yas', 'Moov Money', 'Orange Money', 'Wave', 'Credit')),
  montant integer NOT NULL CHECK (montant >= 0),
  client_nom text,
  client_tel text,
  est_regle boolean NOT NULL DEFAULT true,
  caissier_nom text NOT NULL,
  reference text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 13. TABLE LIVRAISONS (RESTO & PREMIUM)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.livraisons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  etablissement_id uuid NOT NULL REFERENCES public.etablissements(id) ON DELETE CASCADE,
  commande_id uuid NOT NULL REFERENCES public.commandes(id) ON DELETE CASCADE,
  client_nom text NOT NULL,
  client_tel text NOT NULL,
  quartier text NOT NULL,
  adresse_detail text NOT NULL,
  frais_livraison integer NOT NULL DEFAULT 0,
  montant_a_encaisser integer NOT NULL DEFAULT 0,
  livreur_id uuid REFERENCES public.employes(id) ON DELETE SET NULL,
  livreur_nom text,
  statut text NOT NULL DEFAULT 'EN_ATTENTE' CHECK (statut IN ('EN_ATTENTE', 'EN_COURS', 'LIVRE')),
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz
);

-- ----------------------------------------------------------------------------
-- 14. TABLE MENAGE (PREMIUM)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.menage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  etablissement_id uuid NOT NULL REFERENCES public.etablissements(id) ON DELETE CASCADE,
  chambre_id uuid NOT NULL REFERENCES public.chambres(id) ON DELETE CASCADE,
  chambre_numero text NOT NULL,
  sejour_id uuid REFERENCES public.sejours(id) ON DELETE SET NULL,
  statut text NOT NULL DEFAULT 'A_NETTOYER' CHECK (statut IN ('A_NETTOYER', 'EN_COURS', 'NETTOYEE')),
  agent_nom text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

-- ----------------------------------------------------------------------------
-- 15. TABLE ABONNEMENTS (Paiements SaaS des établissements)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.abonnements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  etablissement_id uuid NOT NULL REFERENCES public.etablissements(id) ON DELETE CASCADE,
  formule text NOT NULL REFERENCES public.formules(id),
  cycle text NOT NULL CHECK (cycle IN ('mensuel', 'annuel')),
  montant integer NOT NULL DEFAULT 0,
  mode_paiement text NOT NULL CHECK (mode_paiement IN ('Mixx by Yas', 'Moov Money', 'Orange Money', 'Wave', 'Especes', 'Essai Gratuit')),
  reference_transaction text,
  statut text NOT NULL DEFAULT 'PAYE' CHECK (statut IN ('EN_ATTENTE', 'PAYE', 'REFUSE')),
  periode_debut timestamptz NOT NULL DEFAULT now(),
  periode_fin timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- INDEXES DE PERFORMANCE
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_profils_etab ON public.profils(etablissement_id);
CREATE INDEX IF NOT EXISTS idx_employes_etab ON public.employes(etablissement_id);
CREATE INDEX IF NOT EXISTS idx_menus_etab ON public.menus(etablissement_id);
CREATE INDEX IF NOT EXISTS idx_stock_etab ON public.stock(etablissement_id);
CREATE INDEX IF NOT EXISTS idx_commandes_etab_date ON public.commandes(etablissement_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_paiements_etab_date ON public.paiements(etablissement_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_livraisons_etab ON public.livraisons(etablissement_id, statut);
CREATE INDEX IF NOT EXISTS idx_chambres_etab ON public.chambres(etablissement_id);
CREATE INDEX IF NOT EXISTS idx_sejours_etab ON public.sejours(etablissement_id, statut);
CREATE INDEX IF NOT EXISTS idx_menage_etab ON public.menage(etablissement_id, statut);

-- ----------------------------------------------------------------------------
-- FONCTIONS HELPER RLS (SECURITY DEFINER -> ZÉRO RÉCURSION RLS)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profils WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_my_etablissement_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT etablissement_id FROM public.profils WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profils WHERE id = auth.uid() AND role = 'super_admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_etablissement_actif(p_etab_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.etablissements e
    WHERE e.id = p_etab_id
      AND e.est_bloque = false
      AND (
        (e.statut_abonnement = 'actif' AND (e.abonnement_fin IS NULL OR e.abonnement_fin >= now()))
        OR
        (e.statut_abonnement = 'essai' AND e.essai_fin >= now())
      )
  );
$$;

-- ----------------------------------------------------------------------------
-- RPC : BOOTSTRAP SUPER-ADMIN (1ère exécution uniquement, verrouillé ensuite)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bootstrap_super_admin(p_nom text DEFAULT 'Super Admin EFA')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_exists boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentification requise';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.profils WHERE role = 'super_admin') INTO v_exists;
  IF v_exists THEN
    RAISE EXCEPTION 'Un Super-Admin existe déjà sur la plateforme';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  INSERT INTO public.profils (id, etablissement_id, nom, email, role)
  VALUES (v_uid, NULL, COALESCE(NULLIF(trim(p_nom), ''), 'Super Admin EFA'), v_email, 'super_admin')
  ON CONFLICT (id) DO UPDATE
    SET role = 'super_admin', etablissement_id = NULL, nom = EXCLUDED.nom;

  RETURN jsonb_build_object('ok', true, 'role', 'super_admin');
END;
$$;

-- ----------------------------------------------------------------------------
-- RPC : INSCRIPTION PATRON + CRÉATION ÉTABLISSEMENT (7 jours d'essai gratuit)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_patron_establishment(
  p_nom_etab text,
  p_nom_patron text,
  p_telephone text DEFAULT '',
  p_ville text DEFAULT 'Lomé',
  p_formule text DEFAULT 'resto'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_etab_id uuid;
  v_code text;
  v_tables integer := 10;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentification requise';
  END IF;

  IF EXISTS (SELECT 1 FROM public.profils WHERE id = v_uid AND etablissement_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Ce compte est déjà rattaché à un établissement';
  END IF;

  IF p_formule NOT IN ('bar', 'resto', 'premium') THEN
    RAISE EXCEPTION 'Formule invalide';
  END IF;

  IF p_formule = 'resto' THEN v_tables := 20; END IF;
  IF p_formule = 'premium' THEN v_tables := 30; END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
  v_code := 'EFA-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  INSERT INTO public.etablissements (nom, code_etablissement, telephone, ville, formule, statut_abonnement, essai_debut, essai_fin, nb_tables)
  VALUES (trim(p_nom_etab), v_code, p_telephone, COALESCE(NULLIF(trim(p_ville), ''), 'Lomé'), p_formule, 'essai', now(), now() + interval '7 days', v_tables)
  RETURNING id INTO v_etab_id;

  INSERT INTO public.profils (id, etablissement_id, nom, email, telephone, role)
  VALUES (v_uid, v_etab_id, trim(p_nom_patron), v_email, p_telephone, 'patron')
  ON CONFLICT (id) DO UPDATE
    SET etablissement_id = v_etab_id, nom = EXCLUDED.nom, telephone = EXCLUDED.telephone, role = 'patron';

  INSERT INTO public.employes (etablissement_id, profil_id, nom, telephone, email, role, pin_code)
  VALUES (v_etab_id, v_uid, trim(p_nom_patron), p_telephone, v_email, 'patron', '0000');

  INSERT INTO public.abonnements (etablissement_id, formule, cycle, montant, mode_paiement, reference_transaction, statut, periode_debut, periode_fin)
  VALUES (v_etab_id, p_formule, 'mensuel', 0, 'Essai Gratuit', 'ESSAI-7J', 'PAYE', now(), now() + interval '7 days');

  RETURN jsonb_build_object('ok', true, 'etablissement_id', v_etab_id, 'code_etablissement', v_code);
END;
$$;

-- ----------------------------------------------------------------------------
-- RPC : LISTE DES EMPLOYÉS ACTIFS PAR CODE ÉTABLISSEMENT (Connexion sans email)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_active_employees_for_login(p_code_etab text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_etab public.etablissements%ROWTYPE;
  v_emps jsonb;
BEGIN
  SELECT * INTO v_etab
  FROM public.etablissements
  WHERE upper(code_etablissement) = upper(trim(p_code_etab))
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Code établissement introuvable';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object('id', e.id, 'nom', e.nom, 'role', e.role)
      ORDER BY e.nom ASC
    ),
    '[]'::jsonb
  )
  INTO v_emps
  FROM public.employes e
  WHERE e.etablissement_id = v_etab.id
    AND e.actif = true
    AND e.role <> 'patron';

  RETURN jsonb_build_object(
    'etablissement', jsonb_build_object(
      'id', v_etab.id,
      'nom', v_etab.nom,
      'code_etablissement', v_etab.code_etablissement,
      'formule', v_etab.formule,
      'ville', v_etab.ville
    ),
    'employes', v_emps
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- RPC : CONNEXION EMPLOYÉ PAR NOM + CODE PIN 4 CHIFFRES (Sans email ni confirmation)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_employee_pin_login(
  p_code_etab text,
  p_employe_id uuid,
  p_pin text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_etab public.etablissements%ROWTYPE;
  v_emp public.employes%ROWTYPE;
BEGIN
  SELECT * INTO v_etab
  FROM public.etablissements
  WHERE upper(code_etablissement) = upper(trim(p_code_etab))
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Code établissement introuvable';
  END IF;

  SELECT * INTO v_emp
  FROM public.employes
  WHERE id = p_employe_id
    AND etablissement_id = v_etab.id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Compte employé supprimé ou introuvable';
  END IF;

  IF v_emp.actif = false THEN
    RAISE EXCEPTION 'Accès bloqué par le Patron. Contactez votre responsable.';
  END IF;

  IF trim(v_emp.pin_code) <> trim(p_pin) THEN
    RAISE EXCEPTION 'Code PIN incorrect';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'etablissement', to_jsonb(v_etab),
    'employe', jsonb_build_object(
      'id', v_emp.id,
      'etablissement_id', v_emp.etablissement_id,
      'nom', v_emp.nom,
      'role', v_emp.role,
      'actif', v_emp.actif
    )
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- RPC : LECTURE WORKSPACE POUR EMPLOYÉ CONNECTÉ PAR PIN
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.employee_get_workspace(
  p_etab_id uuid,
  p_employe_id uuid,
  p_pin text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp public.employes%ROWTYPE;
  v_etab public.etablissements%ROWTYPE;
BEGIN
  SELECT * INTO v_emp
  FROM public.employes
  WHERE id = p_employe_id
    AND etablissement_id = p_etab_id
  LIMIT 1;

  IF NOT FOUND OR v_emp.actif = false OR trim(v_emp.pin_code) <> trim(p_pin) THEN
    RAISE EXCEPTION 'Accès employé refusé ou bloqué';
  END IF;

  SELECT * INTO v_etab FROM public.etablissements WHERE id = p_etab_id;

  RETURN jsonb_build_object(
    'etab', to_jsonb(v_etab),
    'employes', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', e.id, 'etablissement_id', e.etablissement_id, 'profil_id', e.profil_id, 'nom', e.nom, 'telephone', e.telephone, 'email', e.email, 'role', e.role, 'pin_code', '****', 'actif', e.actif, 'created_at', e.created_at) ORDER BY e.created_at) FROM public.employes e WHERE e.etablissement_id = p_etab_id AND e.actif = true), '[]'::jsonb),
    'menus', COALESCE((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.created_at) FROM public.menus m WHERE m.etablissement_id = p_etab_id), '[]'::jsonb),
    'stock', COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.nom) FROM public.stock s WHERE s.etablissement_id = p_etab_id), '[]'::jsonb),
    'approvisionnements', COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC) FROM (SELECT * FROM public.approvisionnements WHERE etablissement_id = p_etab_id ORDER BY created_at DESC LIMIT 50) a), '[]'::jsonb),
    'commandes', COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.created_at DESC) FROM (SELECT * FROM public.commandes WHERE etablissement_id = p_etab_id ORDER BY created_at DESC LIMIT 200) c), '[]'::jsonb),
    'paiements', COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.created_at DESC) FROM (SELECT * FROM public.paiements WHERE etablissement_id = p_etab_id ORDER BY created_at DESC LIMIT 300) p), '[]'::jsonb),
    'livraisons', COALESCE((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.created_at DESC) FROM (SELECT * FROM public.livraisons WHERE etablissement_id = p_etab_id ORDER BY created_at DESC LIMIT 100) l), '[]'::jsonb),
    'chambres', COALESCE((SELECT jsonb_agg(to_jsonb(ch) ORDER BY ch.numero) FROM public.chambres ch WHERE ch.etablissement_id = p_etab_id), '[]'::jsonb),
    'reservations', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.date_arrivee DESC) FROM public.reservations r WHERE r.etablissement_id = p_etab_id), '[]'::jsonb),
    'sejours', COALESCE((SELECT jsonb_agg(to_jsonb(sj) ORDER BY sj.heure_arrivee DESC) FROM (SELECT * FROM public.sejours WHERE etablissement_id = p_etab_id ORDER BY heure_arrivee DESC LIMIT 100) sj), '[]'::jsonb),
    'menage', COALESCE((SELECT jsonb_agg(to_jsonb(mn) ORDER BY mn.created_at DESC) FROM (SELECT * FROM public.menage WHERE etablissement_id = p_etab_id ORDER BY created_at DESC LIMIT 50) mn), '[]'::jsonb)
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- RPC : MUTATIONS POS POUR EMPLOYÉ CONNECTÉ PAR PIN
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.employee_mutate_workspace(
  p_etab_id uuid,
  p_employe_id uuid,
  p_pin text,
  p_action text,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp public.employes%ROWTYPE;
  v_cmd public.commandes%ROWTYPE;
BEGIN
  SELECT * INTO v_emp
  FROM public.employes
  WHERE id = p_employe_id
    AND etablissement_id = p_etab_id
  LIMIT 1;

  IF NOT FOUND OR v_emp.actif = false OR trim(v_emp.pin_code) <> trim(p_pin) THEN
    RAISE EXCEPTION 'Accès employé refusé ou bloqué';
  END IF;

  IF NOT public.is_etablissement_actif(p_etab_id) THEN
    RAISE EXCEPTION 'Établissement en lecture seule (abonnement expiré ou bloqué)';
  END IF;

  IF p_action = 'create_commande' THEN
    INSERT INTO public.commandes (
      etablissement_id, numero_bon, type_service, cible, chambre_id, sejour_id,
      serveur_id, serveur_nom, items, montant_items, frais_livraison, montant_total,
      statut_caisse, statut_cuisine, client_nom, client_tel, note, validated_at
    ) VALUES (
      p_etab_id,
      p_payload->>'numero_bon',
      p_payload->>'type_service',
      p_payload->>'cible',
      NULLIF(p_payload->>'chambre_id', '')::uuid,
      NULLIF(p_payload->>'sejour_id', '')::uuid,
      v_emp.id,
      COALESCE(NULLIF(p_payload->>'serveur_nom', ''), v_emp.nom),
      COALESCE(p_payload->'items', '[]'::jsonb),
      COALESCE((p_payload->>'montant_items')::integer, 0),
      COALESCE((p_payload->>'frais_livraison')::integer, 0),
      COALESCE((p_payload->>'montant_total')::integer, 0),
      COALESCE(p_payload->>'statut_caisse', 'EN_ATTENTE'),
      COALESCE(p_payload->>'statut_cuisine', 'EN_ATTENTE'),
      NULLIF(p_payload->>'client_nom', ''),
      NULLIF(p_payload->>'client_tel', ''),
      NULLIF(p_payload->>'note', ''),
      NULLIF(p_payload->>'validated_at', '')::timestamptz
    )
    RETURNING * INTO v_cmd;
    RETURN jsonb_build_object('ok', true, 'data', to_jsonb(v_cmd));

  ELSIF p_action = 'validate_commande' THEN
    UPDATE public.commandes
    SET statut_caisse = 'VALIDEE',
        caissier_nom = COALESCE(p_payload->>'caissier_nom', v_emp.nom),
        validated_at = now()
    WHERE id = (p_payload->>'id')::uuid AND etablissement_id = p_etab_id;
    RETURN jsonb_build_object('ok', true);

  ELSIF p_action = 'encaisser_commande' THEN
    UPDATE public.commandes
    SET statut_caisse = p_payload->>'statut_caisse',
        caissier_nom = COALESCE(p_payload->>'caissier_nom', v_emp.nom),
        paid_at = CASE WHEN p_payload->>'statut_caisse' = 'SUR_CHAMBRE' THEN NULL ELSE now() END
    WHERE id = (p_payload->>'commande_id')::uuid AND etablissement_id = p_etab_id;

    IF p_payload->>'statut_caisse' <> 'SUR_CHAMBRE' THEN
      INSERT INTO public.paiements (
        etablissement_id, commande_id, sejour_id, type_paiement, mode_paiement,
        montant, client_nom, client_tel, est_regle, caissier_nom, reference
      ) VALUES (
        p_etab_id,
        (p_payload->>'commande_id')::uuid,
        NULLIF(p_payload->>'sejour_id', '')::uuid,
        'commande',
        p_payload->>'mode_paiement',
        (p_payload->>'montant')::integer,
        NULLIF(p_payload->>'client_nom', ''),
        NULLIF(p_payload->>'client_tel', ''),
        COALESCE((p_payload->>'est_regle')::boolean, true),
        COALESCE(p_payload->>'caissier_nom', v_emp.nom),
        NULLIF(p_payload->>'reference', '')
      );
    END IF;
    RETURN jsonb_build_object('ok', true);

  ELSIF p_action = 'settle_credit' THEN
    UPDATE public.paiements
    SET est_regle = true
    WHERE id = (p_payload->>'paiement_id')::uuid AND etablissement_id = p_etab_id;

    INSERT INTO public.paiements (
      etablissement_id, commande_id, type_paiement, mode_paiement, montant,
      client_nom, client_tel, est_regle, caissier_nom, reference
    ) VALUES (
      p_etab_id,
      NULLIF(p_payload->>'commande_id', '')::uuid,
      'reglement_credit',
      p_payload->>'mode_paiement',
      (p_payload->>'montant')::integer,
      NULLIF(p_payload->>'client_nom', ''),
      NULLIF(p_payload->>'client_tel', ''),
      true,
      COALESCE(p_payload->>'caissier_nom', v_emp.nom),
      p_payload->>'reference'
    );
    RETURN jsonb_build_object('ok', true);

  ELSIF p_action = 'update_kitchen_status' THEN
    UPDATE public.commandes
    SET statut_cuisine = p_payload->>'statut_cuisine'
    WHERE id = (p_payload->>'id')::uuid AND etablissement_id = p_etab_id;
    RETURN jsonb_build_object('ok', true);

  ELSIF p_action = 'create_delivery' THEN
    INSERT INTO public.commandes (
      etablissement_id, numero_bon, type_service, cible, serveur_nom, items,
      montant_items, frais_livraison, montant_total, statut_caisse, statut_cuisine,
      client_nom, client_tel, validated_at
    ) VALUES (
      p_etab_id,
      p_payload->>'numero_bon',
      'Livraison',
      p_payload->>'cible',
      COALESCE(p_payload->>'operateur_nom', v_emp.nom),
      COALESCE(p_payload->'items', '[]'::jsonb),
      (p_payload->>'montant_items')::integer,
      (p_payload->>'frais_livraison')::integer,
      (p_payload->>'montant_total')::integer,
      'VALIDEE',
      'EN_ATTENTE',
      p_payload->>'client_nom',
      p_payload->>'client_tel',
      now()
    )
    RETURNING * INTO v_cmd;

    INSERT INTO public.livraisons (
      etablissement_id, commande_id, client_nom, client_tel, quartier,
      adresse_detail, frais_livraison, montant_a_encaisser, livreur_id, livreur_nom, statut
    ) VALUES (
      p_etab_id,
      v_cmd.id,
      p_payload->>'client_nom',
      p_payload->>'client_tel',
      p_payload->>'quartier',
      p_payload->>'adresse_detail',
      (p_payload->>'frais_livraison')::integer,
      (p_payload->>'montant_total')::integer,
      NULLIF(p_payload->>'livreur_id', '')::uuid,
      NULLIF(p_payload->>'livreur_nom', ''),
      'EN_ATTENTE'
    );
    RETURN jsonb_build_object('ok', true);

  ELSIF p_action = 'update_delivery_status' THEN
    UPDATE public.livraisons
    SET statut = p_payload->>'statut',
        livreur_nom = COALESCE(p_payload->>'livreur_nom', v_emp.nom),
        delivered_at = CASE WHEN p_payload->>'statut' = 'LIVRE' THEN now() ELSE delivered_at END
    WHERE id = (p_payload->>'livraison_id')::uuid AND etablissement_id = p_etab_id;

    IF p_payload->>'statut' = 'LIVRE' THEN
      UPDATE public.commandes
      SET statut_caisse = 'ENCAISSEE', paid_at = now()
      WHERE id = (p_payload->>'commande_id')::uuid AND etablissement_id = p_etab_id;

      INSERT INTO public.paiements (
        etablissement_id, commande_id, type_paiement, mode_paiement, montant,
        client_nom, client_tel, est_regle, caissier_nom
      ) VALUES (
        p_etab_id,
        (p_payload->>'commande_id')::uuid,
        'commande',
        'Especes',
        (p_payload->>'montant')::integer,
        p_payload->>'client_nom',
        p_payload->>'client_tel',
        true,
        'Livreur · ' || COALESCE(p_payload->>'livreur_nom', v_emp.nom)
      );
    END IF;
    RETURN jsonb_build_object('ok', true);

  ELSIF p_action = 'update_chambre_statut' THEN
    UPDATE public.chambres SET statut = p_payload->>'statut'
    WHERE id = (p_payload->>'chambre_id')::uuid AND etablissement_id = p_etab_id;
    RETURN jsonb_build_object('ok', true);

  ELSIF p_action = 'check_in' THEN
    INSERT INTO public.sejours (
      etablissement_id, chambre_id, chambre_numero, client_nom, client_tel, piece_identite,
      nb_personnes, type_sejour, duree_prevue, prix_unitaire, montant_chambre,
      acompte_verse, heure_arrivee, heure_depart_prevue, receptionniste_nom, statut
    ) VALUES (
      p_etab_id,
      (p_payload->>'chambre_id')::uuid,
      p_payload->>'chambre_numero',
      p_payload->>'client_nom',
      p_payload->>'client_tel',
      p_payload->>'piece_identite',
      (p_payload->>'nb_personnes')::integer,
      p_payload->>'type_sejour',
      (p_payload->>'duree_prevue')::integer,
      (p_payload->>'prix_unitaire')::integer,
      (p_payload->>'montant_chambre')::integer,
      (p_payload->>'acompte_verse')::integer,
      (p_payload->>'heure_arrivee')::timestamptz,
      (p_payload->>'heure_depart_prevue')::timestamptz,
      COALESCE(p_payload->>'receptionniste_nom', v_emp.nom),
      'EN_COURS'
    );
    UPDATE public.chambres SET statut = 'OCCUPEE'
    WHERE id = (p_payload->>'chambre_id')::uuid AND etablissement_id = p_etab_id;
    RETURN jsonb_build_object('ok', true);

  ELSIF p_action = 'check_out' THEN
    UPDATE public.sejours
    SET supplement_prolongation = (p_payload->>'supplement_prolongation')::integer,
        heure_depart_reelle = now(),
        statut = 'TERMINE'
    WHERE id = (p_payload->>'sejour_id')::uuid AND etablissement_id = p_etab_id;

    UPDATE public.commandes
    SET statut_caisse = 'ENCAISSEE', paid_at = now()
    WHERE sejour_id = (p_payload->>'sejour_id')::uuid
      AND etablissement_id = p_etab_id
      AND statut_caisse = 'SUR_CHAMBRE';

    INSERT INTO public.paiements (
      etablissement_id, sejour_id, type_paiement, mode_paiement, montant,
      client_nom, client_tel, est_regle, caissier_nom, reference
    ) VALUES (
      p_etab_id,
      (p_payload->>'sejour_id')::uuid,
      'sejour_checkout',
      p_payload->>'mode_paiement',
      (p_payload->>'montant')::integer,
      p_payload->>'client_nom',
      p_payload->>'client_tel',
      true,
      COALESCE(p_payload->>'caissier_nom', v_emp.nom),
      p_payload->>'reference'
    );
    RETURN jsonb_build_object('ok', true);

  ELSIF p_action = 'create_reservation' THEN
    INSERT INTO public.reservations (
      etablissement_id, chambre_id, client_nom, client_tel, date_arrivee,
      date_depart, type_sejour, acompte, notes, statut
    ) VALUES (
      p_etab_id,
      (p_payload->>'chambre_id')::uuid,
      p_payload->>'client_nom',
      p_payload->>'client_tel',
      (p_payload->>'date_arrivee')::timestamptz,
      (p_payload->>'date_depart')::timestamptz,
      p_payload->>'type_sejour',
      (p_payload->>'acompte')::integer,
      NULLIF(p_payload->>'notes', ''),
      'CONFIRMEE'
    );
    UPDATE public.chambres SET statut = 'RESERVEE'
    WHERE id = (p_payload->>'chambre_id')::uuid AND etablissement_id = p_etab_id;
    RETURN jsonb_build_object('ok', true);

  ELSIF p_action = 'update_reservation_statut' THEN
    UPDATE public.reservations SET statut = p_payload->>'statut'
    WHERE id = (p_payload->>'reservation_id')::uuid AND etablissement_id = p_etab_id;
    IF p_payload->>'statut' = 'ANNULEE' THEN
      UPDATE public.chambres SET statut = 'LIBRE'
      WHERE id = (p_payload->>'chambre_id')::uuid AND etablissement_id = p_etab_id;
    END IF;
    RETURN jsonb_build_object('ok', true);

  ELSIF p_action = 'clean_room' THEN
    UPDATE public.menage
    SET statut = 'NETTOYEE',
        agent_nom = COALESCE(p_payload->>'agent_nom', v_emp.nom),
        completed_at = now()
    WHERE id = (p_payload->>'task_id')::uuid AND etablissement_id = p_etab_id;
    UPDATE public.chambres SET statut = 'LIBRE'
    WHERE id = (p_payload->>'chambre_id')::uuid AND etablissement_id = p_etab_id;
    RETURN jsonb_build_object('ok', true);

  ELSE
    RAISE EXCEPTION 'Action non reconnue: %', p_action;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_employees_for_login(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_employee_pin_login(text, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.employee_get_workspace(uuid, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.employee_mutate_workspace(uuid, uuid, text, text, jsonb) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- TRIGGERS MÉTIER : LIMITES STRICTES PAR FORMULE + STOCK AUTO + HÔTEL AUTO
-- ----------------------------------------------------------------------------

-- A. Vérification limite employés
CREATE OR REPLACE FUNCTION public.check_employe_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_formule text;
  v_max integer;
  v_count integer;
BEGIN
  SELECT formule INTO v_formule FROM public.etablissements WHERE id = NEW.etablissement_id;
  SELECT max_employes INTO v_max FROM public.formules WHERE id = v_formule;
  SELECT count(*) INTO v_count FROM public.employes WHERE etablissement_id = NEW.etablissement_id AND actif = true;

  IF v_count >= v_max THEN
    RAISE EXCEPTION 'Limite de % employés atteinte pour la formule %. Passez à une formule supérieure.', v_max, upper(v_formule);
  END IF;

  IF v_formule = 'bar' AND NEW.role IN ('cuisinier', 'livreur', 'receptionniste', 'menage') THEN
    RAISE EXCEPTION 'Le rôle % n''est pas disponible dans la formule BAR.', NEW.role;
  END IF;

  IF v_formule = 'resto' AND NEW.role IN ('receptionniste', 'menage') THEN
    RAISE EXCEPTION 'Les rôles Hôtel nécessitent la formule PREMIUM.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_employe_limit ON public.employes;
CREATE TRIGGER trg_check_employe_limit
  BEFORE INSERT ON public.employes
  FOR EACH ROW EXECUTE FUNCTION public.check_employe_limit();

-- B. Vérification limite produits menu & restrictions BAR
CREATE OR REPLACE FUNCTION public.check_menu_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_formule text;
  v_max integer;
  v_count integer;
BEGIN
  SELECT formule INTO v_formule FROM public.etablissements WHERE id = NEW.etablissement_id;
  SELECT max_produits INTO v_max FROM public.formules WHERE id = v_formule;

  IF v_formule = 'bar' AND NEW.categorie IN ('plat', 'grillade') THEN
    RAISE EXCEPTION 'La formule BAR autorise uniquement les boissons. Passez à RESTO pour ajouter des plats.';
  END IF;

  IF v_max IS NOT NULL THEN
    SELECT count(*) INTO v_count FROM public.menus WHERE etablissement_id = NEW.etablissement_id AND actif = true;
    IF v_count >= v_max THEN
      RAISE EXCEPTION 'Limite de % produits atteinte pour la formule %.', v_max, upper(v_formule);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_menu_limit ON public.menus;
CREATE TRIGGER trg_check_menu_limit
  BEFORE INSERT ON public.menus
  FOR EACH ROW EXECUTE FUNCTION public.check_menu_limit();

-- C. Vérification limite tables sur etablissements
CREATE OR REPLACE FUNCTION public.check_tables_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max integer;
BEGIN
  SELECT max_tables INTO v_max FROM public.formules WHERE id = NEW.formule;
  IF v_max IS NOT NULL AND NEW.nb_tables > v_max THEN
    RAISE EXCEPTION 'La formule % limite le nombre de tables à %.', upper(NEW.formule), v_max;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_tables_limit ON public.etablissements;
CREATE TRIGGER trg_check_tables_limit
  BEFORE INSERT OR UPDATE OF nb_tables, formule ON public.etablissements
  FOR EACH ROW EXECUTE FUNCTION public.check_tables_limit();

-- D. Vérification module Hôtel & limite chambres (PREMIUM uniquement)
CREATE OR REPLACE FUNCTION public.check_chambre_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_formule text;
  v_max integer;
  v_count integer;
BEGIN
  SELECT formule INTO v_formule FROM public.etablissements WHERE id = NEW.etablissement_id;
  IF v_formule <> 'premium' THEN
    RAISE EXCEPTION 'Le module Hôtel est réservé à la formule PREMIUM.';
  END IF;

  SELECT max_chambres INTO v_max FROM public.formules WHERE id = v_formule;
  SELECT count(*) INTO v_count FROM public.chambres WHERE etablissement_id = NEW.etablissement_id;
  IF v_count >= v_max THEN
    RAISE EXCEPTION 'Limite de % chambres atteinte pour la formule PREMIUM.', v_max;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_chambre_limit ON public.chambres;
CREATE TRIGGER trg_check_chambre_limit
  BEFORE INSERT ON public.chambres
  FOR EACH ROW EXECUTE FUNCTION public.check_chambre_limit();

-- E. Vérification livraison autorisée (RESTO & PREMIUM)
CREATE OR REPLACE FUNCTION public.check_livraison_formule()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_formule text;
BEGIN
  SELECT formule INTO v_formule FROM public.etablissements WHERE id = NEW.etablissement_id;
  IF v_formule = 'bar' THEN
    RAISE EXCEPTION 'Le module Livraison nécessite la formule RESTO ou PREMIUM.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_livraison_formule ON public.livraisons;
CREATE TRIGGER trg_check_livraison_formule
  BEFORE INSERT ON public.livraisons
  FOR EACH ROW EXECUTE FUNCTION public.check_livraison_formule();

-- F. Diminution automatique du stock à la validation caisse
CREATE OR REPLACE FUNCTION public.deduct_stock_on_order_validation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_rec jsonb;
  v_item_qty numeric;
  v_rec_qty numeric;
  v_stock_id uuid;
BEGIN
  IF NEW.statut_caisse IN ('VALIDEE', 'ENCAISSEE', 'CREDIT', 'SUR_CHAMBRE') AND COALESCE(NEW.stock_deduit, false) = false THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(NEW.items, '[]'::jsonb))
    LOOP
      v_item_qty := COALESCE((v_item->>'quantite')::numeric, 1);
      FOR v_rec IN SELECT * FROM jsonb_array_elements(COALESCE(v_item->'recette', '[]'::jsonb))
      LOOP
        IF v_rec->>'stock_id' IS NOT NULL AND v_rec->>'stock_id' <> '' THEN
          v_stock_id := (v_rec->>'stock_id')::uuid;
          v_rec_qty := COALESCE((v_rec->>'quantite')::numeric, 0) * v_item_qty;
          UPDATE public.stock
          SET quantite = GREATEST(0, quantite - v_rec_qty),
              updated_at = now()
          WHERE id = v_stock_id AND etablissement_id = NEW.etablissement_id;
        END IF;
      END LOOP;
    END LOOP;
    NEW.stock_deduit := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deduct_stock_on_order ON public.commandes;
CREATE TRIGGER trg_deduct_stock_on_order
  BEFORE INSERT OR UPDATE ON public.commandes
  FOR EACH ROW EXECUTE FUNCTION public.deduct_stock_on_order_validation();

-- G. Mise à jour automatique du stock lors d'un approvisionnement
CREATE OR REPLACE FUNCTION public.add_stock_on_approvisionnement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.stock
  SET quantite = quantite + NEW.quantite,
      prix_achat_unitaire = CASE WHEN NEW.prix_achat_unitaire > 0 THEN NEW.prix_achat_unitaire ELSE prix_achat_unitaire END,
      updated_at = now()
  WHERE id = NEW.stock_id AND etablissement_id = NEW.etablissement_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_add_stock_on_appro ON public.approvisionnements;
CREATE TRIGGER trg_add_stock_on_appro
  AFTER INSERT ON public.approvisionnements
  FOR EACH ROW EXECUTE FUNCTION public.add_stock_on_approvisionnement();

-- H. Déclenchement automatique Ménage lors du check-out hôtel
CREATE OR REPLACE FUNCTION public.trigger_menage_on_checkout()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.statut = 'EN_COURS' AND NEW.statut = 'TERMINE' THEN
    UPDATE public.chambres
    SET statut = 'EN_NETTOYAGE'
    WHERE id = NEW.chambre_id;

    INSERT INTO public.menage (etablissement_id, chambre_id, chambre_numero, sejour_id, statut)
    VALUES (NEW.etablissement_id, NEW.chambre_id, NEW.chambre_numero, NEW.id, 'A_NETTOYER');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_menage_on_checkout ON public.sejours;
CREATE TRIGGER trg_menage_on_checkout
  AFTER UPDATE ON public.sejours
  FOR EACH ROW EXECUTE FUNCTION public.trigger_menage_on_checkout();

-- I. Activation immédiate / upgrade lors d'un paiement abonnement PAYE
CREATE OR REPLACE FUNCTION public.activate_establishment_on_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.statut = 'PAYE' AND NEW.mode_paiement <> 'Essai Gratuit' THEN
    UPDATE public.etablissements
    SET formule = NEW.formule,
        cycle_abonnement = NEW.cycle,
        statut_abonnement = 'actif',
        est_bloque = false,
        abonnement_fin = NEW.periode_fin
    WHERE id = NEW.etablissement_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_activate_on_subscription ON public.abonnements;
CREATE TRIGGER trg_activate_on_subscription
  AFTER INSERT OR UPDATE ON public.abonnements
  FOR EACH ROW EXECUTE FUNCTION public.activate_establishment_on_subscription();

-- ----------------------------------------------------------------------------
-- ROW LEVEL SECURITY (RLS) + POLICIES SANS RÉCURSION
-- ----------------------------------------------------------------------------
ALTER TABLE public.formules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.etablissements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profils ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approvisionnements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chambres ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sejours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commandes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paiements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.livraisons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abonnements ENABLE ROW LEVEL SECURITY;

-- 1. FORMULES : lecture publique authentifiée/anon, modification Super-Admin uniquement
DROP POLICY IF EXISTS "formules_select_all" ON public.formules;
CREATE POLICY "formules_select_all" ON public.formules FOR SELECT USING (true);

DROP POLICY IF EXISTS "formules_update_super_admin" ON public.formules;
CREATE POLICY "formules_update_super_admin" ON public.formules FOR UPDATE
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- 2. PROFILS
DROP POLICY IF EXISTS "profils_select" ON public.profils;
CREATE POLICY "profils_select" ON public.profils FOR SELECT
  USING (id = auth.uid() OR public.is_super_admin() OR etablissement_id = public.get_my_etablissement_id());

DROP POLICY IF EXISTS "profils_update_own" ON public.profils;
CREATE POLICY "profils_update_own" ON public.profils FOR UPDATE
  USING (id = auth.uid() OR public.is_super_admin());

-- 3. ETABLISSEMENTS
DROP POLICY IF EXISTS "etab_select" ON public.etablissements;
CREATE POLICY "etab_select" ON public.etablissements FOR SELECT
  USING (public.is_super_admin() OR id = public.get_my_etablissement_id());

DROP POLICY IF EXISTS "etab_update" ON public.etablissements;
CREATE POLICY "etab_update" ON public.etablissements FOR UPDATE
  USING (public.is_super_admin() OR (id = public.get_my_etablissement_id() AND public.get_my_role() = 'patron'))
  WITH CHECK (public.is_super_admin() OR (id = public.get_my_etablissement_id() AND public.get_my_role() = 'patron'));

-- 4. ABONNEMENTS (Patrons peuvent consulter et payer même si expirés pour débloquer)
DROP POLICY IF EXISTS "abonnements_select" ON public.abonnements;
CREATE POLICY "abonnements_select" ON public.abonnements FOR SELECT
  USING (public.is_super_admin() OR etablissement_id = public.get_my_etablissement_id());

DROP POLICY IF EXISTS "abonnements_insert" ON public.abonnements;
CREATE POLICY "abonnements_insert" ON public.abonnements FOR INSERT
  WITH CHECK (public.is_super_admin() OR (etablissement_id = public.get_my_etablissement_id() AND public.get_my_role() = 'patron'));

DROP POLICY IF EXISTS "abonnements_update_sa" ON public.abonnements;
CREATE POLICY "abonnements_update_sa" ON public.abonnements FOR UPDATE
  USING (public.is_super_admin());

-- Helper macro logique : Lecture établissement + Écriture uniquement si abonnement actif (non bloqué / non expiré)
-- Tables opérationnelles : employes, stock, approvisionnements, menus, chambres, reservations, sejours, commandes, paiements, livraisons, menage

-- EMPLOYES
DROP POLICY IF EXISTS "employes_select" ON public.employes;
CREATE POLICY "employes_select" ON public.employes FOR SELECT
  USING (public.is_super_admin() OR etablissement_id = public.get_my_etablissement_id());
DROP POLICY IF EXISTS "employes_write" ON public.employes;
CREATE POLICY "employes_write" ON public.employes FOR ALL
  USING (public.is_super_admin() OR (etablissement_id = public.get_my_etablissement_id() AND public.get_my_role() = 'patron' AND public.is_etablissement_actif(etablissement_id)))
  WITH CHECK (public.is_super_admin() OR (etablissement_id = public.get_my_etablissement_id() AND public.get_my_role() = 'patron' AND public.is_etablissement_actif(etablissement_id)));

-- STOCK
DROP POLICY IF EXISTS "stock_select" ON public.stock;
CREATE POLICY "stock_select" ON public.stock FOR SELECT
  USING (public.is_super_admin() OR etablissement_id = public.get_my_etablissement_id());
DROP POLICY IF EXISTS "stock_write" ON public.stock;
CREATE POLICY "stock_write" ON public.stock FOR ALL
  USING (public.is_super_admin() OR (etablissement_id = public.get_my_etablissement_id() AND public.is_etablissement_actif(etablissement_id)))
  WITH CHECK (public.is_super_admin() OR (etablissement_id = public.get_my_etablissement_id() AND public.is_etablissement_actif(etablissement_id)));

-- APPROVISIONNEMENTS
DROP POLICY IF EXISTS "appro_select" ON public.approvisionnements;
CREATE POLICY "appro_select" ON public.approvisionnements FOR SELECT
  USING (public.is_super_admin() OR etablissement_id = public.get_my_etablissement_id());
DROP POLICY IF EXISTS "appro_write" ON public.approvisionnements;
CREATE POLICY "appro_write" ON public.approvisionnements FOR ALL
  USING (public.is_super_admin() OR (etablissement_id = public.get_my_etablissement_id() AND public.is_etablissement_actif(etablissement_id)))
  WITH CHECK (public.is_super_admin() OR (etablissement_id = public.get_my_etablissement_id() AND public.is_etablissement_actif(etablissement_id)));

-- MENUS
DROP POLICY IF EXISTS "menus_select" ON public.menus;
CREATE POLICY "menus_select" ON public.menus FOR SELECT
  USING (public.is_super_admin() OR etablissement_id = public.get_my_etablissement_id());
DROP POLICY IF EXISTS "menus_write" ON public.menus;
CREATE POLICY "menus_write" ON public.menus FOR ALL
  USING (public.is_super_admin() OR (etablissement_id = public.get_my_etablissement_id() AND public.is_etablissement_actif(etablissement_id)))
  WITH CHECK (public.is_super_admin() OR (etablissement_id = public.get_my_etablissement_id() AND public.is_etablissement_actif(etablissement_id)));

-- COMMANDES
DROP POLICY IF EXISTS "commandes_select" ON public.commandes;
CREATE POLICY "commandes_select" ON public.commandes FOR SELECT
  USING (public.is_super_admin() OR etablissement_id = public.get_my_etablissement_id());
DROP POLICY IF EXISTS "commandes_write" ON public.commandes;
CREATE POLICY "commandes_write" ON public.commandes FOR ALL
  USING (public.is_super_admin() OR (etablissement_id = public.get_my_etablissement_id() AND public.is_etablissement_actif(etablissement_id)))
  WITH CHECK (public.is_super_admin() OR (etablissement_id = public.get_my_etablissement_id() AND public.is_etablissement_actif(etablissement_id)));

-- PAIEMENTS
DROP POLICY IF EXISTS "paiements_select" ON public.paiements;
CREATE POLICY "paiements_select" ON public.paiements FOR SELECT
  USING (public.is_super_admin() OR etablissement_id = public.get_my_etablissement_id());
DROP POLICY IF EXISTS "paiements_write" ON public.paiements;
CREATE POLICY "paiements_write" ON public.paiements FOR ALL
  USING (public.is_super_admin() OR (etablissement_id = public.get_my_etablissement_id() AND public.is_etablissement_actif(etablissement_id)))
  WITH CHECK (public.is_super_admin() OR (etablissement_id = public.get_my_etablissement_id() AND public.is_etablissement_actif(etablissement_id)));

-- LIVRAISONS
DROP POLICY IF EXISTS "livraisons_select" ON public.livraisons;
CREATE POLICY "livraisons_select" ON public.livraisons FOR SELECT
  USING (public.is_super_admin() OR etablissement_id = public.get_my_etablissement_id());
DROP POLICY IF EXISTS "livraisons_write" ON public.livraisons;
CREATE POLICY "livraisons_write" ON public.livraisons FOR ALL
  USING (public.is_super_admin() OR (etablissement_id = public.get_my_etablissement_id() AND public.is_etablissement_actif(etablissement_id)))
  WITH CHECK (public.is_super_admin() OR (etablissement_id = public.get_my_etablissement_id() AND public.is_etablissement_actif(etablissement_id)));

-- CHAMBRES
DROP POLICY IF EXISTS "chambres_select" ON public.chambres;
CREATE POLICY "chambres_select" ON public.chambres FOR SELECT
  USING (public.is_super_admin() OR etablissement_id = public.get_my_etablissement_id());
DROP POLICY IF EXISTS "chambres_write" ON public.chambres;
CREATE POLICY "chambres_write" ON public.chambres FOR ALL
  USING (public.is_super_admin() OR (etablissement_id = public.get_my_etablissement_id() AND public.is_etablissement_actif(etablissement_id)))
  WITH CHECK (public.is_super_admin() OR (etablissement_id = public.get_my_etablissement_id() AND public.is_etablissement_actif(etablissement_id)));

-- RESERVATIONS
DROP POLICY IF EXISTS "reservations_select" ON public.reservations;
CREATE POLICY "reservations_select" ON public.reservations FOR SELECT
  USING (public.is_super_admin() OR etablissement_id = public.get_my_etablissement_id());
DROP POLICY IF EXISTS "reservations_write" ON public.reservations;
CREATE POLICY "reservations_write" ON public.reservations FOR ALL
  USING (public.is_super_admin() OR (etablissement_id = public.get_my_etablissement_id() AND public.is_etablissement_actif(etablissement_id)))
  WITH CHECK (public.is_super_admin() OR (etablissement_id = public.get_my_etablissement_id() AND public.is_etablissement_actif(etablissement_id)));

-- SEJOURS
DROP POLICY IF EXISTS "sejours_select" ON public.sejours;
CREATE POLICY "sejours_select" ON public.sejours FOR SELECT
  USING (public.is_super_admin() OR etablissement_id = public.get_my_etablissement_id());
DROP POLICY IF EXISTS "sejours_write" ON public.sejours;
CREATE POLICY "sejours_write" ON public.sejours FOR ALL
  USING (public.is_super_admin() OR (etablissement_id = public.get_my_etablissement_id() AND public.is_etablissement_actif(etablissement_id)))
  WITH CHECK (public.is_super_admin() OR (etablissement_id = public.get_my_etablissement_id() AND public.is_etablissement_actif(etablissement_id)));

-- MENAGE
DROP POLICY IF EXISTS "menage_select" ON public.menage;
CREATE POLICY "menage_select" ON public.menage FOR SELECT
  USING (public.is_super_admin() OR etablissement_id = public.get_my_etablissement_id());
DROP POLICY IF EXISTS "menage_write" ON public.menage;
CREATE POLICY "menage_write" ON public.menage FOR ALL
  USING (public.is_super_admin() OR (etablissement_id = public.get_my_etablissement_id() AND public.is_etablissement_actif(etablissement_id)))
  WITH CHECK (public.is_super_admin() OR (etablissement_id = public.get_my_etablissement_id() AND public.is_etablissement_actif(etablissement_id)));

-- ----------------------------------------------------------------------------
-- MIGRATION IDEMPOTENTE PAIEMENTS TOGO (Mixx by Yas remplace Flooz)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  UPDATE public.paiements SET mode_paiement = 'Mixx by Yas' WHERE mode_paiement = 'Flooz';
  UPDATE public.abonnements SET mode_paiement = 'Mixx by Yas' WHERE mode_paiement = 'Flooz';
  UPDATE public.formules SET nom = 'Formules BAR' WHERE id = 'bar';
  UPDATE public.formules SET nom = 'Formules RESTO' WHERE id = 'resto';
  UPDATE public.formules SET nom = 'Formules PREMIUM' WHERE id = 'premium';

  ALTER TABLE public.paiements DROP CONSTRAINT IF EXISTS paiements_mode_paiement_check;
  ALTER TABLE public.paiements ADD CONSTRAINT paiements_mode_paiement_check
    CHECK (mode_paiement IN ('Especes', 'Mixx by Yas', 'Moov Money', 'Orange Money', 'Wave', 'Credit'));

  ALTER TABLE public.abonnements DROP CONSTRAINT IF EXISTS abonnements_mode_paiement_check;
  ALTER TABLE public.abonnements ADD CONSTRAINT abonnements_mode_paiement_check
    CHECK (mode_paiement IN ('Mixx by Yas', 'Moov Money', 'Orange Money', 'Wave', 'Especes', 'Essai Gratuit'));
EXCEPTION
  WHEN others THEN NULL;
END $$;

-- ----------------------------------------------------------------------------
-- REALTIME PUBLICATION (Idempotent, zéro erreur doublon)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_table text;
  v_tables text[] := ARRAY[
    'etablissements', 'formules', 'employes', 'menus', 'commandes',
    'stock', 'paiements', 'livraisons', 'chambres', 'reservations',
    'sejours', 'menage', 'abonnements'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables
  LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_table);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN others THEN NULL;
    END;
  END LOOP;
END $$;

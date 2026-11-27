export type FormuleId = 'bar' | 'resto' | 'premium';

export type RoleType =
  | 'super_admin'
  | 'patron'
  | 'caissier'
  | 'serveur'
  | 'cuisinier'
  | 'livreur'
  | 'receptionniste'
  | 'menage';

export type CycleAbonnement = 'mensuel' | 'annuel';
export type StatutAbonnement = 'essai' | 'actif' | 'expire' | 'bloque';
export type ModePaiement = 'Especes' | 'Mixx by Yas' | 'Moov Money' | 'Orange Money' | 'Wave' | 'Credit';
export const TOGO_PAYMENT_MODES: Exclude<ModePaiement, 'Credit'>[] = [
  'Mixx by Yas',
  'Moov Money',
  'Orange Money',
  'Wave',
  'Especes',
];
export type ChambreStatut = 'LIBRE' | 'OCCUPEE' | 'EN_NETTOYAGE' | 'RESERVEE' | 'HORS_SERVICE';

export interface ZoneLivraison {
  quartier: string;
  frais: number;
}

export interface Formule {
  id: FormuleId;
  nom: string;
  description: string;
  prix_mensuel: number;
  prix_annuel: number;
  max_employes: number;
  max_appareils: number;
  max_tables: number | null;
  max_produits: number | null;
  max_chambres: number;
  updated_at?: string;
}

export interface Etablissement {
  id: string;
  nom: string;
  code_etablissement: string;
  telephone: string | null;
  adresse: string | null;
  ville: string | null;
  formule: FormuleId;
  cycle_abonnement: CycleAbonnement;
  statut_abonnement: StatutAbonnement;
  essai_debut: string;
  essai_fin: string;
  abonnement_fin: string | null;
  est_bloque: boolean;
  nb_tables: number;
  zones_livraison: ZoneLivraison[];
  created_at: string;
}

export interface Profil {
  id: string;
  etablissement_id: string | null;
  nom: string;
  email: string | null;
  telephone: string | null;
  role: RoleType;
  actif: boolean;
  created_at: string;
}

export interface Employe {
  id: string;
  etablissement_id: string;
  profil_id: string | null;
  nom: string;
  telephone: string | null;
  email: string | null;
  role: Exclude<RoleType, 'super_admin'>;
  pin_code: string;
  actif: boolean;
  created_at: string;
}

export interface StockItem {
  id: string;
  etablissement_id: string;
  nom: string;
  categorie: 'boisson' | 'cuisine' | 'hotel' | 'autre';
  unite: string;
  quantite: number;
  seuil_alerte: number;
  prix_achat_unitaire: number;
  updated_at: string;
}

export interface Approvisionnement {
  id: string;
  etablissement_id: string;
  stock_id: string;
  quantite: number;
  prix_achat_unitaire: number;
  montant_total: number;
  fournisseur: string | null;
  note: string | null;
  cree_par: string | null;
  created_at: string;
}

export interface RecetteIngredient {
  stock_id: string;
  nom: string;
  quantite: number;
}

export interface MenuItem {
  id: string;
  etablissement_id: string;
  nom: string;
  categorie: 'boisson' | 'plat' | 'grillade';
  prix: number;
  cout_revient: number;
  photo_url: string | null;
  est_plat_du_jour: boolean;
  est_epuise: boolean;
  recette: RecetteIngredient[];
  actif: boolean;
  created_at: string;
}

export interface CommandeItem {
  menu_id: string;
  nom: string;
  categorie: 'boisson' | 'plat' | 'grillade';
  prix: number;
  cout_revient: number;
  quantite: number;
  recette: RecetteIngredient[];
}

export interface Commande {
  id: string;
  etablissement_id: string;
  numero_bon: string;
  type_service: 'Table' | 'Terrasse' | 'A Emporter' | 'Chambre' | 'Livraison';
  cible: string;
  chambre_id: string | null;
  sejour_id: string | null;
  serveur_id: string | null;
  serveur_nom: string;
  items: CommandeItem[];
  montant_items: number;
  frais_livraison: number;
  montant_total: number;
  statut_caisse: 'EN_ATTENTE' | 'VALIDEE' | 'ENCAISSEE' | 'CREDIT' | 'SUR_CHAMBRE' | 'ANNULEE';
  statut_cuisine: 'EN_ATTENTE' | 'EN_PREPARATION' | 'PRET' | 'SERVI';
  stock_deduit: boolean;
  caissier_nom: string | null;
  client_nom: string | null;
  client_tel: string | null;
  note: string | null;
  created_at: string;
  validated_at: string | null;
  paid_at: string | null;
}

export interface Paiement {
  id: string;
  etablissement_id: string;
  commande_id: string | null;
  sejour_id: string | null;
  type_paiement: 'commande' | 'sejour_checkout' | 'reglement_credit' | 'acompte_reservation';
  mode_paiement: ModePaiement;
  montant: number;
  client_nom: string | null;
  client_tel: string | null;
  est_regle: boolean;
  caissier_nom: string;
  reference: string | null;
  created_at: string;
}

export interface Livraison {
  id: string;
  etablissement_id: string;
  commande_id: string;
  client_nom: string;
  client_tel: string;
  quartier: string;
  adresse_detail: string;
  frais_livraison: number;
  montant_a_encaisser: number;
  livreur_id: string | null;
  livreur_nom: string | null;
  statut: 'EN_ATTENTE' | 'EN_COURS' | 'LIVRE';
  created_at: string;
  delivered_at: string | null;
}

export interface Chambre {
  id: string;
  etablissement_id: string;
  numero: string;
  type_chambre: 'Standard' | 'Deluxe' | 'Suite' | 'Ventilateur' | 'Climatisé';
  prix_heure: number;
  prix_nuit: number;
  prix_journee: number;
  statut: ChambreStatut;
  photo_url: string | null;
  created_at: string;
}

export interface Reservation {
  id: string;
  etablissement_id: string;
  chambre_id: string;
  client_nom: string;
  client_tel: string;
  date_arrivee: string;
  date_depart: string;
  type_sejour: 'Heure' | 'Nuit' | 'Journée';
  acompte: number;
  statut: 'CONFIRMEE' | 'HONOREE' | 'ANNULEE';
  notes: string | null;
  created_at: string;
}

export interface Sejour {
  id: string;
  etablissement_id: string;
  chambre_id: string;
  chambre_numero: string;
  client_nom: string;
  client_tel: string;
  piece_identite: string;
  nb_personnes: number;
  type_sejour: 'Heure' | 'Nuit' | 'Journée';
  duree_prevue: number;
  prix_unitaire: number;
  montant_chambre: number;
  supplement_prolongation: number;
  acompte_verse: number;
  heure_arrivee: string;
  heure_depart_prevue: string;
  heure_depart_reelle: string | null;
  statut: 'EN_COURS' | 'TERMINE';
  receptionniste_nom: string | null;
  created_at: string;
}

export interface MenageTask {
  id: string;
  etablissement_id: string;
  chambre_id: string;
  chambre_numero: string;
  sejour_id: string | null;
  statut: 'A_NETTOYER' | 'EN_COURS' | 'NETTOYEE';
  agent_nom: string | null;
  notes: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface Abonnement {
  id: string;
  etablissement_id: string;
  formule: FormuleId;
  cycle: CycleAbonnement;
  montant: number;
  mode_paiement: 'Mixx by Yas' | 'Moov Money' | 'Orange Money' | 'Wave' | 'Especes' | 'Essai Gratuit';
  reference_transaction: string | null;
  statut: 'EN_ATTENTE' | 'PAYE' | 'REFUSE';
  periode_debut: string;
  periode_fin: string;
  created_at: string;
}

export const ROLE_LABELS: Record<RoleType, string> = {
  super_admin: 'Super-Admin',
  patron: 'Patron',
  caissier: 'Caissier',
  serveur: 'Serveur',
  cuisinier: 'Cuisinier / Barman',
  livreur: 'Livreur',
  receptionniste: 'Réceptionniste Hôtel',
  menage: 'Femme de ménage',
};

export const DEFAULT_FORMULES: Formule[] = [
  {
    id: 'bar',
    nom: 'Formules BAR',
    description: 'Boissons seulement · Serveur, Caissier, Stock Boissons, Paiement',
    prix_mensuel: 7500,
    prix_annuel: 75000,
    max_employes: 3,
    max_appareils: 3,
    max_tables: 10,
    max_produits: 30,
    max_chambres: 0,
  },
  {
    id: 'resto',
    nom: 'Formules RESTO',
    description: 'Bar + Menu Plats + Cuisine + Crédit Client + Stats + Livraison',
    prix_mensuel: 20000,
    prix_annuel: 200000,
    max_employes: 9,
    max_appareils: 8,
    max_tables: 25,
    max_produits: 80,
    max_chambres: 0,
  },
  {
    id: 'premium',
    nom: 'Formules PREMIUM',
    description: 'Tout RESTO + Module Hôtel Complet (Chambres, Check-in/out, Ménage)',
    prix_mensuel: 35000,
    prix_annuel: 350000,
    max_employes: 20,
    max_appareils: 15,
    max_tables: null,
    max_produits: null,
    max_chambres: 50,
  },
];

export function formatFormuleName(nom: string): string {
  return nom.replace(/^Formule\b/i, 'Formules');
}

export function getWhatsAppFormuleUrl(formuleNom: string): string {
  const shortNom = formuleNom.replace(/^Formules?\s+/i, '').trim() || formuleNom;
  const text = `Bonjour EFA Technologies, je veux acheter la Formule ${shortNom} pour EFA RESTO-LIVRO. Merci de me confirmer.`;
  return `https://wa.me/22896100972?text=${encodeURIComponent(text)}`;
}

export const PHOTO_PRESETS = [
  {label: 'Poulet Braisé & Alloco', url: '/src/assets/images/dish_poulet_braise_1795658726782.jpg', cat: 'plat'},
  {label: 'Riz Jollof & Poisson', url: '/src/assets/images/dish_riz_jollof_1795658726917.jpg', cat: 'plat'},
  {label: 'Brochettes & Attiéké', url: '/src/assets/images/dish_brochettes_grill_1795658726445.jpg', cat: 'grillade'},
  {label: 'Bissap & Gingembre', url: '/src/assets/images/drink_bissap_bar_1795658728002.jpg', cat: 'boisson'},
  {label: 'Suite Hôtel Deluxe', url: '/src/assets/images/hotel_suite_deluxe_1795658726553.jpg', cat: 'hotel'},
];

export const CHAMBRE_STATUS_UI: Record<
  ChambreStatut,
  {label: string; bg: string; border: string; text: string; dot: string}
> = {
  LIBRE: {
    label: 'LIBRE',
    bg: 'bg-emerald-50',
    border: 'border-emerald-300',
    text: 'text-emerald-800',
    dot: 'bg-emerald-600',
  },
  OCCUPEE: {
    label: 'OCCUPÉE',
    bg: 'bg-red-50',
    border: 'border-red-300',
    text: 'text-red-800',
    dot: 'bg-red-600',
  },
  EN_NETTOYAGE: {
    label: 'EN NETTOYAGE',
    bg: 'bg-amber-50',
    border: 'border-amber-300',
    text: 'text-amber-800',
    dot: 'bg-amber-500',
  },
  RESERVEE: {
    label: 'RÉSERVÉE',
    bg: 'bg-blue-50',
    border: 'border-blue-300',
    text: 'text-blue-800',
    dot: 'bg-blue-600',
  },
  HORS_SERVICE: {
    label: 'HORS SERVICE',
    bg: 'bg-stone-100',
    border: 'border-stone-300',
    text: 'text-stone-700',
    dot: 'bg-stone-500',
  },
};

export function formatFCFA(amount: number): string {
  return `${new Intl.NumberFormat('fr-FR').format(Math.round(amount || 0))} F`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function isEtabReadOnly(etab: Etablissement | null): {readOnly: boolean; reason: string | null} {
  if (!etab) return {readOnly: false, reason: null};
  if (etab.est_bloque || etab.statut_abonnement === 'bloque') {
    return {readOnly: true, reason: 'Établissement bloqué par le Super-Admin. Contactez le support ou régularisez l’abonnement.'};
  }
  const now = Date.now();
  if (etab.statut_abonnement === 'essai') {
    if (new Date(etab.essai_fin).getTime() < now) {
      return {readOnly: true, reason: 'Période d’essai gratuit de 7 jours expirée. Passez à un abonnement payant pour débloquer les écritures.'};
    }
    return {readOnly: false, reason: null};
  }
  if (etab.statut_abonnement === 'actif') {
    if (etab.abonnement_fin && new Date(etab.abonnement_fin).getTime() < now) {
      return {readOnly: true, reason: 'Abonnement expiré. Renouvelez par Mobile Money pour réactiver l’établissement.'};
    }
    return {readOnly: false, reason: null};
  }
  return {readOnly: true, reason: 'Abonnement inactif — Mode lecture seule activé.'};
}

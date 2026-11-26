import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  BarChart3,
  BedDouble,
  Bike,
  ChefHat,
  CreditCard,
  LogOut,
  Package,
  Receipt,
  RefreshCw,
  ShieldAlert,
  UserCheck,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import type {Session} from '@supabase/supabase-js';
import {AuthScreen} from './components/AuthScreen';
import {CaissierView} from './components/CaissierView';
import {CuisineBarView} from './components/CuisineBarView';
import {HotelView} from './components/HotelView';
import {LivraisonView} from './components/LivraisonView';
import {MenuStockView} from './components/MenuStockView';
import {
  OfflineSyncBar,
  PWAInstallBanner,
  PWAInstallButton,
  SplashScreen,
} from './components/PWAComponents';
import {ServeurView} from './components/ServeurView';
import {SqlSetupModal} from './components/SqlSetupModal';
import {StatistiquesView} from './components/StatistiquesView';
import {SuperAdminDashboard} from './components/SuperAdminDashboard';
import {
  enqueueOfflineOp,
  flushOfflineQueue,
  getOfflineQueue,
  loadCachedWorkspace,
  saveCachedWorkspace,
  useOnlineStatus,
} from './lib/offlineSync';
import {checkDatabaseInitialized, supabase} from './lib/supabase';
import {
  DEFAULT_FORMULES,
  isEtabReadOnly,
  ROLE_LABELS,
  type Approvisionnement,
  type Chambre,
  type ChambreStatut,
  type Commande,
  type CommandeItem,
  type CycleAbonnement,
  type Employe,
  type Etablissement,
  type Formule,
  type FormuleId,
  type Livraison,
  type MenageTask,
  type MenuItem,
  type ModePaiement,
  type Paiement,
  type Profil,
  type Reservation,
  type RoleType,
  type Sejour,
  type StockItem,
} from './types/efa';

type NavTab =
  | 'serveur'
  | 'caissier'
  | 'cuisine'
  | 'livraison'
  | 'hotel'
  | 'admin'
  | 'stats';

interface CachedWorkspace {
  etab: Etablissement;
  employes: Employe[];
  menus: MenuItem[];
  stock: StockItem[];
  approvisionnements: Approvisionnement[];
  commandes: Commande[];
  paiements: Paiement[];
  livraisons: Livraison[];
  chambres: Chambre[];
  reservations: Reservation[];
  sejours: Sejour[];
  menageTasks: MenageTask[];
}

export default function App() {
  const isOnline = useOnlineStatus();
  const [dbReady, setDbReady] = useState<boolean | null>(null);
  const [dbError, setDbError] = useState<string | undefined>(undefined);
  const [showSqlHelp, setShowSqlHelp] = useState(false);

  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profil, setProfil] = useState<Profil | null>(null);
  const [formules, setFormules] = useState<Formule[]>(DEFAULT_FORMULES);

  // Establishment workspace state
  const [etab, setEtab] = useState<Etablissement | null>(null);
  const [employes, setEmployes] = useState<Employe[]>([]);
  const [menus, setMenus] = useState<MenuItem[]>([]);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [approvisionnements, setApprovisionnements] = useState<Approvisionnement[]>([]);
  const [commandes, setCommandes] = useState<Commande[]>([]);
  const [paiements, setPaiements] = useState<Paiement[]>([]);
  const [livraisons, setLivraisons] = useState<Livraison[]>([]);
  const [chambres, setChambres] = useState<Chambre[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [sejours, setSejours] = useState<Sejour[]>([]);
  const [menageTasks, setMenageTasks] = useState<MenageTask[]>([]);

  // Active operator (can switch on shared POS via PIN)
  const [activeOperator, setActiveOperator] = useState<{
    id: string | null;
    nom: string;
    role: RoleType;
  } | null>(null);
  const [showPinSwitch, setShowPinSwitch] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [selectedEmpId, setSelectedEmpId] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<NavTab>('serveur');
  const [pendingOps, setPendingOps] = useState<number>(() => getOfflineQueue().length);
  const [syncing, setSyncing] = useState(false);
  const [bootSplash, setBootSplash] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setBootSplash(false), 600);
    return () => clearTimeout(timer);
  }, []);

  const verifyDatabase = useCallback(async () => {
    const res = await checkDatabaseInitialized();
    setDbReady(res.initialized);
    setDbError(res.error);
  }, []);

  const loadFormules = useCallback(async () => {
    const {data, error} = await supabase.from('formules').select('*');
    if (!error && data && data.length > 0) {
      const order: Record<string, number> = {bar: 1, resto: 2, premium: 3};
      setFormules(
        (data as Formule[]).sort((a, b) => (order[a.id] || 9) - (order[b.id] || 9))
      );
    }
  }, []);

  useEffect(() => {
    verifyDatabase();
  }, [verifyDatabase]);

  useEffect(() => {
    if (dbReady) {
      loadFormules();
    }
  }, [dbReady, loadFormules]);

  // Auth listener
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({data}) => {
      if (mounted) {
        setSession(data.session);
        setAuthLoading(false);
      }
    });
    const {
      data: {subscription},
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (mounted) {
        setSession(nextSession);
        setAuthLoading(false);
      }
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const loadWorkspace = useCallback(
    async (etabId: string) => {
      if (!isOnline) {
        const cached = loadCachedWorkspace<CachedWorkspace>(etabId);
        if (cached) {
          setEtab(cached.etab);
          setEmployes(cached.employes);
          setMenus(cached.menus);
          setStock(cached.stock);
          setApprovisionnements(cached.approvisionnements);
          setCommandes(cached.commandes);
          setPaiements(cached.paiements);
          setLivraisons(cached.livraisons);
          setChambres(cached.chambres);
          setReservations(cached.reservations);
          setSejours(cached.sejours);
          setMenageTasks(cached.menageTasks);
        }
        return;
      }

      const [
        etabRes,
        empRes,
        menuRes,
        stockRes,
        approRes,
        cmdRes,
        payRes,
        livRes,
        chRes,
        resRes,
        sejRes,
        menRes,
      ] = await Promise.all([
        supabase.from('etablissements').select('*').eq('id', etabId).single(),
        supabase.from('employes').select('*').eq('etablissement_id', etabId).order('created_at'),
        supabase.from('menus').select('*').eq('etablissement_id', etabId).order('created_at'),
        supabase.from('stock').select('*').eq('etablissement_id', etabId).order('nom'),
        supabase
          .from('approvisionnements')
          .select('*')
          .eq('etablissement_id', etabId)
          .order('created_at', {ascending: false})
          .limit(50),
        supabase
          .from('commandes')
          .select('*')
          .eq('etablissement_id', etabId)
          .order('created_at', {ascending: false})
          .limit(200),
        supabase
          .from('paiements')
          .select('*')
          .eq('etablissement_id', etabId)
          .order('created_at', {ascending: false})
          .limit(300),
        supabase
          .from('livraisons')
          .select('*')
          .eq('etablissement_id', etabId)
          .order('created_at', {ascending: false})
          .limit(100),
        supabase.from('chambres').select('*').eq('etablissement_id', etabId).order('numero'),
        supabase
          .from('reservations')
          .select('*')
          .eq('etablissement_id', etabId)
          .order('date_arrivee', {ascending: false}),
        supabase
          .from('sejours')
          .select('*')
          .eq('etablissement_id', etabId)
          .order('heure_arrivee', {ascending: false})
          .limit(100),
        supabase
          .from('menage')
          .select('*')
          .eq('etablissement_id', etabId)
          .order('created_at', {ascending: false})
          .limit(50),
      ]);

      if (etabRes.data) {
        const nextEtab = etabRes.data as Etablissement;
        const nextEmp = (empRes.data || []) as Employe[];
        const nextMenu = (menuRes.data || []) as MenuItem[];
        const nextStock = (stockRes.data || []) as StockItem[];
        const nextAppro = (approRes.data || []) as Approvisionnement[];
        const nextCmd = (cmdRes.data || []) as Commande[];
        const nextPay = (payRes.data || []) as Paiement[];
        const nextLiv = (livRes.data || []) as Livraison[];
        const nextCh = (chRes.data || []) as Chambre[];
        const nextRes = (resRes.data || []) as Reservation[];
        const nextSej = (sejRes.data || []) as Sejour[];
        const nextMen = (menRes.data || []) as MenageTask[];

        setEtab(nextEtab);
        setEmployes(nextEmp);
        setMenus(nextMenu);
        setStock(nextStock);
        setApprovisionnements(nextAppro);
        setCommandes(nextCmd);
        setPaiements(nextPay);
        setLivraisons(nextLiv);
        setChambres(nextCh);
        setReservations(nextRes);
        setSejours(nextSej);
        setMenageTasks(nextMen);

        saveCachedWorkspace<CachedWorkspace>(etabId, {
          etab: nextEtab,
          employes: nextEmp,
          menus: nextMenu,
          stock: nextStock,
          approvisionnements: nextAppro,
          commandes: nextCmd,
          paiements: nextPay,
          livraisons: nextLiv,
          chambres: nextCh,
          reservations: nextRes,
          sejours: nextSej,
          menageTasks: nextMen,
        });
      }
    },
    [isOnline]
  );

  const loadProfilAndData = useCallback(async () => {
    if (!dbReady || !session?.user) {
      setProfil(null);
      setEtab(null);
      return;
    }

    const {data: prof} = await supabase
      .from('profils')
      .select('*')
      .eq('id', session.user.id)
      .maybeSingle();

    if (!prof) {
      setProfil(null);
      setEtab(null);
      return;
    }

    const typedProf = prof as Profil;
    setProfil(typedProf);
    setActiveOperator((prev) =>
      prev || {
        id: null,
        nom: typedProf.nom,
        role: typedProf.role,
      }
    );

    if (typedProf.role === 'serveur') setActiveTab('serveur');
    else if (typedProf.role === 'caissier') setActiveTab('caissier');
    else if (typedProf.role === 'cuisinier') setActiveTab('cuisine');
    else if (typedProf.role === 'livreur') setActiveTab('livraison');
    else if (typedProf.role === 'receptionniste' || typedProf.role === 'menage') setActiveTab('hotel');

    if (typedProf.etablissement_id) {
      await loadWorkspace(typedProf.etablissement_id);
    }
  }, [dbReady, session, loadWorkspace]);

  useEffect(() => {
    loadProfilAndData();
  }, [loadProfilAndData]);

  // Realtime subscription (unique channel name per mount -> zero duplicate errors in React 19 StrictMode)
  useEffect(() => {
    const etabId = etab?.id;
    if (!dbReady || !etabId || !isOnline) return;

    const channelName = `efa-live-${etabId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {event: '*', schema: 'public', table: 'commandes', filter: `etablissement_id=eq.${etabId}`},
        () => {
          void loadWorkspace(etabId);
        }
      )
      .on(
        'postgres_changes',
        {event: '*', schema: 'public', table: 'livraisons', filter: `etablissement_id=eq.${etabId}`},
        () => {
          void loadWorkspace(etabId);
        }
      )
      .on(
        'postgres_changes',
        {event: '*', schema: 'public', table: 'chambres', filter: `etablissement_id=eq.${etabId}`},
        () => {
          void loadWorkspace(etabId);
        }
      )
      .on(
        'postgres_changes',
        {event: '*', schema: 'public', table: 'stock', filter: `etablissement_id=eq.${etabId}`},
        () => {
          void loadWorkspace(etabId);
        }
      )
      .on(
        'postgres_changes',
        {event: '*', schema: 'public', table: 'menage', filter: `etablissement_id=eq.${etabId}`},
        () => {
          void loadWorkspace(etabId);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [dbReady, etab?.id, isOnline, loadWorkspace]);

  // Offline auto-sync when connectivity returns
  const handleSyncNow = useCallback(async () => {
    if (!isOnline || getOfflineQueue().length === 0) return;
    setSyncing(true);
    const result = await flushOfflineQueue(supabase);
    setPendingOps(result.remaining);
    setSyncing(false);
    if (etab?.id) {
      await loadWorkspace(etab.id);
    }
  }, [isOnline, etab?.id, loadWorkspace]);

  useEffect(() => {
    if (isOnline && pendingOps > 0) {
      void handleSyncNow();
    }
  }, [isOnline, pendingOps, handleSyncNow]);

  const currentFormule = useMemo(
    () => formules.find((f) => f.id === etab?.formule) || DEFAULT_FORMULES[0],
    [formules, etab?.formule]
  );

  const readOnlyState = useMemo(() => isEtabReadOnly(etab), [etab]);

  const operatorRole = activeOperator?.role || profil?.role || 'serveur';
  const operatorName = activeOperator?.nom || profil?.nom || 'Opérateur';
  const isPatron = operatorRole === 'patron';

  const navItems = useMemo(() => {
    if (!etab) return [];
    const f = etab.formule;
    const all: {id: NavTab; label: string; icon: React.ReactNode; visible: boolean}[] = [
      {
        id: 'serveur',
        label: 'Serveur',
        icon: <UtensilsCrossed className="w-4 h-4" />,
        visible: isPatron || operatorRole === 'serveur',
      },
      {
        id: 'caissier',
        label: 'Caisse',
        icon: <Receipt className="w-4 h-4" />,
        visible: isPatron || operatorRole === 'caissier',
      },
      {
        id: 'cuisine',
        label: f === 'bar' ? 'Bar' : 'Cuisine / Bar',
        icon: <ChefHat className="w-4 h-4" />,
        visible: (isPatron || operatorRole === 'cuisinier') && f !== 'bar',
      },
      {
        id: 'livraison',
        label: 'Livraisons',
        icon: <Bike className="w-4 h-4" />,
        visible: (isPatron || operatorRole === 'livreur') && (f === 'resto' || f === 'premium'),
      },
      {
        id: 'hotel',
        label: 'Hôtel',
        icon: <BedDouble className="w-4 h-4" />,
        visible:
          (isPatron || operatorRole === 'receptionniste' || operatorRole === 'menage') &&
          f === 'premium',
      },
      {
        id: 'admin',
        label: 'Menu & Stock',
        icon: <Package className="w-4 h-4" />,
        visible: isPatron,
      },
      {
        id: 'stats',
        label: 'Statistiques',
        icon: <BarChart3 className="w-4 h-4" />,
        visible: isPatron,
      },
    ];
    return all.filter((item) => item.visible);
  }, [etab, isPatron, operatorRole]);

  // Keep activeTab valid when switching roles/formulas
  useEffect(() => {
    if (navItems.length > 0 && !navItems.some((n) => n.id === activeTab)) {
      setActiveTab(navItems[0].id);
    }
  }, [navItems, activeTab]);

  // --------------------------------------------------------------------------
  // MUTATIONS (Connected to Supabase + Offline Queue Fallback)
  // --------------------------------------------------------------------------
  const handleCreateCommande = async (
    payload: Omit<Commande, 'id' | 'created_at' | 'validated_at' | 'paid_at'>
  ) => {
    if (!isOnline) {
      const localCmd: Commande = {
        ...payload,
        id: `offline-${Date.now()}`,
        created_at: new Date().toISOString(),
        validated_at: null,
        paid_at: null,
      };
      setCommandes((prev) => [localCmd, ...prev]);
      const next = enqueueOfflineOp({
        type: 'insert',
        table: 'commandes',
        payload,
        description: `Commande ${payload.numero_bon}`,
      });
      setPendingOps(next.length);
      return {ok: true, numeroBon: payload.numero_bon};
    }

    const {data, error} = await supabase.from('commandes').insert(payload).select().single();
    if (error) return {ok: false, error: error.message};
    if (data) setCommandes((prev) => [data as Commande, ...prev]);
    return {ok: true, numeroBon: payload.numero_bon};
  };

  const handleValidateCommande = async (commande: Commande, caissierNom: string) => {
    const patch = {
      statut_caisse: 'VALIDEE' as const,
      caissier_nom: caissierNom,
      validated_at: new Date().toISOString(),
    };
    if (!isOnline || commande.id.startsWith('offline-')) {
      setCommandes((prev) => prev.map((c) => (c.id === commande.id ? {...c, ...patch} : c)));
      const next = enqueueOfflineOp({
        type: 'update',
        table: 'commandes',
        match: {numero_bon: commande.numero_bon, etablissement_id: commande.etablissement_id},
        payload: patch,
        description: `Validation ${commande.numero_bon}`,
      });
      setPendingOps(next.length);
      return {ok: true};
    }

    const {error} = await supabase.from('commandes').update(patch).eq('id', commande.id);
    if (error) return {ok: false, error: error.message};
    if (etab?.id) await loadWorkspace(etab.id);
    return {ok: true};
  };

  const handleEncaisserCommande = async ({
    commande,
    mode,
    caissierNom,
    clientNom,
    clientTel,
    reference,
  }: {
    commande: Commande;
    mode: ModePaiement | 'SUR_CHAMBRE';
    caissierNom: string;
    clientNom?: string;
    clientTel?: string;
    reference?: string;
  }) => {
    if (!etab) return {ok: false, error: 'Établissement introuvable'};
    const nextStatus: Commande['statut_caisse'] =
      mode === 'SUR_CHAMBRE' ? 'SUR_CHAMBRE' : mode === 'Credit' ? 'CREDIT' : 'ENCAISSEE';
    const cmdPatch = {
      statut_caisse: nextStatus,
      caissier_nom: caissierNom,
      paid_at: mode === 'SUR_CHAMBRE' ? null : new Date().toISOString(),
    };

    if (!isOnline) {
      setCommandes((prev) => prev.map((c) => (c.id === commande.id ? {...c, ...cmdPatch} : c)));
      enqueueOfflineOp({
        type: 'update',
        table: 'commandes',
        match: {numero_bon: commande.numero_bon, etablissement_id: etab.id},
        payload: cmdPatch,
        description: `Encaissement ${commande.numero_bon}`,
      });
      if (mode !== 'SUR_CHAMBRE') {
        const payPayload = {
          etablissement_id: etab.id,
          commande_id: commande.id.startsWith('offline-') ? null : commande.id,
          sejour_id: commande.sejour_id,
          type_paiement: 'commande',
          mode_paiement: mode,
          montant: commande.montant_total,
          client_nom: clientNom || null,
          client_tel: clientTel || null,
          est_regle: mode !== 'Credit',
          caissier_nom: caissierNom,
          reference: reference || null,
        };
        const next = enqueueOfflineOp({
          type: 'insert',
          table: 'paiements',
          payload: payPayload,
          description: `Paiement ${commande.numero_bon}`,
        });
        setPendingOps(next.length);
      }
      return {ok: true};
    }

    const {error: cmdErr} = await supabase.from('commandes').update(cmdPatch).eq('id', commande.id);
    if (cmdErr) return {ok: false, error: cmdErr.message};

    if (mode !== 'SUR_CHAMBRE') {
      const {error: payErr} = await supabase.from('paiements').insert({
        etablissement_id: etab.id,
        commande_id: commande.id,
        sejour_id: commande.sejour_id,
        type_paiement: 'commande',
        mode_paiement: mode,
        montant: commande.montant_total,
        client_nom: clientNom || null,
        client_tel: clientTel || null,
        est_regle: mode !== 'Credit',
        caissier_nom: caissierNom,
        reference: reference || null,
      });
      if (payErr) return {ok: false, error: payErr.message};
    }

    await loadWorkspace(etab.id);
    return {ok: true};
  };

  const handleSettleCredit = async (
    paiement: Paiement,
    mode: Exclude<ModePaiement, 'Credit'>,
    caissierNom: string
  ) => {
    if (!etab) return {ok: false, error: 'Établissement introuvable'};
    const {error: updErr} = await supabase
      .from('paiements')
      .update({est_regle: true})
      .eq('id', paiement.id);
    if (updErr) return {ok: false, error: updErr.message};

    const {error: insErr} = await supabase.from('paiements').insert({
      etablissement_id: etab.id,
      commande_id: paiement.commande_id,
      type_paiement: 'reglement_credit',
      mode_paiement: mode,
      montant: paiement.montant,
      client_nom: paiement.client_nom,
      client_tel: paiement.client_tel,
      est_regle: true,
      caissier_nom: caissierNom,
      reference: `REG-${paiement.id.slice(0, 6)}`,
    });
    if (insErr) return {ok: false, error: insErr.message};

    await loadWorkspace(etab.id);
    return {ok: true};
  };

  const handleUpdateKitchenStatus = async (
    commande: Commande,
    status: 'EN_PREPARATION' | 'PRET' | 'SERVI'
  ) => {
    if (!isOnline) {
      setCommandes((prev) =>
        prev.map((c) => (c.id === commande.id ? {...c, statut_cuisine: status} : c))
      );
      const next = enqueueOfflineOp({
        type: 'update',
        table: 'commandes',
        match: {numero_bon: commande.numero_bon, etablissement_id: commande.etablissement_id},
        payload: {statut_cuisine: status},
        description: `Cuisine ${commande.numero_bon} -> ${status}`,
      });
      setPendingOps(next.length);
      return {ok: true};
    }

    const {error} = await supabase
      .from('commandes')
      .update({statut_cuisine: status})
      .eq('id', commande.id);
    if (error) return {ok: false, error: error.message};
    setCommandes((prev) =>
      prev.map((c) => (c.id === commande.id ? {...c, statut_cuisine: status} : c))
    );
    return {ok: true};
  };

  const handleCreateDeliveryOrder = async (params: {
    clientNom: string;
    clientTel: string;
    quartier: string;
    adresseDetail: string;
    fraisLivraison: number;
    items: CommandeItem[];
    livreurId: string | null;
    livreurNom: string | null;
    operateurNom: string;
  }) => {
    if (!etab) return {ok: false, error: 'Établissement introuvable'};
    const montantItems = params.items.reduce((s, i) => s + i.prix * i.quantite, 0);
    const total = montantItems + params.fraisLivraison;
    const numeroBon = `LIV-${Math.floor(1000 + Math.random() * 9000)}`;

    const {data: cmdData, error: cmdErr} = await supabase
      .from('commandes')
      .insert({
        etablissement_id: etab.id,
        numero_bon: numeroBon,
        type_service: 'Livraison',
        cible: `Livraison · ${params.quartier}`,
        serveur_nom: params.operateurNom,
        items: params.items,
        montant_items: montantItems,
        frais_livraison: params.fraisLivraison,
        montant_total: total,
        statut_caisse: 'VALIDEE',
        statut_cuisine: 'EN_ATTENTE',
        client_nom: params.clientNom,
        client_tel: params.clientTel,
        validated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (cmdErr || !cmdData) return {ok: false, error: cmdErr?.message || 'Erreur commande livraison'};

    const {error: livErr} = await supabase.from('livraisons').insert({
      etablissement_id: etab.id,
      commande_id: (cmdData as Commande).id,
      client_nom: params.clientNom,
      client_tel: params.clientTel,
      quartier: params.quartier,
      adresse_detail: params.adresseDetail,
      frais_livraison: params.fraisLivraison,
      montant_a_encaisser: total,
      livreur_id: params.livreurId,
      livreur_nom: params.livreurNom,
      statut: 'EN_ATTENTE',
    });

    if (livErr) return {ok: false, error: livErr.message};
    await loadWorkspace(etab.id);
    return {ok: true};
  };

  const handleUpdateDeliveryStatus = async (
    livraison: Livraison,
    statut: 'EN_COURS' | 'LIVRE',
    livreurNom: string
  ) => {
    if (!etab) return {ok: false, error: 'Établissement introuvable'};
    const patch = {
      statut,
      livreur_nom: livreurNom,
      ...(statut === 'LIVRE' ? {delivered_at: new Date().toISOString()} : {}),
    };
    const {error} = await supabase.from('livraisons').update(patch).eq('id', livraison.id);
    if (error) return {ok: false, error: error.message};

    if (statut === 'LIVRE') {
      await supabase
        .from('commandes')
        .update({statut_caisse: 'ENCAISSEE', paid_at: new Date().toISOString()})
        .eq('id', livraison.commande_id);

      await supabase.from('paiements').insert({
        etablissement_id: etab.id,
        commande_id: livraison.commande_id,
        type_paiement: 'commande',
        mode_paiement: 'Especes',
        montant: livraison.montant_a_encaisser,
        client_nom: livraison.client_nom,
        client_tel: livraison.client_tel,
        est_regle: true,
        caissier_nom: `Livreur · ${livreurNom}`,
      });
    }

    await loadWorkspace(etab.id);
    return {ok: true};
  };

  // Hotel mutations
  const handleCreateChambre = async (c: Omit<Chambre, 'id' | 'created_at'>) => {
    const {error} = await supabase.from('chambres').insert(c);
    if (error) return {ok: false, error: error.message};
    if (etab?.id) await loadWorkspace(etab.id);
    return {ok: true};
  };

  const handleUpdateChambreStatut = async (chambreId: string, statut: ChambreStatut) => {
    const {error} = await supabase.from('chambres').update({statut}).eq('id', chambreId);
    if (error) return {ok: false, error: error.message};
    if (etab?.id) await loadWorkspace(etab.id);
    return {ok: true};
  };

  const handleCheckIn = async (
    payload: Omit<Sejour, 'id' | 'created_at' | 'heure_depart_reelle' | 'statut' | 'supplement_prolongation'>
  ) => {
    const {error: sejErr} = await supabase.from('sejours').insert({...payload, statut: 'EN_COURS'});
    if (sejErr) return {ok: false, error: sejErr.message};

    await supabase.from('chambres').update({statut: 'OCCUPEE'}).eq('id', payload.chambre_id);
    if (etab?.id) await loadWorkspace(etab.id);
    return {ok: true};
  };

  const handleCheckOut = async ({
    sejour,
    supplementProlongation,
    montantTotalFacture,
    modePaiement,
    caissierNom,
  }: {
    sejour: Sejour;
    supplementProlongation: number;
    montantTotalFacture: number;
    modePaiement: Exclude<ModePaiement, 'Credit'>;
    caissierNom: string;
  }) => {
    if (!etab) return {ok: false, error: 'Établissement introuvable'};
    const nowIso = new Date().toISOString();

    const {error: sejErr} = await supabase
      .from('sejours')
      .update({
        supplement_prolongation: supplementProlongation,
        heure_depart_reelle: nowIso,
        statut: 'TERMINE',
      })
      .eq('id', sejour.id);
    if (sejErr) return {ok: false, error: sejErr.message};

    // Close linked SUR_CHAMBRE orders
    await supabase
      .from('commandes')
      .update({statut_caisse: 'ENCAISSEE', paid_at: nowIso})
      .eq('sejour_id', sejour.id)
      .eq('statut_caisse', 'SUR_CHAMBRE');

    const {error: payErr} = await supabase.from('paiements').insert({
      etablissement_id: etab.id,
      sejour_id: sejour.id,
      type_paiement: 'sejour_checkout',
      mode_paiement: modePaiement,
      montant: montantTotalFacture,
      client_nom: sejour.client_nom,
      client_tel: sejour.client_tel,
      est_regle: true,
      caissier_nom: caissierNom,
      reference: `CH-${sejour.chambre_numero}`,
    });
    if (payErr) return {ok: false, error: payErr.message};

    await loadWorkspace(etab.id);
    return {ok: true};
  };

  const handleCreateReservation = async (
    payload: Omit<Reservation, 'id' | 'created_at' | 'statut'>
  ) => {
    const {error} = await supabase.from('reservations').insert({...payload, statut: 'CONFIRMEE'});
    if (error) return {ok: false, error: error.message};
    await supabase.from('chambres').update({statut: 'RESERVEE'}).eq('id', payload.chambre_id);
    if (etab?.id) await loadWorkspace(etab.id);
    return {ok: true};
  };

  const handleUpdateReservationStatut = async (
    resId: string,
    chambreId: string,
    statut: 'HONOREE' | 'ANNULEE'
  ) => {
    await supabase.from('reservations').update({statut}).eq('id', resId);
    if (statut === 'ANNULEE') {
      await supabase.from('chambres').update({statut: 'LIBRE'}).eq('id', chambreId);
    }
    if (etab?.id) await loadWorkspace(etab.id);
  };

  const handleCleanRoom = async (task: MenageTask, agentNom: string) => {
    const {error: mErr} = await supabase
      .from('menage')
      .update({statut: 'NETTOYEE', agent_nom: agentNom, completed_at: new Date().toISOString()})
      .eq('id', task.id);
    if (mErr) return {ok: false, error: mErr.message};

    await supabase.from('chambres').update({statut: 'LIBRE'}).eq('id', task.chambre_id);
    if (etab?.id) await loadWorkspace(etab.id);
    return {ok: true};
  };

  // Menu, Stock, Staff, Config & Abonnement mutations
  const handleCreateMenu = async (m: Omit<MenuItem, 'id' | 'created_at' | 'actif'>) => {
    const {error} = await supabase.from('menus').insert({...m, actif: true});
    if (error) return {ok: false, error: error.message};
    if (etab?.id) await loadWorkspace(etab.id);
    return {ok: true};
  };

  const handleToggleMenuFlag = async (
    id: string,
    field: 'est_plat_du_jour' | 'est_epuise',
    val: boolean
  ) => {
    await supabase.from('menus').update({[field]: val}).eq('id', id);
    if (etab?.id) await loadWorkspace(etab.id);
  };

  const handleCreateStock = async (s: Omit<StockItem, 'id' | 'updated_at'>) => {
    const {error} = await supabase.from('stock').insert(s);
    if (error) return {ok: false, error: error.message};
    if (etab?.id) await loadWorkspace(etab.id);
    return {ok: true};
  };

  const handleApprovisionner = async (a: Omit<Approvisionnement, 'id' | 'created_at'>) => {
    const {error} = await supabase.from('approvisionnements').insert(a);
    if (error) return {ok: false, error: error.message};
    if (etab?.id) await loadWorkspace(etab.id);
    return {ok: true};
  };

  const handleCreateEmploye = async (
    e: Omit<Employe, 'id' | 'created_at' | 'profil_id' | 'actif'>
  ) => {
    const {error} = await supabase.from('employes').insert({...e, actif: true});
    if (error) return {ok: false, error: error.message};
    if (etab?.id) await loadWorkspace(etab.id);
    return {ok: true};
  };

  const handleUpdateEtabConfig = async (patch: Partial<Etablissement>) => {
    if (!etab) return {ok: false, error: 'Établissement manquant'};
    const {error} = await supabase.from('etablissements').update(patch).eq('id', etab.id);
    if (error) return {ok: false, error: error.message};
    await loadWorkspace(etab.id);
    return {ok: true};
  };

  const handlePayAbonnement = async ({
    formule,
    cycle,
    mode,
    reference,
  }: {
    formule: FormuleId;
    cycle: CycleAbonnement;
    mode: 'Flooz' | 'Moov Money' | 'Orange Money' | 'Wave';
    reference: string;
  }) => {
    if (!etab) return {ok: false, error: 'Établissement manquant'};
    const fObj = formules.find((f) => f.id === formule);
    const montant = cycle === 'mensuel' ? fObj?.prix_mensuel || 0 : fObj?.prix_annuel || 0;
    const start = new Date();
    const end = new Date(start);
    end.setDate(end.getDate() + (cycle === 'mensuel' ? 30 : 365));

    const {error} = await supabase.from('abonnements').insert({
      etablissement_id: etab.id,
      formule,
      cycle,
      montant,
      mode_paiement: mode,
      reference_transaction: reference,
      statut: 'PAYE',
      periode_debut: start.toISOString(),
      periode_fin: end.toISOString(),
    });
    if (error) return {ok: false, error: error.message};
    await loadWorkspace(etab.id);
    return {ok: true};
  };

  const handlePinSwitch = (e: React.FormEvent) => {
    e.preventDefault();
    const emp = employes.find((x) => x.id === selectedEmpId);
    if (!emp) {
      setPinError('Sélectionnez un employé.');
      return;
    }
    if (emp.pin_code !== pinInput.trim()) {
      setPinError('Code PIN incorrect.');
      return;
    }
    setActiveOperator({id: emp.id, nom: emp.nom, role: emp.role});
    setShowPinSwitch(false);
    setPinInput('');
    setPinError(null);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setProfil(null);
    setEtab(null);
    setActiveOperator(null);
  };

  // --------------------------------------------------------------------------
  // RENDER GATES
  // --------------------------------------------------------------------------
  if (dbReady === null || authLoading || bootSplash) {
    return <SplashScreen />;
  }

  if (dbReady === false || showSqlHelp) {
    return (
      <SqlSetupModal
        errorMessage={dbError}
        onRetryConnection={async () => {
          await verifyDatabase();
          await loadFormules();
          setShowSqlHelp(false);
        }}
        closable={Boolean(dbReady)}
        onClose={() => setShowSqlHelp(false)}
      />
    );
  }

  if (!session || !profil) {
    return (
      <AuthScreen
        formules={formules}
        pendingUserEmail={session?.user?.email}
        pendingUserId={session?.user?.id}
        onAuthComplete={loadProfilAndData}
        onSignOut={session ? handleSignOut : undefined}
        onOpenSqlSetup={() => setShowSqlHelp(true)}
      />
    );
  }

  // SUPER-ADMIN SHELL
  if (profil.role === 'super_admin') {
    return (
      <div className="min-h-screen bg-[#FAF9F6] text-[#161614] flex flex-col overflow-x-hidden">
        <PWAInstallBanner />
        <header className="border-b border-stone-200 bg-white">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5 min-w-0">
              <img
                src="/logo-emblem.png"
                alt="Logo EFA RESTO-LIVRO"
                className="w-9 h-9 rounded-full object-contain shrink-0"
              />
              <span className="font-display text-base sm:text-lg font-extrabold tracking-tight text-[#161614] truncate">
                EFA RESTO-LIVRO · Super-Admin
              </span>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              <PWAInstallButton />
              <span className="hidden md:inline text-xs font-medium text-stone-500">{profil.nom}</span>
              <button
                type="button"
                onClick={handleSignOut}
                className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 px-3.5 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50 min-h-[48px]"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Déconnexion</span>
              </button>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-7xl w-full flex-1 px-4 sm:px-6 py-6">
          <SuperAdminDashboard formules={formules} onRefreshFormules={loadFormules} />
        </main>
      </div>
    );
  }

  if (!etab) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center p-4">
        <div className="rounded-2xl border border-stone-200 bg-white p-6 text-center space-y-3 max-w-sm">
          <RefreshCw className="w-6 h-6 text-[#0E8A55] animate-spin mx-auto" />
          <p className="text-sm font-semibold">Chargement de votre établissement...</p>
          <button
            type="button"
            onClick={handleSignOut}
            className="text-xs text-stone-500 underline"
          >
            Se déconnecter
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#161614] flex flex-col overflow-x-hidden">
      <PWAInstallBanner />
      <OfflineSyncBar
        isOnline={isOnline}
        pendingCount={pendingOps}
        syncing={syncing}
        onSyncNow={handleSyncNow}
      />

      {readOnlyState.readOnly && (
        <div className="bg-red-700 text-white px-4 py-2.5 text-xs font-semibold flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>MODE LECTURE SEULE · {readOnlyState.reason}</span>
          </div>
          {isPatron && (
            <button
              type="button"
              onClick={() => setActiveTab('admin')}
              className="rounded-lg bg-white text-red-800 px-3 py-2 text-xs font-bold whitespace-nowrap min-h-[44px]"
            >
              Régulariser maintenant
            </button>
          )}
        </div>
      )}

      {/* Workspace Layout: Sidebar on Tablet (md+) & Desktop, Bottom nav on Smartphone (< md) */}
      <div className="flex-1 flex flex-col md:flex-row min-w-0">
        {/* Tablet & Desktop Left Sidebar */}
        <aside className="hidden md:flex md:w-56 lg:w-64 md:flex-col border-r border-stone-200 bg-white p-4 justify-between shrink-0">
          <div className="space-y-6">
            <div className="px-1 flex items-center gap-2.5">
              <img
                src="/logo-emblem.png"
                alt="Logo EFA RESTO-LIVRO"
                className="w-10 h-10 rounded-full object-contain shrink-0"
              />
              <div className="min-w-0">
                <span className="font-display text-sm font-extrabold tracking-tight text-[#161614] block truncate">
                  EFA RESTO-LIVRO
                </span>
                <p className="text-xs font-semibold text-emerald-800 truncate">{etab.nom}</p>
                <p className="text-[11px] font-mono text-stone-500 truncate">
                  {etab.formule.toUpperCase()} · {etab.code_etablissement}
                </p>
              </div>
            </div>

            <nav className="space-y-1">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-colors min-h-[48px] ${
                    activeTab === item.id
                      ? 'bg-[#0E8A55] text-white'
                      : 'text-stone-700 hover:bg-stone-100'
                  }`}
                >
                  {item.icon}
                  <span className="truncate">{item.label}</span>
                </button>
              ))}
            </nav>
          </div>

          <div className="space-y-2 border-t border-stone-100 pt-4">
            <div className="px-2 py-1">
              <p className="text-xs font-bold text-[#161614] truncate">{operatorName}</p>
              <p className="text-[11px] text-stone-500">{ROLE_LABELS[operatorRole]}</p>
            </div>
            {employes.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  setSelectedEmpId(employes[0]?.id || '');
                  setShowPinSwitch(true);
                }}
                className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-stone-300 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50 min-h-[48px]"
              >
                <UserCheck className="w-3.5 h-3.5" />
                Changer (PIN)
              </button>
            )}
            <button
              type="button"
              onClick={handleSignOut}
              className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-stone-200 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-50 min-h-[48px]"
            >
              <LogOut className="w-3.5 h-3.5" />
              Déconnexion
            </button>
          </div>
        </aside>

        {/* Main Viewport */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top Bar with Small Logo on Left + Name */}
          <header className="border-b border-stone-200 bg-white px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3">
            <div className="min-w-0 flex items-center gap-2.5">
              <div className="md:hidden flex items-center gap-2 min-w-0">
                <img
                  src="/logo-emblem.png"
                  alt="Logo EFA RESTO-LIVRO"
                  className="w-8 h-8 rounded-full object-contain shrink-0"
                />
                <div className="min-w-0">
                  <span className="font-display text-xs font-extrabold text-[#161614] block leading-tight truncate">
                    EFA RESTO-LIVRO
                  </span>
                  <span className="text-[11px] font-semibold text-emerald-800 block leading-tight truncate">
                    {etab.nom}
                  </span>
                </div>
              </div>
              <span className="hidden md:inline text-xs text-stone-500 truncate">
                {etab.ville || 'Afrique'} ·{' '}
                {etab.statut_abonnement === 'essai'
                  ? `Essai gratuit jusqu’au ${new Date(etab.essai_fin).toLocaleDateString('fr-FR')}`
                  : `Formule ${etab.formule.toUpperCase()} active`}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <PWAInstallButton />
              <button
                type="button"
                onClick={() => etab.id && loadWorkspace(etab.id)}
                className="inline-flex items-center justify-center gap-1 rounded-xl border border-stone-200 px-3 py-2 text-xs font-medium text-stone-600 hover:bg-stone-50 min-h-[48px]"
                title="Actualiser"
                aria-label="Actualiser"
              >
                <RefreshCw className="w-4 h-4" />
                <span className="hidden sm:inline">Actualiser</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedEmpId(employes[0]?.id || '');
                  setShowPinSwitch(true);
                }}
                className="md:hidden inline-flex items-center justify-center gap-1 rounded-xl border border-stone-200 px-3 py-2 text-xs font-semibold text-stone-700 min-h-[48px]"
              >
                <UserCheck className="w-4 h-4" />
                PIN
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                className="md:hidden inline-flex items-center justify-center px-3 py-2 rounded-xl border border-stone-200 text-stone-600 min-h-[48px]"
                aria-label="Déconnexion"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </header>

          <main className="flex-1 p-4 sm:p-6 pb-24 md:pb-8 max-w-7xl w-full mx-auto">
            {activeTab === 'serveur' && (
              <ServeurView
                etab={etab}
                menus={menus}
                chambres={chambres}
                sejoursActifs={sejours.filter((s) => s.statut === 'EN_COURS')}
                operatorName={operatorName}
                operatorId={activeOperator?.id || null}
                readOnly={readOnlyState.readOnly}
                onCreateCommande={handleCreateCommande}
              />
            )}

            {activeTab === 'caissier' && (
              <CaissierView
                etab={etab}
                commandes={commandes}
                paiements={paiements}
                operatorName={operatorName}
                readOnly={readOnlyState.readOnly}
                onValidateCommande={handleValidateCommande}
                onEncaisserCommande={handleEncaisserCommande}
                onSettleCredit={handleSettleCredit}
              />
            )}

            {activeTab === 'cuisine' && (
              <CuisineBarView
                commandes={commandes}
                readOnly={readOnlyState.readOnly}
                onUpdateKitchenStatus={handleUpdateKitchenStatus}
              />
            )}

            {activeTab === 'livraison' && etab.formule !== 'bar' && (
              <LivraisonView
                etab={etab}
                menus={menus}
                livraisons={livraisons}
                employes={employes}
                operatorName={operatorName}
                readOnly={readOnlyState.readOnly}
                onCreateDeliveryOrder={handleCreateDeliveryOrder}
                onUpdateDeliveryStatus={handleUpdateDeliveryStatus}
              />
            )}

            {activeTab === 'hotel' && etab.formule === 'premium' && (
              <HotelView
                etab={etab}
                formuleObj={currentFormule}
                chambres={chambres}
                sejours={sejours}
                reservations={reservations}
                menageTasks={menageTasks}
                commandes={commandes}
                operatorName={operatorName}
                isPatron={isPatron}
                readOnly={readOnlyState.readOnly}
                onCreateChambre={handleCreateChambre}
                onUpdateChambreStatut={handleUpdateChambreStatut}
                onCheckIn={handleCheckIn}
                onCheckOut={handleCheckOut}
                onCreateReservation={handleCreateReservation}
                onUpdateReservationStatut={handleUpdateReservationStatut}
                onCleanRoom={handleCleanRoom}
              />
            )}

            {activeTab === 'admin' && isPatron && (
              <MenuStockView
                etab={etab}
                formuleObj={currentFormule}
                formules={formules}
                menus={menus}
                stock={stock}
                approvisionnements={approvisionnements}
                employes={employes}
                operatorName={operatorName}
                readOnly={readOnlyState.readOnly}
                onCreateMenu={handleCreateMenu}
                onToggleMenuFlag={handleToggleMenuFlag}
                onCreateStock={handleCreateStock}
                onApprovisionner={handleApprovisionner}
                onCreateEmploye={handleCreateEmploye}
                onUpdateEtabConfig={handleUpdateEtabConfig}
                onPayAbonnement={handlePayAbonnement}
              />
            )}

            {activeTab === 'stats' && isPatron && (
              <StatistiquesView
                etab={etab}
                commandes={commandes}
                paiements={paiements}
                chambres={chambres}
                sejours={sejours}
              />
            )}
          </main>
        </div>
      </div>

      {/* Smartphone Bottom Navigation Bar (< md) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-stone-200 bg-white/95 backdrop-blur-md">
        <div className="flex items-center justify-around h-16 px-1 overflow-x-auto">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center justify-center min-w-[56px] min-h-[48px] px-2 py-1 text-[10px] font-semibold transition-colors ${
                activeTab === item.id ? 'text-[#0E8A55]' : 'text-stone-500'
              }`}
            >
              {item.icon}
              <span className="mt-1 truncate max-w-[64px]">{item.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* PIN Switcher Modal */}
      {showPinSwitch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={handlePinSwitch}
            className="w-full max-w-xs rounded-2xl border border-stone-200 bg-white p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold">Changer d’opérateur</h3>
              <button type="button" onClick={() => setShowPinSwitch(false)}>
                <X className="w-5 h-5 text-stone-400" />
              </button>
            </div>
            {pinError && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                {pinError}
              </p>
            )}
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">Employé</label>
              <select
                value={selectedEmpId}
                onChange={(e) => setSelectedEmpId(e.target.value)}
                className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm min-h-[48px]"
              >
                {employes.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.nom} ({ROLE_LABELS[emp.role]})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">Code PIN</label>
              <input
                type="password"
                inputMode="numeric"
                required
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="••••"
                className="w-full rounded-xl border border-stone-300 px-3 py-2.5 text-center font-mono text-lg tracking-widest min-h-[48px]"
              />
            </div>
            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#0E8A55] py-3 text-sm font-bold text-white min-h-[48px]"
            >
              <CreditCard className="w-4 h-4" />
              Valider le PIN
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

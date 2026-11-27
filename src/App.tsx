import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  BarChart3,
  BedDouble,
  Bike,
  ChefHat,
  CreditCard,
  KeyRound,
  LogOut,
  Package,
  Receipt,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
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
  type Employe,
  type Etablissement,
  type Formule,
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

interface EmployeeSession {
  etabId: string;
  codeEtab: string;
  employeId: string;
  nom: string;
  role: Exclude<RoleType, 'super_admin' | 'patron'>;
  pin: string;
}

const EMPLOYEE_SESSION_KEY = 'efa_employee_session_v1';
const SUPER_ADMIN_EMAIL_ENV = ((import.meta.env.VITE_SUPER_ADMIN_EMAIL as string | undefined) || '')
  .trim()
  .toLowerCase();

function checkIsSuperAdminRoute(): boolean {
  if (typeof window === 'undefined') return false;
  const cleanHash = window.location.hash.replace(/\/+$/, '').toLowerCase();
  return cleanHash === '#/super-admin';
}

function isAuthorizedSuperAdminEmail(email?: string | null): boolean {
  if (!SUPER_ADMIN_EMAIL_ENV || !email) return false;
  return email.trim().toLowerCase() === SUPER_ADMIN_EMAIL_ENV;
}

function getDefaultTabForRole(role: RoleType): NavTab {
  if (role === 'caissier') return 'caissier';
  if (role === 'cuisinier') return 'cuisine';
  if (role === 'livreur') return 'livraison';
  if (role === 'receptionniste' || role === 'menage') return 'hotel';
  return 'serveur';
}

export default function App() {
  const isOnline = useOnlineStatus();
  const [dbReady, setDbReady] = useState<boolean | null>(null);
  const [isSuperAdminRoute, setIsSuperAdminRoute] = useState<boolean>(() => checkIsSuperAdminRoute());

  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profil, setProfil] = useState<Profil | null>(null);
  const [formules, setFormules] = useState<Formule[]>(DEFAULT_FORMULES);

  // Employee no-email PIN session
  const [employeeSession, setEmployeeSession] = useState<EmployeeSession | null>(() => {
    try {
      const raw = localStorage.getItem(EMPLOYEE_SESSION_KEY);
      return raw ? (JSON.parse(raw) as EmployeeSession) : null;
    } catch {
      return null;
    }
  });
  const [employeeBlockedNotice, setEmployeeBlockedNotice] = useState<string | null>(null);

  // Hidden Super-Admin login form state
  const [saEmail, setSaEmail] = useState('');
  const [saPassword, setSaPassword] = useState('');
  const [saLoading, setSaLoading] = useState(false);
  const [saError, setSaError] = useState<string | null>(null);

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

  useEffect(() => {
    const onHash = () => setIsSuperAdminRoute(checkIsSuperAdminRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const clearEmployeeSession = useCallback((notice?: string) => {
    setEmployeeSession(null);
    setActiveOperator(null);
    setEtab(null);
    try {
      localStorage.removeItem(EMPLOYEE_SESSION_KEY);
    } catch {
      // Ignore
    }
    if (notice) setEmployeeBlockedNotice(notice);
  }, []);

  const verifyDatabase = useCallback(async () => {
    const res = await checkDatabaseInitialized();
    setDbReady(res.initialized);
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

  // Auth listener (Patron & Super-Admin)
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

  const applyWorkspaceSnapshot = useCallback((etabId: string, snap: CachedWorkspace, save = true) => {
    setEtab(snap.etab);
    setEmployes(snap.employes);
    setMenus(snap.menus);
    setStock(snap.stock);
    setApprovisionnements(snap.approvisionnements);
    setCommandes(snap.commandes);
    setPaiements(snap.paiements);
    setLivraisons(snap.livraisons);
    setChambres(snap.chambres);
    setReservations(snap.reservations);
    setSejours(snap.sejours);
    setMenageTasks(snap.menageTasks);
    if (save) {
      saveCachedWorkspace<CachedWorkspace>(etabId, snap);
    }
  }, []);

  const loadWorkspace = useCallback(
    async (etabId: string) => {
      if (!isOnline) {
        const cached = loadCachedWorkspace<CachedWorkspace>(etabId);
        if (cached) {
          applyWorkspaceSnapshot(etabId, cached, false);
        }
        return;
      }

      // Employee no-email RPC workspace loader
      if (employeeSession && !session) {
        const {data, error} = await supabase.rpc('employee_get_workspace', {
          p_etab_id: employeeSession.etabId,
          p_employe_id: employeeSession.employeId,
          p_pin: employeeSession.pin,
        });
        if (error || !data) {
          clearEmployeeSession('Votre accès employé a été bloqué ou supprimé par le Patron.');
          return;
        }
        const raw = data as {
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
          menage: MenageTask[];
        };
        if (raw.etab) {
          applyWorkspaceSnapshot(etabId, {
            etab: raw.etab,
            employes: raw.employes || [],
            menus: raw.menus || [],
            stock: raw.stock || [],
            approvisionnements: raw.approvisionnements || [],
            commandes: raw.commandes || [],
            paiements: raw.paiements || [],
            livraisons: raw.livraisons || [],
            chambres: raw.chambres || [],
            reservations: raw.reservations || [],
            sejours: raw.sejours || [],
            menageTasks: raw.menage || [],
          });
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
        const nextEmp = (empRes.data || []) as Employe[];
        applyWorkspaceSnapshot(etabId, {
          etab: etabRes.data as Etablissement,
          employes: nextEmp,
          menus: (menuRes.data || []) as MenuItem[],
          stock: (stockRes.data || []) as StockItem[],
          approvisionnements: (approRes.data || []) as Approvisionnement[],
          commandes: (cmdRes.data || []) as Commande[],
          paiements: (payRes.data || []) as Paiement[],
          livraisons: (livRes.data || []) as Livraison[],
          chambres: (chRes.data || []) as Chambre[],
          reservations: (resRes.data || []) as Reservation[],
          sejours: (sejRes.data || []) as Sejour[],
          menageTasks: (menRes.data || []) as MenageTask[],
        });
      }
    },
    [isOnline, employeeSession, session, applyWorkspaceSnapshot, clearEmployeeSession]
  );

  // Enforce active employee check if activeOperator gets blocked/deleted on shared POS
  useEffect(() => {
    if (!activeOperator?.id || employes.length === 0) return;
    const match = employes.find((e) => e.id === activeOperator.id);
    if (!match || !match.actif) {
      if (employeeSession && !session) {
        clearEmployeeSession('Votre compte employé a été bloqué ou supprimé par le Patron.');
      } else if (profil) {
        setActiveOperator({id: null, nom: profil.nom, role: profil.role});
      }
    }
  }, [employes, activeOperator?.id, employeeSession, session, profil, clearEmployeeSession]);

  const loadProfilAndData = useCallback(async () => {
    if (!dbReady) return;

    // 1. Standalone Employee PIN Session (No Supabase Auth user)
    if (!session?.user) {
      setProfil(null);
      if (employeeSession) {
        setActiveOperator({
          id: employeeSession.employeId,
          nom: employeeSession.nom,
          role: employeeSession.role,
        });
        setActiveTab(getDefaultTabForRole(employeeSession.role));
        await loadWorkspace(employeeSession.etabId);
      } else {
        setEtab(null);
      }
      return;
    }

    // 2. Supabase Auth Session (Patron or Super-Admin)
    let {data: prof} = await supabase
      .from('profils')
      .select('*')
      .eq('id', session.user.id)
      .maybeSingle();

    // Auto-bind Super-Admin profile on /#/super-admin if email matches VITE_SUPER_ADMIN_EMAIL (no email confirmation)
    if (
      isSuperAdminRoute &&
      isAuthorizedSuperAdminEmail(session.user.email) &&
      (!prof || (prof as Profil).role !== 'super_admin')
    ) {
      await supabase.rpc('bootstrap_super_admin', {p_nom: 'Super-Admin EFA'});
      const refreshed = await supabase
        .from('profils')
        .select('*')
        .eq('id', session.user.id)
        .maybeSingle();
      prof = refreshed.data;
    }

    if (!prof) {
      setProfil(null);
      setEtab(null);
      return;
    }

    const typedProf = prof as Profil;
    setProfil(typedProf);

    if (typedProf.role !== 'super_admin') {
      setActiveOperator((prev) =>
        prev || {
          id: null,
          nom: typedProf.nom,
          role: typedProf.role,
        }
      );
      setActiveTab(getDefaultTabForRole(typedProf.role));
      if (typedProf.etablissement_id) {
        await loadWorkspace(typedProf.etablissement_id);
      }
    }
  }, [dbReady, session, employeeSession, isSuperAdminRoute, loadWorkspace]);

  useEffect(() => {
    loadProfilAndData();
  }, [loadProfilAndData]);

  // Realtime subscription
  useEffect(() => {
    const etabId = etab?.id;
    if (!dbReady || !etabId || !isOnline || isSuperAdminRoute) return;

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
      .on(
        'postgres_changes',
        {event: '*', schema: 'public', table: 'employes', filter: `etablissement_id=eq.${etabId}`},
        () => {
          void loadWorkspace(etabId);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [dbReady, etab?.id, isOnline, isSuperAdminRoute, loadWorkspace]);

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

  const activeEmployes = useMemo(() => employes.filter((e) => e.actif), [employes]);

  const operatorRole = activeOperator?.role || profil?.role || employeeSession?.role || 'serveur';
  const operatorName = activeOperator?.nom || profil?.nom || employeeSession?.nom || 'Opérateur';
  const isPatron = operatorRole === 'patron';
  const isEmployeeMode = Boolean(employeeSession && !session);

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

  useEffect(() => {
    if (navItems.length > 0 && !navItems.some((n) => n.id === activeTab)) {
      setActiveTab(navItems[0].id);
    }
  }, [navItems, activeTab]);

  // --------------------------------------------------------------------------
  // EMPLOYEE LOGIN (Code + Name + 4-digit PIN, zero email)
  // --------------------------------------------------------------------------
  const handleEmployeePinLogin = async ({
    codeEtab,
    employeId,
    pin,
  }: {
    codeEtab: string;
    employeId: string;
    pin: string;
  }): Promise<{ok: boolean; error?: string}> => {
    setEmployeeBlockedNotice(null);
    const cleanCode = codeEtab.trim().toUpperCase();
    const cleanPin = pin.trim();

    if (!isOnline) {
      // Offline verification against cached workspace
      const cached = Object.keys(localStorage)
        .filter((k) => k.startsWith('efa_workspace_cache_v1_'))
        .map((k) => {
          try {
            return JSON.parse(localStorage.getItem(k) || '') as CachedWorkspace;
          } catch {
            return null;
          }
        })
        .find((ws) => ws && ws.etab?.code_etablissement?.toUpperCase() === cleanCode);

      if (!cached) {
        return {ok: false, error: 'Mode hors-ligne : cet établissement doit d’abord être chargé en ligne.'};
      }
      const emp = cached.employes.find((x) => x.id === employeId);
      if (!emp || !emp.actif) {
        return {ok: false, error: 'Employé bloqué ou supprimé.'};
      }
      if (emp.pin_code !== cleanPin && emp.pin_code !== '****') {
        return {ok: false, error: 'Code PIN incorrect.'};
      }
      const nextSess: EmployeeSession = {
        etabId: cached.etab.id,
        codeEtab: cleanCode,
        employeId: emp.id,
        nom: emp.nom,
        role: emp.role as Exclude<RoleType, 'super_admin' | 'patron'>,
        pin: cleanPin,
      };
      setEmployeeSession(nextSess);
      localStorage.setItem(EMPLOYEE_SESSION_KEY, JSON.stringify(nextSess));
      setActiveOperator({id: emp.id, nom: emp.nom, role: emp.role});
      setActiveTab(getDefaultTabForRole(emp.role));
      applyWorkspaceSnapshot(cached.etab.id, cached, false);
      return {ok: true};
    }

    const {data, error} = await supabase.rpc('verify_employee_pin_login', {
      p_code_etab: cleanCode,
      p_employe_id: employeId,
      p_pin: cleanPin,
    });

    if (error || !data) {
      return {ok: false, error: error?.message || 'Code PIN incorrect ou accès bloqué'};
    }

    const res = data as {
      ok: boolean;
      etablissement: Etablissement;
      employe: {
        id: string;
        etablissement_id: string;
        nom: string;
        role: Exclude<RoleType, 'super_admin' | 'patron'>;
        actif: boolean;
      };
    };

    const nextSess: EmployeeSession = {
      etabId: res.etablissement.id,
      codeEtab: cleanCode,
      employeId: res.employe.id,
      nom: res.employe.nom,
      role: res.employe.role,
      pin: cleanPin,
    };

    setEmployeeSession(nextSess);
    try {
      localStorage.setItem(EMPLOYEE_SESSION_KEY, JSON.stringify(nextSess));
    } catch {
      // Ignore
    }
    setActiveOperator({id: res.employe.id, nom: res.employe.nom, role: res.employe.role});
    setActiveTab(getDefaultTabForRole(res.employe.role));
    return {ok: true};
  };

  // Helper to run employee RPC mutations cleanly
  const runEmployeeMutation = async (
    action: string,
    payload: Record<string, unknown>,
    offlineDescription: string
  ): Promise<{ok: boolean; error?: string; data?: unknown}> => {
    if (!employeeSession) return {ok: false, error: 'Session employé manquante'};
    const params = {
      p_etab_id: employeeSession.etabId,
      p_employe_id: employeeSession.employeId,
      p_pin: employeeSession.pin,
      p_action: action,
      p_payload: payload,
    };

    if (!isOnline) {
      const next = enqueueOfflineOp({
        type: 'rpc',
        fn: 'employee_mutate_workspace',
        params,
        description: offlineDescription,
      });
      setPendingOps(next.length);
      return {ok: true};
    }

    const {data, error} = await supabase.rpc('employee_mutate_workspace', params);
    if (error) {
      if (error.message.toLowerCase().includes('bloqué') || error.message.toLowerCase().includes('refusé')) {
        clearEmployeeSession('Votre accès employé a été bloqué ou supprimé par le Patron.');
      }
      return {ok: false, error: error.message};
    }
    if (etab?.id) await loadWorkspace(etab.id);
    return {ok: true, data};
  };

  // --------------------------------------------------------------------------
  // MUTATIONS (Patron Supabase direct OR Employee PIN RPC + Offline Queue)
  // --------------------------------------------------------------------------
  const handleCreateCommande = async (
    payload: Omit<Commande, 'id' | 'created_at' | 'validated_at' | 'paid_at'>
  ) => {
    if (isEmployeeMode) {
      if (!isOnline) {
        const localCmd: Commande = {
          ...payload,
          id: `offline-${Date.now()}`,
          created_at: new Date().toISOString(),
          validated_at: null,
          paid_at: null,
        };
        setCommandes((prev) => [localCmd, ...prev]);
      }
      const res = await runEmployeeMutation(
        'create_commande',
        payload as unknown as Record<string, unknown>,
        `Commande ${payload.numero_bon}`
      );
      return {ok: res.ok, error: res.error, numeroBon: payload.numero_bon};
    }

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

    if (isEmployeeMode) {
      if (!isOnline) {
        setCommandes((prev) => prev.map((c) => (c.id === commande.id ? {...c, ...patch} : c)));
      }
      return runEmployeeMutation(
        'validate_commande',
        {id: commande.id, caissier_nom: caissierNom},
        `Validation ${commande.numero_bon}`
      );
    }

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

    if (isEmployeeMode) {
      if (!isOnline) {
        setCommandes((prev) => prev.map((c) => (c.id === commande.id ? {...c, ...cmdPatch} : c)));
      }
      return runEmployeeMutation(
        'encaisser_commande',
        {
          commande_id: commande.id,
          sejour_id: commande.sejour_id || '',
          statut_caisse: nextStatus,
          mode_paiement: mode,
          montant: commande.montant_total,
          client_nom: clientNom || '',
          client_tel: clientTel || '',
          est_regle: mode !== 'Credit',
          caissier_nom: caissierNom,
          reference: reference || '',
        },
        `Encaissement ${commande.numero_bon}`
      );
    }

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
    if (isEmployeeMode) {
      return runEmployeeMutation(
        'settle_credit',
        {
          paiement_id: paiement.id,
          commande_id: paiement.commande_id || '',
          mode_paiement: mode,
          montant: paiement.montant,
          client_nom: paiement.client_nom || '',
          client_tel: paiement.client_tel || '',
          caissier_nom: caissierNom,
          reference: `REG-${paiement.id.slice(0, 6)}`,
        },
        `Règlement crédit ${paiement.client_nom || ''}`
      );
    }

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
    if (isEmployeeMode) {
      setCommandes((prev) =>
        prev.map((c) => (c.id === commande.id ? {...c, statut_cuisine: status} : c))
      );
      return runEmployeeMutation(
        'update_kitchen_status',
        {id: commande.id, statut_cuisine: status},
        `Cuisine ${commande.numero_bon} -> ${status}`
      );
    }

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

    if (isEmployeeMode) {
      return runEmployeeMutation(
        'create_delivery',
        {
          numero_bon: numeroBon,
          cible: `Livraison · ${params.quartier}`,
          operateur_nom: params.operateurNom,
          items: params.items,
          montant_items: montantItems,
          frais_livraison: params.fraisLivraison,
          montant_total: total,
          client_nom: params.clientNom,
          client_tel: params.clientTel,
          quartier: params.quartier,
          adresse_detail: params.adresseDetail,
          livreur_id: params.livreurId || '',
          livreur_nom: params.livreurNom || '',
        },
        `Livraison ${numeroBon}`
      );
    }

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
    if (isEmployeeMode) {
      return runEmployeeMutation(
        'update_delivery_status',
        {
          livraison_id: livraison.id,
          commande_id: livraison.commande_id,
          statut,
          livreur_nom: livreurNom,
          montant: livraison.montant_a_encaisser,
          client_nom: livraison.client_nom,
          client_tel: livraison.client_tel,
        },
        `Livraison ${livraison.client_nom} -> ${statut}`
      );
    }

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
    if (isEmployeeMode) {
      return runEmployeeMutation('update_chambre_statut', {chambre_id: chambreId, statut}, `Chambre -> ${statut}`);
    }
    const {error} = await supabase.from('chambres').update({statut}).eq('id', chambreId);
    if (error) return {ok: false, error: error.message};
    if (etab?.id) await loadWorkspace(etab.id);
    return {ok: true};
  };

  const handleCheckIn = async (
    payload: Omit<Sejour, 'id' | 'created_at' | 'heure_depart_reelle' | 'statut' | 'supplement_prolongation'>
  ) => {
    if (isEmployeeMode) {
      return runEmployeeMutation('check_in', payload as unknown as Record<string, unknown>, `Check-in ${payload.chambre_numero}`);
    }
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
    if (isEmployeeMode) {
      return runEmployeeMutation(
        'check_out',
        {
          sejour_id: sejour.id,
          supplement_prolongation: supplementProlongation,
          montant: montantTotalFacture,
          mode_paiement: modePaiement,
          client_nom: sejour.client_nom,
          client_tel: sejour.client_tel,
          caissier_nom: caissierNom,
          reference: `CH-${sejour.chambre_numero}`,
        },
        `Check-out Ch. ${sejour.chambre_numero}`
      );
    }

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
    if (isEmployeeMode) {
      return runEmployeeMutation('create_reservation', payload as unknown as Record<string, unknown>, 'Nouvelle réservation');
    }
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
    if (isEmployeeMode) {
      await runEmployeeMutation(
        'update_reservation_statut',
        {reservation_id: resId, chambre_id: chambreId, statut},
        `Réservation -> ${statut}`
      );
      return;
    }
    await supabase.from('reservations').update({statut}).eq('id', resId);
    if (statut === 'ANNULEE') {
      await supabase.from('chambres').update({statut: 'LIBRE'}).eq('id', chambreId);
    }
    if (etab?.id) await loadWorkspace(etab.id);
  };

  const handleCleanRoom = async (task: MenageTask, agentNom: string) => {
    if (isEmployeeMode) {
      return runEmployeeMutation(
        'clean_room',
        {task_id: task.id, chambre_id: task.chambre_id, agent_nom: agentNom},
        `Ménage Ch. ${task.chambre_numero}`
      );
    }
    const {error: mErr} = await supabase
      .from('menage')
      .update({statut: 'NETTOYEE', agent_nom: agentNom, completed_at: new Date().toISOString()})
      .eq('id', task.id);
    if (mErr) return {ok: false, error: mErr.message};

    await supabase.from('chambres').update({statut: 'LIBRE'}).eq('id', task.chambre_id);
    if (etab?.id) await loadWorkspace(etab.id);
    return {ok: true};
  };

  // Menu, Stock, Staff (Create, Block/Unblock, Delete) & Config mutations (Patron only)
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

  const handleToggleEmployeActif = async (emp: Employe) => {
    const nextActif = !emp.actif;
    const {error} = await supabase.from('employes').update({actif: nextActif}).eq('id', emp.id);
    if (error) return {ok: false, error: error.message};
    if (!nextActif && activeOperator?.id === emp.id && profil) {
      setActiveOperator({id: null, nom: profil.nom, role: profil.role});
    }
    if (etab?.id) await loadWorkspace(etab.id);
    return {ok: true};
  };

  const handleDeleteEmploye = async (emp: Employe) => {
    const {error} = await supabase.from('employes').delete().eq('id', emp.id);
    if (error) return {ok: false, error: error.message};
    if (activeOperator?.id === emp.id && profil) {
      setActiveOperator({id: null, nom: profil.nom, role: profil.role});
    }
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

  const handlePinSwitch = (e: React.FormEvent) => {
    e.preventDefault();
    const emp = activeEmployes.find((x) => x.id === selectedEmpId);
    if (!emp || !emp.actif) {
      setPinError('Employé inactif, bloqué ou supprimé.');
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
    if (session) {
      await supabase.auth.signOut();
    }
    setProfil(null);
    clearEmployeeSession();
  };

  // Hidden Super-Admin Sign-in (No confirmation, verified via VITE_SUPER_ADMIN_EMAIL)
  const handleSuperAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaError(null);
    if (!SUPER_ADMIN_EMAIL_ENV) {
      setSaError('Configuration Super-Admin manquante (VITE_SUPER_ADMIN_EMAIL).');
      return;
    }
    if (saEmail.trim().toLowerCase() !== SUPER_ADMIN_EMAIL_ENV) {
      setSaError('Accès refusé : e-mail non autorisé.');
      return;
    }
    setSaLoading(true);
    try {
      const {data, error} = await supabase.auth.signInWithPassword({
        email: saEmail.trim(),
        password: saPassword,
      });
      if (error) throw error;
      if (!isAuthorizedSuperAdminEmail(data.user?.email)) {
        await supabase.auth.signOut();
        setSaError('Accès refusé.');
        return;
      }
      await loadProfilAndData();
    } catch (err: unknown) {
      setSaError(err instanceof Error ? err.message : 'Identifiants invalides');
    } finally {
      setSaLoading(false);
    }
  };

  // --------------------------------------------------------------------------
  // RENDER GATES
  // --------------------------------------------------------------------------
  if (dbReady === null || authLoading || bootSplash) {
    return <SplashScreen />;
  }

  // No SQL exposed to clients if server connection fails
  if (dbReady === false) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-7 text-center space-y-4 shadow-sm">
          <img
            src="/logo-efa-clean.png"
            alt="EFA RESTO-LIVRO"
            className="w-36 h-auto mx-auto object-contain"
          />
          <h1 className="font-display text-lg font-bold text-[#161614]">
            Connexion au serveur en cours
          </h1>
          <p className="text-xs text-stone-600 leading-relaxed">
            Impossible de joindre le serveur EFA RESTO-LIVRO pour le moment. Vérifiez votre connexion internet et réessayez.
          </p>
          <button
            type="button"
            onClick={async () => {
              await verifyDatabase();
              await loadFormules();
            }}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#0E8A55] py-3 text-sm font-bold text-white hover:bg-[#0B7145] min-h-[48px]"
          >
            <RefreshCw className="w-4 h-4" />
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  // SECRET SUPER-ADMIN ROUTE: /#/super-admin ONLY
  if (isSuperAdminRoute) {
    const isVerifiedSa =
      Boolean(session?.user) &&
      isAuthorizedSuperAdminEmail(session?.user?.email) &&
      profil?.role === 'super_admin';

    if (!isVerifiedSa) {
      return (
        <div className="min-h-screen bg-[#FAF9F6] text-[#161614] flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 sm:p-8 shadow-sm space-y-5">
            <div className="flex flex-col items-center text-center space-y-2 border-b border-stone-100 pb-5">
              <img
                src="/logo-efa-clean.png"
                alt="EFA RESTO-LIVRO"
                className="w-36 h-auto object-contain"
              />
              <div className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800 uppercase tracking-wider pt-2">
                <ShieldCheck className="w-4 h-4" />
                Espace Privé Super-Admin
              </div>
            </div>

            {session?.user && !isAuthorizedSuperAdminEmail(session.user.email) && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-800 space-y-2">
                <p className="font-semibold">Ce compte n’est pas autorisé pour l’espace Super-Admin.</p>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="underline font-bold"
                >
                  Changer de compte
                </button>
              </div>
            )}

            {saError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-800">
                {saError}
              </div>
            )}

            <form onSubmit={handleSuperAdminLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">E-mail Super-Admin</label>
                <input
                  type="email"
                  required
                  value={saEmail}
                  onChange={(e) => setSaEmail(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-stone-300 px-3.5 py-3 text-sm focus:border-emerald-700 focus:outline-none min-h-[48px]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Mot de passe</label>
                <input
                  type="password"
                  required
                  value={saPassword}
                  onChange={(e) => setSaPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-stone-300 px-3.5 py-3 text-sm focus:border-emerald-700 focus:outline-none min-h-[48px]"
                />
              </div>
              <button
                type="submit"
                disabled={saLoading}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#161614] py-3.5 text-sm font-bold text-white hover:bg-stone-800 disabled:opacity-60 min-h-[52px]"
              >
                <KeyRound className="w-4 h-4" />
                {saLoading ? 'Connexion...' : 'Accéder à la console'}
              </button>
            </form>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-[#FAF9F6] text-[#161614] flex flex-col overflow-x-hidden">
        <PWAInstallBanner />
        <header className="border-b border-stone-200 bg-white">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5 min-w-0">
              <img
                src="/pwa-192x192.png"
                alt="Logo EFA RESTO-LIVRO"
                className="w-9 h-9 rounded-full object-contain shrink-0 border border-stone-100"
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

  // PUBLIC / ESTABLISHMENT GATE (Patron Auth OR Employee PIN Auth)
  const hasPatronSession = Boolean(session && profil && profil.role !== 'super_admin');
  const hasEmployeeSession = Boolean(employeeSession);

  if (!hasPatronSession && !hasEmployeeSession) {
    return (
      <>
        {employeeBlockedNotice && (
          <div className="bg-red-700 text-white px-4 py-2.5 text-xs font-semibold flex items-center justify-between gap-2">
            <span>{employeeBlockedNotice}</span>
            <button
              type="button"
              onClick={() => setEmployeeBlockedNotice(null)}
              className="underline shrink-0"
            >
              Fermer
            </button>
          </div>
        )}
        <AuthScreen
          formules={formules}
          pendingUserEmail={profil?.role === 'super_admin' ? null : session?.user?.email}
          pendingUserId={profil?.role === 'super_admin' ? null : session?.user?.id}
          onAuthComplete={loadProfilAndData}
          onEmployeePinLogin={handleEmployeePinLogin}
          onSignOut={session ? handleSignOut : undefined}
        />
      </>
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
                src="/pwa-192x192.png"
                alt="Logo EFA RESTO-LIVRO"
                className="w-10 h-10 rounded-full object-contain shrink-0 border border-stone-100"
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
            {hasPatronSession && activeEmployes.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setSelectedEmpId(activeEmployes[0]?.id || '');
                  setPinInput('');
                  setPinError(null);
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
                  src="/pwa-192x192.png"
                  alt="Logo EFA RESTO-LIVRO"
                  className="w-8 h-8 rounded-full object-contain shrink-0 border border-stone-100"
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
                  : `Formules ${etab.formule.toUpperCase()} active`}
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
              {hasPatronSession && activeEmployes.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedEmpId(activeEmployes[0]?.id || '');
                    setPinInput('');
                    setPinError(null);
                    setShowPinSwitch(true);
                  }}
                  className="md:hidden inline-flex items-center justify-center gap-1 rounded-xl border border-stone-200 px-3 py-2 text-xs font-semibold text-stone-700 min-h-[48px]"
                >
                  <UserCheck className="w-4 h-4" />
                  PIN
                </button>
              )}
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
                employes={activeEmployes}
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
                onToggleEmployeActif={handleToggleEmployeActif}
                onDeleteEmploye={handleDeleteEmploye}
                onUpdateEtabConfig={handleUpdateEtabConfig}
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

      {/* PIN Switcher Modal (Patron shared device only, active employees only) */}
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
                {activeEmployes.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.nom} ({ROLE_LABELS[emp.role]})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">Code PIN (4 chiffres)</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                required
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
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

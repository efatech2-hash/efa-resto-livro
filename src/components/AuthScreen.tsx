import React, {useEffect, useState} from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  ExternalLink,
  KeyRound,
  MessageCircle,
  Search,
  UserCheck,
  Users,
} from 'lucide-react';
import {supabase} from '../lib/supabase';
import {
  DEFAULT_FORMULES,
  formatFCFA,
  formatFormuleName,
  getWhatsAppFormuleUrl,
  ROLE_LABELS,
  type Formule,
  type FormuleId,
  type RoleType,
} from '../types/efa';
import {PWAInstallBanner, PWAInstallButton, PWAInstallHeroButton} from './PWAComponents';

export interface EmployeeLoginCandidate {
  id: string;
  nom: string;
  role: Exclude<RoleType, 'super_admin' | 'patron'>;
}

interface AuthScreenProps {
  formules: Formule[];
  pendingUserEmail?: string | null;
  pendingUserId?: string | null;
  onAuthComplete: () => Promise<void>;
  onEmployeePinLogin: (params: {
    codeEtab: string;
    employeId: string;
    pin: string;
  }) => Promise<{ok: boolean; error?: string}>;
  onSignOut?: () => Promise<void>;
}

type AuthTab = 'login' | 'patron' | 'employe';

const LAST_CODE_KEY = 'efa_last_etab_code';

export const AuthScreen: React.FC<AuthScreenProps> = ({
  formules,
  pendingUserEmail,
  pendingUserId,
  onAuthComplete,
  onEmployeePinLogin,
  onSignOut,
}) => {
  const activeFormules = formules.length > 0 ? formules : DEFAULT_FORMULES;
  const [tab, setTab] = useState<AuthTab>(pendingUserId ? 'patron' : 'login');

  // Patron Email + Password state
  const [email, setEmail] = useState(pendingUserEmail || '');
  const [password, setPassword] = useState('');
  const [nom, setNom] = useState('');
  const [telephone, setTelephone] = useState('');
  const [nomEtab, setNomEtab] = useState('');
  const [ville, setVille] = useState('Lomé');
  const [selectedFormule, setSelectedFormule] = useState<FormuleId>('resto');

  // Employee Code + Name List + 4-digit PIN state (NO email)
  const [codeEtab, setCodeEtab] = useState<string>(() => {
    try {
      return localStorage.getItem(LAST_CODE_KEY) || '';
    } catch {
      return '';
    }
  });
  const [etabPreviewNom, setEtabPreviewNom] = useState<string | null>(null);
  const [empCandidates, setEmpCandidates] = useState<EmployeeLoginCandidate[]>([]);
  const [selectedEmp, setSelectedEmp] = useState<EmployeeLoginCandidate | null>(null);
  const [pinCode, setPinCode] = useState('');

  const [loading, setLoading] = useState(false);
  const [loadingEmps, setLoadingEmps] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const fetchEmployeesForCode = async (rawCode: string) => {
    const cleanCode = rawCode.trim().toUpperCase();
    if (!cleanCode) {
      setError('Veuillez saisir le code de votre établissement.');
      return;
    }
    setLoadingEmps(true);
    setError(null);
    setInfo(null);
    setSelectedEmp(null);
    setPinCode('');

    try {
      const {data, error: rpcErr} = await supabase.rpc('get_active_employees_for_login', {
        p_code_etab: cleanCode,
      });
      if (rpcErr) throw rpcErr;

      const parsed = data as {
        etablissement?: {id: string; nom: string; code_etablissement: string};
        employes?: EmployeeLoginCandidate[];
      };

      const list = parsed?.employes || [];
      setEtabPreviewNom(parsed?.etablissement?.nom || cleanCode);
      setEmpCandidates(list);
      try {
        localStorage.setItem(LAST_CODE_KEY, cleanCode);
        localStorage.setItem(
          `efa_emp_candidates_${cleanCode}`,
          JSON.stringify({etabNom: parsed?.etablissement?.nom || cleanCode, employes: list})
        );
      } catch {
        // Ignore storage quota issues
      }
      if (list.length === 0) {
        setInfo('Aucun employé actif trouvé. Demandez au Patron d’ajouter votre nom et votre code PIN.');
      }
    } catch (err: unknown) {
      // Offline fallback from cached candidate list if network fails
      if (!navigator.onLine) {
        try {
          const raw = localStorage.getItem(`efa_emp_candidates_${cleanCode}`);
          if (raw) {
            const cached = JSON.parse(raw) as {etabNom: string; employes: EmployeeLoginCandidate[]};
            setEtabPreviewNom(cached.etabNom);
            setEmpCandidates(cached.employes || []);
            setLoadingEmps(false);
            return;
          }
        } catch {
          // Ignore cache error
        }
      }
      setEtabPreviewNom(null);
      setEmpCandidates([]);
      setError(err instanceof Error ? err.message : 'Code établissement introuvable');
    } finally {
      setLoadingEmps(false);
    }
  };

  useEffect(() => {
    if (tab === 'employe' && codeEtab.trim().length >= 5 && !etabPreviewNom && empCandidates.length === 0) {
      void fetchEmployeesForCode(codeEtab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const handlePatronLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const {error: authErr} = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (authErr) throw authErr;
      await onAuthComplete();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  const handlePatronRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      let uid = pendingUserId;
      if (!uid) {
        const {data, error: signUpErr} = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (signUpErr) throw signUpErr;
        if (!data.session) {
          setInfo(
            'Compte créé ! Veuillez confirmer votre e-mail puis vous connecter pour finaliser la création de votre établissement.'
          );
          setLoading(false);
          return;
        }
        uid = data.user?.id ?? null;
      }

      const {error: rpcErr} = await supabase.rpc('register_patron_establishment', {
        p_nom_etab: nomEtab.trim(),
        p_nom_patron: nom.trim(),
        p_telephone: telephone.trim(),
        p_ville: ville.trim(),
        p_formule: selectedFormule,
      });
      if (rpcErr) throw rpcErr;
      await onAuthComplete();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la création de l’établissement');
    } finally {
      setLoading(false);
    }
  };

  const handleEmployeePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmp) return;
    if (!/^\d{4}$/.test(pinCode.trim())) {
      setError('Entrez votre code PIN à 4 chiffres.');
      return;
    }
    setLoading(true);
    setError(null);
    const res = await onEmployeePinLogin({
      codeEtab: codeEtab.trim().toUpperCase(),
      employeId: selectedEmp.id,
      pin: pinCode.trim(),
    });
    setLoading(false);
    if (!res.ok) {
      setError(res.error || 'Connexion refusée');
      setPinCode('');
    }
  };

  const appendPinDigit = (d: string) => {
    setError(null);
    setPinCode((prev) => (prev.length < 4 ? prev + d : prev));
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#161614] flex flex-col overflow-x-hidden">
      <PWAInstallBanner />

      <header className="border-b border-stone-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-3 flex items-center justify-between gap-4 sm:gap-8">
          <div className="flex items-center gap-2.5 min-w-0 shrink-0">
            <img
              src="/pwa-192x192.png"
              alt="Logo EFA RESTO-LIVRO"
              className="w-9 h-9 rounded-full object-contain shrink-0 border border-stone-100"
            />
            <span className="font-display text-base sm:text-lg font-extrabold tracking-tight text-[#161614] whitespace-nowrap">
              EFA RESTO-LIVRO
            </span>
          </div>
          <nav className="hidden lg:flex items-center gap-6 text-sm font-medium text-stone-600">
            <a href="#formules" className="hover:text-[#161614] transition-colors whitespace-nowrap shrink-0">
              Formules SaaS
            </a>
            <button
              type="button"
              onClick={() => setTab('patron')}
              className="hover:text-[#161614] transition-colors whitespace-nowrap shrink-0 min-h-[40px]"
            >
              Essai 7 jours
            </button>
            <button
              type="button"
              onClick={() => setTab('employe')}
              className="hover:text-[#161614] transition-colors whitespace-nowrap shrink-0 min-h-[40px]"
            >
              Connexion Employé (PIN)
            </button>
          </nav>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <PWAInstallButton />
            {pendingUserId && onSignOut ? (
              <button
                type="button"
                onClick={onSignOut}
                className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50 whitespace-nowrap shrink-0 min-h-[44px]"
              >
                Déconnexion
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setTab('patron')}
                className="hidden sm:inline-flex items-center rounded-xl bg-[#161614] px-4 py-2 text-xs font-semibold text-white hover:bg-stone-800 transition-colors whitespace-nowrap shrink-0 min-h-[44px]"
              >
                Démarrer l’essai
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl w-full flex-1 px-4 sm:px-6 py-6 sm:py-10 grid grid-cols-1 md:grid-cols-12 gap-6 lg:gap-8 items-start">
        {/* Auth Card first on Smartphone for fast POS access, right column on Tablet/Desktop */}
        <section className="md:col-span-6 lg:col-span-5 md:order-2 rounded-2xl border border-stone-200 bg-white p-5 sm:p-7 shadow-sm">
          {/* Official Logo Centered at Top of Login / Register */}
          <div className="flex flex-col items-center pb-5 mb-5 border-b border-stone-100">
            <img
              src="/logo-efa-clean.png"
              alt="EFA RESTO-LIVRO Officiel"
              className="w-40 sm:w-44 h-auto object-contain"
            />
          </div>

          {pendingUserId && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900">
              Connecté en tant que <strong>{pendingUserEmail}</strong>. Finalisez votre profil ci-dessous pour accéder à votre espace.
            </div>
          )}

          {/* 2 Types Login Tabs: Patron (Connexion / Créer Etab.) + Employés (PIN sans e-mail) */}
          <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-stone-100 p-1">
            {!pendingUserId && (
              <button
                type="button"
                onClick={() => {
                  setTab('login');
                  setError(null);
                  setInfo(null);
                }}
                className={`rounded-lg px-2 py-2.5 text-xs font-semibold transition-colors min-h-[44px] ${
                  tab === 'login' ? 'bg-white text-[#161614] shadow-sm' : 'text-stone-600 hover:text-[#161614]'
                }`}
              >
                Patron
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setTab('employe');
                setError(null);
                setInfo(null);
              }}
              className={`rounded-lg px-2 py-2.5 text-xs font-semibold transition-colors min-h-[44px] ${
                tab === 'employe' ? 'bg-white text-[#161614] shadow-sm' : 'text-stone-600 hover:text-[#161614]'
              }`}
            >
              Employés
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('patron');
                setError(null);
                setInfo(null);
              }}
              className={`rounded-lg px-2 py-2.5 text-xs font-semibold transition-colors min-h-[44px] ${
                tab === 'patron' ? 'bg-white text-[#161614] shadow-sm' : 'text-stone-600 hover:text-[#161614]'
              }`}
            >
              Créer Etab.
            </button>
          </div>

          {error && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-800">
              {error}
            </div>
          )}
          {info && (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-medium text-emerald-900">
              {info}
            </div>
          )}

          {/* TYPE 1: PATRON (Email + Mot de passe seulement) */}
          {tab === 'login' && !pendingUserId && (
            <form onSubmit={handlePatronLogin} className="mt-5 space-y-4">
              <div>
                <h2 className="font-display text-xl font-bold text-[#161614]">Connexion Patron</h2>
                <p className="text-xs text-stone-500 mt-0.5">
                  Réservé au propriétaire de l’établissement (e-mail et mot de passe).
                </p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Adresse e-mail</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="patron@restaurant.com"
                  className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-3 text-sm focus:border-emerald-700 focus:outline-none min-h-[48px]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Mot de passe</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-3 text-sm focus:border-emerald-700 focus:outline-none min-h-[48px]"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#0E8A55] px-5 py-3.5 text-sm font-bold text-white hover:bg-[#0B7145] disabled:opacity-60 min-h-[52px]"
              >
                <KeyRound className="w-4 h-4" />
                {loading ? 'Connexion...' : 'Se connecter (Patron)'}
              </button>
            </form>
          )}

          {/* CRÉER ÉTABLISSEMENT (Patron) */}
          {tab === 'patron' && (
            <form onSubmit={handlePatronRegister} className="mt-5 space-y-3.5">
              <div>
                <h2 className="font-display text-xl font-bold text-[#161614]">Créer un établissement</h2>
                <p className="text-xs text-stone-500 mt-0.5">
                  7 jours d’essai gratuit immédiat sans carte bancaire.
                </p>
              </div>
              {!pendingUserId && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">E-mail Patron</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="vous@etablissement.com"
                      className="w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm focus:border-emerald-700 focus:outline-none min-h-[48px]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">Mot de passe</label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="6+ caractères"
                      className="w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm focus:border-emerald-700 focus:outline-none min-h-[48px]"
                    />
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Nom de l’établissement</label>
                <input
                  type="text"
                  required
                  value={nomEtab}
                  onChange={(e) => setNomEtab(e.target.value)}
                  placeholder="Ex : Maquis Le Savane / Hôtel Azur"
                  className="w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm focus:border-emerald-700 focus:outline-none min-h-[48px]"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Nom complet du Patron</label>
                  <input
                    type="text"
                    required
                    value={nom}
                    onChange={(e) => setNom(e.target.value)}
                    placeholder="Kossi Mensah"
                    className="w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm focus:border-emerald-700 focus:outline-none min-h-[48px]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Téléphone</label>
                  <input
                    type="tel"
                    value={telephone}
                    onChange={(e) => setTelephone(e.target.value)}
                    placeholder="+228 90 00 00 00"
                    className="w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm focus:border-emerald-700 focus:outline-none min-h-[48px]"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Ville</label>
                  <input
                    type="text"
                    value={ville}
                    onChange={(e) => setVille(e.target.value)}
                    placeholder="Lomé"
                    className="w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm focus:border-emerald-700 focus:outline-none min-h-[48px]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Formules choisies</label>
                  <select
                    value={selectedFormule}
                    onChange={(e) => setSelectedFormule(e.target.value as FormuleId)}
                    className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm focus:border-emerald-700 focus:outline-none min-h-[48px]"
                  >
                    {activeFormules.map((f) => (
                      <option key={f.id} value={f.id}>
                        {formatFormuleName(f.nom)} ({formatFCFA(f.prix_mensuel)}/mois)
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#0E8A55] px-5 py-3.5 text-sm font-bold text-white hover:bg-[#0B7145] disabled:opacity-60 min-h-[52px]"
              >
                <Building2 className="w-4 h-4" />
                {loading ? 'Création en cours...' : 'Créer et activer 7 jours gratuits'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}

          {/* TYPE 2: EMPLOYÉS (PAS d'e-mail -> Code Établissement -> Liste des noms -> Clic nom -> Code PIN 4 chiffres -> Entrée) */}
          {tab === 'employe' && (
            <div className="mt-5 space-y-4">
              <div>
                <h2 className="font-display text-xl font-bold text-[#161614]">Connexion Employé</h2>
                <p className="text-xs text-stone-500 mt-0.5">
                  Sans e-mail : cliquez sur votre nom puis entrez votre code PIN à 4 chiffres.
                </p>
              </div>

              {/* Étape 1 : Code établissement */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={codeEtab}
                  onChange={(e) => setCodeEtab(e.target.value.toUpperCase())}
                  placeholder="Code EFA-XXXXXX"
                  className="flex-1 rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm font-mono uppercase focus:border-emerald-700 focus:outline-none min-h-[48px]"
                />
                <button
                  type="button"
                  disabled={loadingEmps}
                  onClick={() => fetchEmployeesForCode(codeEtab)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#161614] px-4 py-2.5 text-xs font-bold text-white hover:bg-stone-800 disabled:opacity-60 min-h-[48px] shrink-0"
                >
                  <Search className="w-4 h-4" />
                  {loadingEmps ? '...' : 'Afficher'}
                </button>
              </div>

              {/* Étape 2 : Liste des noms d'employés actifs (clic sur son nom) */}
              {etabPreviewNom && !selectedEmp && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-emerald-800">{etabPreviewNom}</span>
                    <span className="text-stone-500">{empCandidates.length} employé(s) actif(s)</span>
                  </div>
                  {empCandidates.length === 0 ? (
                    <div className="rounded-xl border border-stone-200 bg-[#FAF9F6] p-4 text-center text-xs text-stone-500">
                      <Users className="w-6 h-6 text-stone-400 mx-auto mb-1.5" />
                      Aucun employé actif pour ce code. Le Patron doit vous ajouter dans Équipe & Config.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-0.5">
                      {empCandidates.map((emp) => (
                        <button
                          key={emp.id}
                          type="button"
                          onClick={() => {
                            setSelectedEmp(emp);
                            setPinCode('');
                            setError(null);
                          }}
                          className="flex items-center justify-between gap-2 rounded-xl border border-stone-200 bg-[#FAF9F6] hover:border-emerald-600 hover:bg-emerald-50/60 px-3.5 py-3 text-left transition-colors min-h-[54px]"
                        >
                          <div className="min-w-0">
                            <p className="font-bold text-sm text-[#161614] truncate">{emp.nom}</p>
                            <p className="text-[11px] text-stone-500 truncate">{ROLE_LABELS[emp.role]}</p>
                          </div>
                          <ArrowRight className="w-4 h-4 text-emerald-700 shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Étape 3 : Code PIN 4 chiffres -> Entrée */}
              {selectedEmp && (
                <form onSubmit={handleEmployeePinSubmit} className="space-y-4 rounded-xl border border-emerald-200 bg-[#FAF9F6] p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-emerald-800">{etabPreviewNom}</p>
                      <h3 className="font-display text-lg font-bold text-[#161614]">{selectedEmp.nom}</h3>
                      <p className="text-xs text-stone-500">{ROLE_LABELS[selectedEmp.role]}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedEmp(null);
                        setPinCode('');
                        setError(null);
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-2.5 py-2 text-xs font-semibold text-stone-700 min-h-[40px]"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      Noms
                    </button>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                      Code PIN (4 chiffres)
                    </label>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      required
                      value={pinCode}
                      onChange={(e) => setPinCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      placeholder="••••"
                      className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-center font-mono text-2xl tracking-[0.6em] focus:border-emerald-700 focus:outline-none min-h-[52px]"
                    />
                  </div>

                  {/* Clavier numérique tactile pour smartphone / tablette */}
                  <div className="grid grid-cols-3 gap-2">
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                      <button
                        key={digit}
                        type="button"
                        onClick={() => appendPinDigit(digit)}
                        className="rounded-xl border border-stone-200 bg-white py-2.5 font-mono text-lg font-bold text-[#161614] hover:bg-stone-100 active:scale-95 min-h-[48px]"
                      >
                        {digit}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setPinCode('')}
                      className="rounded-xl border border-stone-200 bg-stone-100 py-2.5 text-xs font-bold text-stone-700 min-h-[48px]"
                    >
                      Effacer
                    </button>
                    <button
                      type="button"
                      onClick={() => appendPinDigit('0')}
                      className="rounded-xl border border-stone-200 bg-white py-2.5 font-mono text-lg font-bold text-[#161614] hover:bg-stone-100 active:scale-95 min-h-[48px]"
                    >
                      0
                    </button>
                    <button
                      type="button"
                      onClick={() => setPinCode((p) => p.slice(0, -1))}
                      className="rounded-xl border border-stone-200 bg-stone-100 py-2.5 text-xs font-bold text-stone-700 min-h-[48px]"
                    >
                      ←
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={loading || pinCode.length < 4}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#0E8A55] px-5 py-3.5 text-sm font-bold text-white hover:bg-[#0B7145] disabled:opacity-50 min-h-[52px]"
                  >
                    <UserCheck className="w-4 h-4" />
                    {loading ? 'Vérification...' : 'Entrée'}
                  </button>
                </form>
              )}
            </div>
          )}
        </section>

        {/* Left column on Tablet/Desktop: Value prop + Big Install Button + 3 Formules */}
        <section id="formules" className="md:col-span-6 lg:col-span-7 md:order-1 space-y-6">
          <div className="space-y-4">
            <p className="text-xs font-semibold tracking-wide text-emerald-800">
              Plateforme Multi-Établissements · Bar · Restaurant · Livraison · Hôtel
            </p>
            <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-[#161614] [text-wrap:balance]">
              Pilotez votre caisse, cuisine, stock, livraisons et chambres depuis un seul outil.
            </h1>
            <p className="text-sm sm:text-base text-stone-600 max-w-2xl leading-relaxed">
              Encaissement Espèces et Mobile Money (Mixx by Yas, Moov Money, Orange Money, Wave), déduction automatique des recettes en stock et mode hors-ligne sur téléphone, tablette et ordinateur.
            </p>
            <div className="pt-1 flex flex-wrap items-center gap-3">
              <PWAInstallHeroButton />
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            {activeFormules.map((f) => {
              const isSelected = selectedFormule === f.id && tab === 'patron';
              const displayNom = formatFormuleName(f.nom);
              return (
                <div
                  key={f.id}
                  onClick={() => {
                    setSelectedFormule(f.id);
                    if (tab !== 'patron') setTab('patron');
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setSelectedFormule(f.id);
                      setTab('patron');
                    }
                  }}
                  className={`cursor-pointer rounded-xl border p-5 transition-colors flex flex-col justify-between gap-4 ${
                    isSelected
                      ? 'border-emerald-700 bg-white ring-2 ring-emerald-700/20'
                      : 'border-stone-200 bg-white hover:border-stone-300'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-display text-base font-bold text-[#161614]">{displayNom}</h3>
                      {f.id === 'premium' && (
                        <span className="text-xs font-semibold text-amber-700">Complet</span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-stone-500 leading-relaxed">{f.description}</p>
                    <div className="mt-4 pt-3 border-t border-stone-100">
                      <div className="font-mono text-2xl font-bold text-[#161614] tabular-nums">
                        {formatFCFA(f.prix_mensuel)}
                        <span className="text-xs font-sans font-normal text-stone-500"> / mois</span>
                      </div>
                      <p className="mt-0.5 text-xs font-mono text-emerald-800 tabular-nums">
                        ou {formatFCFA(f.prix_annuel)} / an (2 mois offerts)
                      </p>
                    </div>
                    <ul className="mt-4 space-y-1.5 text-xs text-stone-700">
                      <li className="flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                        <span className="tabular-nums">{f.max_employes} employés max</span>
                      </li>
                      <li className="flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                        <span className="tabular-nums">{f.max_appareils} appareils max</span>
                      </li>
                      <li className="flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                        <span className="tabular-nums">
                          {f.max_tables ? `${f.max_tables} tables max` : 'Tables illimitées'}
                        </span>
                      </li>
                      <li className="flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                        <span className="tabular-nums">
                          {f.max_produits ? `${f.max_produits} produits max` : 'Produits illimités'}
                        </span>
                      </li>
                      {f.max_chambres > 0 && (
                        <li className="flex items-center gap-1.5 font-semibold text-emerald-900">
                          <Check className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                          <span className="tabular-nums">Hôtel · {f.max_chambres} chambres max</span>
                        </li>
                      )}
                    </ul>
                  </div>

                  <a
                    href={getWhatsAppFormuleUrl(f.nom)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#0E8A55] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#0B7145] transition-colors min-h-[46px]"
                  >
                    <MessageCircle className="w-4 h-4 shrink-0" />
                    <span>Payer</span>
                    <ExternalLink className="w-3.5 h-3.5 opacity-80" />
                  </a>
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
};

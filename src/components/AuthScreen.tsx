import React, {useState} from 'react';
import {ArrowRight, Building2, Check, KeyRound, ShieldCheck, UserPlus} from 'lucide-react';
import {supabase} from '../lib/supabase';
import {DEFAULT_FORMULES, formatFCFA, type Formule, type FormuleId, type RoleType} from '../types/efa';
import {PWAInstallBanner, PWAInstallButton, PWAInstallHeroButton} from './PWAComponents';

interface AuthScreenProps {
  formules: Formule[];
  pendingUserEmail?: string | null;
  pendingUserId?: string | null;
  onAuthComplete: () => Promise<void>;
  onSignOut?: () => Promise<void>;
  onOpenSqlSetup: () => void;
}

type AuthTab = 'login' | 'patron' | 'employe' | 'super_admin';

export const AuthScreen: React.FC<AuthScreenProps> = ({
  formules,
  pendingUserEmail,
  pendingUserId,
  onAuthComplete,
  onSignOut,
  onOpenSqlSetup,
}) => {
  const activeFormules = formules.length > 0 ? formules : DEFAULT_FORMULES;
  const [tab, setTab] = useState<AuthTab>(pendingUserId ? 'patron' : 'login');
  const [email, setEmail] = useState(pendingUserEmail || '');
  const [password, setPassword] = useState('');
  const [nom, setNom] = useState('');
  const [telephone, setTelephone] = useState('');
  const [nomEtab, setNomEtab] = useState('');
  const [ville, setVille] = useState('Lomé');
  const [selectedFormule, setSelectedFormule] = useState<FormuleId>('resto');
  const [codeEtab, setCodeEtab] = useState('');
  const [empRole, setEmpRole] = useState<Exclude<RoleType, 'super_admin' | 'patron'>>('serveur');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
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

  const handleEmployeeJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      if (!pendingUserId) {
        const {data, error: signUpErr} = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (signUpErr) throw signUpErr;
        if (!data.session) {
          setInfo(
            'Compte créé ! Vérifiez votre e-mail puis connectez-vous pour rejoindre votre établissement avec le code.'
          );
          setLoading(false);
          return;
        }
      }

      const {error: rpcErr} = await supabase.rpc('join_establishment_by_code', {
        p_code_etab: codeEtab.trim().toUpperCase(),
        p_nom: nom.trim(),
        p_role: empRole,
        p_telephone: telephone.trim(),
      });
      if (rpcErr) throw rpcErr;
      await onAuthComplete();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Impossible de rejoindre l’établissement');
    } finally {
      setLoading(false);
    }
  };

  const handleBootstrapSuperAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      if (!pendingUserId) {
        const {data, error: signUpErr} = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (signUpErr) {
          const {error: signInErr} = await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          });
          if (signInErr) throw signInErr;
        } else if (!data.session) {
          setInfo('Compte créé ! Confirmez votre e-mail puis connectez-vous pour activer le Super-Admin.');
          setLoading(false);
          return;
        }
      }

      const {error: rpcErr} = await supabase.rpc('bootstrap_super_admin', {
        p_nom: nom.trim() || 'Super-Admin EFA',
      });
      if (rpcErr) throw rpcErr;
      await onAuthComplete();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Échec activation Super-Admin');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#161614] flex flex-col overflow-x-hidden">
      <PWAInstallBanner />

      <header className="border-b border-stone-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-3 flex items-center justify-between gap-4 sm:gap-8">
          <div className="flex items-center gap-2.5 min-w-0 shrink-0">
            <img
              src="/logo-emblem.png"
              alt="Logo EFA RESTO-LIVRO"
              className="w-9 h-9 rounded-full object-contain shrink-0"
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
              Accès Équipe
            </button>
            <button
              type="button"
              onClick={onOpenSqlSetup}
              className="hover:text-[#161614] transition-colors whitespace-nowrap shrink-0 min-h-[40px]"
            >
              Script SQL
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

          {/* Segmented control tabs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 rounded-xl bg-stone-100 p-1">
            {!pendingUserId && (
              <button
                type="button"
                onClick={() => {
                  setTab('login');
                  setError(null);
                }}
                className={`rounded-lg px-2.5 py-2.5 text-xs font-semibold transition-colors min-h-[44px] ${
                  tab === 'login' ? 'bg-white text-[#161614] shadow-sm' : 'text-stone-600 hover:text-[#161614]'
                }`}
              >
                Connexion
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setTab('patron');
                setError(null);
              }}
              className={`rounded-lg px-2.5 py-2.5 text-xs font-semibold transition-colors min-h-[44px] ${
                tab === 'patron' ? 'bg-white text-[#161614] shadow-sm' : 'text-stone-600 hover:text-[#161614]'
              }`}
            >
              Créer Etab.
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('employe');
                setError(null);
              }}
              className={`rounded-lg px-2.5 py-2.5 text-xs font-semibold transition-colors min-h-[44px] ${
                tab === 'employe' ? 'bg-white text-[#161614] shadow-sm' : 'text-stone-600 hover:text-[#161614]'
              }`}
            >
              Équipe
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('super_admin');
                setError(null);
              }}
              className={`rounded-lg px-2.5 py-2.5 text-xs font-semibold transition-colors min-h-[44px] ${
                tab === 'super_admin' ? 'bg-white text-[#161614] shadow-sm' : 'text-stone-600 hover:text-[#161614]'
              }`}
            >
              Super-Admin
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

          {tab === 'login' && !pendingUserId && (
            <form onSubmit={handleLogin} className="mt-5 space-y-4">
              <div>
                <h2 className="font-display text-xl font-bold text-[#161614]">Connexion à votre espace</h2>
                <p className="text-xs text-stone-500 mt-0.5">
                  Patron, Caissier, Serveur, Cuisinier, Livreur, Réceptionniste ou Super-Admin.
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
                {loading ? 'Connexion...' : 'Se connecter'}
              </button>
            </form>
          )}

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
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Formule choisie</label>
                  <select
                    value={selectedFormule}
                    onChange={(e) => setSelectedFormule(e.target.value as FormuleId)}
                    className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm focus:border-emerald-700 focus:outline-none min-h-[48px]"
                  >
                    {activeFormules.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.nom} ({formatFCFA(f.prix_mensuel)}/mois)
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

          {tab === 'employe' && (
            <form onSubmit={handleEmployeeJoin} className="mt-5 space-y-3.5">
              <div>
                <h2 className="font-display text-xl font-bold text-[#161614]">Rejoindre un établissement</h2>
                <p className="text-xs text-stone-500 mt-0.5">
                  Entrez le code EFA fourni par votre Patron pour connecter votre appareil.
                </p>
              </div>
              {!pendingUserId && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">E-mail</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="employe@resto.com"
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
                <label className="block text-xs font-semibold text-stone-700 mb-1">Code Établissement</label>
                <input
                  type="text"
                  required
                  value={codeEtab}
                  onChange={(e) => setCodeEtab(e.target.value.toUpperCase())}
                  placeholder="EFA-XXXXXX"
                  className="w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm font-mono uppercase focus:border-emerald-700 focus:outline-none min-h-[48px]"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Votre nom</label>
                  <input
                    type="text"
                    required
                    value={nom}
                    onChange={(e) => setNom(e.target.value)}
                    placeholder="Afi Kouassi"
                    className="w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm focus:border-emerald-700 focus:outline-none min-h-[48px]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Poste / Rôle</label>
                  <select
                    value={empRole}
                    onChange={(e) => setEmpRole(e.target.value as Exclude<RoleType, 'super_admin' | 'patron'>)}
                    className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm focus:border-emerald-700 focus:outline-none min-h-[48px]"
                  >
                    <option value="serveur">Serveur / Serveuse</option>
                    <option value="caissier">Caissier</option>
                    <option value="cuisinier">Cuisinier / Barman</option>
                    <option value="livreur">Livreur</option>
                    <option value="receptionniste">Réceptionniste Hôtel</option>
                    <option value="menage">Femme de ménage</option>
                  </select>
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#161614] px-5 py-3.5 text-sm font-bold text-white hover:bg-stone-800 disabled:opacity-60 min-h-[52px]"
              >
                <UserPlus className="w-4 h-4" />
                {loading ? 'Rattachement...' : 'Rejoindre l’équipe'}
              </button>
            </form>
          )}

          {tab === 'super_admin' && (
            <form onSubmit={handleBootstrapSuperAdmin} className="mt-5 space-y-3.5">
              <div>
                <h2 className="font-display text-xl font-bold text-[#161614]">Activer le compte Super-Admin</h2>
                <p className="text-xs text-stone-500 mt-0.5">
                  Réservé au propriétaire du SaaS lors du premier démarrage.
                </p>
              </div>
              {!pendingUserId && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">E-mail Super-Admin</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="admin@efa-resto.com"
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
                </>
              )}
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Nom affiché</label>
                <input
                  type="text"
                  required
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  placeholder="Propriétaire EFA SaaS"
                  className="w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm focus:border-emerald-700 focus:outline-none min-h-[48px]"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#161614] px-5 py-3.5 text-sm font-bold text-white hover:bg-stone-800 disabled:opacity-60 min-h-[52px]"
              >
                <ShieldCheck className="w-4 h-4" />
                {loading ? 'Activation...' : 'Activer l’espace Super-Admin'}
              </button>
            </form>
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
              Encaissement Espèces et Mobile Money (Flooz, Moov Money, Orange Money, Wave), déduction automatique des recettes en stock et mode hors-ligne sur téléphone, tablette et ordinateur.
            </p>
            <div className="pt-1 flex flex-wrap items-center gap-3">
              <PWAInstallHeroButton />
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            {activeFormules.map((f) => {
              const isSelected = selectedFormule === f.id && tab === 'patron';
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
                  className={`cursor-pointer rounded-xl border p-5 transition-colors flex flex-col justify-between ${
                    isSelected
                      ? 'border-emerald-700 bg-white ring-2 ring-emerald-700/20'
                      : 'border-stone-200 bg-white hover:border-stone-300'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-display text-base font-bold text-[#161614]">{f.nom}</h3>
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
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
};

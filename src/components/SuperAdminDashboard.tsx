import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  Ban,
  Building2,
  CheckCircle2,
  CreditCard,
  RefreshCw,
  Search,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import {supabase} from '../lib/supabase';
import {
  formatDateTime,
  formatFCFA,
  type Abonnement,
  type CycleAbonnement,
  type Etablissement,
  type Formule,
  type FormuleId,
} from '../types/efa';

interface SuperAdminDashboardProps {
  formules: Formule[];
  onRefreshFormules: () => Promise<void>;
}

export const SuperAdminDashboard: React.FC<SuperAdminDashboardProps> = ({
  formules,
  onRefreshFormules,
}) => {
  const [etabs, setEtabs] = useState<Etablissement[]>([]);
  const [abonnements, setAbonnements] = useState<Abonnement[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'actif' | 'essai' | 'impaye'>('all');
  const [feedback, setFeedback] = useState<string | null>(null);

  // Pricing editor state
  const [priceDrafts, setPriceDrafts] = useState<Record<string, {mensuel: number; annuel: number}>>({});
  const [savingPriceId, setSavingPriceId] = useState<string | null>(null);

  // Payment modal state
  const [payEtab, setPayEtab] = useState<Etablissement | null>(null);
  const [payFormule, setPayFormule] = useState<FormuleId>('resto');
  const [payCycle, setPayCycle] = useState<CycleAbonnement>('mensuel');
  const [payMode, setPayMode] = useState<'Flooz' | 'Moov Money' | 'Orange Money' | 'Wave' | 'Especes'>('Flooz');
  const [payRef, setPayRef] = useState('');
  const [submittingPay, setSubmittingPay] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [{data: eData}, {data: aData}] = await Promise.all([
        supabase.from('etablissements').select('*').order('created_at', {ascending: false}),
        supabase.from('abonnements').select('*').order('created_at', {ascending: false}),
      ]);
      if (eData) setEtabs(eData as Etablissement[]);
      if (aData) setAbonnements(aData as Abonnement[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    const drafts: Record<string, {mensuel: number; annuel: number}> = {};
    for (const f of formules) {
      drafts[f.id] = {mensuel: f.prix_mensuel, annuel: f.prix_annuel};
    }
    setPriceDrafts(drafts);
  }, [formules]);

  const totalRevenueSaaS = useMemo(
    () =>
      abonnements
        .filter((a) => a.statut === 'PAYE')
        .reduce((sum, a) => sum + (a.montant || 0), 0),
    [abonnements]
  );

  const latestPaymentByEtab = useMemo(() => {
    const map = new Map<string, Abonnement>();
    for (const ab of abonnements) {
      if (!map.has(ab.etablissement_id) && ab.montant > 0) {
        map.set(ab.etablissement_id, ab);
      }
    }
    return map;
  }, [abonnements]);

  const isUnpaidOrExpired = (e: Etablissement) => {
    if (e.est_bloque || e.statut_abonnement === 'bloque' || e.statut_abonnement === 'expire') return true;
    const now = Date.now();
    if (e.statut_abonnement === 'essai') return new Date(e.essai_fin).getTime() < now;
    if (e.statut_abonnement === 'actif' && e.abonnement_fin) return new Date(e.abonnement_fin).getTime() < now;
    return false;
  };

  const filteredEtabs = useMemo(() => {
    return etabs.filter((e) => {
      const matchesSearch =
        e.nom.toLowerCase().includes(search.toLowerCase()) ||
        e.code_etablissement.toLowerCase().includes(search.toLowerCase()) ||
        (e.ville || '').toLowerCase().includes(search.toLowerCase());
      if (!matchesSearch) return false;
      if (statusFilter === 'actif') return e.statut_abonnement === 'actif' && !isUnpaidOrExpired(e);
      if (statusFilter === 'essai') return e.statut_abonnement === 'essai' && !isUnpaidOrExpired(e);
      if (statusFilter === 'impaye') return isUnpaidOrExpired(e);
      return true;
    });
  }, [etabs, search, statusFilter]);

  const handleToggleBlock = async (etab: Etablissement) => {
    const nextBlock = !etab.est_bloque;
    const nextStatus = nextBlock
      ? 'bloque'
      : etab.abonnement_fin
      ? 'actif'
      : 'essai';

    const {error} = await supabase
      .from('etablissements')
      .update({est_bloque: nextBlock, statut_abonnement: nextStatus})
      .eq('id', etab.id);

    if (error) {
      setFeedback(`Erreur : ${error.message}`);
      return;
    }
    setFeedback(`${etab.nom} est maintenant ${nextBlock ? 'bloqué (lecture seule)' : 'activé'}.`);
    await loadAll();
  };

  const handleSaveFormulePrice = async (f: Formule) => {
    const draft = priceDrafts[f.id];
    if (!draft) return;
    setSavingPriceId(f.id);
    const {error} = await supabase
      .from('formules')
      .update({
        prix_mensuel: Math.max(0, Number(draft.mensuel)),
        prix_annuel: Math.max(0, Number(draft.annuel)),
        updated_at: new Date().toISOString(),
      })
      .eq('id', f.id);
    setSavingPriceId(null);
    if (error) {
      setFeedback(`Erreur tarif : ${error.message}`);
      return;
    }
    setFeedback(`Tarifs de ${f.nom} mis à jour avec succès.`);
    await onRefreshFormules();
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payEtab) return;
    setSubmittingPay(true);
    const fObj = formules.find((f) => f.id === payFormule);
    const montant = payCycle === 'mensuel' ? fObj?.prix_mensuel || 0 : fObj?.prix_annuel || 0;
    const start = new Date();
    const end = new Date(start);
    end.setDate(end.getDate() + (payCycle === 'mensuel' ? 30 : 365));

    const {error} = await supabase.from('abonnements').insert({
      etablissement_id: payEtab.id,
      formule: payFormule,
      cycle: payCycle,
      montant,
      mode_paiement: payMode,
      reference_transaction: payRef.trim() || `SA-${Date.now().toString().slice(-6)}`,
      statut: 'PAYE',
      periode_debut: start.toISOString(),
      periode_fin: end.toISOString(),
    });
    setSubmittingPay(false);
    if (error) {
      setFeedback(`Erreur paiement : ${error.message}`);
      return;
    }
    setFeedback(`Paiement enregistré et ${payEtab.nom} activé sur la formule ${payFormule.toUpperCase()}.`);
    setPayEtab(null);
    setPayRef('');
    await loadAll();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#161614]">
            Console Super-Admin EFA RESTO-LIVRO
          </h1>
          <p className="text-sm text-stone-500">
            Supervision de tous les établissements, abonnements, blocages et tarification SaaS.
          </p>
        </div>
        <button
          type="button"
          onClick={loadAll}
          className="inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50 min-h-[40px]"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Actualiser
        </button>
      </div>

      {feedback && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900 flex items-center justify-between">
          <span>{feedback}</span>
          <button type="button" onClick={() => setFeedback(null)} className="text-xs underline">
            Fermer
          </button>
        </div>
      )}

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-stone-200 bg-white p-5">
          <div className="flex items-center justify-between text-xs font-medium text-stone-500">
            <span>Revenu Total SaaS</span>
            <TrendingUp className="w-4 h-4 text-emerald-700" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold text-[#161614] tabular-nums">
            {formatFCFA(totalRevenueSaaS)}
          </p>
          <p className="mt-1 text-xs text-stone-500 tabular-nums">
            {abonnements.filter((a) => a.montant > 0 && a.statut === 'PAYE').length} encaissement(s) validé(s)
          </p>
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-5">
          <div className="flex items-center justify-between text-xs font-medium text-stone-500">
            <span>Établissements inscrits</span>
            <Building2 className="w-4 h-4 text-stone-700" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold text-[#161614] tabular-nums">{etabs.length}</p>
          <p className="mt-1 text-xs text-stone-500 tabular-nums">
            {etabs.filter((e) => e.formule === 'premium').length} Premium ·{' '}
            {etabs.filter((e) => e.formule === 'resto').length} Resto ·{' '}
            {etabs.filter((e) => e.formule === 'bar').length} Bar
          </p>
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-5">
          <div className="flex items-center justify-between text-xs font-medium text-stone-500">
            <span>Comptes à jour (Payés / Essai)</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-700" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold text-emerald-800 tabular-nums">
            {etabs.filter((e) => !isUnpaidOrExpired(e)).length}
          </p>
          <p className="mt-1 text-xs text-stone-500">Accès complet lecture & écriture</p>
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-5">
          <div className="flex items-center justify-between text-xs font-medium text-stone-500">
            <span>Impayés / Expirés / Bloqués</span>
            <ShieldCheck className="w-4 h-4 text-red-600" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold text-red-700 tabular-nums">
            {etabs.filter((e) => isUnpaidOrExpired(e)).length}
          </p>
          <p className="mt-1 text-xs text-stone-500">Restreints en lecture seule</p>
        </div>
      </div>

      {/* Pricing Editor */}
      <section className="rounded-xl border border-stone-200 bg-white p-5">
        <h2 className="font-display text-lg font-bold text-[#161614]">
          Tarifs des Formules SaaS (modifiables en direct)
        </h2>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          {formules.map((f) => {
            const draft = priceDrafts[f.id] || {mensuel: f.prix_mensuel, annuel: f.prix_annuel};
            return (
              <div key={f.id} className="rounded-xl border border-stone-200 bg-[#FAF9F6] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-display font-bold text-sm text-[#161614]">{f.nom}</span>
                  <span className="text-xs font-mono text-stone-500 uppercase">{f.id}</span>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-stone-600 mb-1">Prix Mensuel (F)</label>
                    <input
                      type="number"
                      value={draft.mensuel}
                      onChange={(e) =>
                        setPriceDrafts((prev) => ({
                          ...prev,
                          [f.id]: {...draft, mensuel: Number(e.target.value)},
                        }))
                      }
                      className="w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 font-mono text-sm tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-stone-600 mb-1">Prix Annuel (F)</label>
                    <input
                      type="number"
                      value={draft.annuel}
                      onChange={(e) =>
                        setPriceDrafts((prev) => ({
                          ...prev,
                          [f.id]: {...draft, annuel: Number(e.target.value)},
                        }))
                      }
                      className="w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 font-mono text-sm tabular-nums"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleSaveFormulePrice(f)}
                  disabled={savingPriceId === f.id}
                  className="w-full rounded-lg bg-[#161614] py-2 text-xs font-semibold text-white hover:bg-stone-800 disabled:opacity-60"
                >
                  {savingPriceId === f.id ? 'Enregistrement...' : 'Mettre à jour ce tarif'}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Establishments Table */}
      <section className="rounded-xl border border-stone-200 bg-white overflow-hidden">
        <div className="p-5 border-b border-stone-200 flex flex-wrap items-center justify-between gap-4">
          <h2 className="font-display text-lg font-bold text-[#161614]">
            Tous les établissements ({filteredEtabs.length})
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher nom, code, ville..."
                className="rounded-lg border border-stone-300 pl-9 pr-3 py-2 text-xs focus:border-emerald-700 focus:outline-none w-56"
              />
            </div>
            <div className="flex items-center gap-1 rounded-lg bg-stone-100 p-1">
              {(
                [
                  {id: 'all', label: 'Tous'},
                  {id: 'actif', label: 'Payés'},
                  {id: 'essai', label: 'Essai 7j'},
                  {id: 'impaye', label: 'Impayés / Bloqués'},
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setStatusFilter(item.id)}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${
                    statusFilter === item.id ? 'bg-white text-[#161614] shadow-sm' : 'text-stone-600'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#FAF9F6] border-b border-stone-200 text-xs font-semibold text-stone-600">
              <tr>
                <th className="px-4 py-3">Établissement</th>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Formule</th>
                <th className="px-4 py-3">Statut paiement</th>
                <th className="px-4 py-3">Échéance</th>
                <th className="px-4 py-3 text-right">Dernier paiement</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredEtabs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-stone-500">
                    Aucun établissement trouvé pour ce filtre.
                  </td>
                </tr>
              ) : (
                filteredEtabs.map((etab) => {
                  const unpaid = isUnpaidOrExpired(etab);
                  const lastPay = latestPaymentByEtab.get(etab.id);
                  return (
                    <tr key={etab.id} className="hover:bg-stone-50/60">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-[#161614]">{etab.nom}</div>
                        <div className="text-xs text-stone-500">
                          {etab.ville || '—'} · {etab.telephone || 'Sans tél'}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-stone-700">
                        {etab.code_etablissement}
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold uppercase text-stone-800">
                        {etab.formule} · {etab.cycle_abonnement}
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold">
                        {etab.est_bloque ? (
                          <span className="text-red-700">Bloqué (Lecture seule)</span>
                        ) : unpaid ? (
                          <span className="text-amber-700">Expiré / Non payé</span>
                        ) : etab.statut_abonnement === 'actif' ? (
                          <span className="text-emerald-800">Payé · Actif</span>
                        ) : (
                          <span className="text-blue-700">Essai gratuit 7j</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-stone-600 tabular-nums">
                        {etab.statut_abonnement === 'actif' && etab.abonnement_fin
                          ? formatDateTime(etab.abonnement_fin)
                          : formatDateTime(etab.essai_fin)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs tabular-nums">
                        {lastPay ? `${formatFCFA(lastPay.montant)} (${lastPay.mode_paiement})` : 'Essai gratuit'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setPayEtab(etab);
                              setPayFormule(etab.formule);
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                          >
                            <CreditCard className="w-3.5 h-3.5" />
                            Encaisser
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleBlock(etab)}
                            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white ${
                              etab.est_bloque
                                ? 'bg-[#0E8A55] hover:bg-[#0B7145]'
                                : 'bg-red-600 hover:bg-red-700'
                            }`}
                          >
                            {etab.est_bloque ? (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Activer
                              </>
                            ) : (
                              <>
                                <Ban className="w-3.5 h-3.5" />
                                Bloquer
                              </>
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Modal Enregistrer Paiement Abonnement */}
      {payEtab && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={handleRecordPayment}
            className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 space-y-4 shadow-xl"
          >
            <h3 className="font-display text-lg font-bold text-[#161614]">
              Activer / Encaisser · {payEtab.nom}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Formule</label>
                <select
                  value={payFormule}
                  onChange={(e) => setPayFormule(e.target.value as FormuleId)}
                  className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
                >
                  {formules.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nom}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Cycle</label>
                <select
                  value={payCycle}
                  onChange={(e) => setPayCycle(e.target.value as CycleAbonnement)}
                  className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="mensuel">Mensuel (30j)</option>
                  <option value="annuel">Annuel (365j · 2 mois offerts)</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Mode de paiement</label>
                <select
                  value={payMode}
                  onChange={(e) => setPayMode(e.target.value as typeof payMode)}
                  className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="Flooz">Flooz</option>
                  <option value="Moov Money">Moov Money</option>
                  <option value="Orange Money">Orange Money</option>
                  <option value="Wave">Wave</option>
                  <option value="Especes">Espèces</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Référence</label>
                <input
                  type="text"
                  value={payRef}
                  onChange={(e) => setPayRef(e.target.value)}
                  placeholder="ID Transaction"
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm font-mono"
                />
              </div>
            </div>
            <div className="rounded-xl bg-[#FAF9F6] border border-stone-200 p-3 flex items-center justify-between text-sm">
              <span className="text-stone-600">Montant à encaisser :</span>
              <span className="font-mono font-bold text-lg text-[#0E8A55] tabular-nums">
                {formatFCFA(
                  payCycle === 'mensuel'
                    ? formules.find((f) => f.id === payFormule)?.prix_mensuel || 0
                    : formules.find((f) => f.id === payFormule)?.prix_annuel || 0
                )}
              </span>
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setPayEtab(null)}
                className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={submittingPay}
                className="rounded-lg bg-[#0E8A55] px-5 py-2 text-sm font-semibold text-white hover:bg-[#0B7145]"
              >
                {submittingPay ? 'Validation...' : 'Valider et Activer'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

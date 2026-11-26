import React, {useMemo, useState} from 'react';
import {
  BedDouble,
  CheckCircle2,
  CreditCard,
  Printer,
  Receipt,
  UserCheck,
  Wallet,
  X,
} from 'lucide-react';
import {
  formatDateTime,
  formatFCFA,
  type Commande,
  type Etablissement,
  type ModePaiement,
  type Paiement,
} from '../types/efa';

interface CaissierViewProps {
  etab: Etablissement;
  commandes: Commande[];
  paiements: Paiement[];
  operatorName: string;
  readOnly: boolean;
  onValidateCommande: (commande: Commande, caissierNom: string) => Promise<{ok: boolean; error?: string}>;
  onEncaisserCommande: (params: {
    commande: Commande;
    mode: ModePaiement | 'SUR_CHAMBRE';
    caissierNom: string;
    clientNom?: string;
    clientTel?: string;
    reference?: string;
  }) => Promise<{ok: boolean; error?: string}>;
  onSettleCredit: (paiement: Paiement, mode: Exclude<ModePaiement, 'Credit'>, caissierNom: string) => Promise<{ok: boolean; error?: string}>;
}

export const CaissierView: React.FC<CaissierViewProps> = ({
  etab,
  commandes,
  paiements,
  operatorName,
  readOnly,
  onValidateCommande,
  onEncaisserCommande,
  onSettleCredit,
}) => {
  const isBarOnly = etab.formule === 'bar';
  const [tab, setTab] = useState<'queue' | 'historique' | 'credit'>('queue');
  const [bonModal, setBonModal] = useState<Commande | null>(null);
  const [payModal, setPayModal] = useState<Commande | null>(null);
  const [ticketModal, setTicketModal] = useState<{commande: Commande; mode: string; client?: string} | null>(null);

  const [payMode, setPayMode] = useState<ModePaiement | 'SUR_CHAMBRE'>('Especes');
  const [creditNom, setCreditNom] = useState('');
  const [creditTel, setCreditTel] = useState('');
  const [payRef, setPayRef] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Settle credit modal
  const [settleTarget, setSettleTarget] = useState<Paiement | null>(null);
  const [settleMode, setSettleMode] = useState<Exclude<ModePaiement, 'Credit'>>('Especes');

  const activeQueue = useMemo(
    () => commandes.filter((c) => c.statut_caisse === 'EN_ATTENTE' || c.statut_caisse === 'VALIDEE'),
    [commandes]
  );

  const paidToday = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    return paiements.filter((p) => p.created_at.slice(0, 10) === todayStr && p.mode_paiement !== 'Credit');
  }, [paiements]);

  const totalToday = useMemo(
    () => paidToday.reduce((sum, p) => sum + (p.montant || 0), 0),
    [paidToday]
  );

  const openCredits = useMemo(
    () => paiements.filter((p) => p.mode_paiement === 'Credit' && !p.est_regle),
    [paiements]
  );

  const handleValidate = async (cmd: Commande) => {
    if (readOnly) return;
    setBusyId(cmd.id);
    const res = await onValidateCommande(cmd, operatorName);
    setBusyId(null);
    if (!res.ok) {
      setFeedback(res.error || 'Erreur validation');
      return;
    }
    setBonModal({...cmd, statut_caisse: 'VALIDEE', caissier_nom: operatorName});
  };

  const openPaymentModal = (cmd: Commande) => {
    setPayModal(cmd);
    setPayMode(cmd.sejour_id ? 'SUR_CHAMBRE' : 'Especes');
    setCreditNom(cmd.client_nom || '');
    setCreditTel(cmd.client_tel || '');
    setPayRef('');
  };

  const handleConfirmPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payModal || readOnly) return;
    if (payMode === 'Credit' && !creditNom.trim()) {
      setFeedback('Veuillez saisir le nom du client pour la mise en crédit.');
      return;
    }
    setBusyId(payModal.id);
    const res = await onEncaisserCommande({
      commande: payModal,
      mode: payMode,
      caissierNom: operatorName,
      clientNom: creditNom.trim() || payModal.client_nom || undefined,
      clientTel: creditTel.trim() || payModal.client_tel || undefined,
      reference: payRef.trim() || undefined,
    });
    setBusyId(null);
    if (!res.ok) {
      setFeedback(res.error || 'Erreur encaissement');
      return;
    }
    const doneCmd = payModal;
    const doneMode = payMode === 'SUR_CHAMBRE' ? 'Facture Chambre (Check-out)' : payMode;
    setPayModal(null);
    setTicketModal({commande: doneCmd, mode: doneMode, client: creditNom.trim() || doneCmd.client_nom || undefined});
  };

  const handleConfirmSettle = async () => {
    if (!settleTarget || readOnly) return;
    setBusyId(settleTarget.id);
    const res = await onSettleCredit(settleTarget, settleMode, operatorName);
    setBusyId(null);
    if (!res.ok) {
      setFeedback(res.error || 'Erreur règlement crédit');
      return;
    }
    setFeedback(`Crédit de ${settleTarget.client_nom} réglé (${formatFCFA(settleTarget.montant)} en ${settleMode}).`);
    setSettleTarget(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#161614]">Caisse & Encaissements</h1>
          <p className="text-xs text-stone-500">
            Caissier actif : <strong className="text-[#161614]">{operatorName}</strong> · Recette du jour :{' '}
            <strong className="font-mono text-emerald-800 tabular-nums">{formatFCFA(totalToday)}</strong>
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-xl bg-stone-100 p-1">
          <button
            type="button"
            onClick={() => setTab('queue')}
            className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
              tab === 'queue' ? 'bg-white text-[#161614] shadow-sm' : 'text-stone-600'
            }`}
          >
            À traiter ({activeQueue.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('historique')}
            className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
              tab === 'historique' ? 'bg-white text-[#161614] shadow-sm' : 'text-stone-600'
            }`}
          >
            Ventes du jour ({paidToday.length})
          </button>
          {!isBarOnly && (
            <button
              type="button"
              onClick={() => setTab('credit')}
              className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                tab === 'credit' ? 'bg-white text-[#161614] shadow-sm' : 'text-stone-600'
              }`}
            >
              Crédit Client ({openCredits.length})
            </button>
          )}
        </div>
      </div>

      {feedback && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-900 flex items-center justify-between">
          <span>{feedback}</span>
          <button type="button" onClick={() => setFeedback(null)} className="underline">
            Fermer
          </button>
        </div>
      )}

      {tab === 'queue' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {activeQueue.length === 0 ? (
            <div className="md:col-span-2 xl:col-span-3 rounded-2xl border border-stone-200 bg-white p-12 text-center">
              <Receipt className="w-8 h-8 text-stone-400 mx-auto" />
              <p className="mt-3 font-display text-base font-bold text-[#161614]">
                Aucune commande en attente
              </p>
              <p className="mt-1 text-xs text-stone-500">
                Les commandes envoyées par les serveurs apparaissent ici en temps réel.
              </p>
            </div>
          ) : (
            activeQueue.map((cmd) => (
              <div
                key={cmd.id}
                className="rounded-2xl border border-stone-200 bg-white p-5 flex flex-col justify-between space-y-4"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2 border-b border-stone-100 pb-3">
                    <div>
                      <span className="font-mono text-xs font-bold text-stone-500">{cmd.numero_bon}</span>
                      <h3 className="font-display text-lg font-bold text-[#161614]">{cmd.cible}</h3>
                      <p className="text-xs text-stone-500">
                        Serveur : <strong className="text-stone-700">{cmd.serveur_nom}</strong> · {formatDateTime(cmd.created_at)}
                      </p>
                    </div>
                    <span
                      className={`text-xs font-bold ${
                        cmd.statut_caisse === 'EN_ATTENTE' ? 'text-amber-700' : 'text-emerald-800'
                      }`}
                    >
                      {cmd.statut_caisse === 'EN_ATTENTE' ? 'Nouvelle' : 'Validée'}
                    </span>
                  </div>

                  <ul className="space-y-1.5 text-sm">
                    {cmd.items.map((it, idx) => (
                      <li key={idx} className="flex items-center justify-between gap-2">
                        <span className="text-stone-700">
                          <strong className="font-mono tabular-nums">{it.quantite}×</strong> {it.nom}
                        </span>
                        <span className="font-mono text-xs text-stone-600 tabular-nums">
                          {formatFCFA(it.prix * it.quantite)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {cmd.note && (
                    <p className="text-xs text-amber-800 bg-amber-50 rounded-lg px-2.5 py-1.5">
                      Note : {cmd.note}
                    </p>
                  )}
                </div>

                <div className="pt-3 border-t border-stone-100 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-stone-500">Total à encaisser</span>
                    <span className="font-mono text-xl font-extrabold text-[#161614] tabular-nums">
                      {formatFCFA(cmd.montant_total)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {cmd.statut_caisse === 'EN_ATTENTE' ? (
                      <button
                        type="button"
                        disabled={busyId === cmd.id || readOnly}
                        onClick={() => handleValidate(cmd)}
                        className="col-span-2 inline-flex items-center justify-center gap-2 rounded-xl bg-[#161614] py-3 text-sm font-bold text-white hover:bg-stone-800 disabled:opacity-50 min-h-[48px]"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        VALIDER & GÉNÉRER BON
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => setBonModal(cmd)}
                          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-stone-300 bg-white py-3 text-xs font-semibold text-stone-700 hover:bg-stone-50 min-h-[48px]"
                        >
                          <Printer className="w-4 h-4" />
                          Voir Bon
                        </button>
                        <button
                          type="button"
                          disabled={busyId === cmd.id || readOnly}
                          onClick={() => openPaymentModal(cmd)}
                          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#0E8A55] py-3 text-xs font-bold text-white hover:bg-[#0B7145] disabled:opacity-50 min-h-[48px]"
                        >
                          <Wallet className="w-4 h-4" />
                          ENCAISSER
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'historique' && (
        <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#FAF9F6] border-b border-stone-200 text-xs font-semibold text-stone-600">
                <tr>
                  <th className="px-4 py-3">Heure</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Mode</th>
                  <th className="px-4 py-3">Caissier</th>
                  <th className="px-4 py-3">Client / Réf</th>
                  <th className="px-4 py-3 text-right">Montant</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {paidToday.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-xs text-stone-500">
                      Aucun encaissement enregistré aujourd’hui.
                    </td>
                  </tr>
                ) : (
                  paidToday.map((p) => (
                    <tr key={p.id}>
                      <td className="px-4 py-3 font-mono text-xs text-stone-600 tabular-nums">
                        {formatDateTime(p.created_at)}
                      </td>
                      <td className="px-4 py-3 text-xs font-medium capitalize">{p.type_paiement.replace('_', ' ')}</td>
                      <td className="px-4 py-3 text-xs font-semibold text-[#161614]">{p.mode_paiement}</td>
                      <td className="px-4 py-3 text-xs text-stone-600">{p.caissier_nom}</td>
                      <td className="px-4 py-3 text-xs text-stone-500">
                        {p.client_nom || 'Comptoir'} {p.reference ? `· ${p.reference}` : ''}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-emerald-800 tabular-nums">
                        {formatFCFA(p.montant)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'credit' && !isBarOnly && (
        <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden">
          <div className="p-5 border-b border-stone-200 flex items-center justify-between">
            <div>
              <h2 className="font-display text-lg font-bold text-[#161614]">Crédits Clients à recouvrer</h2>
              <p className="text-xs text-stone-500">Règlement fin du mois par Espèces ou Mobile Money.</p>
            </div>
            <span className="font-mono text-lg font-bold text-amber-700 tabular-nums">
              Total dû : {formatFCFA(openCredits.reduce((s, c) => s + c.montant, 0))}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#FAF9F6] border-b border-stone-200 text-xs font-semibold text-stone-600">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Téléphone</th>
                  <th className="px-4 py-3">Enregistré par</th>
                  <th className="px-4 py-3 text-right">Montant dû</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {openCredits.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-xs text-stone-500">
                      Aucun crédit client en cours.
                    </td>
                  </tr>
                ) : (
                  openCredits.map((c) => (
                    <tr key={c.id}>
                      <td className="px-4 py-3 font-mono text-xs text-stone-500 tabular-nums">
                        {formatDateTime(c.created_at)}
                      </td>
                      <td className="px-4 py-3 font-semibold text-[#161614]">{c.client_nom || 'Client'}</td>
                      <td className="px-4 py-3 font-mono text-xs text-stone-600">{c.client_tel || '—'}</td>
                      <td className="px-4 py-3 text-xs text-stone-600">{c.caissier_nom}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-amber-800 tabular-nums">
                        {formatFCFA(c.montant)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          disabled={readOnly}
                          onClick={() => setSettleTarget(c)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-[#0E8A55] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0B7145]"
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                          Régler
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Bon de Commande généré à la validation */}
      {bonModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3 no-print">
              <span className="text-xs font-semibold text-emerald-800">Bon de commande généré (Stock déduit)</span>
              <button type="button" onClick={() => setBonModal(null)} className="text-stone-400 hover:text-stone-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="font-mono text-xs space-y-2 border border-dashed border-stone-300 rounded-xl p-4 bg-[#FAF9F6]">
              <div className="text-center border-b border-dashed border-stone-300 pb-2">
                <p className="font-bold text-sm text-[#161614]">{etab.nom}</p>
                <p>BON DE COMMANDE N° {bonModal.numero_bon}</p>
                <p>{formatDateTime(bonModal.created_at)}</p>
              </div>
              <p><strong>Destination :</strong> {bonModal.cible}</p>
              <p><strong>Serveur :</strong> {bonModal.serveur_nom}</p>
              <div className="border-t border-b border-dashed border-stone-300 py-2 space-y-1">
                {bonModal.items.map((it, idx) => (
                  <div key={idx} className="flex justify-between">
                    <span>{it.quantite}x {it.nom}</span>
                    <span>{formatFCFA(it.prix * it.quantite)}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between font-bold text-sm pt-1">
                <span>TOTAL</span>
                <span>{formatFCFA(bonModal.montant_total)}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 no-print">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-stone-300 py-2.5 text-xs font-semibold text-stone-700"
              >
                <Printer className="w-4 h-4" />
                Imprimer Bon
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = bonModal;
                  setBonModal(null);
                  openPaymentModal(target);
                }}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#0E8A55] py-2.5 text-xs font-bold text-white"
              >
                <Wallet className="w-4 h-4" />
                Encaisser
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Encaissement */}
      {payModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={handleConfirmPayment}
            className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-[#161614]">
                Encaisser {payModal.numero_bon} · {payModal.cible}
              </h3>
              <button type="button" onClick={() => setPayModal(null)}>
                <X className="w-5 h-5 text-stone-400" />
              </button>
            </div>

            <div className="rounded-xl bg-[#FAF9F6] border border-stone-200 p-3.5 flex items-center justify-between">
              <span className="text-xs font-semibold text-stone-600">Montant total</span>
              <span className="font-mono text-2xl font-extrabold text-[#0E8A55] tabular-nums">
                {formatFCFA(payModal.montant_total)}
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-2">Mode de paiement</label>
              <div className="grid grid-cols-2 gap-2">
                {payModal.sejour_id && (
                  <button
                    type="button"
                    onClick={() => setPayMode('SUR_CHAMBRE')}
                    className={`col-span-2 rounded-xl border px-3 py-2.5 text-xs font-bold flex items-center justify-center gap-2 min-h-[44px] ${
                      payMode === 'SUR_CHAMBRE'
                        ? 'border-blue-700 bg-blue-50 text-blue-900'
                        : 'border-stone-200 text-stone-700'
                    }`}
                  >
                    <BedDouble className="w-4 h-4" />
                    Ajouter à la facture Chambre (paiement au Check-out)
                  </button>
                )}
                {(['Especes', 'Flooz', 'Moov Money', 'Orange Money', 'Wave'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setPayMode(m)}
                    className={`rounded-xl border px-3 py-2.5 text-xs font-semibold min-h-[44px] ${
                      payMode === m
                        ? 'border-emerald-700 bg-emerald-50 text-emerald-900'
                        : 'border-stone-200 text-stone-700 hover:bg-stone-50'
                    }`}
                  >
                    {m === 'Especes' ? 'Espèces' : m}
                  </button>
                ))}
                {!isBarOnly && (
                  <button
                    type="button"
                    onClick={() => setPayMode('Credit')}
                    className={`rounded-xl border px-3 py-2.5 text-xs font-semibold min-h-[44px] ${
                      payMode === 'Credit'
                        ? 'border-amber-700 bg-amber-50 text-amber-900'
                        : 'border-stone-200 text-stone-700 hover:bg-stone-50'
                    }`}
                  >
                    Crédit Client (Fin de mois)
                  </button>
                )}
              </div>
            </div>

            {payMode === 'Credit' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Nom du client *</label>
                  <input
                    type="text"
                    required
                    value={creditNom}
                    onChange={(e) => setCreditNom(e.target.value)}
                    placeholder="Nom complet"
                    className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Téléphone</label>
                  <input
                    type="tel"
                    value={creditTel}
                    onChange={(e) => setCreditTel(e.target.value)}
                    placeholder="+228..."
                    className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
            )}

            {payMode !== 'Especes' && payMode !== 'Credit' && payMode !== 'SUR_CHAMBRE' && (
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Référence Mobile Money (optionnel)
                </label>
                <input
                  type="text"
                  value={payRef}
                  onChange={(e) => setPayRef(e.target.value)}
                  placeholder="Ex : TXN 984512"
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm font-mono"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={busyId === payModal.id}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#0E8A55] py-3.5 text-sm font-bold text-white hover:bg-[#0B7145] min-h-[48px]"
            >
              <CreditCard className="w-4 h-4" />
              {payMode === 'SUR_CHAMBRE' ? 'Imputé sur la chambre' : 'Valider et Éditer Ticket'}
            </button>
          </form>
        </div>
      )}

      {/* Ticket de Caisse final */}
      {ticketModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between no-print">
              <span className="text-xs font-bold text-emerald-800">Ticket de caisse enregistré</span>
              <button type="button" onClick={() => setTicketModal(null)}>
                <X className="w-5 h-5 text-stone-400" />
              </button>
            </div>
            <div className="font-mono text-xs space-y-2 border border-dashed border-stone-300 rounded-xl p-4 bg-[#FAF9F6]">
              <div className="text-center border-b border-dashed border-stone-300 pb-2">
                <p className="font-bold text-sm text-[#161614]">{etab.nom}</p>
                <p>{etab.ville || ''} {etab.telephone ? `· ${etab.telephone}` : ''}</p>
                <p>TICKET CAISSE · {ticketModal.commande.numero_bon}</p>
                <p>{formatDateTime(new Date().toISOString())}</p>
              </div>
              <p><strong>Service :</strong> {ticketModal.commande.cible}</p>
              <p><strong>Serveur :</strong> {ticketModal.commande.serveur_nom}</p>
              <p><strong>Caissier :</strong> {operatorName}</p>
              {ticketModal.client && <p><strong>Client :</strong> {ticketModal.client}</p>}
              <div className="border-t border-b border-dashed border-stone-300 py-2 space-y-1">
                {ticketModal.commande.items.map((it, idx) => (
                  <div key={idx} className="flex justify-between">
                    <span>{it.quantite}x {it.nom}</span>
                    <span>{formatFCFA(it.prix * it.quantite)}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between font-bold text-sm">
                <span>TOTAL PAYÉ</span>
                <span>{formatFCFA(ticketModal.commande.montant_total)}</span>
              </div>
              <p><strong>Règlement :</strong> {ticketModal.mode}</p>
              <p className="text-center pt-2 text-stone-500">Merci de votre visite !</p>
            </div>
            <div className="grid grid-cols-2 gap-2 no-print">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-stone-300 py-2.5 text-xs font-semibold text-stone-700"
              >
                <Printer className="w-4 h-4" />
                Imprimer
              </button>
              <button
                type="button"
                onClick={() => setTicketModal(null)}
                className="rounded-xl bg-[#161614] py-2.5 text-xs font-semibold text-white"
              >
                Terminer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Régler Crédit */}
      {settleTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-6 space-y-4 shadow-xl">
            <h3 className="font-display text-lg font-bold text-[#161614]">
              Règlement crédit · {settleTarget.client_nom}
            </h3>
            <p className="font-mono text-2xl font-bold text-[#0E8A55] tabular-nums">
              {formatFCFA(settleTarget.montant)}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {(['Especes', 'Flooz', 'Moov Money', 'Orange Money', 'Wave'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setSettleMode(m)}
                  className={`rounded-xl border px-3 py-2 text-xs font-semibold ${
                    settleMode === m ? 'border-emerald-700 bg-emerald-50 text-emerald-900' : 'border-stone-200'
                  }`}
                >
                  {m === 'Especes' ? 'Espèces' : m}
                </button>
              ))}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSettleTarget(null)}
                className="rounded-lg border border-stone-300 px-4 py-2 text-xs font-semibold"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmSettle}
                disabled={busyId === settleTarget.id}
                className="rounded-lg bg-[#0E8A55] px-4 py-2 text-xs font-bold text-white"
              >
                Confirmer règlement
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

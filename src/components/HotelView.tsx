import React, {useMemo, useState} from 'react';
import {
  AlertTriangle,
  BedDouble,
  CalendarClock,
  CheckCircle2,
  Plus,
  Sparkles,
  UserCheck,
  X,
} from 'lucide-react';
import {
  CHAMBRE_STATUS_UI,
  formatDateTime,
  formatFCFA,
  PHOTO_PRESETS,
  type Chambre,
  type ChambreStatut,
  type Commande,
  type Etablissement,
  type Formule,
  type MenageTask,
  type ModePaiement,
  type Reservation,
  type Sejour,
} from '../types/efa';

interface HotelViewProps {
  etab: Etablissement;
  formuleObj: Formule;
  chambres: Chambre[];
  sejours: Sejour[];
  reservations: Reservation[];
  menageTasks: MenageTask[];
  commandes: Commande[];
  operatorName: string;
  isPatron: boolean;
  readOnly: boolean;
  onCreateChambre: (c: Omit<Chambre, 'id' | 'created_at'>) => Promise<{ok: boolean; error?: string}>;
  onUpdateChambreStatut: (chambreId: string, statut: ChambreStatut) => Promise<{ok: boolean; error?: string}>;
  onCheckIn: (payload: Omit<Sejour, 'id' | 'created_at' | 'heure_depart_reelle' | 'statut' | 'supplement_prolongation'>) => Promise<{ok: boolean; error?: string}>;
  onCheckOut: (params: {
    sejour: Sejour;
    supplementProlongation: number;
    montantTotalFacture: number;
    modePaiement: Exclude<ModePaiement, 'Credit'>;
    caissierNom: string;
  }) => Promise<{ok: boolean; error?: string}>;
  onCreateReservation: (payload: Omit<Reservation, 'id' | 'created_at' | 'statut'>) => Promise<{ok: boolean; error?: string}>;
  onUpdateReservationStatut: (resId: string, chambreId: string, statut: 'HONOREE' | 'ANNULEE') => Promise<void>;
  onCleanRoom: (task: MenageTask, agentNom: string) => Promise<{ok: boolean; error?: string}>;
}

export const HotelView: React.FC<HotelViewProps> = ({
  etab,
  formuleObj,
  chambres,
  sejours,
  reservations,
  menageTasks,
  commandes,
  operatorName,
  isPatron,
  readOnly,
  onCreateChambre,
  onUpdateChambreStatut,
  onCheckIn,
  onCheckOut,
  onCreateReservation,
  onUpdateReservationStatut,
  onCleanRoom,
}) => {
  const [subTab, setSubTab] = useState<'chambres' | 'reservations' | 'menage'>('chambres');
  const [feedback, setFeedback] = useState<string | null>(null);

  // New Room modal (Patron)
  const [showNewRoom, setShowNewRoom] = useState(false);
  const [roomNum, setRoomNum] = useState('');
  const [roomType, setRoomType] = useState<Chambre['type_chambre']>('Climatisé');
  const [prixHeure, setPrixHeure] = useState(5000);
  const [prixNuit, setPrixNuit] = useState(20000);
  const [prixJournee, setPrixJournee] = useState(15000);
  const [roomPhoto, setRoomPhoto] = useState(PHOTO_PRESETS[4].url);

  // Check-in modal
  const [checkInRoom, setCheckInRoom] = useState<Chambre | null>(null);
  const [clientNom, setClientNom] = useState('');
  const [clientTel, setClientTel] = useState('');
  const [pieceId, setPieceId] = useState('');
  const [nbPers, setNbPers] = useState(1);
  const [typeSejour, setTypeSejour] = useState<'Heure' | 'Nuit' | 'Journée'>('Nuit');
  const [duree, setDuree] = useState(1);
  const [acompte, setAcompte] = useState(0);

  // Check-out modal
  const [checkOutTarget, setCheckOutTarget] = useState<{sejour: Sejour; chambre: Chambre} | null>(null);
  const [checkoutMode, setCheckoutMode] = useState<Exclude<ModePaiement, 'Credit'>>('Especes');

  // Reservation modal
  const [showNewRes, setShowNewRes] = useState(false);
  const [resRoomId, setResRoomId] = useState('');
  const [resNom, setResNom] = useState('');
  const [resTel, setResTel] = useState('');
  const [resArrivee, setResArrivee] = useState('');
  const [resDepart, setResDepart] = useState('');
  const [resType, setResType] = useState<'Heure' | 'Nuit' | 'Journée'>('Nuit');
  const [resAcompte, setResAcompte] = useState(0);

  const activeSejoursByRoom = useMemo(() => {
    const map = new Map<string, Sejour>();
    for (const s of sejours) {
      if (s.statut === 'EN_COURS') map.set(s.chambre_id, s);
    }
    return map;
  }, [sejours]);

  const computeOvertime = (s: Sejour, c: Chambre) => {
    const now = Date.now();
    const expected = new Date(s.heure_depart_prevue).getTime();
    if (now <= expected) return {isLate: false, extraHours: 0, supplement: 0};
    const extraHours = Math.ceil((now - expected) / (1000 * 60 * 60));
    const supplement = extraHours * (c.prix_heure || 5000);
    return {isLate: true, extraHours, supplement};
  };

  const overtimeAlerts = useMemo(() => {
    const alerts: {sejour: Sejour; chambre: Chambre; extraHours: number; supplement: number}[] = [];
    for (const s of sejours.filter((x) => x.statut === 'EN_COURS')) {
      const c = chambres.find((r) => r.id === s.chambre_id);
      if (!c) continue;
      const ot = computeOvertime(s, c);
      if (ot.isLate) alerts.push({sejour: s, chambre: c, extraHours: ot.extraHours, supplement: ot.supplement});
    }
    return alerts;
  }, [sejours, chambres]);

  const roomOrdersTotal = (sejourId: string) => {
    return commandes
      .filter((c) => c.sejour_id === sejourId && c.statut_caisse !== 'ANNULEE' && c.statut_caisse !== 'ENCAISSEE')
      .reduce((s, c) => s + c.montant_total, 0);
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) return;
    const res = await onCreateChambre({
      etablissement_id: etab.id,
      numero: roomNum.trim(),
      type_chambre: roomType,
      prix_heure: prixHeure,
      prix_nuit: prixNuit,
      prix_journee: prixJournee,
      statut: 'LIBRE',
      photo_url: roomPhoto || null,
    });
    if (!res.ok) {
      setFeedback(res.error || 'Erreur création chambre');
      return;
    }
    setShowNewRoom(false);
    setRoomNum('');
    setFeedback(`Chambre ${roomNum} créée.`);
  };

  const computeCheckInPrice = () => {
    if (!checkInRoom) return 0;
    const unit =
      typeSejour === 'Heure'
        ? checkInRoom.prix_heure
        : typeSejour === 'Nuit'
        ? checkInRoom.prix_nuit
        : checkInRoom.prix_journee;
    return unit * Math.max(1, duree);
  };

  const handleConfirmCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkInRoom || readOnly) return;
    const now = new Date();
    const depart = new Date(now);
    if (typeSejour === 'Heure') depart.setHours(depart.getHours() + Math.max(1, duree));
    else if (typeSejour === 'Journée') depart.setHours(depart.getHours() + 10 * Math.max(1, duree));
    else depart.setDate(depart.getDate() + Math.max(1, duree));

    const unit =
      typeSejour === 'Heure'
        ? checkInRoom.prix_heure
        : typeSejour === 'Nuit'
        ? checkInRoom.prix_nuit
        : checkInRoom.prix_journee;

    const res = await onCheckIn({
      etablissement_id: etab.id,
      chambre_id: checkInRoom.id,
      chambre_numero: checkInRoom.numero,
      client_nom: clientNom.trim(),
      client_tel: clientTel.trim(),
      piece_identite: pieceId.trim(),
      nb_personnes: nbPers,
      type_sejour: typeSejour,
      duree_prevue: duree,
      prix_unitaire: unit,
      montant_chambre: unit * Math.max(1, duree),
      acompte_verse: acompte,
      heure_arrivee: now.toISOString(),
      heure_depart_prevue: depart.toISOString(),
      receptionniste_nom: operatorName,
    });

    if (!res.ok) {
      setFeedback(res.error || 'Erreur Check-in');
      return;
    }
    setCheckInRoom(null);
    setClientNom('');
    setClientTel('');
    setPieceId('');
    setAcompte(0);
    setFeedback(`Check-in Chambre ${checkInRoom.numero} validé.`);
  };

  const handleConfirmCheckOut = async () => {
    if (!checkOutTarget || readOnly) return;
    const {sejour, chambre} = checkOutTarget;
    const ot = computeOvertime(sejour, chambre);
    const restoTotal = roomOrdersTotal(sejour.id);
    const grandTotal = Math.max(
      0,
      sejour.montant_chambre + ot.supplement + restoTotal - (sejour.acompte_verse || 0)
    );

    const res = await onCheckOut({
      sejour,
      supplementProlongation: ot.supplement,
      montantTotalFacture: grandTotal,
      modePaiement: checkoutMode,
      caissierNom: operatorName,
    });

    if (!res.ok) {
      setFeedback(res.error || 'Erreur Check-out');
      return;
    }
    setCheckOutTarget(null);
    setFeedback(`Check-out Chambre ${chambre.numero} encaissé (${formatFCFA(grandTotal)}). Chambre passée EN NETTOYAGE.`);
  };

  const handleCreateRes = async (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) return;
    const res = await onCreateReservation({
      etablissement_id: etab.id,
      chambre_id: resRoomId,
      client_nom: resNom.trim(),
      client_tel: resTel.trim(),
      date_arrivee: new Date(resArrivee).toISOString(),
      date_depart: new Date(resDepart).toISOString(),
      type_sejour: resType,
      acompte: resAcompte,
      notes: null,
    });
    if (!res.ok) {
      setFeedback(res.error || 'Erreur réservation');
      return;
    }
    setShowNewRes(false);
    setResNom('');
    setResTel('');
    setResAcompte(0);
    setFeedback('Réservation enregistrée.');
  };

  const pendingCleaning = menageTasks.filter((m) => m.statut !== 'NETTOYEE');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#161614]">
            Module Hôtel · Réception, Chambres & Ménage
          </h1>
          <p className="text-xs text-stone-500">
            {chambres.length} / {formuleObj.max_chambres} chambres ·{' '}
            {chambres.filter((c) => c.statut === 'LIBRE').length} libre(s) ·{' '}
            {chambres.filter((c) => c.statut === 'OCCUPEE').length} occupée(s)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 rounded-xl bg-stone-100 p-1">
            <button
              type="button"
              onClick={() => setSubTab('chambres')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap ${
                subTab === 'chambres' ? 'bg-white text-[#161614] shadow-sm' : 'text-stone-600'
              }`}
            >
              Chambres ({chambres.length})
            </button>
            <button
              type="button"
              onClick={() => setSubTab('reservations')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap ${
                subTab === 'reservations' ? 'bg-white text-[#161614] shadow-sm' : 'text-stone-600'
              }`}
            >
              Réservations ({reservations.filter((r) => r.statut === 'CONFIRMEE').length})
            </button>
            <button
              type="button"
              onClick={() => setSubTab('menage')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap ${
                subTab === 'menage' ? 'bg-white text-[#161614] shadow-sm' : 'text-stone-600'
              }`}
            >
              Ménage ({pendingCleaning.length})
            </button>
          </div>
          {isPatron && !readOnly && (
            <button
              type="button"
              disabled={chambres.length >= formuleObj.max_chambres}
              onClick={() => setShowNewRoom(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#0E8A55] px-4 py-2 text-xs font-bold text-white hover:bg-[#0B7145] disabled:opacity-50 min-h-[40px]"
            >
              <Plus className="w-4 h-4" />
              Ajouter Chambre
            </button>
          )}
        </div>
      </div>

      {/* Prolongation Alerts */}
      {overtimeAlerts.length > 0 && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-bold text-red-900">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Alerte Prolongation détectée ({overtimeAlerts.length} chambre(s))</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {overtimeAlerts.map((a) => (
              <div
                key={a.sejour.id}
                className="rounded-lg bg-white border border-red-200 px-3 py-2 flex items-center justify-between text-xs"
              >
                <div>
                  <strong>Chambre {a.chambre.numero}</strong> · {a.sejour.client_nom} (+{a.extraHours}h dépassées)
                </div>
                <span className="font-mono font-bold text-red-700 tabular-nums">
                  +{formatFCFA(a.supplement)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {feedback && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-900 flex items-center justify-between">
          <span>{feedback}</span>
          <button type="button" onClick={() => setFeedback(null)} className="underline">
            Fermer
          </button>
        </div>
      )}

      {subTab === 'chambres' && (
        <>
          {chambres.length === 0 ? (
            <div className="rounded-2xl border border-stone-200 bg-white p-12 text-center">
              <BedDouble className="w-8 h-8 text-stone-400 mx-auto" />
              <p className="mt-3 font-display text-base font-bold text-[#161614]">
                Aucune chambre configurée
              </p>
              <p className="mt-1 text-xs text-stone-500">
                Le Patron peut créer jusqu’à 50 chambres (Standard, Deluxe, Suite, Ventilateur, Climatisé).
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {chambres.map((ch) => {
                const ui = CHAMBRE_STATUS_UI[ch.statut];
                const sejour = activeSejoursByRoom.get(ch.id);
                const ot = sejour ? computeOvertime(sejour, ch) : null;
                const roomResto = sejour ? roomOrdersTotal(sejour.id) : 0;

                return (
                  <div
                    key={ch.id}
                    className={`rounded-2xl border ${ui.border} bg-white overflow-hidden flex flex-col justify-between`}
                  >
                    <div>
                      <div className="aspect-[16/9] w-full bg-stone-100 relative">
                        {ch.photo_url ? (
                          <img
                            src={ch.photo_url}
                            alt={`Chambre ${ch.numero}`}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-stone-400">
                            <BedDouble className="w-8 h-8" />
                          </div>
                        )}
                        <div className={`absolute top-2.5 left-2.5 rounded-lg border ${ui.border} ${ui.bg} px-2.5 py-1 text-[11px] font-bold ${ui.text} flex items-center gap-1.5`}>
                          <span className={`w-2 h-2 rounded-full ${ui.dot}`} />
                          {ui.label}
                        </div>
                      </div>

                      <div className="p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <h3 className="font-display text-lg font-extrabold text-[#161614]">
                            Chambre {ch.numero}
                          </h3>
                          <span className="text-xs font-medium text-stone-500">{ch.type_chambre}</span>
                        </div>

                        <div className="grid grid-cols-3 gap-1 text-[11px] font-mono text-stone-600 bg-[#FAF9F6] rounded-lg p-2 tabular-nums">
                          <div>
                            <span className="block text-stone-400">Heure</span>
                            <strong>{formatFCFA(ch.prix_heure)}</strong>
                          </div>
                          <div>
                            <span className="block text-stone-400">Journée</span>
                            <strong>{formatFCFA(ch.prix_journee)}</strong>
                          </div>
                          <div>
                            <span className="block text-stone-400">Nuit</span>
                            <strong>{formatFCFA(ch.prix_nuit)}</strong>
                          </div>
                        </div>

                        {sejour && (
                          <div className="rounded-xl border border-red-200 bg-red-50/70 p-2.5 text-xs space-y-1">
                            <p className="font-bold text-[#161614]">{sejour.client_nom}</p>
                            <p className="text-stone-600">
                              {sejour.type_sejour} ({sejour.duree_prevue}) · Départ :{' '}
                              <span className="font-mono">{formatDateTime(sejour.heure_depart_prevue)}</span>
                            </p>
                            {roomResto > 0 && (
                              <p className="font-mono font-semibold text-blue-800 tabular-nums">
                                Resto/Bar sur chambre : +{formatFCFA(roomResto)}
                              </p>
                            )}
                            {ot?.isLate && (
                              <p className="font-mono font-bold text-red-700 tabular-nums">
                                Prolongation (+{ot.extraHours}h) : +{formatFCFA(ot.supplement)}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="p-4 pt-0 space-y-2">
                      {ch.statut === 'LIBRE' && (
                        <button
                          type="button"
                          disabled={readOnly}
                          onClick={() => setCheckInRoom(ch)}
                          className="w-full rounded-xl bg-[#0E8A55] py-2.5 text-xs font-bold text-white hover:bg-[#0B7145] min-h-[44px]"
                        >
                          CHECK-IN CLIENT
                        </button>
                      )}
                      {ch.statut === 'OCCUPEE' && sejour && (
                        <button
                          type="button"
                          disabled={readOnly}
                          onClick={() => setCheckOutTarget({sejour, chambre: ch})}
                          className="w-full rounded-xl bg-red-600 py-2.5 text-xs font-bold text-white hover:bg-red-700 min-h-[44px]"
                        >
                          CHECK-OUT & FACTURE
                        </button>
                      )}
                      {ch.statut === 'EN_NETTOYAGE' && (
                        <button
                          type="button"
                          disabled={readOnly}
                          onClick={() => {
                            const task = pendingCleaning.find((t) => t.chambre_id === ch.id);
                            if (task) onCleanRoom(task, operatorName);
                            else onUpdateChambreStatut(ch.id, 'LIBRE');
                          }}
                          className="w-full rounded-xl bg-amber-600 py-2.5 text-xs font-bold text-white hover:bg-amber-700 min-h-[44px]"
                        >
                          CHAMBRE NETTOYÉE
                        </button>
                      )}
                      {ch.statut === 'RESERVEE' && (
                        <button
                          type="button"
                          disabled={readOnly}
                          onClick={() => setCheckInRoom(ch)}
                          className="w-full rounded-xl bg-blue-700 py-2.5 text-xs font-bold text-white hover:bg-blue-800 min-h-[44px]"
                        >
                          ARRIVÉE CLIENT (CHECK-IN)
                        </button>
                      )}
                      {isPatron && ch.statut !== 'OCCUPEE' && (
                        <select
                          value={ch.statut}
                          disabled={readOnly}
                          onChange={(e) => onUpdateChambreStatut(ch.id, e.target.value as ChambreStatut)}
                          className="w-full rounded-lg border border-stone-200 bg-[#FAF9F6] px-2.5 py-1.5 text-xs text-stone-700"
                        >
                          <option value="LIBRE">Statut : LIBRE</option>
                          <option value="EN_NETTOYAGE">Statut : EN NETTOYAGE</option>
                          <option value="RESERVEE">Statut : RÉSERVÉE</option>
                          <option value="HORS_SERVICE">Statut : HORS SERVICE</option>
                        </select>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {subTab === 'reservations' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            {!readOnly && chambres.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setResRoomId(chambres[0].id);
                  setShowNewRes(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#161614] px-4 py-2.5 text-xs font-bold text-white"
              >
                <CalendarClock className="w-4 h-4" />
                Nouvelle réservation
              </button>
            )}
          </div>
          <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#FAF9F6] border-b border-stone-200 text-xs font-semibold text-stone-600">
                <tr>
                  <th className="px-4 py-3">Chambre</th>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Arrivée → Départ</th>
                  <th className="px-4 py-3">Séjour</th>
                  <th className="px-4 py-3 text-right">Acompte</th>
                  <th className="px-4 py-3">Statut</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {reservations.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-xs text-stone-500">
                      Aucune réservation enregistrée.
                    </td>
                  </tr>
                ) : (
                  reservations.map((r) => {
                    const ch = chambres.find((c) => c.id === r.chambre_id);
                    return (
                      <tr key={r.id}>
                        <td className="px-4 py-3 font-bold">Ch. {ch?.numero || '—'}</td>
                        <td className="px-4 py-3">
                          <div className="font-semibold">{r.client_nom}</div>
                          <div className="text-xs text-stone-500 font-mono">{r.client_tel}</div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs tabular-nums">
                          {formatDateTime(r.date_arrivee)} → {formatDateTime(r.date_depart)}
                        </td>
                        <td className="px-4 py-3 text-xs">{r.type_sejour}</td>
                        <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums">
                          {formatFCFA(r.acompte)}
                        </td>
                        <td className="px-4 py-3 text-xs font-bold">{r.statut}</td>
                        <td className="px-4 py-3 text-right">
                          {r.statut === 'CONFIRMEE' && !readOnly && (
                            <div className="inline-flex gap-2">
                              <button
                                type="button"
                                onClick={() => onUpdateReservationStatut(r.id, r.chambre_id, 'HONOREE')}
                                className="rounded-lg bg-emerald-700 px-2.5 py-1 text-xs font-semibold text-white"
                              >
                                Honorée
                              </button>
                              <button
                                type="button"
                                onClick={() => onUpdateReservationStatut(r.id, r.chambre_id, 'ANNULEE')}
                                className="rounded-lg border border-stone-300 px-2.5 py-1 text-xs font-semibold text-stone-600"
                              >
                                Annuler
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'menage' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {pendingCleaning.length === 0 ? (
            <div className="sm:col-span-2 lg:col-span-3 rounded-2xl border border-stone-200 bg-white p-12 text-center">
              <Sparkles className="w-8 h-8 text-emerald-700 mx-auto" />
              <p className="mt-3 font-display text-base font-bold text-[#161614]">
                Toutes les chambres sont propres
              </p>
              <p className="mt-1 text-xs text-stone-500">
                Lors d’un Check-out, la chambre passe automatiquement en « EN NETTOYAGE » ici.
              </p>
            </div>
          ) : (
            pendingCleaning.map((task) => (
              <div
                key={task.id}
                className="rounded-2xl border border-amber-300 bg-white p-5 flex flex-col justify-between space-y-4"
              >
                <div>
                  <span className="text-xs font-bold text-amber-700">EN NETTOYAGE</span>
                  <h3 className="font-display text-xl font-extrabold text-[#161614] mt-1">
                    Chambre {task.chambre_numero}
                  </h3>
                  <p className="text-xs text-stone-500 mt-1">
                    Libérée le {formatDateTime(task.created_at)}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() => onCleanRoom(task, operatorName)}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#0E8A55] py-3.5 text-sm font-bold text-white hover:bg-[#0B7145] min-h-[48px]"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  CHAMBRE NETTOYÉE
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* Modal Ajouter Chambre */}
      {showNewRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={handleCreateRoom}
            className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold">Nouvelle Chambre</h3>
              <button type="button" onClick={() => setShowNewRoom(false)}>
                <X className="w-5 h-5 text-stone-400" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Numéro *</label>
                <input
                  type="text"
                  required
                  value={roomNum}
                  onChange={(e) => setRoomNum(e.target.value)}
                  placeholder="Ex : 101"
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Type</label>
                <select
                  value={roomType}
                  onChange={(e) => setRoomType(e.target.value as Chambre['type_chambre'])}
                  className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="Standard">Standard</option>
                  <option value="Deluxe">Deluxe</option>
                  <option value="Suite">Suite</option>
                  <option value="Ventilateur">Ventilateur</option>
                  <option value="Climatisé">Climatisé</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[11px] font-semibold text-stone-700 mb-1">Prix Heure</label>
                <input
                  type="number"
                  required
                  value={prixHeure}
                  onChange={(e) => setPrixHeure(Number(e.target.value))}
                  className="w-full rounded-lg border border-stone-300 px-2.5 py-2 text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-stone-700 mb-1">Prix Journée</label>
                <input
                  type="number"
                  required
                  value={prixJournee}
                  onChange={(e) => setPrixJournee(Number(e.target.value))}
                  className="w-full rounded-lg border border-stone-300 px-2.5 py-2 text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-stone-700 mb-1">Prix Nuit</label>
                <input
                  type="number"
                  required
                  value={prixNuit}
                  onChange={(e) => setPrixNuit(Number(e.target.value))}
                  className="w-full rounded-lg border border-stone-300 px-2.5 py-2 text-sm font-mono"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">Photo (URL)</label>
              <input
                type="text"
                value={roomPhoto}
                onChange={(e) => setRoomPhoto(e.target.value)}
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-xs"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewRoom(false)}
                className="rounded-lg border border-stone-300 px-4 py-2 text-xs font-semibold"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[#0E8A55] px-5 py-2 text-xs font-bold text-white"
              >
                Enregistrer Chambre
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Check-in */}
      {checkInRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <form
            onSubmit={handleConfirmCheckIn}
            className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 space-y-4 shadow-xl my-8"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold">
                Check-in · Chambre {checkInRoom.numero}
              </h3>
              <button type="button" onClick={() => setCheckInRoom(null)}>
                <X className="w-5 h-5 text-stone-400" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Nom client *</label>
                <input
                  type="text"
                  required
                  value={clientNom}
                  onChange={(e) => setClientNom(e.target.value)}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Téléphone *</label>
                <input
                  type="tel"
                  required
                  value={clientTel}
                  onChange={(e) => setClientTel(e.target.value)}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Pièce d’identité *</label>
                <input
                  type="text"
                  required
                  value={pieceId}
                  onChange={(e) => setPieceId(e.target.value)}
                  placeholder="CNI / Passeport"
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Personnes</label>
                <input
                  type="number"
                  min={1}
                  value={nbPers}
                  onChange={(e) => setNbPers(Number(e.target.value))}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Type séjour</label>
                <select
                  value={typeSejour}
                  onChange={(e) => setTypeSejour(e.target.value as typeof typeSejour)}
                  className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="Heure">À l’heure ({formatFCFA(checkInRoom.prix_heure)})</option>
                  <option value="Journée">Journée ({formatFCFA(checkInRoom.prix_journee)})</option>
                  <option value="Nuit">Nuit ({formatFCFA(checkInRoom.prix_nuit)})</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Durée ({typeSejour}s)</label>
                <input
                  type="number"
                  min={1}
                  value={duree}
                  onChange={(e) => setDuree(Number(e.target.value))}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm font-mono"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">Acompte versé (F)</label>
              <input
                type="number"
                min={0}
                value={acompte}
                onChange={(e) => setAcompte(Number(e.target.value))}
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm font-mono"
              />
            </div>
            <div className="rounded-xl bg-[#FAF9F6] border border-stone-200 p-3 flex items-center justify-between text-sm">
              <span>Montant calculé :</span>
              <span className="font-mono text-xl font-extrabold text-[#0E8A55] tabular-nums">
                {formatFCFA(computeCheckInPrice())}
              </span>
            </div>
            <button
              type="submit"
              className="w-full rounded-xl bg-[#0E8A55] py-3 text-sm font-bold text-white hover:bg-[#0B7145]"
            >
              Confirmer Check-in
            </button>
          </form>
        </div>
      )}

      {/* Modal Check-out unifié (Chambre + Prolongation + Resto + Bar) */}
      {checkOutTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold">
                Check-out Facture Unique · Ch. {checkOutTarget.chambre.numero}
              </h3>
              <button type="button" onClick={() => setCheckOutTarget(null)}>
                <X className="w-5 h-5 text-stone-400" />
              </button>
            </div>
            {(() => {
              const {sejour, chambre} = checkOutTarget;
              const ot = computeOvertime(sejour, chambre);
              const restoTotal = roomOrdersTotal(sejour.id);
              const total = Math.max(
                0,
                sejour.montant_chambre + ot.supplement + restoTotal - (sejour.acompte_verse || 0)
              );
              return (
                <>
                  <div className="rounded-xl border border-stone-200 bg-[#FAF9F6] p-4 space-y-2 text-sm">
                    <p className="font-bold text-[#161614]">Client : {sejour.client_nom}</p>
                    <div className="flex justify-between">
                      <span>Séjour chambre ({sejour.type_sejour} × {sejour.duree_prevue})</span>
                      <span className="font-mono tabular-nums">{formatFCFA(sejour.montant_chambre)}</span>
                    </div>
                    {ot.isLate && (
                      <div className="flex justify-between text-red-700 font-semibold">
                        <span>Supplément prolongation (+{ot.extraHours}h)</span>
                        <span className="font-mono tabular-nums">+{formatFCFA(ot.supplement)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span>Commandes Resto & Bar sur chambre</span>
                      <span className="font-mono tabular-nums">{formatFCFA(restoTotal)}</span>
                    </div>
                    {sejour.acompte_verse > 0 && (
                      <div className="flex justify-between text-emerald-800">
                        <span>Acompte déjà versé</span>
                        <span className="font-mono tabular-nums">-{formatFCFA(sejour.acompte_verse)}</span>
                      </div>
                    )}
                    <div className="border-t border-stone-200 pt-2 flex justify-between text-base font-extrabold">
                      <span>Net à encaisser</span>
                      <span className="font-mono text-[#0E8A55] tabular-nums">{formatFCFA(total)}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {(['Especes', 'Flooz', 'Moov Money', 'Orange Money', 'Wave'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setCheckoutMode(m)}
                        className={`rounded-xl border px-3 py-2 text-xs font-semibold ${
                          checkoutMode === m
                            ? 'border-emerald-700 bg-emerald-50 text-emerald-900'
                            : 'border-stone-200'
                        }`}
                      >
                        {m === 'Especes' ? 'Espèces' : m}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={handleConfirmCheckOut}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#0E8A55] py-3.5 text-sm font-bold text-white hover:bg-[#0B7145]"
                  >
                    <UserCheck className="w-4 h-4" />
                    Encaisser & Libérer (→ Ménage)
                  </button>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Modal Nouvelle Réservation */}
      {showNewRes && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={handleCreateRes}
            className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold">Nouvelle Réservation</h3>
              <button type="button" onClick={() => setShowNewRes(false)}>
                <X className="w-5 h-5 text-stone-400" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">Chambre</label>
              <select
                value={resRoomId}
                onChange={(e) => setResRoomId(e.target.value)}
                className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
              >
                {chambres.map((c) => (
                  <option key={c.id} value={c.id}>
                    Chambre {c.numero} ({c.type_chambre})
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Nom client *</label>
                <input
                  type="text"
                  required
                  value={resNom}
                  onChange={(e) => setResNom(e.target.value)}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Téléphone *</label>
                <input
                  type="tel"
                  required
                  value={resTel}
                  onChange={(e) => setResTel(e.target.value)}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Arrivée *</label>
                <input
                  type="datetime-local"
                  required
                  value={resArrivee}
                  onChange={(e) => setResArrivee(e.target.value)}
                  className="w-full rounded-lg border border-stone-300 px-2.5 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Départ *</label>
                <input
                  type="datetime-local"
                  required
                  value={resDepart}
                  onChange={(e) => setResDepart(e.target.value)}
                  className="w-full rounded-lg border border-stone-300 px-2.5 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Type séjour</label>
                <select
                  value={resType}
                  onChange={(e) => setResType(e.target.value as typeof resType)}
                  className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="Nuit">Nuit</option>
                  <option value="Journée">Journée</option>
                  <option value="Heure">Heure</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Acompte (F)</label>
                <input
                  type="number"
                  min={0}
                  value={resAcompte}
                  onChange={(e) => setResAcompte(Number(e.target.value))}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm font-mono"
                />
              </div>
            </div>
            <button
              type="submit"
              className="w-full rounded-xl bg-[#0E8A55] py-3 text-sm font-bold text-white"
            >
              Enregistrer Réservation
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

import React, {useMemo, useState} from 'react';
import {Bike, CheckCircle2, MapPin, Navigation, Phone, Plus, X} from 'lucide-react';
import {
  formatDateTime,
  formatFCFA,
  type Commande,
  type CommandeItem,
  type Employe,
  type Etablissement,
  type Livraison,
  type MenuItem,
} from '../types/efa';

interface LivraisonViewProps {
  etab: Etablissement;
  menus: MenuItem[];
  livraisons: Livraison[];
  employes: Employe[];
  operatorName: string;
  readOnly: boolean;
  onCreateDeliveryOrder: (params: {
    clientNom: string;
    clientTel: string;
    quartier: string;
    adresseDetail: string;
    fraisLivraison: number;
    items: CommandeItem[];
    livreurId: string | null;
    livreurNom: string | null;
    operateurNom: string;
  }) => Promise<{ok: boolean; error?: string}>;
  onUpdateDeliveryStatus: (
    livraison: Livraison,
    statut: 'EN_COURS' | 'LIVRE',
    livreurNom: string
  ) => Promise<{ok: boolean; error?: string}>;
}

export const LivraisonView: React.FC<LivraisonViewProps> = ({
  etab,
  menus,
  livraisons,
  employes,
  operatorName,
  readOnly,
  onCreateDeliveryOrder,
  onUpdateDeliveryStatus,
}) => {
  const [filter, setFilter] = useState<'all' | 'EN_ATTENTE' | 'EN_COURS' | 'LIVRE'>('all');
  const [showNew, setShowNew] = useState(false);
  const [clientNom, setClientNom] = useState('');
  const [clientTel, setClientTel] = useState('');
  const zones = etab.zones_livraison?.length
    ? etab.zones_livraison
    : [{quartier: 'Centre-ville', frais: 500}];
  const [quartier, setQuartier] = useState(zones[0].quartier);
  const [adresseDetail, setAdresseDetail] = useState('');
  const [livreurId, setLivreurId] = useState('');
  const [items, setItems] = useState<CommandeItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const livreurs = useMemo(
    () => employes.filter((e) => e.role === 'livreur' && e.actif),
    [employes]
  );

  const selectedZone = zones.find((z) => z.quartier === quartier) || zones[0];
  const fraisLivraison = selectedZone ? selectedZone.frais : 0;

  const visibleDeliveries = useMemo(
    () => (filter === 'all' ? livraisons : livraisons.filter((l) => l.statut === filter)),
    [livraisons, filter]
  );

  const addMenuToDelivery = (m: MenuItem) => {
    if (m.est_epuise) return;
    setItems((prev) => {
      const ex = prev.find((i) => i.menu_id === m.id);
      if (ex) return prev.map((i) => (i.menu_id === m.id ? {...i, quantite: i.quantite + 1} : i));
      return [
        ...prev,
        {
          menu_id: m.id,
          nom: m.nom,
          categorie: m.categorie,
          prix: m.prix,
          cout_revient: m.cout_revient || 0,
          quantite: 1,
          recette: m.recette || [],
        },
      ];
    });
  };

  const subtotal = items.reduce((s, i) => s + i.prix * i.quantite, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) return;
    if (items.length === 0) {
      setFeedback('Sélectionnez au moins un plat ou une boisson.');
      return;
    }
    setBusy(true);
    const chosenDriver = livreurs.find((l) => l.id === livreurId);
    const res = await onCreateDeliveryOrder({
      clientNom: clientNom.trim(),
      clientTel: clientTel.trim(),
      quartier,
      adresseDetail: adresseDetail.trim(),
      fraisLivraison,
      items,
      livreurId: chosenDriver?.id || null,
      livreurNom: chosenDriver?.nom || null,
      operateurNom: operatorName,
    });
    setBusy(false);
    if (!res.ok) {
      setFeedback(res.error || 'Erreur création livraison');
      return;
    }
    setShowNew(false);
    setClientNom('');
    setClientTel('');
    setAdresseDetail('');
    setItems([]);
    setFeedback('Commande de livraison enregistrée et envoyée.');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#161614]">Livraisons & Suivi Livreurs</h1>
          <p className="text-xs text-stone-500">
            Frais automatiques par quartier · Suivi en direct (EN COURS / LIVRÉ).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <div className="flex flex-wrap items-center gap-1 rounded-xl bg-stone-100 p-1 w-full sm:w-auto">
            {[
              {id: 'all', label: 'Toutes'},
              {id: 'EN_ATTENTE', label: 'À livrer'},
              {id: 'EN_COURS', label: 'En cours'},
              {id: 'LIVRE', label: 'Livrées'},
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setFilter(t.id as typeof filter)}
                className={`flex-1 sm:flex-initial rounded-lg px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap min-h-[48px] ${
                  filter === t.id ? 'bg-white text-[#161614] shadow-sm' : 'text-stone-600'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {!readOnly && (
            <button
              type="button"
              onClick={() => setShowNew(true)}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-[#0E8A55] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#0B7145] min-h-[48px]"
            >
              <Plus className="w-4 h-4" />
              Nouvelle livraison
            </button>
          )}
        </div>
      </div>

      {feedback && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-900 flex items-center justify-between">
          <span>{feedback}</span>
          <button type="button" onClick={() => setFeedback(null)} className="underline">
            Fermer
          </button>
        </div>
      )}

      {visibleDeliveries.length === 0 ? (
        <div className="rounded-2xl border border-stone-200 bg-white p-12 text-center">
          <Bike className="w-8 h-8 text-stone-400 mx-auto" />
          <p className="mt-3 font-display text-base font-bold text-[#161614]">
            Aucune livraison dans cette vue
          </p>
          <p className="mt-1 text-xs text-stone-500">
            Créez une commande à livrer pour assigner un livreur et suivre le trajet.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visibleDeliveries.map((liv) => (
            <div
              key={liv.id}
              className="rounded-2xl border border-stone-200 bg-white p-5 flex flex-col justify-between space-y-4"
            >
              <div className="space-y-2.5">
                <div className="flex items-start justify-between gap-2 border-b border-stone-100 pb-3">
                  <div>
                    <h3 className="font-display text-lg font-bold text-[#161614]">{liv.client_nom}</h3>
                    <p className="font-mono text-xs text-stone-600 flex items-center gap-1 mt-0.5">
                      <Phone className="w-3.5 h-3.5" />
                      {liv.client_tel}
                    </p>
                  </div>
                  <span
                    className={`text-xs font-bold ${
                      liv.statut === 'LIVRE'
                        ? 'text-emerald-800'
                        : liv.statut === 'EN_COURS'
                        ? 'text-blue-700'
                        : 'text-amber-700'
                    }`}
                  >
                    {liv.statut === 'EN_ATTENTE'
                      ? 'En attente'
                      : liv.statut === 'EN_COURS'
                      ? 'EN COURS'
                      : 'LIVRÉ'}
                  </span>
                </div>

                <div className="text-xs text-stone-700 space-y-1">
                  <p className="flex items-start gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-stone-500 shrink-0 mt-0.5" />
                    <span>
                      <strong>{liv.quartier}</strong> · {liv.adresse_detail}
                    </span>
                  </p>
                  <p className="text-stone-500">
                    Livreur : <strong>{liv.livreur_nom || 'Non assigné'}</strong> · {formatDateTime(liv.created_at)}
                  </p>
                </div>

                <div className="rounded-xl bg-[#FAF9F6] border border-stone-200 p-3 flex items-center justify-between text-xs">
                  <div>
                    <p className="text-stone-500">Frais livraison ({liv.quartier})</p>
                    <p className="font-mono font-semibold text-stone-700 tabular-nums">
                      {formatFCFA(liv.frais_livraison)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-stone-500">Total à encaisser</p>
                    <p className="font-mono text-base font-extrabold text-[#161614] tabular-nums">
                      {formatFCFA(liv.montant_a_encaisser)}
                    </p>
                  </div>
                </div>
              </div>

              {liv.statut !== 'LIVRE' && (
                <div className="pt-2 border-t border-stone-100">
                  {liv.statut === 'EN_ATTENTE' ? (
                    <button
                      type="button"
                      disabled={readOnly}
                      onClick={() => onUpdateDeliveryStatus(liv, 'EN_COURS', liv.livreur_nom || operatorName)}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 py-3.5 text-sm font-bold text-white hover:bg-blue-800 min-h-[48px]"
                    >
                      <Navigation className="w-4 h-4" />
                      DÉMARRER · EN COURS
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={readOnly}
                      onClick={() => onUpdateDeliveryStatus(liv, 'LIVRE', liv.livreur_nom || operatorName)}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#0E8A55] py-3.5 text-sm font-bold text-white hover:bg-[#0B7145] min-h-[48px]"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      MARQUER LIVRÉ
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal Nouvelle Livraison */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <form
            onSubmit={handleSubmit}
            className="w-full max-w-2xl rounded-2xl border border-stone-200 bg-white p-6 space-y-4 shadow-xl my-8"
          >
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="font-display text-lg font-bold text-[#161614]">Créer une commande Livraison</h3>
              <button type="button" onClick={() => setShowNew(false)}>
                <X className="w-5 h-5 text-stone-400" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Nom du client *</label>
                <input
                  type="text"
                  required
                  value={clientNom}
                  onChange={(e) => setClientNom(e.target.value)}
                  placeholder="Ex : Kodjo Amah"
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
                  placeholder="+228 90 11 22 33"
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Quartier (Tarif auto)</label>
                <select
                  value={quartier}
                  onChange={(e) => setQuartier(e.target.value)}
                  className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
                >
                  {zones.map((z) => (
                    <option key={z.quartier} value={z.quartier}>
                      {z.quartier} (+{formatFCFA(z.frais)})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Livreur assigné</label>
                <select
                  value={livreurId}
                  onChange={(e) => setLivreurId(e.target.value)}
                  className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="">-- À attribuer --</option>
                  {livreurs.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nom}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">Adresse / Repère *</label>
              <input
                type="text"
                required
                value={adresseDetail}
                onChange={(e) => setAdresseDetail(e.target.value)}
                placeholder="Ex : Rue pavée derrière pharmacie, portail bleu"
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1.5">Articles commandés</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-44 overflow-y-auto p-1">
                {menus
                  .filter((m) => m.actif && !m.est_epuise)
                  .map((m) => {
                    const count = items.find((i) => i.menu_id === m.id)?.quantite || 0;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => addMenuToDelivery(m)}
                        className={`rounded-xl border p-2.5 text-left text-xs transition-colors min-h-[48px] ${
                          count > 0 ? 'border-emerald-700 bg-emerald-50' : 'border-stone-200 hover:bg-stone-50'
                        }`}
                      >
                        <div className="font-semibold text-[#161614] truncate">{m.nom}</div>
                        <div className="font-mono text-emerald-800 mt-0.5 tabular-nums">
                          {formatFCFA(m.prix)} {count > 0 ? `· ×${count}` : ''}
                        </div>
                      </button>
                    );
                  })}
              </div>
            </div>

            <div className="rounded-xl bg-[#FAF9F6] border border-stone-200 p-3.5 flex flex-wrap items-center justify-between gap-2 text-sm">
              <div className="text-xs text-stone-600">
                Articles : <strong className="font-mono">{formatFCFA(subtotal)}</strong> + Livraison :{' '}
                <strong className="font-mono">{formatFCFA(fraisLivraison)}</strong>
              </div>
              <div className="font-mono text-xl font-extrabold text-[#0E8A55] tabular-nums">
                {formatFCFA(subtotal + fraisLivraison)}
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNew(false)}
                className="rounded-xl border border-stone-300 px-4 py-2.5 text-xs font-semibold min-h-[48px]"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={busy}
                className="rounded-xl bg-[#0E8A55] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#0B7145] min-h-[48px]"
              >
                {busy ? 'Enregistrement...' : 'Créer & Envoyer en cuisine'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

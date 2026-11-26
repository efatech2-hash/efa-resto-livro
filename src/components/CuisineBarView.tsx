import React, {useMemo, useState} from 'react';
import {CheckCircle2, ChefHat, Clock, Flame} from 'lucide-react';
import {formatDateTime, type Commande} from '../types/efa';

interface CuisineBarViewProps {
  commandes: Commande[];
  readOnly: boolean;
  onUpdateKitchenStatus: (
    commande: Commande,
    status: 'EN_PREPARATION' | 'PRET' | 'SERVI'
  ) => Promise<{ok: boolean; error?: string}>;
}

export const CuisineBarView: React.FC<CuisineBarViewProps> = ({
  commandes,
  readOnly,
  onUpdateKitchenStatus,
}) => {
  const [zone, setZone] = useState<'all' | 'cuisine' | 'bar'>('all');
  const [busyId, setBusyId] = useState<string | null>(null);

  const kitchenOrders = useMemo(() => {
    return commandes.filter((c) => {
      const validCaisse = ['VALIDEE', 'ENCAISSEE', 'CREDIT', 'SUR_CHAMBRE'].includes(c.statut_caisse);
      if (!validCaisse || c.statut_cuisine === 'SERVI') return false;
      if (zone === 'cuisine') {
        return c.items.some((it) => it.categorie === 'plat' || it.categorie === 'grillade');
      }
      if (zone === 'bar') {
        return c.items.some((it) => it.categorie === 'boisson');
      }
      return true;
    });
  }, [commandes, zone]);

  const handleStep = async (cmd: Commande, next: 'EN_PREPARATION' | 'PRET' | 'SERVI') => {
    if (readOnly) return;
    setBusyId(cmd.id);
    await onUpdateKitchenStatus(cmd, next);
    setBusyId(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#161614]">Écran Cuisine & Bar</h1>
          <p className="text-xs text-stone-500">
            Commandes validées par la caisse à préparer en temps réel ({kitchenOrders.length} active(s)).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1 rounded-xl bg-stone-100 p-1 w-full sm:w-auto">
          {[
            {id: 'all', label: 'Tout voir'},
            {id: 'cuisine', label: 'Cuisine (Plats/Grill)'},
            {id: 'bar', label: 'Bar (Boissons)'},
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setZone(t.id as typeof zone)}
              className={`flex-1 sm:flex-initial rounded-lg px-3.5 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap min-h-[48px] ${
                zone === t.id ? 'bg-white text-[#161614] shadow-sm' : 'text-stone-600'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {kitchenOrders.length === 0 ? (
        <div className="rounded-2xl border border-stone-200 bg-white p-12 text-center">
          <ChefHat className="w-8 h-8 text-stone-400 mx-auto" />
          <p className="mt-3 font-display text-base font-bold text-[#161614]">
            Aucune commande à préparer
          </p>
          <p className="mt-1 text-xs text-stone-500">
            Dès que le caissier valide une commande, le bon s’affiche automatiquement ici.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {kitchenOrders.map((cmd) => {
            const visibleItems =
              zone === 'cuisine'
                ? cmd.items.filter((it) => it.categorie !== 'boisson')
                : zone === 'bar'
                ? cmd.items.filter((it) => it.categorie === 'boisson')
                : cmd.items;

            return (
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
                        Serveur : {cmd.serveur_nom} · {formatDateTime(cmd.validated_at || cmd.created_at)}
                      </p>
                    </div>
                    <span
                      className={`text-xs font-bold ${
                        cmd.statut_cuisine === 'PRET'
                          ? 'text-emerald-800'
                          : cmd.statut_cuisine === 'EN_PREPARATION'
                          ? 'text-amber-700'
                          : 'text-stone-600'
                      }`}
                    >
                      {cmd.statut_cuisine === 'EN_ATTENTE'
                        ? 'À préparer'
                        : cmd.statut_cuisine === 'EN_PREPARATION'
                        ? 'En préparation'
                        : 'Prêt à servir'}
                    </span>
                  </div>

                  <ul className="space-y-2 text-sm">
                    {visibleItems.map((it, idx) => (
                      <li key={idx} className="flex items-center justify-between gap-2">
                        <span className="font-medium text-[#161614]">
                          <strong className="font-mono text-base text-[#0E8A55] tabular-nums mr-1.5">
                            {it.quantite}×
                          </strong>
                          {it.nom}
                        </span>
                        <span className="text-xs text-stone-400 capitalize">{it.categorie}</span>
                      </li>
                    ))}
                  </ul>

                  {cmd.note && (
                    <p className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs font-medium text-amber-900">
                      Instruction : {cmd.note}
                    </p>
                  )}
                </div>

                <div className="pt-2 border-t border-stone-100">
                  {cmd.statut_cuisine === 'EN_ATTENTE' && (
                    <button
                      type="button"
                      disabled={busyId === cmd.id || readOnly}
                      onClick={() => handleStep(cmd, 'EN_PREPARATION')}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 py-3.5 text-sm font-bold text-white hover:bg-amber-700 min-h-[48px]"
                    >
                      <Flame className="w-4 h-4" />
                      EN PRÉPARATION
                    </button>
                  )}
                  {cmd.statut_cuisine === 'EN_PREPARATION' && (
                    <button
                      type="button"
                      disabled={busyId === cmd.id || readOnly}
                      onClick={() => handleStep(cmd, 'PRET')}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#0E8A55] py-3.5 text-sm font-bold text-white hover:bg-[#0B7145] min-h-[48px]"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      MARQUER PRÊT
                    </button>
                  )}
                  {cmd.statut_cuisine === 'PRET' && (
                    <button
                      type="button"
                      disabled={busyId === cmd.id || readOnly}
                      onClick={() => handleStep(cmd, 'SERVI')}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#161614] py-3.5 text-sm font-bold text-white hover:bg-stone-800 min-h-[48px]"
                    >
                      <Clock className="w-4 h-4" />
                      REMETTRE / SERVI
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

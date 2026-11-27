import React, {useMemo, useState} from 'react';
import {BarChart3, BedDouble, TrendingUp} from 'lucide-react';
import {
  formatFCFA,
  type Chambre,
  type Commande,
  type Etablissement,
  type Paiement,
  type Sejour,
} from '../types/efa';

interface StatistiquesViewProps {
  etab: Etablissement;
  commandes: Commande[];
  paiements: Paiement[];
  chambres: Chambre[];
  sejours: Sejour[];
}

export const StatistiquesView: React.FC<StatistiquesViewProps> = ({
  etab,
  commandes,
  paiements,
  chambres,
  sejours,
}) => {
  const [period, setPeriod] = useState<'week' | 'month' | 'all'>('week');
  const isPremium = etab.formule === 'premium';

  const cutoffMs = useMemo(() => {
    const now = Date.now();
    if (period === 'week') return now - 7 * 24 * 60 * 60 * 1000;
    if (period === 'month') return now - 30 * 24 * 60 * 60 * 1000;
    return 0;
  }, [period]);

  const filteredCommandes = useMemo(
    () =>
      commandes.filter(
        (c) =>
          c.statut_caisse !== 'ANNULEE' &&
          c.statut_caisse !== 'EN_ATTENTE' &&
          new Date(c.created_at).getTime() >= cutoffMs
      ),
    [commandes, cutoffMs]
  );

  const filteredPaiements = useMemo(
    () =>
      paiements.filter(
        (p) =>
          p.mode_paiement !== 'Credit' &&
          new Date(p.created_at).getTime() >= cutoffMs
      ),
    [paiements, cutoffMs]
  );

  const totalSales = useMemo(
    () => filteredPaiements.reduce((s, p) => s + (p.montant || 0), 0),
    [filteredPaiements]
  );

  const daysSpan = useMemo(() => {
    if (period === 'week') return 7;
    if (period === 'month') return 30;
    if (filteredPaiements.length === 0) return 1;
    const minTs = Math.min(...filteredPaiements.map((p) => new Date(p.created_at).getTime()));
    return Math.max(1, Math.ceil((Date.now() - minTs) / (1000 * 60 * 60 * 24)));
  }, [period, filteredPaiements]);

  const avgPerDay = totalSales / daysSpan;
  const avgPerWeek = avgPerDay * 7;
  const avgPerMonth = avgPerDay * 30;

  // Product breakdown
  const productStats = useMemo(() => {
    const map = new Map<
      string,
      {nom: string; categorie: string; qty: number; revenue: number; profit: number}
    >();
    for (const cmd of filteredCommandes) {
      for (const it of cmd.items || []) {
        const cur = map.get(it.nom) || {
          nom: it.nom,
          categorie: it.categorie,
          qty: 0,
          revenue: 0,
          profit: 0,
        };
        cur.qty += it.quantite;
        cur.revenue += it.prix * it.quantite;
        cur.profit += (it.prix - (it.cout_revient || 0)) * it.quantite;
        map.set(it.nom, cur);
      }
    }
    return Array.from(map.values()).sort((a, b) => b.qty - a.qty);
  }, [filteredCommandes]);

  const avgQtyPerProduct = useMemo(() => {
    if (productStats.length === 0) return 0;
    const sum = productStats.reduce((s, p) => s + p.qty, 0);
    return sum / productStats.length;
  }, [productStats]);

  const mostProfitableProduct = useMemo(() => {
    if (productStats.length === 0) return null;
    return [...productStats].sort((a, b) => b.profit - a.profit)[0];
  }, [productStats]);

  // Sales by server
  const serverStats = useMemo(() => {
    const map = new Map<string, {nom: string; count: number; total: number}>();
    for (const cmd of filteredCommandes) {
      const key = cmd.serveur_nom || 'Inconnu';
      const cur = map.get(key) || {nom: key, count: 0, total: 0};
      cur.count += 1;
      cur.total += cmd.montant_total || 0;
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [filteredCommandes]);

  // Sales by payment mode
  const paymentModeStats = useMemo(() => {
    const map = new Map<string, {mode: string; count: number; total: number}>();
    for (const p of filteredPaiements) {
      const cur = map.get(p.mode_paiement) || {mode: p.mode_paiement, count: 0, total: 0};
      cur.count += 1;
      cur.total += p.montant || 0;
      map.set(p.mode_paiement, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [filteredPaiements]);

  // Hotel analytics (PREMIUM)
  const hotelStats = useMemo(() => {
    const filteredSejours = sejours.filter((s) => new Date(s.heure_arrivee).getTime() >= cutoffMs);
    const totalRooms = Math.max(1, chambres.length);
    const occupiedNow = chambres.filter((c) => c.statut === 'OCCUPEE').length;
    const currentOccupancyPct = Math.round((occupiedNow / totalRooms) * 100);

    const revChambres = filteredSejours.reduce(
      (s, x) => s + (x.montant_chambre || 0) + (x.supplement_prolongation || 0),
      0
    );
    const revResto = productStats
      .filter((p) => p.categorie === 'plat' || p.categorie === 'grillade')
      .reduce((s, p) => s + p.revenue, 0);
    const revBar = productStats
      .filter((p) => p.categorie === 'boisson')
      .reduce((s, p) => s + p.revenue, 0);

    const completedStays = filteredSejours.filter((s) => s.heure_depart_reelle);
    const avgDurationHours =
      completedStays.length > 0
        ? completedStays.reduce(
            (s, x) =>
              s +
              Math.max(
                1,
                (new Date(x.heure_depart_reelle!).getTime() - new Date(x.heure_arrivee).getTime()) /
                  (1000 * 60 * 60)
              ),
            0
          ) / completedStays.length
        : 0;

    const byRoom = new Map<string, {numero: string; count: number; rev: number}>();
    for (const s of filteredSejours) {
      const cur = byRoom.get(s.chambre_numero) || {numero: s.chambre_numero, count: 0, rev: 0};
      cur.count += 1;
      cur.rev += (s.montant_chambre || 0) + (s.supplement_prolongation || 0);
      byRoom.set(s.chambre_numero, cur);
    }
    const topRooms = Array.from(byRoom.values()).sort((a, b) => b.count - a.count);

    return {
      currentOccupancyPct,
      revChambres,
      revResto,
      revBar,
      avgDurationHours,
      avgRevenuePerRoom: revChambres / totalRooms,
      topRooms,
    };
  }, [sejours, chambres, productStats, cutoffMs]);

  const maxProductQty = Math.max(1, ...productStats.map((p) => p.qty));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#161614]">
            Statistiques & Rentabilité
          </h1>
          <p className="text-xs text-stone-500">
            Indicateurs calculés en direct depuis vos ventes, commandes et séjours Supabase.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1 rounded-xl bg-stone-100 p-1 w-full sm:w-auto">
          {[
            {id: 'week', label: '7 derniers jours'},
            {id: 'month', label: '30 derniers jours'},
            {id: 'all', label: 'Tout l’historique'},
          ].map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriod(p.id as typeof period)}
              className={`flex-1 sm:flex-initial rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap min-h-[48px] ${
                period === p.id ? 'bg-white text-[#161614] shadow-sm' : 'text-stone-600'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Averages KPI Strip */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <span className="text-xs text-stone-500">Chiffre d’affaires période</span>
          <p className="mt-1 font-mono text-xl font-extrabold text-[#161614] tabular-nums">
            {formatFCFA(totalSales)}
          </p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <span className="text-xs text-stone-500">Moyenne / jour</span>
          <p className="mt-1 font-mono text-xl font-extrabold text-[#0E8A55] tabular-nums">
            {formatFCFA(avgPerDay)}
          </p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <span className="text-xs text-stone-500">Moyenne / semaine</span>
          <p className="mt-1 font-mono text-xl font-extrabold text-[#161614] tabular-nums">
            {formatFCFA(avgPerWeek)}
          </p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <span className="text-xs text-stone-500">Moyenne / mois</span>
          <p className="mt-1 font-mono text-xl font-extrabold text-[#161614] tabular-nums">
            {formatFCFA(avgPerMonth)}
          </p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <span className="text-xs text-stone-500">Produit le + rentable</span>
          <p className="mt-1 font-display text-base font-bold text-[#161614] truncate">
            {mostProfitableProduct ? mostProfitableProduct.nom : '—'}
          </p>
          <p className="text-xs font-mono text-emerald-800 tabular-nums">
            {mostProfitableProduct ? `Marge ${formatFCFA(mostProfitableProduct.profit)}` : 'Aucune donnée'}
          </p>
        </div>
      </div>

      {/* Charts + Tables: Top Products & Payment Modes */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 rounded-2xl border border-stone-200 bg-white p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-[#0E8A55]" />
              <h2 className="font-display text-lg font-bold text-[#161614]">
                Produits les plus vendus
              </h2>
            </div>
            <span className="text-xs font-mono text-stone-500 tabular-nums">
              Moy. {avgQtyPerProduct.toFixed(1)} unités / produit
            </span>
          </div>

          {productStats.length === 0 ? (
            <p className="py-10 text-center text-xs text-stone-500">
              Aucune vente validée sur cette période.
            </p>
          ) : (
            <div className="space-y-3">
              {productStats.slice(0, 8).map((p) => {
                const widthPct = Math.max(4, Math.round((p.qty / maxProductQty) * 100));
                return (
                  <div key={p.nom} className="space-y-1">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-0.5 text-xs">
                      <span className="font-semibold text-[#161614]">{p.nom}</span>
                      <span className="font-mono text-stone-600 tabular-nums">
                        {p.qty} vendu(s) · {formatFCFA(p.revenue)} · Marge {formatFCFA(p.profit)}
                      </span>
                    </div>
                    <div className="h-2.5 w-full rounded-full bg-stone-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#0E8A55]"
                        style={{width: `${widthPct}%`}}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="lg:col-span-5 rounded-2xl border border-stone-200 bg-white p-5 space-y-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-[#0E8A55]" />
            <h2 className="font-display text-lg font-bold text-[#161614]">
              Ventes par mode de paiement
            </h2>
          </div>

          {paymentModeStats.length === 0 ? (
            <p className="py-10 text-center text-xs text-stone-500">Aucun paiement enregistré.</p>
          ) : (
            <div className="space-y-3">
              {paymentModeStats.map((m) => {
                const pct = totalSales > 0 ? Math.round((m.total / totalSales) * 100) : 0;
                return (
                  <div key={m.mode} className="rounded-xl border border-stone-100 bg-[#FAF9F6] p-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-semibold text-[#161614]">
                        {m.mode === 'Especes' ? 'Espèces' : m.mode}
                      </span>
                      <span className="font-mono font-bold text-[#161614] tabular-nums">
                        {formatFCFA(m.total)}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-xs text-stone-500 font-mono tabular-nums">
                      <span>{m.count} transaction(s)</span>
                      <span>{pct}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Sales by Server */}
      <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden">
        <div className="p-5 border-b border-stone-200">
          <h2 className="font-display text-lg font-bold text-[#161614]">Ventes par serveur</h2>
        </div>

        {/* Mobile Cards (< md) */}
        <div className="md:hidden divide-y divide-stone-100">
          {serverStats.length === 0 ? (
            <p className="p-8 text-center text-xs text-stone-500">
              Aucune vente par serveur sur cette période.
            </p>
          ) : (
            serverStats.map((s) => (
              <div key={s.nom} className="p-4 flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-sm text-[#161614]">{s.nom}</p>
                  <p className="text-xs text-stone-500 font-mono tabular-nums">{s.count} commande(s)</p>
                </div>
                <span className="font-mono font-bold text-base text-[#0E8A55] tabular-nums">
                  {formatFCFA(s.total)}
                </span>
              </div>
            ))
          )}
        </div>

        {/* Tablet/Desktop Table (md+) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#FAF9F6] border-b border-stone-200 text-xs font-semibold text-stone-600">
              <tr>
                <th className="px-4 py-3">Serveur</th>
                <th className="px-4 py-3 text-right">Commandes</th>
                <th className="px-4 py-3 text-right">Volume des ventes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {serverStats.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-xs text-stone-500">
                    Aucune vente par serveur sur cette période.
                  </td>
                </tr>
              ) : (
                serverStats.map((s) => (
                  <tr key={s.nom}>
                    <td className="px-4 py-3 font-semibold text-[#161614]">{s.nom}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{s.count}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-[#0E8A55] tabular-nums">
                      {formatFCFA(s.total)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* PREMIUM Hotel Stats */}
      {isPremium && (
        <section className="rounded-2xl border border-stone-200 bg-white p-5 space-y-5">
          <div className="flex items-center gap-2 border-b border-stone-100 pb-3">
            <BedDouble className="w-5 h-5 text-[#0E8A55]" />
            <h2 className="font-display text-lg font-bold text-[#161614]">
              Statistiques Hôtel (Formules PREMIUM)
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            <div className="rounded-xl border border-stone-200 bg-[#FAF9F6] p-4">
              <span className="text-xs text-stone-500">Taux d’occupation actuel</span>
              <p className="mt-1 font-mono text-2xl font-extrabold text-[#161614] tabular-nums">
                {hotelStats.currentOccupancyPct}%
              </p>
            </div>
            <div className="rounded-xl border border-stone-200 bg-[#FAF9F6] p-4">
              <span className="text-xs text-stone-500">Revenu Chambres</span>
              <p className="mt-1 font-mono text-xl font-extrabold text-[#0E8A55] tabular-nums">
                {formatFCFA(hotelStats.revChambres)}
              </p>
            </div>
            <div className="rounded-xl border border-stone-200 bg-[#FAF9F6] p-4">
              <span className="text-xs text-stone-500">Revenu Resto vs Bar</span>
              <p className="mt-1 font-mono text-sm font-bold text-[#161614] tabular-nums">
                Resto : {formatFCFA(hotelStats.revResto)}
              </p>
              <p className="font-mono text-sm font-bold text-amber-700 tabular-nums">
                Bar : {formatFCFA(hotelStats.revBar)}
              </p>
            </div>
            <div className="rounded-xl border border-stone-200 bg-[#FAF9F6] p-4">
              <span className="text-xs text-stone-500">Durée moyenne séjour</span>
              <p className="mt-1 font-mono text-xl font-extrabold text-[#161614] tabular-nums">
                {hotelStats.avgDurationHours.toFixed(1)} h
              </p>
            </div>
            <div className="rounded-xl border border-stone-200 bg-[#FAF9F6] p-4">
              <span className="text-xs text-stone-500">Revenu moyen / chambre</span>
              <p className="mt-1 font-mono text-xl font-extrabold text-[#161614] tabular-nums">
                {formatFCFA(hotelStats.avgRevenuePerRoom)}
              </p>
            </div>
          </div>

          {hotelStats.topRooms.length > 0 && (
            <>
              {/* Mobile Cards (< md) */}
              <div className="md:hidden divide-y divide-stone-100 rounded-xl border border-stone-200 overflow-hidden">
                {hotelStats.topRooms.slice(0, 6).map((r) => (
                  <div key={r.numero} className="p-3.5 flex items-center justify-between gap-2 bg-white">
                    <div>
                      <p className="font-bold text-sm text-[#161614]">Chambre {r.numero}</p>
                      <p className="text-xs text-stone-500 font-mono tabular-nums">{r.count} séjour(s)</p>
                    </div>
                    <span className="font-mono font-bold text-sm text-[#0E8A55] tabular-nums">
                      {formatFCFA(r.rev)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Tablet/Desktop Table (md+) */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#FAF9F6] border-b border-stone-200 text-xs font-semibold text-stone-600">
                    <tr>
                      <th className="px-4 py-2.5">Chambre la plus louée</th>
                      <th className="px-4 py-2.5 text-right">Séjours</th>
                      <th className="px-4 py-2.5 text-right">Revenu généré</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {hotelStats.topRooms.slice(0, 6).map((r) => (
                      <tr key={r.numero}>
                        <td className="px-4 py-2.5 font-bold">Chambre {r.numero}</td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums">{r.count}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-[#0E8A55] tabular-nums">
                          {formatFCFA(r.rev)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
};

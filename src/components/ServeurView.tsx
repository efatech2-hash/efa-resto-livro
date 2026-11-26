import React, {useMemo, useState} from 'react';
import {BedDouble, Check, Minus, Plus, Send, ShoppingBag, Trash2, UtensilsCrossed} from 'lucide-react';
import {
  formatFCFA,
  type Chambre,
  type Commande,
  type CommandeItem,
  type Etablissement,
  type MenuItem,
  type Sejour,
} from '../types/efa';

interface ServeurViewProps {
  etab: Etablissement;
  menus: MenuItem[];
  chambres: Chambre[];
  sejoursActifs: Sejour[];
  operatorName: string;
  operatorId: string | null;
  readOnly: boolean;
  onCreateCommande: (payload: Omit<Commande, 'id' | 'created_at' | 'validated_at' | 'paid_at'>) => Promise<{ok: boolean; error?: string; numeroBon?: string}>;
}

export const ServeurView: React.FC<ServeurViewProps> = ({
  etab,
  menus,
  chambres,
  sejoursActifs,
  operatorName,
  operatorId,
  readOnly,
  onCreateCommande,
}) => {
  const isBarOnly = etab.formule === 'bar';
  const isPremium = etab.formule === 'premium';

  const [catFilter, setCatFilter] = useState<'all' | 'jour' | 'boisson' | 'plat' | 'grillade'>('all');
  const [typeService, setTypeService] = useState<'Table' | 'Terrasse' | 'A Emporter' | 'Chambre'>('Table');
  const [tableNum, setTableNum] = useState('1');
  const [clientNom, setClientNom] = useState('');
  const [selectedSejourId, setSelectedSejourId] = useState('');
  const [note, setNote] = useState('');
  const [cart, setCart] = useState<CommandeItem[]>([]);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<{type: 'ok' | 'err'; text: string} | null>(null);

  const visibleMenus = useMemo(() => {
    return menus.filter((m) => {
      if (!m.actif) return false;
      if (isBarOnly && m.categorie !== 'boisson') return false;
      if (catFilter === 'jour') return m.est_plat_du_jour;
      if (catFilter !== 'all') return m.categorie === catFilter;
      return true;
    });
  }, [menus, isBarOnly, catFilter]);

  const occupiedRooms = useMemo(
    () =>
      sejoursActifs.map((s) => ({
        sejour: s,
        chambre: chambres.find((c) => c.id === s.chambre_id),
      })),
    [sejoursActifs, chambres]
  );

  const addItem = (item: MenuItem) => {
    if (item.est_epuise || readOnly) return;
    setCart((prev) => {
      const existing = prev.find((c) => c.menu_id === item.id);
      if (existing) {
        return prev.map((c) => (c.menu_id === item.id ? {...c, quantite: c.quantite + 1} : c));
      }
      return [
        ...prev,
        {
          menu_id: item.id,
          nom: item.nom,
          categorie: item.categorie,
          prix: item.prix,
          cout_revient: item.cout_revient || 0,
          quantite: 1,
          recette: item.recette || [],
        },
      ];
    });
  };

  const updateQty = (menuId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) => (c.menu_id === menuId ? {...c, quantite: c.quantite + delta} : c))
        .filter((c) => c.quantite > 0)
    );
  };

  const totalAmount = useMemo(
    () => cart.reduce((sum, item) => sum + item.prix * item.quantite, 0),
    [cart]
  );

  const totalQty = useMemo(() => cart.reduce((sum, item) => sum + item.quantite, 0), [cart]);

  const handleSendToCashier = async () => {
    if (readOnly) {
      setToast({type: 'err', text: 'Établissement en lecture seule : abonnement requis.'});
      return;
    }
    if (cart.length === 0) {
      setToast({type: 'err', text: 'Ajoutez au moins un article à la commande.'});
      return;
    }
    let cible = '';
    let chambreId: string | null = null;
    let sejourId: string | null = null;
    let resolvedClient = clientNom.trim() || null;

    if (typeService === 'Table') {
      cible = `Table ${tableNum}`;
    } else if (typeService === 'Terrasse') {
      cible = `Terrasse ${tableNum}`;
    } else if (typeService === 'A Emporter') {
      cible = resolvedClient ? `À Emporter · ${resolvedClient}` : 'À Emporter';
    } else if (typeService === 'Chambre') {
      const found = occupiedRooms.find((o) => o.sejour.id === selectedSejourId);
      if (!found) {
        setToast({type: 'err', text: 'Sélectionnez une chambre occupée.'});
        return;
      }
      chambreId = found.sejour.chambre_id;
      sejourId = found.sejour.id;
      cible = `Chambre ${found.sejour.chambre_numero}`;
      resolvedClient = found.sejour.client_nom;
    }

    setSending(true);
    const numeroBon = `BON-${new Date().getHours().toString().padStart(2, '0')}${new Date()
      .getMinutes()
      .toString()
      .padStart(2, '0')}-${Math.floor(100 + Math.random() * 900)}`;

    const res = await onCreateCommande({
      etablissement_id: etab.id,
      numero_bon: numeroBon,
      type_service: typeService,
      cible,
      chambre_id: chambreId,
      sejour_id: sejourId,
      serveur_id: operatorId,
      serveur_nom: operatorName,
      items: cart,
      montant_items: totalAmount,
      frais_livraison: 0,
      montant_total: totalAmount,
      statut_caisse: 'EN_ATTENTE',
      statut_cuisine: 'EN_ATTENTE',
      stock_deduit: false,
      caissier_nom: null,
      client_nom: resolvedClient,
      client_tel: null,
      note: note.trim() || null,
    });
    setSending(false);

    if (!res.ok) {
      setToast({type: 'err', text: res.error || 'Erreur lors de l’envoi à la caisse'});
      return;
    }

    setCart([]);
    setNote('');
    setClientNom('');
    setToast({
      type: 'ok',
      text: `Commande ${res.numeroBon || numeroBon} envoyée à la caisse (${cible}).`,
    });
    setTimeout(() => setToast(null), 4000);
  };

  const tablesArray = Array.from({length: Math.max(1, etab.nb_tables || 10)}, (_, i) => String(i + 1));

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-5 lg:gap-6 items-start">
      {/* Left: Menu visual grid (1 col mobile, 2 cols tablet, 3 cols desktop) */}
      <div className="md:col-span-7 lg:col-span-8 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-xl sm:text-2xl font-bold text-[#161614]">Prise de Commande</h1>
            <p className="text-xs sm:text-sm text-stone-500">
              Serveur actif : <strong className="text-[#161614]">{operatorName}</strong> · Touchez un article
            </p>
          </div>
          {/* Category Filter Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-stone-100 p-1">
            {[
              {id: 'all', label: 'Tout'},
              ...(!isBarOnly ? [{id: 'jour', label: 'Plat du Jour'}] : []),
              {id: 'boisson', label: 'Boissons'},
              ...(!isBarOnly ? [{id: 'plat', label: 'Plats'}, {id: 'grillade', label: 'Grillades'}] : []),
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setCatFilter(t.id as typeof catFilter)}
                className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors min-h-[44px] whitespace-nowrap ${
                  catFilter === t.id ? 'bg-white text-[#161614] shadow-sm' : 'text-stone-600 hover:text-[#161614]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {toast && (
          <div
            className={`rounded-xl border px-4 py-3 text-sm font-semibold flex items-center gap-2 ${
              toast.type === 'ok'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-red-200 bg-red-50 text-red-800'
            }`}
          >
            <Check className="w-4 h-4 shrink-0" />
            <span>{toast.text}</span>
          </div>
        )}

        {visibleMenus.length === 0 ? (
          <div className="rounded-2xl border border-stone-200 bg-white p-10 text-center">
            <UtensilsCrossed className="w-8 h-8 text-stone-400 mx-auto" />
            <p className="mt-3 font-display text-base font-bold text-[#161614]">
              Aucun article dans cette catégorie
            </p>
            <p className="mt-1 text-xs text-stone-500">
              Le Patron peut ajouter des {isBarOnly ? 'boissons' : 'plats, grillades et boissons'} dans « Menu & Stock ».
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
            {visibleMenus.map((item) => {
              const inCart = cart.find((c) => c.menu_id === item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={item.est_epuise || readOnly}
                  onClick={() => addItem(item)}
                  className={`group text-left rounded-2xl border bg-white overflow-hidden transition-all active:scale-[0.98] flex sm:flex-col justify-between min-h-[92px] ${
                    item.est_epuise
                      ? 'border-stone-200 opacity-55 cursor-not-allowed'
                      : inCart
                      ? 'border-emerald-700 ring-2 ring-emerald-700/20'
                      : 'border-stone-200 hover:border-stone-300'
                  }`}
                >
                  <div className="w-28 sm:w-full sm:aspect-[4/3] bg-stone-100 relative overflow-hidden shrink-0">
                    {item.photo_url ? (
                      <img
                        src={item.photo_url}
                        alt={item.nom}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-stone-100 to-stone-200 text-stone-500">
                        <UtensilsCrossed className="w-8 h-8" />
                      </div>
                    )}
                    {inCart && (
                      <span className="absolute top-2 right-2 rounded-lg bg-[#0E8A55] px-2.5 py-1 font-mono text-xs font-bold text-white shadow">
                        ×{inCart.quantite}
                      </span>
                    )}
                    {item.est_epuise && (
                      <div className="absolute inset-0 bg-black/55 flex items-center justify-center p-2 text-center">
                        <span className="font-display text-xs sm:text-sm font-bold text-white tracking-wide">
                          ÉPUISÉ
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="p-3.5 space-y-1 flex-1 flex flex-col justify-center">
                    <div className="text-[11px] font-medium text-stone-500">
                      <span className="capitalize">{item.categorie}</span>
                      {item.est_plat_du_jour && (
                        <>
                          <span aria-hidden="true"> · </span>
                          <span className="font-semibold text-amber-700">Plat du Jour</span>
                        </>
                      )}
                    </div>
                    <h3 className="font-display text-base font-bold text-[#161614] leading-snug line-clamp-2">
                      {item.nom}
                    </h3>
                    <p className="font-mono text-base sm:text-lg font-extrabold text-[#0E8A55] tabular-nums pt-0.5">
                      {formatFCFA(item.prix)}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Right: Ticket builder & Send to Cashier (always right column on tablet md+ & desktop) */}
      <aside className="md:col-span-5 lg:col-span-4 rounded-2xl border border-stone-200 bg-white p-4 sm:p-5 space-y-4 md:sticky md:top-4">
        <div className="flex items-center justify-between border-b border-stone-100 pb-3">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-[#0E8A55]" />
            <h2 className="font-display text-lg font-bold text-[#161614]">Ticket en cours</h2>
          </div>
          <span className="font-mono text-xs font-semibold text-stone-600 tabular-nums">
            {totalQty} article(s)
          </span>
        </div>

        {/* Service Destination Selector */}
        <div className="space-y-2.5">
          <label className="block text-xs font-semibold text-stone-700">Destination de la commande</label>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                'Table',
                'Terrasse',
                'A Emporter',
                ...(isPremium ? (['Chambre'] as const) : []),
              ] as const
            ).map((dest) => (
              <button
                key={dest}
                type="button"
                onClick={() => setTypeService(dest)}
                className={`rounded-xl border px-3 py-2.5 text-xs font-semibold transition-colors min-h-[48px] flex items-center justify-center gap-1.5 ${
                  typeService === dest
                    ? 'border-emerald-700 bg-emerald-50 text-emerald-900'
                    : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
                }`}
              >
                {dest === 'Chambre' && <BedDouble className="w-3.5 h-3.5" />}
                {dest === 'A Emporter' ? 'À Emporter' : dest}
              </button>
            ))}
          </div>

          {(typeService === 'Table' || typeService === 'Terrasse') && (
            <select
              value={tableNum}
              onChange={(e) => setTableNum(e.target.value)}
              className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm font-semibold min-h-[48px]"
            >
              {tablesArray.map((n) => (
                <option key={n} value={n}>
                  {typeService} N° {n}
                </option>
              ))}
            </select>
          )}

          {typeService === 'A Emporter' && (
            <input
              type="text"
              value={clientNom}
              onChange={(e) => setClientNom(e.target.value)}
              placeholder="Nom du client (optionnel)"
              className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm min-h-[48px]"
            />
          )}

          {typeService === 'Chambre' && isPremium && (
            <select
              value={selectedSejourId}
              onChange={(e) => setSelectedSejourId(e.target.value)}
              className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm font-semibold min-h-[48px]"
            >
              <option value="">-- Choisir une chambre occupée --</option>
              {occupiedRooms.map(({sejour}) => (
                <option key={sejour.id} value={sejour.id}>
                  Chambre {sejour.chambre_numero} · {sejour.client_nom}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Cart Items */}
        <div className="divide-y divide-stone-100 max-h-72 overflow-y-auto">
          {cart.length === 0 ? (
            <p className="py-8 text-center text-xs text-stone-400">
              Aucun article sélectionné pour le moment.
            </p>
          ) : (
            cart.map((item) => (
              <div key={item.menu_id} className="py-2.5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#161614] truncate">{item.nom}</p>
                  <p className="font-mono text-xs text-stone-500 tabular-nums">
                    {formatFCFA(item.prix)} × {item.quantite}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => updateQty(item.menu_id, -1)}
                    className="w-11 h-11 rounded-xl border border-stone-200 flex items-center justify-center hover:bg-stone-100"
                    aria-label="Diminuer"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="w-6 text-center font-mono text-sm font-bold tabular-nums">
                    {item.quantite}
                  </span>
                  <button
                    type="button"
                    onClick={() => updateQty(item.menu_id, 1)}
                    className="w-11 h-11 rounded-xl border border-stone-200 flex items-center justify-center hover:bg-stone-100"
                    aria-label="Augmenter"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note cuisine/bar (ex : bien pimenté, sans glace)"
          className="w-full rounded-xl border border-stone-200 bg-[#FAF9F6] px-3.5 py-2.5 text-xs min-h-[44px]"
        />

        <div className="border-t border-stone-200 pt-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-stone-600">Total Commande</span>
          <span className="font-mono text-2xl font-extrabold text-[#161614] tabular-nums">
            {formatFCFA(totalAmount)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {cart.length > 0 && (
            <button
              type="button"
              onClick={() => setCart([])}
              className="rounded-xl border border-stone-300 px-3.5 text-stone-600 hover:bg-stone-50 min-h-[52px] flex items-center justify-center"
              aria-label="Vider le panier"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          )}
          <button
            type="button"
            disabled={sending || cart.length === 0 || readOnly}
            onClick={handleSendToCashier}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[#0E8A55] px-4 py-3.5 text-sm font-bold text-white hover:bg-[#0B7145] disabled:opacity-50 min-h-[52px]"
          >
            <Send className="w-4 h-4 shrink-0" />
            <span>{sending ? 'Envoi...' : 'ENVOYER À LA CAISSE'}</span>
          </button>
        </div>
      </aside>
    </div>
  );
};

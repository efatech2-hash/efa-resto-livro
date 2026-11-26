import React, {useMemo, useState} from 'react';
import {
  AlertTriangle,
  Copy,
  CreditCard,
  PackagePlus,
  Plus,
  Sparkles,
  Users,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import {
  formatDateTime,
  formatFCFA,
  PHOTO_PRESETS,
  ROLE_LABELS,
  type Approvisionnement,
  type CycleAbonnement,
  type Employe,
  type Etablissement,
  type Formule,
  type FormuleId,
  type MenuItem,
  type RecetteIngredient,
  type StockItem,
  type ZoneLivraison,
} from '../types/efa';

interface MenuStockViewProps {
  etab: Etablissement;
  formuleObj: Formule;
  formules: Formule[];
  menus: MenuItem[];
  stock: StockItem[];
  approvisionnements: Approvisionnement[];
  employes: Employe[];
  operatorName: string;
  readOnly: boolean;
  onCreateMenu: (m: Omit<MenuItem, 'id' | 'created_at' | 'actif'>) => Promise<{ok: boolean; error?: string}>;
  onToggleMenuFlag: (id: string, field: 'est_plat_du_jour' | 'est_epuise', val: boolean) => Promise<void>;
  onCreateStock: (s: Omit<StockItem, 'id' | 'updated_at'>) => Promise<{ok: boolean; error?: string}>;
  onApprovisionner: (a: Omit<Approvisionnement, 'id' | 'created_at'>) => Promise<{ok: boolean; error?: string}>;
  onCreateEmploye: (e: Omit<Employe, 'id' | 'created_at' | 'profil_id' | 'actif'>) => Promise<{ok: boolean; error?: string}>;
  onUpdateEtabConfig: (patch: Partial<Etablissement>) => Promise<{ok: boolean; error?: string}>;
  onPayAbonnement: (params: {
    formule: FormuleId;
    cycle: CycleAbonnement;
    mode: 'Flooz' | 'Moov Money' | 'Orange Money' | 'Wave';
    reference: string;
  }) => Promise<{ok: boolean; error?: string}>;
}

export const MenuStockView: React.FC<MenuStockViewProps> = ({
  etab,
  formuleObj,
  formules,
  menus,
  stock,
  approvisionnements,
  employes,
  operatorName,
  readOnly,
  onCreateMenu,
  onToggleMenuFlag,
  onCreateStock,
  onApprovisionner,
  onCreateEmploye,
  onUpdateEtabConfig,
  onPayAbonnement,
}) => {
  const isBarOnly = etab.formule === 'bar';
  const [subTab, setSubTab] = useState<'menu' | 'stock' | 'equipe' | 'abonnement'>('menu');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  // Menu form
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [mNom, setMNom] = useState('');
  const [mCat, setMCat] = useState<'boisson' | 'plat' | 'grillade'>('boisson');
  const [mPrix, setMPrix] = useState(1500);
  const [mCout, setMCout] = useState(700);
  const [mPhoto, setMPhoto] = useState(PHOTO_PRESETS[3].url);
  const [mRecette, setMRecette] = useState<RecetteIngredient[]>([]);

  // Stock form
  const [showNewStock, setShowNewStock] = useState(false);
  const [sNom, setSNom] = useState('');
  const [sCat, setSCat] = useState<StockItem['categorie']>(isBarOnly ? 'boisson' : 'cuisine');
  const [sUnite, setSUnite] = useState('bouteille');
  const [sQty, setSQty] = useState(24);
  const [sSeuil, setSSeuil] = useState(5);
  const [sPrixAchat, setSPrixAchat] = useState(500);

  // Approvisionnement modal
  const [approStock, setApproStock] = useState<StockItem | null>(null);
  const [approQty, setApproQty] = useState(10);
  const [approPrixUnit, setApproPrixUnit] = useState(500);
  const [approFournisseur, setApproFournisseur] = useState('');

  // Employe form
  const [showNewEmp, setShowNewEmp] = useState(false);
  const [eNom, setENom] = useState('');
  const [eTel, setETel] = useState('');
  const [eRole, setERole] = useState<Employe['role']>('serveur');
  const [ePin, setEPin] = useState('1234');

  // Tables & Delivery zones
  const [nbTablesDraft, setNbTablesDraft] = useState(etab.nb_tables);
  const [zonesDraft, setZonesDraft] = useState<ZoneLivraison[]>(etab.zones_livraison || []);
  const [newQuartier, setNewQuartier] = useState('');
  const [newFrais, setNewFrais] = useState(500);

  // Abonnement payment
  const [subFormule, setSubFormule] = useState<FormuleId>(etab.formule);
  const [subCycle, setSubCycle] = useState<CycleAbonnement>('mensuel');
  const [subMode, setSubMode] = useState<'Flooz' | 'Moov Money' | 'Orange Money' | 'Wave'>('Flooz');
  const [subRef, setSubRef] = useState('');
  const [payingSub, setPayingSub] = useState(false);

  const lowStockItems = useMemo(
    () => stock.filter((s) => Number(s.quantite) <= Number(s.seuil_alerte)),
    [stock]
  );

  const handleAddMenu = async (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) return;
    const res = await onCreateMenu({
      etablissement_id: etab.id,
      nom: mNom.trim(),
      categorie: isBarOnly ? 'boisson' : mCat,
      prix: mPrix,
      cout_revient: mCout,
      photo_url: mPhoto || null,
      est_plat_du_jour: false,
      est_epuise: false,
      recette: mRecette,
    });
    if (!res.ok) {
      setFeedback(res.error || 'Erreur ajout produit');
      return;
    }
    setShowNewMenu(false);
    setMNom('');
    setMRecette([]);
    setFeedback(`Produit « ${mNom} » ajouté au menu.`);
  };

  const handleAddStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) return;
    const res = await onCreateStock({
      etablissement_id: etab.id,
      nom: sNom.trim(),
      categorie: sCat,
      unite: sUnite.trim(),
      quantite: sQty,
      seuil_alerte: sSeuil,
      prix_achat_unitaire: sPrixAchat,
    });
    if (!res.ok) {
      setFeedback(res.error || 'Erreur ajout stock');
      return;
    }
    setShowNewStock(false);
    setSNom('');
    setFeedback(`Article de stock « ${sNom} » enregistré.`);
  };

  const handleConfirmAppro = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!approStock || readOnly) return;
    const res = await onApprovisionner({
      etablissement_id: etab.id,
      stock_id: approStock.id,
      quantite: approQty,
      prix_achat_unitaire: approPrixUnit,
      montant_total: Math.round(approQty * approPrixUnit),
      fournisseur: approFournisseur.trim() || null,
      note: null,
      cree_par: operatorName,
    });
    if (!res.ok) {
      setFeedback(res.error || 'Erreur approvisionnement');
      return;
    }
    setFeedback(`Approvisionnement +${approQty} ${approStock.unite} de ${approStock.nom} enregistré.`);
    setApproStock(null);
  };

  const handleAddEmploye = async (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) return;
    const res = await onCreateEmploye({
      etablissement_id: etab.id,
      nom: eNom.trim(),
      telephone: eTel.trim() || null,
      email: null,
      role: eRole,
      pin_code: ePin.trim() || '1234',
    });
    if (!res.ok) {
      setFeedback(res.error || 'Erreur ajout employé');
      return;
    }
    setShowNewEmp(false);
    setENom('');
    setETel('');
    setFeedback(`Employé « ${eNom} » ajouté (PIN : ${ePin}).`);
  };

  const handlePaySub = async (e: React.FormEvent) => {
    e.preventDefault();
    setPayingSub(true);
    const res = await onPayAbonnement({
      formule: subFormule,
      cycle: subCycle,
      mode: subMode,
      reference: subRef.trim() || `MM-${Date.now().toString().slice(-6)}`,
    });
    setPayingSub(false);
    if (!res.ok) {
      setFeedback(res.error || 'Erreur paiement abonnement');
      return;
    }
    setSubRef('');
    setFeedback(`Abonnement ${subFormule.toUpperCase()} activé ! Toutes les limites sont débloquées.`);
  };

  const targetFormule = formules.find((f) => f.id === subFormule);
  const subPrice =
    subCycle === 'mensuel' ? targetFormule?.prix_mensuel || 0 : targetFormule?.prix_annuel || 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#161614]">
            Administration · {etab.nom}
          </h1>
          <p className="text-xs text-stone-500">
            Code d’accès équipe : <strong className="font-mono text-[#161614]">{etab.code_etablissement}</strong> ·{' '}
            Formule <strong className="uppercase">{etab.formule}</strong>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 rounded-xl bg-stone-100 p-1">
          {[
            {id: 'menu', label: `Menu (${menus.length}${formuleObj.max_produits ? `/${formuleObj.max_produits}` : ''})`},
            {id: 'stock', label: `Stock (${stock.length})`},
            {id: 'equipe', label: `Équipe & Config (${employes.length}/${formuleObj.max_employes})`},
            {id: 'abonnement', label: 'Abonnement & Upgrade'},
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSubTab(t.id as typeof subTab)}
              className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                subTab === t.id ? 'bg-white text-[#161614] shadow-sm' : 'text-stone-600'
              }`}
            >
              {t.label}
            </button>
          ))}
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

      {/* TAB 1: MENU */}
      {subTab === 'menu' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-stone-600">
              {isBarOnly
                ? 'Formule BAR : Boissons uniquement (max 30 produits).'
                : `Plats, Grillades et Boissons · Recettes liées au stock pour déduction automatique.`}
            </p>
            {!readOnly && (
              <button
                type="button"
                disabled={formuleObj.max_produits !== null && menus.length >= formuleObj.max_produits}
                onClick={() => setShowNewMenu(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#0E8A55] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#0B7145] disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                Ajouter au Menu
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {menus.map((m) => (
              <div key={m.id} className="rounded-2xl border border-stone-200 bg-white overflow-hidden flex flex-col justify-between">
                <div className="flex gap-3 p-4">
                  <div className="w-20 h-20 rounded-xl bg-stone-100 overflow-hidden shrink-0">
                    {m.photo_url ? (
                      <img src={m.photo_url} alt={m.nom} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-stone-400">
                        <UtensilsCrossed className="w-6 h-6" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-[11px] font-medium text-stone-500 capitalize">{m.categorie}</span>
                    <h3 className="font-display font-bold text-base text-[#161614] truncate">{m.nom}</h3>
                    <div className="mt-1 flex items-center gap-3 font-mono text-xs tabular-nums">
                      <span className="font-bold text-[#0E8A55]">{formatFCFA(m.prix)}</span>
                      <span className="text-stone-400">Coût : {formatFCFA(m.cout_revient)}</span>
                    </div>
                    {m.recette?.length > 0 && (
                      <p className="mt-1 text-[11px] text-stone-500 truncate">
                        Recette : {m.recette.map((r) => `${r.quantite} ${r.nom}`).join(', ')}
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 border-t border-stone-100 p-3 bg-[#FAF9F6]">
                  {!isBarOnly && (
                    <button
                      type="button"
                      disabled={readOnly}
                      onClick={() => onToggleMenuFlag(m.id, 'est_plat_du_jour', !m.est_plat_du_jour)}
                      className={`rounded-lg py-2 text-xs font-semibold border transition-colors ${
                        m.est_plat_du_jour
                          ? 'border-amber-600 bg-amber-50 text-amber-900'
                          : 'border-stone-200 bg-white text-stone-600'
                      }`}
                    >
                      {m.est_plat_du_jour ? '★ Plat du Jour' : 'Plat du Jour'}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={readOnly}
                    onClick={() => onToggleMenuFlag(m.id, 'est_epuise', !m.est_epuise)}
                    className={`${isBarOnly ? 'col-span-2' : ''} rounded-lg py-2 text-xs font-semibold border transition-colors ${
                      m.est_epuise
                        ? 'border-red-600 bg-red-50 text-red-800'
                        : 'border-stone-200 bg-white text-stone-600'
                    }`}
                  >
                    {m.est_epuise ? 'Épuisé (Réactiver)' : 'Marquer Plat Fini'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: STOCK & APPROVISIONNEMENTS */}
      {subTab === 'stock' && (
        <div className="space-y-5">
          {lowStockItems.length > 0 && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-bold text-amber-900">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  Alerte stock bas ({lowStockItems.length}) :{' '}
                  {lowStockItems.map((s) => `${s.nom} (${s.quantite} ${s.unite})`).join(', ')}
                </span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-[#161614]">Inventaire Stock en direct</h2>
            {!readOnly && (
              <button
                type="button"
                onClick={() => setShowNewStock(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#0E8A55] px-4 py-2 text-xs font-bold text-white"
              >
                <Plus className="w-4 h-4" />
                Nouvel ingrédient / boisson
              </button>
            )}
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#FAF9F6] border-b border-stone-200 text-xs font-semibold text-stone-600">
                  <tr>
                    <th className="px-4 py-3">Produit / Ingrédient</th>
                    <th className="px-4 py-3">Catégorie</th>
                    <th className="px-4 py-3 text-right">Stock actuel</th>
                    <th className="px-4 py-3 text-right">Seuil alerte</th>
                    <th className="px-4 py-3 text-right">Dernier prix achat</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {stock.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-xs text-stone-500">
                        Aucun article en stock. Ajoutez vos ingrédients (Riz, Poulet, Tomate, Huile, Boissons).
                      </td>
                    </tr>
                  ) : (
                    stock.map((s) => {
                      const isLow = Number(s.quantite) <= Number(s.seuil_alerte);
                      return (
                        <tr key={s.id}>
                          <td className="px-4 py-3 font-semibold text-[#161614]">{s.nom}</td>
                          <td className="px-4 py-3 text-xs capitalize text-stone-500">{s.categorie}</td>
                          <td
                            className={`px-4 py-3 text-right font-mono font-bold tabular-nums ${
                              isLow ? 'text-red-700' : 'text-emerald-800'
                            }`}
                          >
                            {s.quantite} {s.unite} {isLow && '· BAS'}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-xs text-stone-500 tabular-nums">
                            {s.seuil_alerte} {s.unite}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-xs tabular-nums">
                            {formatFCFA(s.prix_achat_unitaire)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              disabled={readOnly}
                              onClick={() => {
                                setApproStock(s);
                                setApproPrixUnit(s.prix_achat_unitaire);
                              }}
                              className="inline-flex items-center gap-1 rounded-lg bg-[#161614] px-3 py-1.5 text-xs font-semibold text-white hover:bg-stone-800"
                            >
                              <PackagePlus className="w-3.5 h-3.5" />
                              Approvisionner
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {approvisionnements.length > 0 && (
            <div className="rounded-2xl border border-stone-200 bg-white p-5">
              <h3 className="font-display text-base font-bold text-[#161614] mb-3">
                Derniers approvisionnements
              </h3>
              <div className="space-y-2 text-xs">
                {approvisionnements.slice(0, 8).map((a) => {
                  const st = stock.find((s) => s.id === a.stock_id);
                  return (
                    <div key={a.id} className="flex items-center justify-between border-b border-stone-100 pb-2">
                      <span>
                        <strong>{st?.nom || 'Article'}</strong> (+{a.quantite} {st?.unite || ''}) ·{' '}
                        {a.fournisseur || 'Fournisseur'} · {formatDateTime(a.created_at)}
                      </span>
                      <span className="font-mono font-bold tabular-nums">{formatFCFA(a.montant_total)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: ÉQUIPE, TABLES & ZONES LIVRAISON */}
      {subTab === 'equipe' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-lg font-bold text-[#161614]">
                  Employés ({employes.length} / {formuleObj.max_employes})
                </h2>
                <p className="text-xs text-stone-500">
                  Chaque employé dispose d’un PIN pour changer de poste rapidement sur la caisse/tablette.
                </p>
              </div>
              {!readOnly && (
                <button
                  type="button"
                  disabled={employes.length >= formuleObj.max_employes}
                  onClick={() => setShowNewEmp(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#0E8A55] px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                >
                  <Users className="w-4 h-4" />
                  Ajouter Employé
                </button>
              )}
            </div>

            <div className="rounded-2xl border border-stone-200 bg-white divide-y divide-stone-100">
              {employes.map((emp) => (
                <div key={emp.id} className="p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-semibold text-sm text-[#161614]">{emp.nom}</p>
                    <p className="text-xs text-stone-500">
                      {ROLE_LABELS[emp.role]} · {emp.telephone || 'Sans téléphone'}
                    </p>
                  </div>
                  <div className="font-mono text-xs bg-stone-100 rounded-lg px-2.5 py-1 text-stone-700">
                    PIN : {emp.pin_code}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-5 space-y-4">
            {/* Code Établissement */}
            <div className="rounded-2xl border border-stone-200 bg-white p-5 space-y-2">
              <h3 className="font-display text-base font-bold text-[#161614]">Code d’invitation Équipe</h3>
              <p className="text-xs text-stone-500">
                Partagez ce code à vos serveurs, cuisiniers ou livreurs pour qu’ils connectent leur téléphone.
              </p>
              <div className="flex items-center justify-between rounded-xl bg-[#FAF9F6] border border-stone-200 px-3.5 py-2.5">
                <span className="font-mono text-base font-extrabold text-[#0E8A55]">{etab.code_etablissement}</span>
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(etab.code_etablissement);
                    setCopiedCode(true);
                    setTimeout(() => setCopiedCode(false), 2000);
                  }}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-stone-700"
                >
                  <Copy className="w-3.5 h-3.5" />
                  {copiedCode ? 'Copié' : 'Copier'}
                </button>
              </div>
            </div>

            {/* Nombre de Tables */}
            <div className="rounded-2xl border border-stone-200 bg-white p-5 space-y-3">
              <h3 className="font-display text-base font-bold text-[#161614]">
                Nombre de Tables ({formuleObj.max_tables ? `max ${formuleObj.max_tables}` : 'Illimité'})
              </h3>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={formuleObj.max_tables || 200}
                  value={nbTablesDraft}
                  onChange={(e) => setNbTablesDraft(Number(e.target.value))}
                  className="flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm font-mono"
                />
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={async () => {
                    const res = await onUpdateEtabConfig({nb_tables: nbTablesDraft});
                    setFeedback(res.ok ? 'Nombre de tables mis à jour.' : res.error || 'Erreur');
                  }}
                  className="rounded-lg bg-[#161614] px-4 py-2 text-xs font-semibold text-white"
                >
                  Enregistrer
                </button>
              </div>
            </div>

            {/* Zones de livraison */}
            {!isBarOnly && (
              <div className="rounded-2xl border border-stone-200 bg-white p-5 space-y-3">
                <h3 className="font-display text-base font-bold text-[#161614]">Frais de livraison par quartier</h3>
                <div className="space-y-1.5 text-xs">
                  {zonesDraft.map((z, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-[#FAF9F6] rounded-lg px-3 py-1.5">
                      <span className="font-medium">{z.quartier}</span>
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-bold tabular-nums">{formatFCFA(z.frais)}</span>
                        <button
                          type="button"
                          onClick={() => setZonesDraft((prev) => prev.filter((_, i) => i !== idx))}
                          className="text-red-600 hover:underline"
                        >
                          Suppr.
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-5 gap-2">
                  <input
                    type="text"
                    value={newQuartier}
                    onChange={(e) => setNewQuartier(e.target.value)}
                    placeholder="Quartier"
                    className="col-span-3 rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs"
                  />
                  <input
                    type="number"
                    value={newFrais}
                    onChange={(e) => setNewFrais(Number(e.target.value))}
                    placeholder="Frais"
                    className="col-span-2 rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs font-mono"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (!newQuartier.trim()) return;
                      setZonesDraft((prev) => [...prev, {quartier: newQuartier.trim(), frais: newFrais}]);
                      setNewQuartier('');
                    }}
                    className="flex-1 rounded-lg border border-stone-300 py-2 text-xs font-semibold"
                  >
                    + Ajouter quartier
                  </button>
                  <button
                    type="button"
                    disabled={readOnly}
                    onClick={async () => {
                      const res = await onUpdateEtabConfig({zones_livraison: zonesDraft});
                      setFeedback(res.ok ? 'Zones de livraison enregistrées.' : res.error || 'Erreur');
                    }}
                    className="rounded-lg bg-[#0E8A55] px-4 py-2 text-xs font-bold text-white"
                  >
                    Sauver
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: ABONNEMENT & UPGRADE */}
      {subTab === 'abonnement' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {formules.map((f) => {
              const isCurrent = etab.formule === f.id;
              const isChosen = subFormule === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setSubFormule(f.id)}
                  className={`text-left rounded-2xl border p-5 transition-all flex flex-col justify-between ${
                    isChosen
                      ? 'border-emerald-700 bg-white ring-2 ring-emerald-700/20'
                      : 'border-stone-200 bg-white hover:border-stone-300'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-display font-bold text-base text-[#161614]">{f.nom}</span>
                      {isCurrent && <span className="text-[11px] font-bold text-emerald-800">Actuelle</span>}
                    </div>
                    <p className="mt-1 text-xs text-stone-500">{f.description}</p>
                    <p className="mt-3 font-mono text-xl font-extrabold text-[#161614] tabular-nums">
                      {formatFCFA(f.prix_mensuel)}
                      <span className="text-xs font-sans font-normal text-stone-500">/mois</span>
                    </p>
                    <p className="font-mono text-xs text-emerald-800 tabular-nums">
                      {formatFCFA(f.prix_annuel)}/an
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-stone-100 text-[11px] text-stone-600 space-y-1">
                    <p>{f.max_employes} employés · {f.max_appareils} appareils</p>
                    <p>{f.max_tables ? `${f.max_tables} tables` : 'Tables illimitées'}</p>
                    <p>{f.max_produits ? `${f.max_produits} produits` : 'Produits illimités'}</p>
                    <p>{f.max_chambres > 0 ? `Hôtel ${f.max_chambres} chambres` : 'Sans hôtel'}</p>
                  </div>
                </button>
              );
            })}
          </div>

          <form
            onSubmit={handlePaySub}
            className="lg:col-span-5 rounded-2xl border border-stone-200 bg-white p-6 space-y-4"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#0E8A55]" />
              <h3 className="font-display text-lg font-bold text-[#161614]">
                Payer / Upgrader immédiatement
              </h3>
            </div>
            <p className="text-xs text-stone-500">
              Statut actuel : <strong className="uppercase">{etab.statut_abonnement}</strong> · Essai jusqu’au{' '}
              <span className="font-mono">{formatDateTime(etab.essai_fin)}</span>
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSubCycle('mensuel')}
                className={`rounded-xl border py-2.5 text-xs font-semibold ${
                  subCycle === 'mensuel' ? 'border-emerald-700 bg-emerald-50 text-emerald-900' : 'border-stone-200'
                }`}
              >
                Mensuel (30 jours)
              </button>
              <button
                type="button"
                onClick={() => setSubCycle('annuel')}
                className={`rounded-xl border py-2.5 text-xs font-semibold ${
                  subCycle === 'annuel' ? 'border-emerald-700 bg-emerald-50 text-emerald-900' : 'border-stone-200'
                }`}
              >
                Annuel (2 mois offerts)
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(['Flooz', 'Moov Money', 'Orange Money', 'Wave'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setSubMode(m)}
                  className={`rounded-xl border py-2.5 text-xs font-semibold ${
                    subMode === m ? 'border-emerald-700 bg-emerald-50 text-emerald-900' : 'border-stone-200'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Référence transaction Mobile Money *
              </label>
              <input
                type="text"
                required
                value={subRef}
                onChange={(e) => setSubRef(e.target.value)}
                placeholder="Ex : TXN-2026-8841"
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm font-mono"
              />
            </div>
            <div className="rounded-xl bg-[#FAF9F6] border border-stone-200 p-3.5 flex items-center justify-between">
              <span className="text-xs font-semibold text-stone-600">Total à régler ({subFormule.toUpperCase()})</span>
              <span className="font-mono text-xl font-extrabold text-[#0E8A55] tabular-nums">
                {formatFCFA(subPrice)}
              </span>
            </div>
            <button
              type="submit"
              disabled={payingSub}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#0E8A55] py-3.5 text-sm font-bold text-white hover:bg-[#0B7145]"
            >
              <CreditCard className="w-4 h-4" />
              {payingSub ? 'Activation...' : 'Confirmer & Débloquer la formule'}
            </button>
          </form>
        </div>
      )}

      {/* Modal Nouveau Produit Menu */}
      {showNewMenu && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <form
            onSubmit={handleAddMenu}
            className="w-full max-w-lg rounded-2xl border border-stone-200 bg-white p-6 space-y-4 shadow-xl my-8"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold">Ajouter un produit au menu</h3>
              <button type="button" onClick={() => setShowNewMenu(false)}>
                <X className="w-5 h-5 text-stone-400" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs font-semibold text-stone-700 mb-1">Nom *</label>
                <input
                  type="text"
                  required
                  value={mNom}
                  onChange={(e) => setMNom(e.target.value)}
                  placeholder="Ex : Poulet Braisé + Alloco"
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs font-semibold text-stone-700 mb-1">Catégorie</label>
                <select
                  value={isBarOnly ? 'boisson' : mCat}
                  disabled={isBarOnly}
                  onChange={(e) => setMCat(e.target.value as typeof mCat)}
                  className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="boisson">Boisson</option>
                  {!isBarOnly && (
                    <>
                      <option value="plat">Plat</option>
                      <option value="grillade">Grillade</option>
                    </>
                  )}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Prix de vente (F)</label>
                <input
                  type="number"
                  required
                  min={0}
                  value={mPrix}
                  onChange={(e) => setMPrix(Number(e.target.value))}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Coût revient (F)</label>
                <input
                  type="number"
                  min={0}
                  value={mCout}
                  onChange={(e) => setMCout(Number(e.target.value))}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">Photo rapide ou URL</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {PHOTO_PRESETS.slice(0, 4).map((p) => (
                  <button
                    key={p.url}
                    type="button"
                    onClick={() => setMPhoto(p.url)}
                    className={`rounded-lg border px-2 py-1 text-[11px] font-medium ${
                      mPhoto === p.url ? 'border-emerald-700 bg-emerald-50 text-emerald-900' : 'border-stone-200'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={mPhoto}
                onChange={(e) => setMPhoto(e.target.value)}
                className="w-full rounded-lg border border-stone-300 px-3 py-1.5 text-xs"
              />
            </div>

            {stock.length > 0 && (
              <div className="space-y-2 border-t border-stone-100 pt-3">
                <label className="block text-xs font-semibold text-stone-700">
                  Recette (déduction automatique du stock lors de la validation)
                </label>
                <div className="max-h-32 overflow-y-auto space-y-1.5">
                  {stock.map((s) => {
                    const existing = mRecette.find((r) => r.stock_id === s.id);
                    return (
                      <div key={s.id} className="flex items-center justify-between text-xs">
                        <span>
                          {s.nom} ({s.unite})
                        </span>
                        <input
                          type="number"
                          step="0.1"
                          min={0}
                          value={existing?.quantite || 0}
                          onChange={(e) => {
                            const qty = Number(e.target.value);
                            setMRecette((prev) => {
                              const filtered = prev.filter((r) => r.stock_id !== s.id);
                              if (qty > 0) return [...filtered, {stock_id: s.id, nom: s.nom, quantite: qty}];
                              return filtered;
                            });
                          }}
                          className="w-20 rounded border border-stone-300 px-2 py-1 text-right font-mono"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <button
              type="submit"
              className="w-full rounded-xl bg-[#0E8A55] py-3 text-sm font-bold text-white"
            >
              Enregistrer dans le Menu
            </button>
          </form>
        </div>
      )}

      {/* Modal Nouveau Stock */}
      {showNewStock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={handleAddStock}
            className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold">Nouvel article de stock</h3>
              <button type="button" onClick={() => setShowNewStock(false)}>
                <X className="w-5 h-5 text-stone-400" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-stone-700 mb-1">Nom *</label>
                <input
                  type="text"
                  required
                  value={sNom}
                  onChange={(e) => setSNom(e.target.value)}
                  placeholder="Ex : Riz parfumé, Poulet, Castel..."
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Catégorie</label>
                <select
                  value={sCat}
                  onChange={(e) => setSCat(e.target.value as StockItem['categorie'])}
                  className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="boisson">Boisson</option>
                  {!isBarOnly && <option value="cuisine">Cuisine</option>}
                  <option value="autre">Autre</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Unité *</label>
                <input
                  type="text"
                  required
                  value={sUnite}
                  onChange={(e) => setSUnite(e.target.value)}
                  placeholder="kg, L, bouteille, unité"
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Quantité initiale</label>
                <input
                  type="number"
                  step="0.1"
                  value={sQty}
                  onChange={(e) => setSQty(Number(e.target.value))}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Seuil alerte</label>
                <input
                  type="number"
                  step="0.1"
                  value={sSeuil}
                  onChange={(e) => setSSeuil(Number(e.target.value))}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm font-mono"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-stone-700 mb-1">Prix d’achat unitaire (F)</label>
                <input
                  type="number"
                  value={sPrixAchat}
                  onChange={(e) => setSPrixAchat(Number(e.target.value))}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm font-mono"
                />
              </div>
            </div>
            <button
              type="submit"
              className="w-full rounded-xl bg-[#0E8A55] py-3 text-sm font-bold text-white"
            >
              Créer l’article en stock
            </button>
          </form>
        </div>
      )}

      {/* Modal Approvisionnement */}
      {approStock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={handleConfirmAppro}
            className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold">Approvisionner · {approStock.nom}</h3>
              <button type="button" onClick={() => setApproStock(null)}>
                <X className="w-5 h-5 text-stone-400" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Quantité ajoutée ({approStock.unite})
              </label>
              <input
                type="number"
                step="0.1"
                min={0.1}
                required
                value={approQty}
                onChange={(e) => setApproQty(Number(e.target.value))}
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">Prix achat unitaire (F)</label>
              <input
                type="number"
                min={0}
                required
                value={approPrixUnit}
                onChange={(e) => setApproPrixUnit(Number(e.target.value))}
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">Fournisseur</label>
              <input
                type="text"
                value={approFournisseur}
                onChange={(e) => setApproFournisseur(e.target.value)}
                placeholder="Ex : Marché d’Adawlato / BB Lomé"
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-xl bg-[#0E8A55] py-3 text-sm font-bold text-white"
            >
              Valider (+{approQty} {approStock.unite})
            </button>
          </form>
        </div>
      )}

      {/* Modal Nouvel Employé */}
      {showNewEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={handleAddEmploye}
            className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold">Ajouter un employé</h3>
              <button type="button" onClick={() => setShowNewEmp(false)}>
                <X className="w-5 h-5 text-stone-400" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">Nom complet *</label>
              <input
                type="text"
                required
                value={eNom}
                onChange={(e) => setENom(e.target.value)}
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">Rôle</label>
              <select
                value={eRole}
                onChange={(e) => setERole(e.target.value as Employe['role'])}
                className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
              >
                <option value="serveur">Serveur / Serveuse</option>
                <option value="caissier">Caissier</option>
                {!isBarOnly && (
                  <>
                    <option value="cuisinier">Cuisinier / Barman</option>
                    <option value="livreur">Livreur</option>
                  </>
                )}
                {etab.formule === 'premium' && (
                  <>
                    <option value="receptionniste">Réceptionniste Hôtel</option>
                    <option value="menage">Femme de ménage</option>
                  </>
                )}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Téléphone</label>
                <input
                  type="tel"
                  value={eTel}
                  onChange={(e) => setETel(e.target.value)}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Code PIN (4 chiffres)</label>
                <input
                  type="text"
                  maxLength={6}
                  required
                  value={ePin}
                  onChange={(e) => setEPin(e.target.value)}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm font-mono"
                />
              </div>
            </div>
            <button
              type="submit"
              className="w-full rounded-xl bg-[#0E8A55] py-3 text-sm font-bold text-white"
            >
              Créer l’employé
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

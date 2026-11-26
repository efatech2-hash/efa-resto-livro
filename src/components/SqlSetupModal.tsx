import React, {useState} from 'react';
import {Check, Copy, Database, RefreshCw, X} from 'lucide-react';
import schemaSql from '../../supabase/schema.sql?raw';

interface SqlSetupModalProps {
  errorMessage?: string;
  onRetryConnection: () => Promise<void>;
  onClose?: () => void;
  closable?: boolean;
}

export const SqlSetupModal: React.FC<SqlSetupModalProps> = ({
  errorMessage,
  onRetryConnection,
  onClose,
  closable = false,
}) => {
  const [copied, setCopied] = useState(false);
  const [checking, setChecking] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(schemaSql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleVerify = async () => {
    setChecking(true);
    try {
      await onRetryConnection();
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-4xl rounded-2xl border border-stone-200 bg-white p-6 sm:p-8 shadow-sm">
        <div className="flex items-start justify-between gap-4 border-b border-stone-200 pb-5">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-800">
              <Database className="w-4 h-4" />
              <span>Initialisation Supabase Requise</span>
            </div>
            <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-[#161614]">
              Installer les tables EFA RESTO-LIVRO dans Supabase
            </h1>
            <p className="mt-1 text-sm text-stone-600">
              Votre projet Supabase est connecté, mais les 15 tables, politiques RLS et triggers n’ont pas encore été exécutés dans votre base de données.
            </p>
            {errorMessage && (
              <p className="mt-2 text-xs font-mono text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Détail Supabase : {errorMessage}
              </p>
            )}
          </div>
          {closable && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-stone-500 hover:bg-stone-100"
              aria-label="Fermer"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="rounded-xl border border-stone-200 bg-[#FAF9F6] p-4">
            <span className="font-mono text-xs font-semibold text-emerald-800">Étape 1</span>
            <p className="mt-1 font-semibold text-[#161614]">Copier le SQL complet</p>
            <p className="mt-1 text-xs text-stone-600">
              Cliquez sur « Copier le SQL » ci-dessous pour copier le script complet (tables, RLS, limites, Realtime).
            </p>
          </div>
          <div className="rounded-xl border border-stone-200 bg-[#FAF9F6] p-4">
            <span className="font-mono text-xs font-semibold text-emerald-800">Étape 2</span>
            <p className="mt-1 font-semibold text-[#161614]">Coller dans SQL Editor</p>
            <p className="mt-1 text-xs text-stone-600">
              Ouvrez votre tableau de bord Supabase → <strong>SQL Editor</strong> → New Query → Collez et cliquez <strong>Run</strong>.
            </p>
          </div>
          <div className="rounded-xl border border-stone-200 bg-[#FAF9F6] p-4">
            <span className="font-mono text-xs font-semibold text-emerald-800">Étape 3</span>
            <p className="mt-1 font-semibold text-[#161614]">Vérifier et démarrer</p>
            <p className="mt-1 text-xs text-stone-600">
              Revenez ici et cliquez sur « Vérifier la base Supabase » pour accéder immédiatement à EFA RESTO-LIVRO.
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs font-mono text-stone-500">
            Fichier : supabase/schema.sql ({schemaSql.split('\n').length} lignes)
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-[#161614] hover:bg-stone-50 min-h-[44px]"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-700" /> : <Copy className="w-4 h-4" />}
              {copied ? 'SQL copié !' : 'Copier le SQL'}
            </button>
            <button
              type="button"
              onClick={handleVerify}
              disabled={checking}
              className="inline-flex items-center gap-2 rounded-lg bg-[#0E8A55] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0B7145] disabled:opacity-60 min-h-[44px]"
            >
              <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
              {checking ? 'Vérification...' : 'Vérifier la base Supabase'}
            </button>
          </div>
        </div>

        <pre className="mt-4 max-h-72 overflow-auto rounded-xl border border-stone-200 bg-[#161614] p-4 text-xs font-mono text-stone-100 leading-relaxed">
          {schemaSql}
        </pre>
      </div>
    </div>
  );
};

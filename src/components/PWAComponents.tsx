import React, {useEffect, useState} from 'react';
import {Download, RefreshCw, Smartphone, WifiOff, X} from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{outcome: 'accepted' | 'dismissed'; platform: string}>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as {standalone?: boolean}).standalone === true;
    setIsInstalled(isStandalone);

    const ua = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(ua));

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = async (): Promise<'accepted' | 'dismissed' | 'manual'> => {
    if (!deferredPrompt) return 'manual';
    await deferredPrompt.prompt();
    const {outcome} = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return 'accepted';
    }
    return 'dismissed';
  };

  return {
    isInstallable: Boolean(deferredPrompt),
    isInstalled,
    isIOS,
    install,
  };
}

const ManualInstallModal: React.FC<{isIOS: boolean; onClose: () => void}> = ({isIOS, onClose}) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
    <div className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-6 shadow-xl space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <img
            src="/logo-emblem.png"
            alt="EFA RESTO-LIVRO"
            className="w-9 h-9 rounded-full object-contain border border-stone-200"
          />
          <h3 className="font-display text-lg font-bold text-[#161614]">Installer EFA RESTO-LIVRO</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100"
          aria-label="Fermer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      {isIOS ? (
        <ol className="text-sm text-stone-700 space-y-2 list-decimal pl-5 leading-relaxed">
          <li>
            Appuyez sur le bouton <strong>Partager</strong> (carré avec flèche vers le haut) dans Safari.
          </li>
          <li>
            Faites défiler et choisissez <strong>Sur l’écran d’accueil</strong>.
          </li>
          <li>
            Appuyez sur <strong>Ajouter</strong> en haut à droite.
          </li>
        </ol>
      ) : (
        <ol className="text-sm text-stone-700 space-y-2 list-decimal pl-5 leading-relaxed">
          <li>
            Ouvrez le menu <strong>⋮</strong> (en haut à droite de Chrome / Edge).
          </li>
          <li>
            Appuyez sur <strong>Installer l’application</strong> ou <strong>Ajouter à l’écran d’accueil</strong>.
          </li>
          <li>
            Confirmez pour lancer <strong>EFA</strong> en plein écran hors-ligne.
          </li>
        </ol>
      )}
      <button
        type="button"
        onClick={onClose}
        className="w-full rounded-xl bg-[#0E8A55] py-3 text-sm font-bold text-white hover:bg-[#0B7145] min-h-[48px]"
      >
        Compris
      </button>
    </div>
  </div>
);

export const PWAInstallBanner: React.FC = () => {
  const {isInstalled, isIOS, install} = usePWAInstall();
  const [dismissed, setDismissed] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled || dismissed) return null;

  const handleInstallClick = async () => {
    const res = await install();
    if (res === 'manual') {
      setShowGuide(true);
    }
  };

  return (
    <>
      <div className="bg-[#0E8A55] text-white px-3 sm:px-6 py-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <img
            src="/logo-emblem.png"
            alt="Logo EFA"
            className="w-7 h-7 rounded-full bg-white object-contain shrink-0"
          />
          <span className="text-xs sm:text-sm font-semibold truncate">
            Installer EFA sur votre téléphone
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleInstallClick}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white text-[#0E8A55] px-3.5 py-2 text-xs font-extrabold hover:bg-emerald-50 min-h-[40px] whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            INSTALLER
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 min-h-[40px] min-w-[40px] flex items-center justify-center"
            aria-label="Fermer la bannière"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      {showGuide && <ManualInstallModal isIOS={isIOS} onClose={() => setShowGuide(false)} />}
    </>
  );
};

export const PWAInstallHeroButton: React.FC = () => {
  const {isInstalled, isIOS, install} = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) return null;

  const handleClick = async () => {
    const res = await install();
    if (res === 'manual') {
      setShowGuide(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="w-full sm:w-auto inline-flex items-center justify-center gap-3 rounded-2xl bg-[#0E8A55] px-6 py-3.5 text-sm sm:text-base font-extrabold text-white shadow-sm hover:bg-[#0B7145] active:scale-[0.99] transition-all min-h-[52px]"
      >
        <Smartphone className="w-5 h-5 shrink-0" />
        <span>INSTALLER L’APPLICATION</span>
      </button>
      {showGuide && <ManualInstallModal isIOS={isIOS} onClose={() => setShowGuide(false)} />}
    </>
  );
};

export const PWAInstallButton: React.FC = () => {
  const {isInstalled, isIOS, install} = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) return null;

  const handleClick = async () => {
    const res = await install();
    if (res === 'manual') {
      setShowGuide(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-700/25 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-900 hover:bg-emerald-100 transition-colors whitespace-nowrap shrink-0 min-h-[44px]"
      >
        <Download className="w-4 h-4" />
        <span>Installer</span>
      </button>
      {showGuide && <ManualInstallModal isIOS={isIOS} onClose={() => setShowGuide(false)} />}
    </>
  );
};

export const SplashScreen: React.FC = () => (
  <div className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-between py-12 px-6">
    <div className="h-6" />
    <div className="flex flex-col items-center text-center space-y-5">
      <img
        src="/logo-efa-clean.png"
        alt="EFA RESTO-LIVRO"
        className="w-56 sm:w-64 h-auto object-contain"
      />
      <div className="flex items-center gap-2 text-xs font-medium text-stone-500">
        <RefreshCw className="w-4 h-4 text-[#0E8A55] animate-spin" />
        <span>Chargement de votre espace...</span>
      </div>
    </div>
    <p className="font-display text-lg font-extrabold tracking-widest text-[#161614]">
      EFA RESTO-LIVRO
    </p>
  </div>
);

interface OfflineSyncBarProps {
  isOnline: boolean;
  pendingCount: number;
  syncing: boolean;
  onSyncNow: () => void;
}

export const OfflineSyncBar: React.FC<OfflineSyncBarProps> = ({
  isOnline,
  pendingCount,
  syncing,
  onSyncNow,
}) => {
  if (isOnline && pendingCount === 0) return null;

  return (
    <div
      className={`border-b px-4 py-2.5 text-xs font-medium flex flex-wrap items-center justify-between gap-3 ${
        !isOnline
          ? 'bg-amber-50 border-amber-200 text-amber-900'
          : 'bg-emerald-50 border-emerald-200 text-emerald-900'
      }`}
    >
      <div className="flex items-center gap-2">
        <WifiOff className="w-4 h-4 shrink-0" />
        <span>
          {!isOnline
            ? `Mode hors-ligne actif · Les opérations sont sauvegardées localement (${pendingCount} en attente).`
            : `Connexion rétablie · ${pendingCount} opération(s) en attente de synchronisation vers Supabase.`}
        </span>
      </div>
      {isOnline && pendingCount > 0 && (
        <button
          type="button"
          onClick={onSyncNow}
          disabled={syncing}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-60 whitespace-nowrap shrink-0 min-h-[44px]"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Synchronisation...' : 'Synchroniser maintenant'}
        </button>
      )}
    </div>
  );
};

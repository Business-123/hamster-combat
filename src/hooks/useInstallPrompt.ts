import { useCallback, useEffect, useState } from 'react';

// Fired by Chrome/Edge/Android once the page meets installability criteria
// (manifest + registered service worker + HTTPS) and hasn't been installed
// yet. Not part of the standard DOM lib types, so declare just what we use.
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS Safari's own flag for "opened from the home screen" — it never
    // sets the standard display-mode media query.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const isIos = /iphone|ipad|ipod/i.test(ua);
  // iOS Chrome/Firefox are just Safari with a different chrome, and share
  // the same lack of beforeinstallprompt support and "Add to Home Screen"
  // flow, so no extra browser check is needed here beyond "is this iOS".
  return isIos;
}

// Wraps the native install flow (Chrome/Edge/Android's beforeinstallprompt)
// and reports when we're on iOS Safari instead, where there's no
// programmatic prompt — the player has to use Share > Add to Home Screen.
export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone());

  useEffect(() => {
    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    return outcome === 'accepted';
  }, [deferredPrompt]);

  return {
    // True once the browser has actually offered a native install prompt.
    canInstall: Boolean(deferredPrompt) && !installed,
    installed,
    // True on iOS Safari (pre-install, not already installed) — there's no
    // native prompt there, so callers should show manual instructions.
    isIos: isIosSafari() && !installed,
    promptInstall,
  };
}

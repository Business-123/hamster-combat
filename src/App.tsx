import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import { fetchState, tap as tapApi, claim as claimApi, fetchCharacters, initializeCharacterPurchase, confirmCharacterPurchase, GameState, Character } from './api';
import { isLoggedIn, restoreSession, logout as logoutApi } from './auth';
import BottomNav, { Tab } from './components/BottomNav';
import MineScreen, { DailyType } from './screens/MineScreen';
import CharacterScreen from './screens/CharacterScreen';
import FriendsScreen from './screens/FriendsScreen';
import EarnScreen from './screens/EarnScreen';
import AirdropScreen from './screens/AirdropScreen';
import AuthScreen from './screens/AuthScreen';
import BlockedScreen from './components/BlockedScreen';
import ProfileModal from './components/ProfileModal';
import { ensureAudioStarted, isMusicOn, playCoinSound, toggleMusic } from './sound';
import { formatGhs } from './utils/currency';

const App: React.FC = () => {
  const [state, setState] = useState<GameState | null>(null);
  // The admin-editable character roster (name/rank/price/image/gradient) —
  // fetched once here so the Mine screen can show the equipped character
  // correctly without duplicating that data in a hardcoded lookup table.
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clicks, setClicks] = useState<{ id: number, x: number, y: number }[]>([]);
  const [claimMessage, setClaimMessage] = useState<string | null>(null);
  // Mine tab's "🔒 Get a character to start earning" button: buys the
  // first/cheapest character for real money via the Payment Hub, instead of
  // sending the player to the Character tab to grind coins.
  const [unlocking, setUnlocking] = useState(false);
  const [unlockMessage, setUnlockMessage] = useState<string | null>(null);
  // If the Payment Hub is redirecting back here after a checkout, land on
  // the tab that can actually confirm it: ?taskId=... means a verified task
  // (Friends tab), ?characterId=... means the Mine-tab quick-unlock
  // purchase, a bare ?reference=... means a wallet top-up (Earn tab).
  const [tab, setTab] = useState<Tab>(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('taskId')) return 'friends';
    if (params.get('characterId')) return 'mine';
    if (params.get('reference')) return 'earn';
    return 'mine';
  });
  // Set only when the app was opened from a "reset your password" email
  // link (?resetToken=...) — routes straight to the "set new password" form
  // regardless of whether a session is already stored.
  const [resetToken] = useState<string | null>(() => new URLSearchParams(window.location.search).get('resetToken'));
  const [authChecked, setAuthChecked] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [musicOn, setMusicOn] = useState(isMusicOn());

  const pendingTaps = useRef(0);
  const flushTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadGame = () => {
    fetchState()
      .then(setState)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
    fetchCharacters()
      .then(({ characters: list }) => setCharacters(list))
      .catch(() => {});
  };

  // On first load: if there's a stored session, try to restore it silently.
  // Otherwise show the login/signup screen. An account is required to play —
  // there's no anonymous/guest mode.
  useEffect(() => {
    if (resetToken) {
      // A reset link always lands on the "set new password" form, even if
      // this browser also happens to have a session stored.
      setShowAuth(true);
      setAuthChecked(true);
      setLoading(false);
      return;
    }
    if (!isLoggedIn()) {
      setShowAuth(true);
      setAuthChecked(true);
      setLoading(false);
      return;
    }
    restoreSession()
      .then((session) => {
        if (session) {
          setEmail(session.email);
          setName(session.name || null);
          setState(session.state);
          loadGame();
        } else {
          setShowAuth(true);
          setLoading(false);
        }
      })
      .finally(() => setAuthChecked(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAuthenticated = ({
    email: authedEmail,
    name: authedName,
    state: authedState,
  }: {
    email: string;
    name: string;
    state: GameState;
  }) => {
    setEmail(authedEmail);
    setName(authedName || null);
    setState(authedState);
    setShowAuth(false);
    setLoading(false);
    loadGame();
  };

  const handleLogout = async () => {
    setProfileOpen(false);
    setLoading(true);
    await logoutApi();
    setEmail(null);
    setName(null);
    setState(null);
    setShowAuth(true);
    setLoading(false);
  };

  const handleGoToLogin = () => {
    setProfileOpen(false);
    setShowAuth(true);
  };

  // Flush any queued taps to the backend on an interval and reconcile with
  // the authoritative response (covers passive income accrued server-side).
  useEffect(() => {
    flushTimer.current = setInterval(async () => {
      const count = pendingTaps.current;
      if (count === 0) {
        // Even with no taps, periodically resync to pick up passive income / timers.
        try {
          const fresh = await fetchState();
          setState(fresh);
        } catch {
          // ignore transient errors
        }
        return;
      }
      pendingTaps.current = 0;
      try {
        const updated = await tapApi(count);
        setState(updated);
      } catch (err) {
        // If the server just blocked this account (tapping faster than
        // humanly possible), reflect that immediately and drop the queued
        // taps instead of retrying forever against a locked account.
        const blockedState = (err as { state?: GameState })?.state;
        if (blockedState?.blocked) {
          setState(blockedState);
          return;
        }
        // Otherwise a transient error — put the taps back so we retry next tick.
        pendingTaps.current += count;
      }
    }, 1500);
    return () => {
      if (flushTimer.current) clearInterval(flushTimer.current);
    };
  }, []);

  // Smooth local ticking between server syncs (passive income + optimistic tap display).
  useEffect(() => {
    if (!state) return;
    const pointsPerSecond = Math.floor(state.profitPerHour / 3600);
    if (pointsPerSecond <= 0) return;
    const interval = setInterval(() => {
      setState((prev) => (prev ? { ...prev, points: prev.points + pointsPerSecond } : prev));
    }, 1000);
    return () => clearInterval(interval);
  }, [state?.profitPerHour]);

  // Countdown re-render every minute so the daily timers stay fresh looking.
  const [, forceTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => forceTick((n) => n + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  const handleCardClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!state || state.blocked) return;
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    card.style.transform = `perspective(1000px) rotateX(${-y / 10}deg) rotateY(${x / 10}deg)`;
    setTimeout(() => {
      card.style.transform = '';
    }, 100);

    ensureAudioStarted();
    playCoinSound();

    pendingTaps.current += 1;
    setState((prev) => (prev ? { ...prev, points: prev.points + prev.pointsPerTap } : prev));
    setClicks((prev) => [...prev, { id: Date.now() + Math.random(), x: e.pageX, y: e.pageY }]);
  };

  const handleToggleMusic = () => {
    setMusicOn(toggleMusic());
  };

  const handleAnimationEnd = (id: number) => {
    setClicks((prevClicks) => prevClicks.filter(click => click.id !== id));
  };

  const handleClaim = async (type: DailyType) => {
    if (!state || !state.dailyClaimable[type]) return;
    try {
      const { bonus, state: updated } = await claimApi(type);
      setState(updated);
      setClaimMessage(`+${formatGhs(bonus, updated.pointsPerGhs)} from daily ${type}!`);
      setTimeout(() => setClaimMessage(null), 2500);
    } catch (err) {
      // Already claimed or a transient error — refresh to get accurate timers.
      fetchState().then(setState).catch(() => {});
    }
  };

  // Mine tab's lock button: pay for the first/cheapest character with real
  // money via the Payment Hub instead of grinding coins. Same hub-hosted
  // Paystack checkout pattern as the other payment flows.
  const handleQuickUnlock = async () => {
    if (unlocking || !characters.length) return;
    const target = characters.find((c) => !c.owned) ?? characters[0];
    if (!target || target.owned) return;
    if (!email) {
      setUnlockMessage('Sign in with an email to buy a character');
      setTimeout(() => setUnlockMessage(null), 2500);
      return;
    }
    setUnlocking(true);
    try {
      const { authorizationUrl, demo, state: updated } = await initializeCharacterPurchase(target.id, email);
      if (!authorizationUrl) {
        // DEMO mode: server granted the character immediately, no hub configured.
        if (updated) setState(updated);
        setCharacters((prev) => prev.map((c) => (c.id === target.id ? { ...c, owned: true } : c)));
        setUnlockMessage(demo ? `${target.name} joined your squad (demo payment)!` : `${target.name} joined your squad!`);
        setUnlocking(false);
        setTimeout(() => setUnlockMessage(null), 2500);
        return;
      }
      // Full-page redirect to the hub's Paystack checkout. It sends the user
      // back here (with ?characterId=...&reference=...&status=...) once paid.
      window.location.href = authorizationUrl;
    } catch (err) {
      setUnlockMessage(err instanceof Error ? err.message : 'Could not start this purchase');
      setUnlocking(false);
      setTimeout(() => setUnlockMessage(null), 2500);
    }
  };

  // After the Payment Hub redirects back here for a quick-unlock purchase,
  // the URL carries ?characterId=...&reference=...&status=... — confirm
  // server-side (which re-checks with the hub/Paystack) and grant it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const characterId = params.get('characterId');
    const reference = params.get('reference');
    if (!characterId || !reference) return;

    setUnlocking(true);
    confirmCharacterPurchase(characterId, reference)
      .then(({ alreadyProcessed, state: updated }) => {
        setState(updated);
        setCharacters((prev) => prev.map((c) => (c.id === characterId ? { ...c, owned: true } : c)));
        setUnlockMessage(alreadyProcessed ? 'This purchase was already processed.' : 'Payment confirmed — character added!');
      })
      .catch((err) => {
        setUnlockMessage(err instanceof Error ? err.message : 'Could not confirm payment yet — try again shortly.');
      })
      .finally(() => {
        setUnlocking(false);
        setTimeout(() => setUnlockMessage(null), 3500);
        params.delete('characterId');
        params.delete('reference');
        params.delete('status');
        const clean = `${window.location.pathname}${params.toString() ? `?${params}` : ''}`;
        window.history.replaceState({}, '', clean);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!authChecked) {
    return (
      <div className="bg-black flex justify-center items-center h-screen">
        <p className="text-white">Loading...</p>
      </div>
    );
  }

  if (showAuth) {
    return <AuthScreen onAuthenticated={handleAuthenticated} resetToken={resetToken} />;
  }

  if (loading) {
    return (
      <div className="bg-black flex justify-center items-center h-screen">
        <p className="text-white">Loading...</p>
      </div>
    );
  }

  if (error || !state) {
    return (
      <div className="bg-black flex justify-center items-center h-screen">
        <p className="text-white">Couldn't reach the game server{error ? `: ${error}` : ''}.</p>
      </div>
    );
  }

  if (state.blocked) {
    return <BlockedScreen state={state} onStateChange={setState} accountEmail={email} />;
  }

  return (
    <div className="bg-black flex justify-center">
      <div className="w-full bg-black text-white min-h-screen font-bold flex flex-col items-center max-w-xl mx-auto">
        {tab === 'mine' && (
          <MineScreen
            state={state}
            characters={characters}
            displayName={name}
            onCardClick={handleCardClick}
            clicks={clicks}
            onAnimationEnd={handleAnimationEnd}
            claimMessage={claimMessage || unlockMessage}
            onClaim={handleClaim}
            onQuickUnlock={handleQuickUnlock}
            unlocking={unlocking}
            onOpenSettings={() => setProfileOpen(true)}
            musicOn={musicOn}
            onToggleMusic={handleToggleMusic}
          />
        )}
        {tab === 'character' && <CharacterScreen state={state} onStateChange={setState} accountEmail={email} />}
        {tab === 'friends' && <FriendsScreen state={state} onStateChange={setState} accountEmail={email} />}
        {tab === 'earn' && <EarnScreen state={state} onStateChange={setState} accountEmail={email} />}
        {tab === 'airdrop' && <AirdropScreen state={state} />}

        {profileOpen && (
          <ProfileModal
            email={email}
            name={name}
            onClose={() => setProfileOpen(false)}
            onLogout={handleLogout}
            onGoToLogin={handleGoToLogin}
          />
        )}
      </div>

      <BottomNav active={tab} onChange={setTab} />
    </div>
  );
};

export default App;

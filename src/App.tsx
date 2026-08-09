import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import { fetchState, tap as tapApi, claim as claimApi, fetchCharacters, GameState, Character } from './api';
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
  // If the Payment Hub is redirecting back here after a checkout, land on
  // the tab that can actually confirm it: ?taskId=... means a verified task
  // (Friends tab), a bare ?reference=... means a wallet top-up (Earn tab).
  const [tab, setTab] = useState<Tab>(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('taskId')) return 'friends';
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
            claimMessage={claimMessage}
            onClaim={handleClaim}
            onGoToCharacters={() => setTab('character')}
            onOpenSettings={() => setProfileOpen(true)}
            musicOn={musicOn}
            onToggleMusic={handleToggleMusic}
          />
        )}
        {tab === 'character' && <CharacterScreen state={state} onStateChange={setState} />}
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

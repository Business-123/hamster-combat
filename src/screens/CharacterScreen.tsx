import React, { useEffect, useState } from 'react';
import ScreenHeader from '../components/ScreenHeader';
import Wallet from '../icons/Wallet';
import { coinIcon, mainCharacter } from '../images';
import {
  fetchCharacters, purchaseCharacter, selectCharacter, Character, GameState,
  initializeCharacterPurchase, confirmCharacterPurchase,
} from '../api';
import { gradientFor, glowFor } from '../utils/characters';
import { formatGhs, toGhs } from '../utils/currency';

// Character art/color: prefer what the admin configured on the server for
// this character; fall back to the bundled defaults (utils/characters.ts)
// only if a character predates those fields.
const imageFor = (c: Character) => c.image || null;
const bgFor = (c: Character) => c.gradient || gradientFor(c.id);
const glowColorFor = (c: Character) => c.glow || glowFor(c.id);

type Props = {
  state: GameState;
  onStateChange: (state: GameState) => void;
  accountEmail?: string | null;
};

// Only used to prompt a guest (no account) for a receipt email before a
// Payment Hub checkout — signed-in players use accountEmail directly.
const PAY_EMAIL_KEY = 'hamster-kombat-character-pay-email';

const BoltIcon = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} width="11" height="11">
    <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z" />
  </svg>
);

const CharacterScreen: React.FC<Props> = ({ state, onStateChange, accountEmail = null }) => {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Paying for a character via the Payment Hub (real money) instead of coins.
  const [payingId, setPayingId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [payCharacter, setPayCharacter] = useState<Character | null>(null);
  const [payEmail, setPayEmail] = useState(() => localStorage.getItem(PAY_EMAIL_KEY) || '');

  const load = () => {
    setLoading(true);
    fetchCharacters()
      .then(({ characters }) => setCharacters(characters))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  // After the Payment Hub redirects back here, the URL carries
  // ?characterId=...&reference=...&status=... — confirm server-side (which
  // re-checks with the hub/Paystack) and grant the character.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const characterId = params.get('characterId');
    const reference = params.get('reference');
    if (!characterId || !reference) return;

    setConfirming(true);
    confirmCharacterPurchase(characterId, reference)
      .then(({ alreadyProcessed, state: updated }) => {
        onStateChange(updated);
        setCharacters((prev) => prev.map((c) => (c.id === characterId ? { ...c, owned: true } : c)));
        setMessage(alreadyProcessed ? 'This purchase was already processed.' : 'Payment confirmed — character added!');
      })
      .catch((err) => {
        setMessage(err instanceof Error ? err.message : 'Could not confirm payment yet — try again shortly.');
      })
      .finally(() => {
        setConfirming(false);
        setTimeout(() => setMessage(null), 3500);
        params.delete('characterId');
        params.delete('reference');
        params.delete('status');
        const clean = `${window.location.pathname}${params.toString() ? `?${params}` : ''}`;
        window.history.replaceState({}, '', clean);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleBuy = async (character: Character) => {
    if (character.owned || pendingId) return;
    if (state.points < character.price) {
      setMessage(`Not enough GH₵ balance for ${character.name}`);
      setTimeout(() => setMessage(null), 2500);
      return;
    }
    setPendingId(character.id);
    try {
      const { state: updated } = await purchaseCharacter(character.id);
      onStateChange(updated);
      setCharacters((prev) => prev.map((c) => (c.id === character.id ? { ...c, owned: true } : c)));
      setMessage(`${character.name} joined your squad!`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Purchase failed');
      load();
    } finally {
      setPendingId(null);
      setTimeout(() => setMessage(null), 2500);
    }
  };

  const handleBuyWithHub = (character: Character) => {
    if (character.owned || payingId || pendingId) return;
    if (accountEmail) {
      startHubPurchase(character, accountEmail);
    } else {
      setPayCharacter(character);
    }
  };

  const startHubPurchase = async (character: Character, email: string) => {
    setPayingId(character.id);
    try {
      const { authorizationUrl, demo, state: updated } = await initializeCharacterPurchase(character.id, email);
      if (!authorizationUrl) {
        // DEMO mode: server granted the character immediately, no hub configured.
        if (updated) onStateChange(updated);
        setCharacters((prev) => prev.map((c) => (c.id === character.id ? { ...c, owned: true } : c)));
        setMessage(demo ? `${character.name} joined your squad (demo payment)!` : `${character.name} joined your squad!`);
        setPayingId(null);
        setTimeout(() => setMessage(null), 2500);
        return;
      }
      // Full-page redirect to the hub's Paystack checkout. It sends the user
      // back here (with ?characterId=...&reference=...&status=...) once paid.
      window.location.href = authorizationUrl;
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not start this purchase');
      setPayingId(null);
      setTimeout(() => setMessage(null), 2500);
    }
  };

  const handlePayEmailSubmit = () => {
    if (!payCharacter) return;
    if (!payEmail.trim() || !payEmail.includes('@')) {
      setMessage('Enter a valid email first');
      setTimeout(() => setMessage(null), 2500);
      return;
    }
    localStorage.setItem(PAY_EMAIL_KEY, payEmail.trim());
    const character = payCharacter;
    setPayCharacter(null);
    startHubPurchase(character, payEmail.trim());
  };

  const handleSelect = async (character: Character) => {
    if (!character.owned || character.selected || pendingId) return;
    setPendingId(character.id);
    try {
      const { state: updated } = await selectCharacter(character.id);
      onStateChange(updated);
      setCharacters((prev) => prev.map((c) => ({ ...c, selected: c.id === character.id })));
      setMessage(`${character.name} is now mining for you!`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not equip that character');
      load();
    } finally {
      setPendingId(null);
      setTimeout(() => setMessage(null), 2500);
    }
  };

  return (
    <div className="w-full max-w-xl px-4 pb-28">
      <ScreenHeader title="Character" subtitle="Recruit hamsters for your squad" points={state.points} pointsPerGhs={state.pointsPerGhs} />

      {message && <p className="text-center text-xs text-[#f3ba2f] mt-2">{message}</p>}
      {confirming && <p className="text-center text-xs text-[#85827d] mt-2">Confirming your payment...</p>}

      {loading ? (
        <p className="text-center text-sm text-[#85827d] mt-6">Loading...</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 mt-4">
          {characters.map((character) => {
            const affordable = state.points >= character.price;
            const glow = glowColorFor(character);
            const image = imageFor(character);
            return (
              <div
                key={character.id}
                className="relative rounded-2xl p-3 pt-4 flex flex-col items-center text-center overflow-hidden transition-transform active:scale-[0.98]"
                style={{
                  background: `linear-gradient(160deg, ${glow}22, #272a2f 55%)`,
                  boxShadow: character.selected ? `0 0 0 2px ${glow}, 0 8px 24px -8px ${glow}77` : `0 0 0 1px ${glow}33`,
                }}
              >
                {/* rarity edge */}
                <div className="absolute top-0 left-0 right-0 h-1" style={{ background: bgFor(character) }} />

                {character.selected && (
                  <span
                    className="absolute top-2 right-2 text-[8px] font-extrabold uppercase tracking-wide text-black rounded-full px-2 py-0.5"
                    style={{ background: glow }}
                  >
                    Equipped
                  </span>
                )}

                <div
                  className="w-20 h-20 rounded-full flex items-center justify-center relative overflow-visible"
                  style={{ background: bgFor(character), boxShadow: `0 0 18px -4px ${glow}aa` }}
                >
                  <div className="w-full h-full rounded-full overflow-hidden">
                    <img
                      src={image || mainCharacter}
                      alt={character.name}
                      className={image ? 'w-full h-full object-cover' : 'w-14 h-14 object-contain drop-shadow mx-auto mt-3'}
                    />
                  </div>
                  {/* per-tap value badge, overlapping the avatar like a stat chip */}
                  <span
                    className="absolute -bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-0.5 text-[9px] font-extrabold text-black rounded-full pl-1 pr-1.5 py-0.5 whitespace-nowrap shadow-md"
                    style={{ background: glow }}
                  >
                    <BoltIcon />
                    {formatGhs(character.pointsPerTap, state.pointsPerGhs)}/tap
                  </span>
                </div>

                <p className="text-xs font-bold mt-3">{character.name}</p>
                <span
                  className="text-[9px] font-semibold mt-1 rounded-full px-2 py-0.5"
                  style={{ color: glow, background: `${glow}22` }}
                >
                  {character.rank}
                </span>

                {character.owned ? (
                  <button
                    onClick={() => handleSelect(character)}
                    disabled={character.selected || pendingId === character.id}
                    className={`mt-2 w-full rounded-lg py-1.5 text-[11px] font-bold flex items-center justify-center space-x-1 ${
                      character.selected
                        ? 'bg-[#1c1f24] text-green-400'
                        : 'bg-[#f3ba2f] text-black'
                    }`}
                  >
                    {character.selected ? (
                      <span>✓ Equipped</span>
                    ) : pendingId === character.id ? (
                      <span>...</span>
                    ) : (
                      <span>Select</span>
                    )}
                  </button>
                ) : (
                  <div className="w-full space-y-1.5">
                    <button
                      onClick={() => handleBuy(character)}
                      disabled={pendingId === character.id || payingId === character.id}
                      className={`mt-2 w-full rounded-lg py-1.5 text-[11px] font-bold flex items-center justify-center space-x-1 ${
                        affordable
                          ? 'bg-[#f3ba2f] text-black'
                          : 'bg-[#1c1f24] text-[#85827d]'
                      }`}
                    >
                      {pendingId === character.id ? (
                        <span>...</span>
                      ) : (
                        <>
                          <img src={coinIcon} alt="" className="w-3 h-3" />
                          <span>{formatGhs(character.price, state.pointsPerGhs)}</span>
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => handleBuyWithHub(character)}
                      disabled={pendingId === character.id || payingId === character.id}
                      className="w-full rounded-lg py-1.5 text-[10px] font-bold flex items-center justify-center space-x-1 bg-transparent border border-[#43433b] text-[#d4d4d4]"
                    >
                      {payingId === character.id ? (
                        <span>...</span>
                      ) : (
                        <>
                          <Wallet size={11} />
                          <span>Pay GH₵{toGhs(character.price, state.pointsPerGhs).toFixed(2)}</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {payCharacter && (
        <div className="mt-4 bg-gradient-to-br from-[#33291a] to-[#1c1f24] border border-[#f3ba2f]/50 rounded-2xl p-4">
          <p className="text-xs text-white font-medium">💳 {payCharacter.name}</p>
          <p className="text-[11px] text-[#85827d] mt-1">
            Paying costs GH₵{toGhs(payCharacter.price, state.pointsPerGhs).toFixed(2)}. Enter an email for your receipt to continue.
          </p>
          <div className="flex items-center gap-2 mt-2">
            <input
              type="email"
              value={payEmail}
              onChange={(e) => setPayEmail(e.target.value)}
              placeholder="you@example.com"
              className="flex-1 bg-[#1c1f24] text-xs rounded-lg px-3 py-2 text-white placeholder-[#85827d]"
            />
            <button
              onClick={handlePayEmailSubmit}
              className="bg-[#f3ba2f] text-black text-xs font-bold rounded-lg px-3 py-2 whitespace-nowrap"
            >
              Continue
            </button>
            <button
              onClick={() => setPayCharacter(null)}
              className="bg-[#1c1f24] text-white text-xs font-bold rounded-lg px-3 py-2 whitespace-nowrap"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CharacterScreen;

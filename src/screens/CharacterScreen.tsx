import React, { useEffect, useState } from 'react';
import ScreenHeader from '../components/ScreenHeader';
import { coinIcon, mainCharacter } from '../images';
import { fetchCharacters, purchaseCharacter, selectCharacter, Character, GameState } from '../api';
import { gradientFor, glowFor } from '../utils/characters';
import { formatGhs } from '../utils/currency';

// Character art/color: prefer what the admin configured on the server for
// this character; fall back to the bundled defaults (utils/characters.ts)
// only if a character predates those fields.
const imageFor = (c: Character) => c.image || null;
const bgFor = (c: Character) => c.gradient || gradientFor(c.id);
const glowColorFor = (c: Character) => c.glow || glowFor(c.id);

type Props = {
  state: GameState;
  onStateChange: (state: GameState) => void;
};

const BoltIcon = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} width="11" height="11">
    <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z" />
  </svg>
);

const CharacterScreen: React.FC<Props> = ({ state, onStateChange }) => {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetchCharacters()
      .then(({ characters }) => setCharacters(characters))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
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
                  <button
                    onClick={() => handleBuy(character)}
                    disabled={pendingId === character.id}
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
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CharacterScreen;

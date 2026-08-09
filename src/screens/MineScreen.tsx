import React, { useCallback } from 'react';
import Info from '../icons/Info';
import Settings from '../icons/Settings';
import Speaker from '../icons/Speaker';
import { binanceLogo, dailyCipher, dailyCombo, dailyReward, coinIcon, hamsterCoin, mainCharacter } from '../images';
import { GameState, Character } from '../api';
import { gradientFor, glowFor } from '../utils/characters';
import { formatGhs } from '../utils/currency';

// Mirrors server/game.js — used client-side only to render the level progress bar.
const LEVEL_MIN_POINTS = [
  0, 5000, 25000, 100000, 1000000,
  2000000, 10000000, 50000000, 100000000, 1000000000,
];

export type DailyType = 'reward' | 'cipher' | 'combo';

const DAILY_META: Record<DailyType, { label: string; icon: string }> = {
  reward: { label: 'Daily reward', icon: dailyReward },
  cipher: { label: 'Daily cipher', icon: dailyCipher },
  combo: { label: 'Daily combo', icon: dailyCombo },
};

type Click = { id: number; x: number; y: number };

type Props = {
  state: GameState;
  // Live roster from the server (name/rank/image/gradient/glow are all
  // admin-editable) — used to render the equipped character correctly
  // without a separate lookup table baked into this component.
  characters: Character[];
  displayName: string | null;
  onCardClick: (e: React.MouseEvent<HTMLDivElement>) => void;
  clicks: Click[];
  onAnimationEnd: (id: number) => void;
  claimMessage: string | null;
  onClaim: (type: DailyType) => void;
  onQuickUnlock: () => void;
  unlocking: boolean;
  onOpenSettings: () => void;
  musicOn: boolean;
  onToggleMusic: () => void;
};

const MineScreen: React.FC<Props> = ({ state, characters, displayName, onCardClick, clicks, onAnimationEnd, claimMessage, onClaim, onQuickUnlock, unlocking, onOpenSettings, musicOn, onToggleMusic }) => {
  const locked = !state.canEarn;
  const equipped = characters.find((c) => c.id === state.selectedCharacterId) || null;
  const equippedGradient = equipped?.gradient || gradientFor(state.selectedCharacterId);
  const equippedGlow = equipped?.glow || glowFor(state.selectedCharacterId);
  const equippedImage = equipped?.image || null;
  const calculateProgress = useCallback(() => {
    const { levelIndex, points } = state;
    if (levelIndex >= LEVEL_MIN_POINTS.length - 1) return 100;
    const currentLevelMin = LEVEL_MIN_POINTS[levelIndex];
    const nextLevelMin = LEVEL_MIN_POINTS[levelIndex + 1];
    const progress = ((points - currentLevelMin) / (nextLevelMin - currentLevelMin)) * 100;
    return Math.min(Math.max(progress, 0), 100);
  }, [state]);

  const formatProfitPerHour = (profit: number) => `+${formatGhs(profit, state.pointsPerGhs)}`;

  const formatCountdown = (ms: number) => {
    const totalMinutes = Math.max(0, Math.floor(ms / 60000));
    const hours = Math.floor(totalMinutes / 60).toString().padStart(2, '0');
    const minutes = (totalMinutes % 60).toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  return (
    <>
      <div className="w-full bg-black text-white flex flex-col max-w-xl">
        <div className="px-4 z-10">
          <div className="flex items-center space-x-2 pt-4">
            <img src={hamsterCoin} alt="Earn Master" className="w-8 h-8 rounded-full" />
            <div>
              <p className="text-[10px] font-extrabold tracking-wide text-[#f3ba2f] leading-none">EARN MASTER</p>
              <p className="text-sm">{displayName ? `${displayName} (CEO)` : 'Guest (CEO)'}</p>
            </div>
          </div>
          <div className="flex items-center justify-between space-x-4 mt-1">
            <div className="flex items-center w-1/3">
              <div className="w-full">
                <div className="flex justify-between">
                  <p className="text-sm">{state.levelName}</p>
                  <p className="text-sm">{state.levelIndex + 1} <span className="text-[#95908a]">/ {state.levelCount}</span></p>
                </div>
                <div className="flex items-center mt-1 border-2 border-[#43433b] rounded-full">
                  <div className="w-full h-2 bg-[#43433b]/[0.6] rounded-full">
                    <div className="progress-gradient h-2 rounded-full" style={{ width: `${calculateProgress()}%` }}></div>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center w-2/3 border-2 border-[#43433b] rounded-full px-4 py-[2px] bg-[#43433b]/[0.6] max-w-64">
              <img src={binanceLogo} alt="Exchange" className="w-8 h-8" />
              <div className="h-[32px] w-[2px] bg-[#43433b] mx-2"></div>
              <div className="flex-1 text-center">
                <p className="text-xs text-[#85827d] font-medium">Profit per hour</p>
                <div className="flex items-center justify-center space-x-1">
                  <img src={coinIcon} alt="" className="w-[18px] h-[18px]" />
                  <p className="text-sm">{formatProfitPerHour(state.profitPerHour)}</p>
                  <Info size={20} className="text-[#43433b]" />
                </div>
              </div>
              <div className="h-[32px] w-[2px] bg-[#43433b] mx-2"></div>
              <button
                type="button"
                onClick={onToggleMusic}
                aria-label={musicOn ? 'Mute music' : 'Unmute music'}
                className={`active:scale-90 transition-transform mr-1 ${musicOn ? 'text-[#f3ba2f]' : 'text-white'}`}
              >
                <Speaker size={20} muted={!musicOn} />
              </button>
              <button
                type="button"
                onClick={onOpenSettings}
                aria-label="Account settings"
                className="text-white active:scale-90 transition-transform"
              >
                <Settings className="text-white" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex-grow mt-4 bg-[#f3ba2f] rounded-t-[48px] relative top-glow z-0">
          <div className="absolute top-[2px] left-0 right-0 bottom-0 bg-[#1d2025] rounded-t-[46px]">
            <div className="px-4 mt-6 flex justify-between gap-2">
              {(Object.keys(DAILY_META) as DailyType[]).map((type) => {
                const meta = DAILY_META[type];
                const claimable = state.dailyClaimable[type] && !locked;
                return (
                  <div
                    key={type}
                    onClick={() => !locked && onClaim(type)}
                    className={`bg-[#272a2f] rounded-lg px-4 py-2 w-full relative ${locked ? 'opacity-50' : ''} ${claimable ? 'cursor-pointer ring-2 ring-[#f3ba2f]' : ''}`}
                  >
                    <div className={`dot ${claimable ? 'bg-green-400' : ''}`}></div>
                    <img src={meta.icon} alt={meta.label} className="mx-auto w-12 h-12" />
                    <p className="text-[10px] text-center text-white mt-1">{meta.label}</p>
                    <p className="text-[10px] font-medium text-center text-gray-400 mt-2">
                      {locked ? 'Locked' : claimable ? 'Claim now' : formatCountdown(state.dailyTimersMs[type])}
                    </p>
                  </div>
                );
              })}
            </div>

            {claimMessage && (
              <div className="px-4 mt-2 text-center text-xs text-[#f3ba2f]">{claimMessage}</div>
            )}

            <div className="px-4 mt-4 flex justify-center">
              <div className="px-4 py-2 flex items-center space-x-2">
                <img src={coinIcon} alt="" className="w-10 h-10" />
                <p className="text-4xl text-white">{formatGhs(state.points, state.pointsPerGhs)}</p>
              </div>
            </div>

            {equipped && (
              <div className="px-4 mt-1 flex justify-center">
                <p className="text-[11px] text-[#85827d]">
                  Mining with{' '}
                  <span className="text-white font-medium">{equipped.name}</span>{' '}
                  · {equipped.rank}
                </p>
              </div>
            )}

            <div className="px-4 mt-4 flex justify-center pb-8">
              <div className="relative">
                <div
                  className={`w-80 h-80 p-4 rounded-full circle-outer ${locked ? 'opacity-40 grayscale' : ''}`}
                  style={{
                    background: equippedGradient,
                    boxShadow: `0 -26px 40px ${equippedGlow}55`,
                  }}
                  onClick={locked ? onQuickUnlock : onCardClick}
                >
                  <div className="w-full h-full rounded-full circle-inner overflow-hidden">
                    <img
                      src={equippedImage || mainCharacter}
                      alt="Main Character"
                      className={equippedImage ? 'w-full h-full object-cover' : 'w-full h-full'}
                    />
                  </div>
                </div>

                {locked && (
                  <div className="absolute inset-0 flex items-center justify-center px-8">
                    <button
                      onClick={onQuickUnlock}
                      disabled={unlocking}
                      className="bg-[#f3ba2f] text-black text-xs font-bold rounded-full px-4 py-2 shadow-lg text-center leading-snug"
                    >
                      {unlocking ? '...' : '🔒 Get a character to start earning'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {clicks.map((click) => (
        <div
          key={click.id}
          className="absolute text-5xl font-bold opacity-0 text-white pointer-events-none"
          style={{
            top: `${click.y - 42}px`,
            left: `${click.x - 28}px`,
            animation: `float 1s ease-out`,
          }}
          onAnimationEnd={() => onAnimationEnd(click.id)}
        >
          {state.pointsPerTap}
        </div>
      ))}
    </>
  );
};

export default MineScreen;

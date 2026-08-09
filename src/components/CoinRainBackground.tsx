import React, { useMemo } from 'react';
import { coinIcon } from '../images';

type Props = {
  // How many coins fall at once. Kept modest so it reads as ambient
  // decoration rather than clutter.
  count?: number;
};

type CoinPiece = {
  id: number;
  left: number; // percent
  size: number; // px
  duration: number; // seconds
  delay: number; // seconds negative, so coins are already mid-fall on mount
  drift: number; // px of horizontal sway
  spin: string; // rotation direction
  opacity: number;
};

// Decorative, non-interactive background of coins gently falling behind the
// wallet content. Purely CSS-driven (no JS ticking) so it's cheap to keep
// mounted, and it never intercepts clicks/taps.
const CoinRainBackground: React.FC<Props> = ({ count = 18 }) => {
  const pieces = useMemo<CoinPiece[]>(() => {
    return Array.from({ length: count }, (_, id) => {
      const duration = 6 + Math.random() * 6; // 6s - 12s fall
      return {
        id,
        left: Math.random() * 100,
        size: 14 + Math.random() * 20, // 14px - 34px
        duration,
        delay: -Math.random() * duration, // stagger so it's already in progress
        drift: (Math.random() - 0.5) * 40,
        spin: Math.random() > 0.5 ? 'normal' : 'reverse',
        opacity: 0.35 + Math.random() * 0.5,
      };
    });
  }, [count]);

  return (
    <div
      className="absolute inset-0 overflow-hidden pointer-events-none select-none"
      aria-hidden="true"
    >
      {pieces.map((coin) => (
        <img
          key={coin.id}
          src={coinIcon}
          alt=""
          className="coin-rain-piece"
          style={{
            left: `${coin.left}%`,
            width: coin.size,
            height: coin.size,
            opacity: coin.opacity,
            animationDuration: `${coin.duration}s`,
            animationDelay: `${coin.delay}s`,
            animationDirection: coin.spin,
            // slight horizontal sway via a custom property read nowhere else,
            // kept simple: bake drift into a translateX on top of the fall
            marginLeft: coin.drift,
            filter: 'drop-shadow(0 0 4px rgba(243,186,47,0.35))',
          }}
        />
      ))}
    </div>
  );
};

export default CoinRainBackground;

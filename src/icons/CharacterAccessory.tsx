import React from 'react';
import { Accessory } from '../utils/characters';

type Props = {
  type: Accessory | null;
  size?: number; // roughly matches the diameter of the circle it sits on
};

// Renders a small prop on top of the shared hamster artwork so each high-rank
// character reads as visually distinct without needing separate art files.
const CharacterAccessory: React.FC<Props> = ({ type, size = 80 }) => {
  if (!type) return null;

  if (type === 'crown') {
    return (
      <svg
        viewBox="0 0 100 60"
        className="absolute -top-4 left-1/2 -translate-x-1/2 pointer-events-none drop-shadow-md"
        style={{ width: size * 0.6, height: size * 0.36 }}
      >
        <polygon points="10,55 20,15 35,35 50,10 65,35 80,15 90,55" fill="#ffd700" stroke="#a9770b" strokeWidth="3" strokeLinejoin="round" />
        <circle cx="20" cy="15" r="6" fill="#fff2b0" />
        <circle cx="50" cy="10" r="7" fill="#fff2b0" />
        <circle cx="80" cy="15" r="6" fill="#fff2b0" />
        <rect x="8" y="52" width="84" height="8" rx="2" fill="#a9770b" />
      </svg>
    );
  }

  if (type === 'hood') {
    return (
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-0 pointer-events-none"
        style={{ width: size, height: size }}
      >
        {/* Dark cloak shadow across the upper half, with two glowing eyes */}
        <path d="M50 2 C20 2 6 30 10 60 C14 45 30 20 50 20 C70 20 86 45 90 60 C94 30 80 2 50 2 Z" fill="rgba(5,5,8,0.85)" />
        <circle cx="40" cy="34" r="3" fill="#a78bfa" />
        <circle cx="60" cy="34" r="3" fill="#a78bfa" />
      </svg>
    );
  }

  if (type === 'staff') {
    return (
      <svg
        viewBox="0 0 60 100"
        className="absolute -right-2 bottom-0 pointer-events-none drop-shadow"
        style={{ width: size * 0.35, height: size * 0.85 }}
      >
        <line x1="30" y1="10" x2="30" y2="95" stroke="#8a5a2c" strokeWidth="6" strokeLinecap="round" />
        <circle cx="30" cy="10" r="10" fill="#5fbf6a" stroke="#3f6b46" strokeWidth="3" />
      </svg>
    );
  }

  if (type === 'spikes') {
    return (
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-0 pointer-events-none"
        style={{ width: size, height: size }}
      >
        {Array.from({ length: 8 }).map((_, i) => {
          const angle = (i / 8) * Math.PI * 2;
          const cx = 50 + Math.cos(angle) * 44;
          const cy = 50 + Math.sin(angle) * 44;
          const tx = 50 + Math.cos(angle) * 56;
          const ty = 50 + Math.sin(angle) * 56;
          return (
            <polygon
              key={i}
              points={`${cx - 4},${cy} ${cx + 4},${cy} ${tx},${ty}`}
              fill="#9aa1ab"
              stroke="#2b2e33"
              strokeWidth="1"
            />
          );
        })}
      </svg>
    );
  }

  return null;
};

export default CharacterAccessory;

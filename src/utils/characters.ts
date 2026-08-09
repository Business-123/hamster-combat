// Purely visual metadata, index-aligned with server/game.js CHARACTERS.
// There's a single hamster artwork (main-character.png) used everywhere —
// each character/rank is distinguished by a color identity instead of unique
// art. The same identity is used on the Character tab and around the hamster
// on the Mine screen so the equipped character visibly "shows up" there.

// Cosmetic prop rendered on top of a character's portrait by CharacterAccessory.
export type Accessory = 'crown' | 'hood' | 'staff' | 'spikes';

export const CHARACTER_GRADIENTS: Record<string, string> = {
  nibbles: 'linear-gradient(to bottom, #b0b6bd, #6b7280)', // Rookie — steel grey
  'chubby-cheeks': 'linear-gradient(to bottom, #d99a5c, #8a5a2c)', // Bronze
  'turbo-paws': 'linear-gradient(to bottom, #d7dbe0, #9aa1ab)', // Silver
  'duke-whiskers': 'linear-gradient(to bottom, #f3ba2f, #a9770b)', // Gold
  zorak: 'linear-gradient(to bottom, #8fd3f4, #4a90c2)', // Platinum
  'kombat-king': 'linear-gradient(to bottom, #a78bfa, #575def)', // Legendary
  'blaze-fang': 'linear-gradient(to bottom, #b9f2ff, #2e9fc2)', // Diamond
  'shadow-strike': 'linear-gradient(to bottom, #ff6ec7, #7b2ff7)', // Epic
  'iron-colossus': 'linear-gradient(to bottom, #ff9a5c, #b0242b)', // Master
  'lord-hamzilla': 'linear-gradient(to bottom, #ff4b4b, #1a1a1a)', // GrandMaster
};

export const CHARACTER_GLOW: Record<string, string> = {
  nibbles: '#9aa0a8',
  'chubby-cheeks': '#c07f3d',
  'turbo-paws': '#c3cad2',
  'duke-whiskers': '#f3ba2f',
  zorak: '#5aa8d6',
  'kombat-king': '#8b7cf6',
  'blaze-fang': '#4fc3e0',
  'shadow-strike': '#b83bf0',
  'iron-colossus': '#ff6a3d',
  'lord-hamzilla': '#ff3b3b',
};

export const DEFAULT_GRADIENT = 'linear-gradient(to bottom, #575def, #202731)';
export const DEFAULT_GLOW = '#f3ba2f';

export const gradientFor = (id: string | null) => (id && CHARACTER_GRADIENTS[id]) || DEFAULT_GRADIENT;
export const glowFor = (id: string | null) => (id && CHARACTER_GLOW[id]) || DEFAULT_GLOW;

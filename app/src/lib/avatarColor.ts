// Deterministic avatar colors (Style Guide 1a). Avatars carry identity but stay
// de-emphasized: a hue picked by seed, filled at ~13% with a ~33% ring — never
// solid brand gold. Same seed → same color everywhere.
const AVATAR_HUES = ['#5B9BE6', '#40BE86', '#B667D6', '#EC6A9C', '#22C3D6', '#6E62E6'];

export interface AvatarColor {
  /** ~13% tint for the fill */
  bg: string;
  /** ~40% ring/border */
  ring: string;
  /** full-strength hue for the initials */
  fg: string;
}

export function avatarColor(seed: string | number | null | undefined): AvatarColor {
  const n =
    typeof seed === 'number'
      ? seed
      : [...String(seed ?? '')].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const hue = AVATAR_HUES[Math.abs(n) % AVATAR_HUES.length] ?? AVATAR_HUES[0]!;
  return { bg: `${hue}22`, ring: `${hue}66`, fg: hue };
}

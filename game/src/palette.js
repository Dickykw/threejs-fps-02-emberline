// The look plan, in one place. Every colour the game or its page uses is one of these
// names; the lighting makes every shade the game needs. The same names are the CSS custom
// properties in index.html. Foundry at dusk: warm dark steel, rust, and one ember accent.
export const PALETTE = {
  canvas: '#141110',
  surface: '#221d19',
  hairline: '#3a312a',
  ink: '#efe7d8',
  muted: '#9a8d7c',
  accent: '#f08c1e',
  ally: '#3fa7a0',
  foe: '#c23b2e',
  danger: '#e5484d',
  gold: '#e8b93e',
};

export function shade(name) {
  return PALETTE[name];
}

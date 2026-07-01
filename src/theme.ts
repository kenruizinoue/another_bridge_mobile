// Central design tokens — the single source of truth for the terminal
// palette, fonts, and spacing. Screens and components import from here so
// the developer-tool look stays consistent and no color is hard-coded in
// two places.
import { Platform } from 'react-native';

export const mono = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

export const colors = {
  bg: '#0b0f14',
  surface: '#141b24',
  surfacePressed: '#1b2530',
  inputBg: '#0d131a',
  border: '#1f2a36',
  borderStrong: '#2b3948',
  divider: '#1a222c',
  textPrimary: '#f2f5f8',
  textBody: '#d9e0e8',
  textDim: '#7d8a99',
  textFaint: '#59677a',
  accent: '#5eb1ff',
  user: '#7ee787',
  tool: '#8b98a8',
  stat: '#7ee787',
  codeBg: '#11202b',
  codeText: '#9ecbff',
  error: '#ff6b6b',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20 } as const;

export const font = {
  tiny: 11,
  small: 12,
  body: 13,
  meta: 13,
  title: 16,
  h3: 15,
  h2: 17,
  h1: 20,
} as const;

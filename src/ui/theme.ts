export const colors = {
  bg: {
    primary: '#0A0E17',
    secondary: '#111827',
    card: '#1A2033',
    elevated: '#222B3E',
  },
  accent: {
    primary: '#6366F1',    // indigo
    success: '#10B981',    // emerald
    warning: '#F59E0B',    // amber
    danger: '#EF4444',     // red
    info: '#3B82F6',       // blue
    pink: '#EC4899',
  },
  text: {
    primary: '#F9FAFB',
    secondary: '#9CA3AF',
    muted: '#6B7280',
    inverse: '#111827',
  },
  momentum: {
    critical: '#EF4444',
    low: '#F59E0B',
    building: '#3B82F6',
    steady: '#10B981',
    peak: '#6366F1',
  },
  border: '#2D3748',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

export const typography = {
  h1: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.5 },
  h2: { fontSize: 22, fontWeight: '600' as const, letterSpacing: -0.3 },
  h3: { fontSize: 18, fontWeight: '600' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  caption: { fontSize: 13, fontWeight: '400' as const },
  mono: { fontSize: 13, fontFamily: 'Menlo' },
} as const;

// Minimal 60/30/10 palette: airy cotton, warm stone surfaces, one calm sage accent.
export const colors = {
  bg:        '#F7F4EE',
  s1:        '#FFFFFF',
  s2:        '#EEE8DD',
  s3:        '#DED4C6',
  tx:        '#25201B',
  mu:        '#746B61',
  mu2:       '#9B9186',
  acc:       '#5F7F72',
  lime:      '#DDE8E1',
  limeSoft:  '#F0F6F2',
  accLight:  '#E3ECE7',
  grn:       '#5F7F72',
  err:       '#B65348',
  br:        '#E3DDD3',
  brBr:      '#CEC3B6',
  white:     '#FFFFFF',
  ink:       '#25201B',
  pink:      '#D8C3B6',
  gold:      '#5F7F72',
  goldLight: '#E3ECE7',
  card:      '#FFFFFF',
  cardSoft:  '#EEE8DD',
  navy:      '#25201B',
} as const;

export const radii = {
  sm:  12,
  md:  16,
  lg:  20,
  xl:  24,
  xxl: 28,
  pill: 999,
} as const;

export const spacing = {
  xs:   4,
  sm:   8,
  md:   12,
  lg:   16,
  xl:   20,
  xxl:  24,
  xxxl: 32,
} as const;

export const shadow = {
  card: {
    shadowColor:   '#5F544C',
    shadowOpacity: 0.07,
    shadowRadius:  24,
    shadowOffset:  { width: 0, height: 10 },
    elevation: 2,
  },
  cta: {
    shadowColor:   '#5F7F72',
    shadowOpacity: 0.18,
    shadowRadius:  22,
    shadowOffset:  { width: 0, height: 8 },
    elevation: 4,
  },
  glass: {
    shadowColor:   '#5F544C',
    shadowOpacity: 0.06,
    shadowRadius:  18,
    shadowOffset:  { width: 0, height: 8 },
    elevation: 2,
  },
} as const;

export type Colors = typeof colors;

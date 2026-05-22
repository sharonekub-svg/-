import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

const STORAGE_KEY = 'shakana.paymentSettings';

export type PaymentMethodKey = 'bit' | 'paybox' | 'paypal' | 'venmo' | 'cash';

export type PaymentMethodSetting = {
  enabled: boolean;
  link: string;
};

export type PaymentSettings = Record<PaymentMethodKey, PaymentMethodSetting>;

type PaymentSettingsState = {
  settings: PaymentSettings;
  hydrated: boolean;
  load: () => Promise<void>;
  setMethod: (key: PaymentMethodKey, value: Partial<PaymentMethodSetting>) => Promise<void>;
  hasPaymentOption: () => boolean;
};

const DEFAULT_SETTINGS: PaymentSettings = {
  bit: { enabled: false, link: '' },
  paybox: { enabled: false, link: '' },
  paypal: { enabled: false, link: '' },
  venmo: { enabled: false, link: '' },
  cash: { enabled: false, link: '' },
};

async function persist(settings: PaymentSettings) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Keep the in-memory settings if storage is unavailable.
  }
}

function normalizeSettings(raw: Partial<PaymentSettings> | null): PaymentSettings {
  return {
    bit: { ...DEFAULT_SETTINGS.bit, ...raw?.bit },
    paybox: { ...DEFAULT_SETTINGS.paybox, ...raw?.paybox },
    paypal: { ...DEFAULT_SETTINGS.paypal, ...raw?.paypal },
    venmo: { ...DEFAULT_SETTINGS.venmo, ...raw?.venmo },
    cash: { ...DEFAULT_SETTINGS.cash, ...raw?.cash },
  };
}

export const usePaymentSettingsStore = create<PaymentSettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  hydrated: false,
  load: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      set({
        settings: normalizeSettings(raw ? (JSON.parse(raw) as Partial<PaymentSettings>) : null),
        hydrated: true,
      });
    } catch {
      set({ settings: DEFAULT_SETTINGS, hydrated: true });
    }
  },
  setMethod: async (key, value) => {
    const next = {
      ...get().settings,
      [key]: {
        ...get().settings[key],
        ...value,
      },
    };
    set({ settings: next });
    await persist(next);
  },
  hasPaymentOption: () => Object.values(get().settings).some((method) => method.enabled && method.link.trim().length > 0),
}));

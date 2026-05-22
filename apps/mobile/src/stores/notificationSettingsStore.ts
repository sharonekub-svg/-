import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

const STORAGE_KEY = 'shakana.notificationSettings';

export type NotificationSettings = {
  orderUpdates: boolean;
  paymentReminders: boolean;
  productAlerts: boolean;
  buildingOrderAlerts: boolean;
  friendOrderAlerts: boolean;
  followedFriendUsernames: string[];
};

type NotificationSettingsState = {
  settings: NotificationSettings;
  hydrated: boolean;
  load: () => Promise<void>;
  setSetting: <K extends keyof NotificationSettings>(key: K, value: NotificationSettings[K]) => Promise<void>;
  addFriendUsername: (username: string) => Promise<void>;
  removeFriendUsername: (username: string) => Promise<void>;
};

const DEFAULT_SETTINGS: NotificationSettings = {
  orderUpdates: true,
  paymentReminders: true,
  productAlerts: false,
  buildingOrderAlerts: false,
  friendOrderAlerts: false,
  followedFriendUsernames: [],
};

async function persist(settings: NotificationSettings) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Keep the in-memory settings if storage is unavailable.
  }
}

export const useNotificationSettingsStore = create<NotificationSettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  hydrated: false,
  load: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) {
        set({ settings: DEFAULT_SETTINGS, hydrated: true });
        return;
      }
      const parsed = JSON.parse(raw) as Partial<NotificationSettings>;
      set({
        settings: {
          orderUpdates: parsed.orderUpdates ?? DEFAULT_SETTINGS.orderUpdates,
          paymentReminders: parsed.paymentReminders ?? DEFAULT_SETTINGS.paymentReminders,
          productAlerts: parsed.productAlerts ?? DEFAULT_SETTINGS.productAlerts,
          buildingOrderAlerts: parsed.buildingOrderAlerts ?? DEFAULT_SETTINGS.buildingOrderAlerts,
          friendOrderAlerts: parsed.friendOrderAlerts ?? DEFAULT_SETTINGS.friendOrderAlerts,
          followedFriendUsernames: Array.isArray(parsed.followedFriendUsernames)
            ? parsed.followedFriendUsernames.filter((name) => typeof name === 'string')
            : DEFAULT_SETTINGS.followedFriendUsernames,
        },
        hydrated: true,
      });
    } catch {
      set({ settings: DEFAULT_SETTINGS, hydrated: true });
    }
  },
  setSetting: async (key, value) => {
    const next = { ...get().settings, [key]: value };
    set({ settings: next });
    await persist(next);
  },
  addFriendUsername: async (username) => {
    const clean = username.trim().replace(/^@/, '').toLowerCase();
    if (!clean) return;
    const current = get().settings.followedFriendUsernames;
    const next = {
      ...get().settings,
      followedFriendUsernames: current.includes(clean) ? current : [...current, clean],
      friendOrderAlerts: true,
    };
    set({ settings: next });
    await persist(next);
  },
  removeFriendUsername: async (username) => {
    const clean = username.trim().replace(/^@/, '').toLowerCase();
    const next = {
      ...get().settings,
      followedFriendUsernames: get().settings.followedFriendUsernames.filter((name) => name !== clean),
    };
    set({ settings: next });
    await persist(next);
  },
}));

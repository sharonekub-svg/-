import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import type { Profile } from '@/types/domain';

const STORAGE_KEY = 'shakana.profileDraft';

type ProfileDraftState = {
  draft: Profile | null;
  hydrated: boolean;
  loadDraft: () => Promise<void>;
  setDraft: (profile: Profile) => Promise<void>;
  clearDraft: () => Promise<void>;
};

async function persistDraft(profile: Profile | null) {
  try {
    if (profile) {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    } else {
      await AsyncStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // If storage is unavailable, keep the in-memory copy working for this session.
  }
}

export const useProfileDraftStore = create<ProfileDraftState>((set) => ({
  draft: null,
  hydrated: false,
  loadDraft: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) {
        set({ draft: null, hydrated: true });
        return;
      }

      const parsed = JSON.parse(raw) as Profile;
      set({ draft: parsed, hydrated: true });
    } catch {
      set({ draft: null, hydrated: true });
    }
  },
  setDraft: async (profile) => {
    set({ draft: profile });
    await persistDraft(profile);
  },
  clearDraft: async () => {
    set({ draft: null });
    await persistDraft(null);
  },
}));

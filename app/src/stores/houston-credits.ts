import { create } from "zustand";
import { getEngine } from "../lib/engine";
import { tauriPreferences } from "../lib/tauri";
import { FREE_CREDITS_LIMIT } from "../lib/providers";

const PREF_KEY = "houston_credits_balance";

interface HoustonCreditsState {
  balance: number | null;
  isLoading: boolean;
  init: () => Promise<void>;
  decrement: () => Promise<void>;
  topUp: (amount: number) => Promise<void>;
}

export const useHoustonCreditsStore = create<HoustonCreditsState>((set, get) => ({
  balance: null,
  isLoading: true,

  init: async () => {
    try {
      const raw = await getEngine().getPreference(PREF_KEY);
      const parsed = raw !== null ? parseInt(raw, 10) : FREE_CREDITS_LIMIT;
      const balance = Number.isNaN(parsed) ? FREE_CREDITS_LIMIT : parsed;
      set({ balance, isLoading: false });
    } catch {
      set({ balance: FREE_CREDITS_LIMIT, isLoading: false });
    }
  },

  decrement: async () => {
    const { balance } = get();
    if (balance === null || balance <= 0) return;
    const next = balance - 1;
    set({ balance: next });
    await tauriPreferences.set(PREF_KEY, String(next));
  },

  topUp: async (amount: number) => {
    const { balance } = get();
    const next = (balance ?? 0) + amount;
    set({ balance: next });
    await tauriPreferences.set(PREF_KEY, String(next));
  },
}));

import { create } from 'zustand';

type OrderDraft = {
  productUrl: string;
  productTitle: string;
  productPriceAgorot: number;
  maxParticipants: number;
  productImage: string;
};

type State = {
  draft: OrderDraft;
  setDraft: (d: Partial<OrderDraft>) => void;
  clearDraft: () => void;
};

const EMPTY: OrderDraft = {
  productUrl: '',
  productTitle: '',
  productPriceAgorot: 0,
  maxParticipants: 4,
  productImage: '',
};

export const useOrderDraftStore = create<State>((set) => ({
  draft: EMPTY,
  setDraft: (d) => set((s) => ({ draft: { ...s.draft, ...d } })),
  clearDraft: () => set({ draft: EMPTY }),
}));

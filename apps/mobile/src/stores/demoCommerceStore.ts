import { create } from 'zustand';
import {
  DELIVERY_FEE,
  FREE_SHIPPING_GOAL,
  type DemoBrandId,
  type DemoProduct,
  demoStores,
  findProduct,
  productsForBrand,
} from '@/demo/catalog';

export type DemoRole = 'user' | 'store' | null;
export type OrderStatus = 'Collecting' | 'Accepted' | 'Packing' | 'Ready' | 'Shipped';

export type DemoParticipant = {
  id: string;
  name: string;
  joinedAt: number;
};

export type DemoOrderItem = {
  id: string;
  productId: string;
  participantId: string;
  size: string;
  color: string;
  quantity: number;
  private: boolean;
  addedAt: number;
};

export type DemoOrder = {
  id: string;
  brand: DemoBrandId;
  status: OrderStatus;
  inviteCode: string;
  inviteLink: string;
  createdBy: string;
  createdAt: number;
  closesAt: number;
  participants: DemoParticipant[];
  items: DemoOrderItem[];
  lastEvent: string;
};

export type DemoPulse = {
  id: number;
  kind: 'join' | 'item' | 'status' | 'goal';
  message: string;
};

type DemoState = {
  demoRole: DemoRole;
  selectedBrand: DemoBrandId | null;
  activeParticipantId: string;
  orders: DemoOrder[];
  lastNotice: string | null;
  lastPulse: DemoPulse | null;
  setDemoRole: (role: DemoRole) => void;
  selectBrand: (brand: DemoBrandId | null) => void;
  setActiveParticipant: (participantId: string) => void;
  ensureOrder: (brand: DemoBrandId) => string;
  joinParticipant: (orderId: string, participantId: string) => void;
  addItem: (orderId: string, input: AddItemInput) => void;
  updateStatus: (orderId: string, status: OrderStatus) => void;
  resetDemo: () => void;
};

type PersistedDemoState = Pick<
  DemoState,
  'demoRole' | 'selectedBrand' | 'activeParticipantId' | 'orders' | 'lastNotice'
  | 'lastPulse'
>;

type AddItemInput = {
  productId: string;
  participantId: string;
  size: string;
  color: string;
  quantity: number;
  private: boolean;
};

export const demoParticipants: DemoParticipant[] = [
  { id: 'user-a', name: 'Sharone', joinedAt: 0 },
  { id: 'user-b', name: 'User B', joinedAt: 0 },
  { id: 'user-c', name: 'User C', joinedAt: 0 },
];

export const primaryDemoParticipant: DemoParticipant = demoParticipants[0] ?? {
  id: 'user-a',
  name: 'Sharone',
  joinedAt: 0,
};

const STORAGE_KEY = 'shakana-investor-demo-v1';
const CHANNEL_NAME = 'shakana-investor-demo-sync';
const DEMO_ORIGIN = 'https://shakana1.vercel.app';

let channel: BroadcastChannel | null = null;
let applyingRemote = false;

const canUseWindow = () => typeof window !== 'undefined';
const now = () => Date.now();

function getParticipantName(participantId: string) {
  return demoParticipants.find((participant) => participant.id === participantId)?.name ?? 'Guest';
}

function createOrder(brand: DemoBrandId): DemoOrder {
  const id = `SK-${Math.floor(1000 + Math.random() * 9000)}`;
  const inviteCode = String(Math.floor(1000 + Math.random() * 9000));
  const createdAt = now();
  return {
    id,
    brand,
    status: 'Collecting',
    inviteCode,
    inviteLink: `${DEMO_ORIGIN}/user?join=${inviteCode}`,
    createdBy: 'user-a',
    createdAt,
    closesAt: createdAt + 15 * 60 * 1000,
    participants: [{ ...primaryDemoParticipant, joinedAt: createdAt }],
    items: [],
    lastEvent: `${demoStores[brand].name} group order created`,
  };
}

function defaultState(): PersistedDemoState {
  return {
    demoRole: null,
    selectedBrand: null,
    activeParticipantId: 'user-a',
    orders: [],
    lastNotice: null,
    lastPulse: null,
  };
}

function sanitizeState(value: unknown): PersistedDemoState {
  const fallback = defaultState();
  if (!value || typeof value !== 'object') return fallback;
  const incoming = value as Partial<PersistedDemoState>;
  return {
    demoRole: incoming.demoRole === 'user' || incoming.demoRole === 'store' ? incoming.demoRole : null,
    selectedBrand: incoming.selectedBrand === 'hm' || incoming.selectedBrand === 'zara' ? incoming.selectedBrand : null,
    activeParticipantId:
      typeof incoming.activeParticipantId === 'string' ? incoming.activeParticipantId : 'user-a',
    orders: Array.isArray(incoming.orders) ? incoming.orders : [],
    lastNotice: typeof incoming.lastNotice === 'string' ? incoming.lastNotice : null,
    lastPulse:
      incoming.lastPulse &&
      typeof incoming.lastPulse === 'object' &&
      typeof (incoming.lastPulse as DemoPulse).id === 'number' &&
      typeof (incoming.lastPulse as DemoPulse).message === 'string'
        ? (incoming.lastPulse as DemoPulse)
        : null,
  };
}

function readPersistedState(): PersistedDemoState {
  if (!canUseWindow()) return defaultState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? sanitizeState(JSON.parse(raw)) : defaultState();
  } catch {
    return defaultState();
  }
}

function persistedFromState(state: DemoState): PersistedDemoState {
  return {
    demoRole: state.demoRole,
    selectedBrand: state.selectedBrand,
    activeParticipantId: state.activeParticipantId,
    orders: state.orders,
    lastNotice: state.lastNotice,
    lastPulse: state.lastPulse,
  };
}

function persistAndBroadcast(state: DemoState) {
  if (!canUseWindow() || applyingRemote) return;
  const payload = persistedFromState(state);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    channel?.postMessage(payload);
  } catch {
    // The demo continues in memory when browser storage is unavailable.
  }
}

const initialState = readPersistedState();

export const useDemoCommerceStore = create<DemoState>((set, get) => ({
  ...initialState,
  setDemoRole: (demoRole) =>
    set((state) => {
      const next = { ...state, demoRole };
      persistAndBroadcast(next);
      return next;
    }),
  selectBrand: (selectedBrand) =>
    set((state) => {
      const next = { ...state, selectedBrand };
      persistAndBroadcast(next);
      return next;
    }),
  setActiveParticipant: (activeParticipantId) =>
    set((state) => {
      const next = { ...state, activeParticipantId };
      persistAndBroadcast(next);
      return next;
    }),
  ensureOrder: (brand) => {
    const existing = get().orders.find((order) => order.brand === brand && order.status !== 'Shipped');
    if (existing) return existing.id;
    const order = createOrder(brand);
    set((state) => {
      const pulse: DemoPulse = { id: now(), kind: 'join', message: order.lastEvent };
      const next = {
        ...state,
        selectedBrand: brand,
        orders: [order, ...state.orders],
        lastNotice: order.lastEvent,
        lastPulse: pulse,
      };
      persistAndBroadcast(next);
      return next;
    });
    return order.id;
  },
  joinParticipant: (orderId, participantId) =>
    set((state) => {
      const participantTemplate = demoParticipants.find((participant) => participant.id === participantId);
      if (!participantTemplate) return state;
      const orders = state.orders.map((order) => {
        if (order.id !== orderId) return order;
        if (order.participants.some((participant) => participant.id === participantId)) return order;
        const participant = { ...participantTemplate, joinedAt: now() };
        return {
          ...order,
          participants: [...order.participants, participant],
          lastEvent: `${participant.name} joined the group order`,
        };
      });
      const joinedOrder = orders.find((order) => order.id === orderId);
      const pulse: DemoPulse = {
        id: now(),
        kind: 'join',
        message: joinedOrder?.lastEvent ?? 'Friend joined',
      };
      const next = {
        ...state,
        orders,
        activeParticipantId: participantId,
        lastNotice: joinedOrder?.lastEvent ?? 'Friend joined',
        lastPulse: pulse,
      };
      persistAndBroadcast(next);
      return next;
    }),
  addItem: (orderId, input) =>
    set((state) => {
      const product = findProduct(input.productId);
      if (!product || !input.size || !input.color || input.quantity < 1) {
        return { ...state, lastNotice: 'Choose size, color, and quantity before adding.' };
      }
      const item: DemoOrderItem = {
        id: `${input.productId}-${input.participantId}-${now()}`,
        productId: input.productId,
        participantId: input.participantId,
        size: input.size,
        color: input.color,
        quantity: input.quantity,
        private: input.private,
        addedAt: now(),
      };
      const orders = state.orders.map((order) => {
        if (order.id !== orderId) return order;
        const participantExists = order.participants.some(
          (participant) => participant.id === input.participantId,
        );
        const participantTemplate = demoParticipants.find(
          (participant) => participant.id === input.participantId,
        );
        const participants =
          participantExists || !participantTemplate
            ? order.participants
            : [...order.participants, { ...participantTemplate, joinedAt: now() }];
        return {
          ...order,
          participants,
          items: [item, ...order.items],
          lastEvent: `${getParticipantName(input.participantId)} added ${input.quantity}x ${product.name}`,
        };
      });
      const changedOrder = orders.find((order) => order.id === orderId);
      const pulse: DemoPulse = {
        id: now(),
        kind: 'item',
        message: changedOrder?.lastEvent ?? 'Item added',
      };
      const next = {
        ...state,
        orders,
        activeParticipantId: input.participantId,
        lastNotice: changedOrder?.lastEvent ?? 'Item added',
        lastPulse: pulse,
      };
      persistAndBroadcast(next);
      return next;
    }),
  updateStatus: (orderId, status) =>
    set((state) => {
      const orders = state.orders.map((order) =>
        order.id === orderId
          ? { ...order, status, lastEvent: `Store marked order as ${status}` }
          : order,
      );
      const next = {
        ...state,
        orders,
        lastNotice: `Order status updated to ${status}`,
        lastPulse: {
          id: now(),
          kind: status === 'Shipped' ? 'goal' : 'status',
          message: `Order status updated to ${status}`,
        } as DemoPulse,
      };
      persistAndBroadcast(next);
      return next;
    }),
  resetDemo: () =>
    set((state) => {
      const next = { ...state, ...defaultState() };
      persistAndBroadcast(next);
      return next;
    }),
}));

export function initDemoCommerceSync() {
  if (!canUseWindow()) return;
  if ('BroadcastChannel' in window && !channel) {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (event: MessageEvent<PersistedDemoState>) => {
      applyingRemote = true;
      useDemoCommerceStore.setState(sanitizeState(event.data));
      applyingRemote = false;
    };
  }
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      applyingRemote = true;
      useDemoCommerceStore.setState(sanitizeState(JSON.parse(event.newValue)));
    } catch {
      // Ignore malformed external storage writes.
    } finally {
      applyingRemote = false;
    }
  });
}

export function getOrderTotal(order: DemoOrder) {
  return order.items.reduce((total, item) => {
    const product = findProduct(item.productId);
    return total + (product?.price ?? 0) * item.quantity;
  }, 0);
}

export function getOrderItemCount(order: DemoOrder) {
  return order.items.reduce((total, item) => total + item.quantity, 0);
}

export function getSharedDeliveryFee(order: DemoOrder) {
  if (order.participants.length === 0) return DELIVERY_FEE;
  return DELIVERY_FEE / order.participants.length;
}

export function getPersonalSavings(order: DemoOrder) {
  return Math.max(0, DELIVERY_FEE - getSharedDeliveryFee(order));
}

export function getGroupSavings(order: DemoOrder) {
  return getPersonalSavings(order) * order.participants.length;
}

export function getGoalProgress(order: DemoOrder) {
  return Math.min(100, Math.round((getOrderTotal(order) / FREE_SHIPPING_GOAL) * 100));
}

export function getRemainingToGoal(order: DemoOrder) {
  return Math.max(0, FREE_SHIPPING_GOAL - getOrderTotal(order));
}

export function getProductLine(item: DemoOrderItem) {
  const product = findProduct(item.productId);
  return {
    product,
    lineTotal: (product?.price ?? 0) * item.quantity,
    displayName: product?.name ?? 'Unknown product',
  };
}

export function getMasterPickingList(order: DemoOrder) {
  const grouped = new Map<string, { item: DemoOrderItem; product: DemoProduct; quantity: number }>();
  order.items.forEach((item) => {
    const product = findProduct(item.productId);
    if (!product) return;
    const key = `${item.productId}:${item.size}:${item.color}`;
    const current = grouped.get(key);
    if (current) {
      current.quantity += item.quantity;
    } else {
      grouped.set(key, { item, product, quantity: item.quantity });
    }
  });
  return Array.from(grouped.values());
}

export function getOrdersForStore() {
  return useDemoCommerceStore.getState().orders;
}

export function getDemoOrderStats(orders: DemoOrder[]) {
  const shippedOrders = orders.filter((order) => order.status === 'Shipped');
  const totalSavings = shippedOrders.reduce((total, order) => total + getGroupSavings(order), 0);
  const totalParticipants = new Set(
    shippedOrders.flatMap((order) => order.participants.map((participant) => participant.id)),
  ).size;
  return {
    shippedOrders: shippedOrders.length,
    totalSavings,
    totalParticipants,
  };
}

export function getParticipantSuccessCount(orders: DemoOrder[], participantId: string) {
  return orders.reduce((count, order) => {
    const participantSeen = order.participants.some((participant) => participant.id === participantId);
    return participantSeen && order.status === 'Shipped' ? count + 1 : count;
  }, 0);
}

export function getDefaultProductForBrand(brand: DemoBrandId) {
  return productsForBrand(brand)[0] ?? null;
}

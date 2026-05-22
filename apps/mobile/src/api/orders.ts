import { useEffect } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { invokeFn, supabase } from '@/lib/supabase';
import { newIdempotencyKey } from '@/utils/idempotency';
import { track } from '@/lib/posthog';
import type { Order, OrderItem, Participant } from '@/types/domain';

type CreateOrderInput = {
  productUrl: string;
  productTitle: string;
  productPriceAgorot: number;
  productImage?: string;
  storeKey: string;
  storeLabel: string;
  estimatedShippingAgorot: number;
  freeShippingThresholdAgorot: number;
  timerMinutes: number;
  maxParticipants: number;
  pickupResponsibleUserId: string;
  preferredPickupLocation: string;
};

export function useCreateOrder() {
  return useMutation({
    mutationFn: async (input: CreateOrderInput) => {
      const res = await invokeFn<{ order: Order }>('create-order', {
        ...input,
        idempotency_key: newIdempotencyKey(),
      });
      track('start_order_clicked', { orderId: res.order.id });
      return res.order;
    },
  });
}

export function useOrder(orderId: string | undefined) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['order', orderId],
    enabled: !!orderId,
    queryFn: async () => {
      if (!orderId) throw new Error('missing orderId');
      return invokeFn<{
        order: Order;
        participants: Participant[];
        items: OrderItem[];
      }>('get-order', { orderId });
    },
  });

  // Subscribe to realtime changes on this order + its participants.
  useEffect(() => {
    if (!orderId) return;
    const ch = supabase
      .channel(`order:${orderId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
        () => qc.invalidateQueries({ queryKey: ['order', orderId] }),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'participants',
          filter: `order_id=eq.${orderId}`,
        },
        () => qc.invalidateQueries({ queryKey: ['order', orderId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [orderId, qc]);

  return query;
}

export function useUserOrders(userId: string | undefined) {
  return useQuery({
    queryKey: ['userOrders', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*, participants!inner(user_id)')
        .eq('participants.user_id', userId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Order[];
    },
  });
}

export function useConfirmDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orderId: string) => {
      return invokeFn<{ ok: true; completed: boolean }>('confirm-delivery', {
        orderId,
        idempotency_key: newIdempotencyKey(),
      });
    },
    onSuccess: (_d, orderId) => {
      qc.invalidateQueries({ queryKey: ['order', orderId] });
      track('order_completed', { orderId });
    },
  });
}

export function useCloseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orderId: string) => invokeFn<{ order: Order; changed: boolean }>('close-order', { orderId }),
    onSuccess: (_d, orderId) => {
      qc.invalidateQueries({ queryKey: ['order', orderId] });
      qc.invalidateQueries({ queryKey: ['userOrders'] });
      track('order_timer_locked', { orderId });
    },
  });
}

export type DeliveryAction =
  | 'update_pickup'
  | 'mark_shipped'
  | 'mark_ready_for_pickup'
  | 'mark_picked_up'
  | 'mark_ready_for_distribution'
  | 'mark_delivered_to_user';

type UpdateDeliveryInput = {
  orderId: string;
  action: DeliveryAction;
  participantId?: string;
  pickupResponsibleUserId?: string;
  preferredPickupLocation?: string;
};

type AddOrderItemInput = {
  orderId: string;
  participantId: string;
  title: string;
  ref?: string | null;
  size?: string | null;
  priceAgorot: number;
};

export function useUpdateDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateDeliveryInput) => invokeFn<{ ok: true }>('update-delivery', input),
    onSuccess: (_d, input) => {
      qc.invalidateQueries({ queryKey: ['order', input.orderId] });
      track('delivery_status_updated', { orderId: input.orderId, action: input.action });
    },
  });
}

export function useAddOrderItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: AddOrderItemInput) => {
      const orderItems = supabase.from('order_items') as unknown as {
        insert: (values: {
          order_id: string;
          participant_id: string;
          title: string;
          ref: string | null;
          size: string | null;
          price_agorot: number;
        }) => {
          select: (columns: string) => {
            single: () => Promise<{ data: unknown; error: Error | null }>;
          };
        };
      };
      const { data, error } = await orderItems
        .insert({
          order_id: input.orderId,
          participant_id: input.participantId,
          title: input.title.trim(),
          ref: input.ref?.trim() || null,
          size: input.size?.trim() || null,
          price_agorot: input.priceAgorot,
        })
        .select('*')
        .single();
      if (error) throw error;
      return data as OrderItem;
    },
    onSuccess: (_item, input) => {
      qc.invalidateQueries({ queryKey: ['order', input.orderId] });
      track('cart_item_added', { orderId: input.orderId });
    },
  });
}

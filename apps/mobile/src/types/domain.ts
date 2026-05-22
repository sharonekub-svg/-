export type OrderStatus =
  | 'draft'
  | 'open'
  | 'paying'
  | 'locked'
  | 'escrow'
  | 'delivered'
  | 'completed'
  | 'cancelled';

export type ParticipantStatus = 'invited' | 'joined' | 'paid' | 'refunded';

export type ShippingStatus =
  | 'not_shipped'
  | 'shipped'
  | 'ready_for_pickup'
  | 'picked_up'
  | 'ready_for_distribution';

export type Profile = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  city: string;
  street: string;
  building: string;
  apt: string;
  floor: string | null;
};

export type Order = {
  id: string;
  creator_id: string;
  building_id: string | null;
  product_url: string;
  product_title: string | null;
  product_image: string | null;
  product_price_agorot: number;
  max_participants: number;
  store_key?: string | null;
  store_label?: string | null;
  estimated_shipping_agorot?: number;
  free_shipping_threshold_agorot?: number;
  closes_at?: string | null;
  edit_locks_at?: string | null;
  locked_at?: string | null;
  founder_checkout_url?: string | null;
  status: OrderStatus;
  stripe_payment_intent_id: string | null;
  stripe_transfer_group: string | null;
  pickup_responsible_user_id?: string | null;
  pickup_responsible_name?: string | null;
  preferred_pickup_location?: string | null;
  pickup_location_note?: string | null;
  shipping_status?: ShippingStatus;
  shipped_at?: string | null;
  ready_for_pickup_at?: string | null;
  picked_up_at?: string | null;
  ready_for_distribution_at?: string | null;
  created_at: string;
  updated_at: string;
  delivery_confirmed_at: string | null;
  completed_at: string | null;
};

export type Participant = {
  id: string;
  order_id: string;
  user_id: string;
  status: ParticipantStatus;
  amount_agorot: number;
  joined_at: string;
  paid_at: string | null;
  delivered_to_user_at?: string | null;
  received_confirmed_at?: string | null;
  stripe_payment_intent_id: string | null;
};

export type OrderItem = {
  id: string;
  order_id: string;
  participant_id: string;
  title: string;
  ref: string | null;
  size: string | null;
  price_agorot: number;
};

export type Invite = {
  id: string;
  order_id: string;
  token: string;
  created_by: string;
  expires_at: string;
  max_uses: number;
  uses_count: number;
  revoked_at: string | null;
};

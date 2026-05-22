/**
 * Generated Supabase types placeholder. Regenerate after migrations with:
 *   pnpm supabase:gen:types
 *
 * Until then, this mirrors the public schema hand-written in migrations.
 */
import type {
  Order,
  OrderItem,
  Participant,
  Profile,
  Invite,
  OrderStatus,
  ParticipantStatus,
} from './domain';

type Row<T> = T;
type Insert<T> = Partial<T>;
type Update<T> = Partial<T>;

export type Database = {
  public: {
    Tables: {
      profiles: { Row: Row<Profile>; Insert: Insert<Profile>; Update: Update<Profile> };
      orders: { Row: Row<Order>; Insert: Insert<Order>; Update: Update<Order> };
      participants: {
        Row: Row<Participant>;
        Insert: Insert<Participant>;
        Update: Update<Participant>;
      };
      order_items: { Row: Row<OrderItem>; Insert: Insert<OrderItem>; Update: Update<OrderItem> };
      invites: { Row: Row<Invite>; Insert: Insert<Invite>; Update: Update<Invite> };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      order_status: OrderStatus;
      participant_status: ParticipantStatus;
    };
  };
};

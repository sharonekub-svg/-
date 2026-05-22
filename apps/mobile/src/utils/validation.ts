import { z } from 'zod';

export const phoneSchema = z
  .string()
  .transform((s) => s.replace(/\D/g, ''))
  .refine((s) => s.length >= 9 && s.length <= 10, 'מספר טלפון לא תקין');

export const nameSchema = z.object({
  firstName: z.string().trim().min(2, 'שם פרטי קצר מדי'),
  lastName: z.string().trim().min(2, 'שם משפחה קצר מדי'),
});

export const addressSchema = z.object({
  city: z.string().trim().min(1),
  street: z.string().trim().min(1),
  building: z.string().trim().min(1),
  apt: z.string().trim().min(1),
  floor: z.string().trim().optional(),
});

export const productUrlSchema = z
  .string()
  .trim()
  .url('כתובת לא תקינה')
  .refine((u) => /^https?:\/\//.test(u), 'חייב להיות קישור תקין');

export const otpSchema = z
  .string()
  .regex(/^\d{6}$/, 'קוד האימות חייב להיות 6 ספרות');

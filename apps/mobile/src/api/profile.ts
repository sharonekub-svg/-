import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/types/domain';

export function useProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ['profile', userId],
    enabled: !!userId,
    queryFn: async (): Promise<Profile | null> => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useUpsertProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: Profile) => {
      const payload = {
        id: p.id,
        first_name: p.first_name.trim(),
        last_name: p.last_name.trim(),
        phone: p.phone ?? '',
        city: p.city ?? '',
        street: p.street ?? '',
        building: p.building ?? '',
        apt: p.apt ?? '',
        floor: p.floor?.trim() || null,
      };
      const { error } = await supabase.from('profiles').upsert(payload as never, { onConflict: 'id' });
      if (error) throw new Error(error.message || 'Could not save profile');
      return p;
    },
    onSuccess: (profile) => {
      qc.setQueryData(['profile', profile.id], profile);
      qc.invalidateQueries({ queryKey: ['profile', profile.id] });
    },
  });
}

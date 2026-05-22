import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { ScreenBase } from '@/components/primitives/ScreenBase';
import { PrimaryBtn, SecondaryBtn } from '@/components/primitives/Button';
import { BackBtn } from '@/components/primitives/BackBtn';
import { StepDots } from '@/components/primitives/StepDots';
import { AutoField } from '@/components/primitives/AutoField';
import { NumField } from '@/components/primitives/NumField';
import { colors, radii, shadow } from '@/theme/tokens';
import { fontFamily } from '@/theme/fonts';
import { useAuthStore } from '@/stores/authStore';
import { useUpsertProfile } from '@/api/profile';
import { useUiStore } from '@/stores/uiStore';
import { useProfileDraftStore } from '@/stores/profileDraftStore';
import { consumePendingInvite } from '@/lib/deeplinks';
import { useLocale } from '@/i18n/locale';
import { searchCities, searchStreets } from '@/lib/locationAutocomplete';

export default function Address() {
  const router = useRouter();
  const { t, language } = useLocale();
  const profile = useAuthStore((s) => s.profile);
  const user = useAuthStore((s) => s.user);
  const setProfile = useAuthStore((s) => s.setProfile);
  const upsert = useUpsertProfile();
  const pushToast = useUiStore((s) => s.pushToast);
  const draft = useProfileDraftStore((s) => s.draft);
  const setDraft = useProfileDraftStore((s) => s.setDraft);
  const clearDraft = useProfileDraftStore((s) => s.clearDraft);

  const [city, setCity] = useState('');
  const [cityLocked, setCityLocked] = useState(false);
  const [street, setStreet] = useState('');
  const [citySuggs, setCitySuggs] = useState<string[]>([]);
  const [streetSuggs, setStreetSuggs] = useState<string[]>([]);
  const [cityLoad, setCityLoad] = useState(false);
  const [streetLoad, setStreetLoad] = useState(false);
  const [building, setBuilding] = useState('');
  const [apt, setApt] = useState('');
  const [floor, setFloor] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const skipPersistRef = useRef(false);
  const lastPersistedDraftKeyRef = useRef<string | null>(null);
  const hydratedAddressRef = useRef(false);

  const getProfileBase = useCallback(() => {
    if (!user) return null;
    const userDraft = draft?.id === user.id ? draft : null;
    const userProfile = profile?.id === user.id ? profile : null;
    const emailName = user.email?.split('@')[0]?.replace(/[._-]+/g, ' ').trim();
    const metadataName =
      typeof user.user_metadata?.full_name === 'string'
        ? user.user_metadata.full_name.trim()
        : '';
    const fallbackName = metadataName || emailName || 'Shakana user';
    const [fallbackFirst = 'Shakana', ...fallbackLastParts] = fallbackName.split(/\s+/).filter(Boolean);
    return (
      userDraft ??
      userProfile ?? {
        id: user.id,
        first_name: fallbackFirst,
        last_name: fallbackLastParts.join(' ') || 'User',
        phone: user.phone ?? '',
        city: '',
        street: '',
        building: '',
        apt: '',
        floor: null,
      }
    );
  }, [draft, profile, user]);

  useEffect(() => {
    if (hydratedAddressRef.current) return;
    if (!user) return;
    const savedAddress =
      draft?.id === user.id
        ? draft
        : profile?.id === user.id
          ? profile
          : null;
    if (!savedAddress) return;

    hydratedAddressRef.current = true;
    setCity(savedAddress.city ?? '');
    setCityLocked(!!savedAddress.city);
    setStreet(savedAddress.street ?? '');
    setBuilding(savedAddress.building ?? '');
    setApt(savedAddress.apt ?? '');
    setFloor(savedAddress.floor ?? '');
  }, [draft, profile, user]);

  useEffect(() => {
    if (skipPersistRef.current) return;
    const baseProfile = getProfileBase();

    if (!baseProfile) return;

    const nextDraft = {
      ...baseProfile,
      city: city.trim(),
      street: street.trim(),
      building: building.trim(),
      apt: apt.trim(),
      floor: floor.trim() || null,
    };
    const nextDraftKey = JSON.stringify({
      id: nextDraft.id,
      first_name: nextDraft.first_name,
      last_name: nextDraft.last_name,
      phone: nextDraft.phone,
      city: nextDraft.city,
      street: nextDraft.street,
      building: nextDraft.building,
      apt: nextDraft.apt,
      floor: nextDraft.floor,
    });
    const currentDraftKey = draft
      ? JSON.stringify({
          id: draft.id,
          first_name: draft.first_name,
          last_name: draft.last_name,
          phone: draft.phone,
          city: draft.city,
          street: draft.street,
          building: draft.building,
          apt: draft.apt,
          floor: draft.floor,
        })
      : null;

    if (nextDraftKey === currentDraftKey || nextDraftKey === lastPersistedDraftKeyRef.current) return;

    lastPersistedDraftKeyRef.current = nextDraftKey;
    void setDraft(nextDraft);
  }, [apt, building, city, draft, floor, getProfileBase, setDraft, street]);

  const selectCity = (c: string) => {
    const nextCity = c.trim();
    setCity(nextCity);
    setCityLocked(nextCity.length > 0);
    setStreet('');
    setStreetSuggs([]);
  };

  const commitBestCity = () => {
    const best = citySuggs[0];
    if (best) selectCity(best);
  };

  const runCitySearch = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 1) {
      setCitySuggs([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setCityLoad(true);
      try {
        const res = await searchCities(q, language, ac.signal);
        setCitySuggs(res);
      } catch {
        setCitySuggs([]);
      } finally {
        setCityLoad(false);
      }
    }, 250);
  }, [language]);

  const runStreetSearch = useCallback(
    (q: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (q.trim().length < 1) {
        setStreetSuggs([]);
        return;
      }
      debounceRef.current = setTimeout(async () => {
        abortRef.current?.abort();
        const ac = new AbortController();
        abortRef.current = ac;
        setStreetLoad(true);
        try {
          const res = await searchStreets(q, cityLocked ? city : '', language, ac.signal);
          setStreetSuggs(res);
        } catch {
          setStreetSuggs([]);
        } finally {
          setStreetLoad(false);
        }
      }, 350);
    },
    [city, cityLocked, language],
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  useEffect(() => {
    if (cityLocked) return;
    runCitySearch(city);
  }, [city, cityLocked, runCitySearch]);

  const onStreetChange = (v: string) => {
    setStreet(v);
    runStreetSearch(v);
  };

  const hasAnyAddressValue = [city, street, building, apt, floor].some((value) => value.trim().length > 0);

  const clearAddress = () => {
    setCity('');
    setCityLocked(false);
    setStreet('');
    setBuilding('');
    setApt('');
    setFloor('');
    setCitySuggs([]);
    setStreetSuggs([]);
  };

  const submit = async (
    addressOverride?: {
      city: string;
      street: string;
      building: string;
      apt: string;
      floor: string | null;
    },
  ) => {
    if (!user) {
      router.replace('/login');
      return;
    }

    const baseProfile = getProfileBase();
    if (!baseProfile) return;

    const updated = {
      ...baseProfile,
      city: addressOverride?.city ?? city.trim(),
      street: addressOverride?.street ?? street.trim(),
      building: addressOverride?.building ?? building.trim(),
      apt: addressOverride?.apt ?? apt.trim(),
      floor: addressOverride ? addressOverride.floor : floor.trim() || null,
    };
    try {
      await upsert.mutateAsync(updated);
      skipPersistRef.current = true;
      setProfile(updated);
      await clearDraft();
      const pending = await consumePendingInvite();
      if (pending) {
        router.replace(`/join/${pending}`);
      } else {
        router.replace('/(auth)/success');
      }
    } catch (e) {
      pushToast(e instanceof Error ? e.message : t('auth.address.saveError'), 'error');
    }
  };

  return (
    <ScreenBase style={styles.screen}>
      <View style={styles.header}>
        <BackBtn onPress={() => router.back()} />
        <StepDots total={4} current={2} />
      </View>

      <View style={styles.hero}>
        <Text style={styles.kicker}>SHAKANA</Text>
        <Text style={styles.title}>
          {language === 'he' ? 'כתובת בניין להתראות שכנים' : 'Building address for neighbor alerts'}
        </Text>
        <Text style={styles.subtitle}>
          {language === 'he'
            ? 'זה אופציונלי. מלא רק אם תרצה לקבל התראות כששכנים בבניין שלך פותחים הזמנה.'
            : 'This is optional. Add it only if you want alerts when neighbors in your building open an order.'}
        </Text>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 14, paddingBottom: 6 }}>
        {!cityLocked ? (
          <AutoField
            label={language === 'he' ? 'עיר (אופציונלי)' : 'City (optional)'}
            value={city}
            onChange={(v) => {
              setCity(v);
              setCityLocked(false);
            }}
            onSelect={selectCity}
            onSubmitEditing={commitBestCity}
            placeholder={t('auth.address.citySearch')}
            suggestions={citySuggs}
            loading={cityLoad}
            autoFocus
            direction={language === 'en' ? 'ltr' : 'rtl'}
          />
        ) : (
          <View style={{ gap: 8 }}>
            <Text style={styles.fieldLabel}>{language === 'he' ? 'עיר (אופציונלי)' : 'City (optional)'}</Text>
            <View style={styles.cityChip}>
              <Text style={styles.cityChipText}>{city}</Text>
              <Pressable
                onPress={() => {
                  setCityLocked(false);
                  setStreet('');
                  setStreetSuggs([]);
                }}
                hitSlop={8}
              >
                <Text style={styles.cityChange}>{t('common.change')}</Text>
              </Pressable>
            </View>
          </View>
        )}

        <AutoField
          label={language === 'he' ? 'רחוב (אופציונלי)' : 'Street (optional)'}
          value={street}
          onChange={onStreetChange}
          onSelect={(v) => {
            setStreet(v);
            setStreetSuggs([]);
          }}
          onSubmitEditing={() => {
            const best = streetSuggs[0];
            if (best) setStreet(best);
          }}
          placeholder={
            cityLocked
              ? t('auth.address.streetSearch', { city })
              : language === 'he'
                ? 'אפשר להקליד רחוב בלי לבחור עיר'
                : 'You can type a street without choosing a city'
          }
          suggestions={streetSuggs}
          loading={streetLoad}
          direction={language === 'en' ? 'ltr' : 'rtl'}
        />

        <View style={styles.row}>
          <NumField
            label={language === 'he' ? 'בניין' : t('auth.address.building')}
            value={building}
            onChange={setBuilding}
            placeholder="22"
          />
          <NumField
            label={language === 'he' ? 'דירה' : t('auth.address.apartment')}
            value={apt}
            onChange={setApt}
            placeholder="4"
          />
          <NumField
            label={language === 'he' ? 'קומה' : t('auth.address.floor')}
            value={floor}
            onChange={setFloor}
            placeholder="2"
          />
        </View>

        <View style={styles.privacy}>
          <Text style={styles.privacyText}>
            {language === 'he'
              ? 'אפשר להשאיר ריק. אם תמלא כתובת, נשתמש בה רק כדי לזהות הזמנות והתראות של שכנים מהבניין שלך.'
              : 'You can leave this empty. If you add an address, it is only used for building-based neighbor order alerts.'}
          </Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {hasAnyAddressValue ? (
          <SecondaryBtn
            label={language === 'he' ? 'מחק כתובת והמשך בלי' : 'Delete address and continue without it'}
            onPress={() => {
              clearAddress();
              void submit({ city: '', street: '', building: '', apt: '', floor: null });
            }}
          />
        ) : null}
        <PrimaryBtn
          label={language === 'he' ? 'שמור והמשך' : t('common.save')}
          onPress={submit}
          loading={upsert.isPending}
        />
      </View>
    </ScreenBase>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingTop: 20,
    paddingBottom: 36,
    gap: 22,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  hero: {
    gap: 10,
  },
  kicker: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 10,
    letterSpacing: 2.4,
    color: colors.acc,
  },
  title: {
    fontFamily: fontFamily.display,
    fontSize: 30,
    color: colors.tx,
    lineHeight: 34,
  },
  subtitle: { fontFamily: fontFamily.body, fontSize: 15, color: colors.mu, lineHeight: 24 },
  fieldLabel: { fontSize: 13, color: colors.mu, fontFamily: fontFamily.bodyBold },
  cityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderColor: colors.br,
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingVertical: 13,
    paddingHorizontal: 16,
    minHeight: 54,
    ...shadow.card,
  },
  cityChipText: {
    flex: 1,
    fontSize: 16,
    color: colors.tx,
    fontFamily: fontFamily.bodyBold,
  },
  cityChange: {
    fontSize: 13,
    color: colors.acc,
    paddingHorizontal: 6,
    fontFamily: fontFamily.bodyBold,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  privacy: {
    backgroundColor: colors.accLight,
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  privacyText: {
    fontSize: 13,
    color: colors.acc,
    lineHeight: 20,
    fontFamily: fontFamily.body,
  },
  footer: {
    paddingTop: 16,
    gap: 10,
  },
});

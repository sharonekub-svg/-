import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';

import { ScreenBase } from '@/components/primitives/ScreenBase';
import { BackBtn } from '@/components/primitives/BackBtn';
import { PrimaryBtn } from '@/components/primitives/Button';
import { Field } from '@/components/primitives/Field';
import { NumField } from '@/components/primitives/NumField';
import { colors, radii, shadow } from '@/theme/tokens';
import { fontFamily } from '@/theme/fonts';
import { productUrlSchema } from '@/utils/validation';
import { useCreateOrder } from '@/api/orders';
import { useUiStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import { useLocale } from '@/i18n/locale';
import { loadSharedProductInsights, parseSharedProduct, type SharedProductInsights } from '@/lib/sharedProduct';
import { fetchProductPageHtml } from '@/api/productInsights';
import { formatAgorot } from '@/utils/format';
import { formatCompactDuration, timerUnitToMinutes } from '@/utils/timer';

type NewOrderParams = {
  url?: string;
  title?: string;
  source?: string;
  store?: string;
};

const ZARA_START_URL = 'https://www.zara.com/il/';
const DEFAULT_DELIVERY_FEE_AGOROT = 3000;
const DEFAULT_FREE_SHIPPING_THRESHOLD_AGOROT = 19900;
const TIMER_UNITS = ['minutes', 'hours', 'days'] as const;
const TIMER_PRESETS = [
  { label: '30m', value: '30', unit: 'minutes' },
  { label: '2h', value: '2', unit: 'hours' },
  { label: '5h', value: '5', unit: 'hours' },
  { label: '1d', value: '1', unit: 'days' },
] as const;

export default function NewOrder() {
  const router = useRouter();
  const params = useLocalSearchParams<NewOrderParams>();
  const { language, t } = useLocale();
  const isHebrew = language === 'he';
  const copy = isHebrew
    ? {
        detectedAfterPaste: 'יזוהה אחרי הדבקת הקישור',
        waitingForLink: 'ממתין לקישור מוצר',
        addPrice: 'הוסף מחיר ידנית',
        readingPrice: 'קורא מחיר...',
        addThreshold: 'הוסף סכום למשלוח חינם',
        unknownThreshold: 'לא ידוע עד שמוסיפים סכום',
        noDeal: 'לא זוהה מבצע כרגע',
        linkNotWorking: 'הלינק לא עובד?',
        closeHelp: 'סגור עזרה',
        linkHelpTitle: 'אפשר להמשיך גם בלי זיהוי אוטומטי',
        linkHelpBody:
          'אם Amazon או חנות אחרת חסמה מחיר, תמונה או משלוח, מלא את שם המוצר, המחיר, החנות והמשלוח בשדות למעלה. ההזמנה והשיתוף עדיין יעבדו רגיל.',
        findProductTitle: 'מצא מוצר, העתק קישור וחזור לכאן.',
        findProductBody:
          'זה המסלול הבטוח והפשוט: Shakana פותחת את החנות, אתה בוחר את הפריט המדויק, מעתיק את הקישור של דף המוצר, ואז Shakana קוראת מידע ציבורי ומשאירה שדות ידניים אם החנות חוסמת פרטים.',
        openZara: 'פתח את Zara',
        useCopiedLink: 'השתמש בקישור שהועתק',
        copyLinkHelp: 'מצא את המוצר, העתק את קישור הדף וחזור לכאן.',
        noProductLink: 'לא נמצא קישור מוצר בטקסט שהועתק.',
        productLinkAdded: 'קישור המוצר נוסף.',
        store: 'חנות',
        storePlaceholder: 'Zara, H&M, Amazon...',
        titlePlaceholder: 'חולצה מזארה',
        stepProduct: 'קישור מוצר',
        stepProductBody: 'הדבק קישור מכל חנות. פרמטרים של מעקב יוסרו אוטומטית.',
        timerShipping: 'טיימר ומשלוח',
        timerShippingBody: 'שכנים יכולים להצטרף עד שהטיימר מסתיים. עריכות ננעלות מעט לפני הסגירה.',
        timer: 'טיימר',
        freeShippingFrom: 'משלוח חינם מסכום',
        product: 'מוצר',
        pasteProductLink: 'הדבק קישור מוצר',
        readingProduct: 'קורא את דף המוצר...',
        deal: 'מבצע',
        simpleOrder: 'הזמנה פשוטה, בלי בלגן.',
        finderResult: 'תוצאת איתור מוצר',
        finderTitle: 'מה Shakana מצאה מהקישור',
        whatItIs: 'מה המוצר',
        whereFrom: 'מאיפה זה מגיע',
        productCost: 'מחיר המוצר',
        deliveryFee: 'דמי משלוח',
        importantCosts: 'עלויות חשובות',
        freeShippingMinimum: 'סכום למשלוח חינם',
        costCardNote: 'אלה המספרים שרואים מיד אחרי הלינק: מחיר המוצר, דמי המשלוח, מאיזה סכום המשלוח חינם, וכמה חסר.',
        freeDeliveryFrom: 'משלוח חינם מ',
        missingFreeDelivery: 'חסר למשלוח חינם',
        dealCheck: 'בדיקת מבצע / 1+1',
        finderNote: 'אם החנות חוסמת פרטים ציבוריים, Shakana משאירה את השדות הידניים כדי שההזמנה עדיין תמשיך.',
        timerPlan: 'תוכנית הזמנה לפי טיימר',
        timerPlanIntro: 'אין יעד סכום: ההזמנה נסגרת לפי זמן, ואז מייסד ההזמנה מקבל קישור וקונה ידנית.',
        timerClosesIn: 'הטיימר נסגר בעוד',
        showCart: 'הצג סל',
        hideCart: 'הסתר סל',
        oneItem: 'פריט אחד',
        shoppingCart: 'סל קניות',
        manualProduct: 'מוצר שלא זוהה אוטומטית',
        chooseStore: 'בחר חנות',
        productPrice: 'מחיר מוצר',
        cartHint: 'המגירה משאירה את הגלישה נקייה ועדיין מראה מה יוזמן.',
        pickup: 'איסוף',
        pickupManager: 'אחראי איסוף: אתה',
        pickupBody:
          'בחר נקודת איסוף מועדפת לפני יצירת ההזמנה. כולם יראו אותה, ואפשר לעדכן אותה בהמשך.',
        pickupLocation: 'מיקום איסוף מועדף',
        pickupPlaceholder: 'לובי הבניין, נקודת איסוף, או הדירה שלך',
        pickupUncertain: 'מיקום האיסוף עשוי להשתנות לפי החנות או חברת המשלוחים',
        noTimerLabel: 'ללא טיימר',
        noTimerDesc: 'ההזמנה תישאר פתוחה עד שתסגור אותה ידנית.',
        min: 'דק׳',
        hr: 'שעה',
        day: 'יום',
      }
    : {
        detectedAfterPaste: 'Detected after link paste',
        waitingForLink: 'Waiting for product link',
        addPrice: 'Add price manually',
        readingPrice: 'Reading price...',
        addThreshold: 'Add store threshold',
        unknownThreshold: 'Unknown until threshold is added',
        noDeal: 'No deal detected yet',
        linkNotWorking: 'Link not working?',
        closeHelp: 'Close help',
        linkHelpTitle: 'You can continue without automatic detection',
        linkHelpBody:
          'If Amazon or another store blocks price, image, or shipping details, fill in product name, price, store, and shipping in the fields above. The order and invite link will still work.',
        findProductTitle: 'Find a product, copy the URL, then come back.',
        findProductBody:
          'This is the safe practical flow: Shakana opens the store, you choose the exact item, copy the product page link, then Shakana reads public product data and keeps manual fields ready if the store blocks details.',
        openZara: 'Open Zara',
        useCopiedLink: 'Use copied link',
        copyLinkHelp: 'Find the product, copy its page link, then come back here.',
        noProductLink: 'No product link found in the copied text.',
        productLinkAdded: 'Product link added.',
        store: 'Store',
        storePlaceholder: 'Zara, H&M, Amazon...',
        titlePlaceholder: 'Zara shirt',
        stepProduct: 'Product link',
        stepProductBody: 'Paste any store link. Tracking parameters are removed automatically.',
        timerShipping: 'Timer and shipping',
        timerShippingBody: 'People can join until the timer ends. Edits lock right before closing.',
        timer: 'Timer',
        freeShippingFrom: 'Free shipping from',
        product: 'Product',
        pasteProductLink: 'Paste a product link',
        readingProduct: 'Reading the product page...',
        deal: 'Deal',
        simpleOrder: 'Simple order, no extra clutter.',
        finderResult: 'Product finder result',
        finderTitle: 'What Shakana found from the link',
        whatItIs: 'What it is',
        whereFrom: 'Where it comes from',
        productCost: 'Product cost',
        deliveryFee: 'Delivery fee',
        importantCosts: 'Important costs',
        freeShippingMinimum: 'Free delivery minimum',
        costCardNote: 'These are shown first after the link: product price, delivery fee, free-delivery minimum, and how much is missing.',
        freeDeliveryFrom: 'Free delivery from',
        missingFreeDelivery: 'Missing for free delivery',
        dealCheck: 'Deal / 1+1 check',
        finderNote: 'If the store blocks public details, Shakana keeps the manual fields above so the order can still continue.',
        timerPlan: 'Timer-based order plan',
        timerPlanIntro: 'No target amount: the order closes by time, then the founder gets the checkout link and buys manually.',
        timerClosesIn: 'Timer closes in',
        showCart: 'Show cart drawer',
        hideCart: 'Hide cart drawer',
        oneItem: '1 item',
        shoppingCart: 'Shopping cart',
        manualProduct: 'Manual product',
        chooseStore: 'Choose store',
        productPrice: 'Product price',
        cartHint: 'This drawer keeps browsing clean while still showing what will be ordered.',
        pickup: 'Pickup',
        pickupManager: 'Pickup manager: you',
        pickupBody:
          'Choose the preferred pickup point before creating the order. Everyone will see it, and it can be updated later.',
        pickupLocation: 'Preferred pickup location',
        pickupPlaceholder: 'Building lobby, pickup point, or your apartment',
        pickupUncertain: 'Pickup location may vary depending on the store/shipping provider',
        noTimerLabel: 'No timer',
        noTimerDesc: 'The order stays open until you close it manually.',
        min: 'min',
        hr: 'hr',
        day: 'day',
      };
  const initialDraft = parseSharedProduct({
    url: typeof params.url === 'string' ? params.url : null,
    title: typeof params.title === 'string' ? params.title : null,
    manualStoreLabel: typeof params.store === 'string' ? params.store : null,
  });
  const isZaraStart = params.store === 'zara' || initialDraft?.source === 'zara';
  const [url, setUrl] = useState(() => initialDraft?.url ?? '');
  const [storeLabel, setStoreLabel] = useState(() => initialDraft?.storeLabel ?? (typeof params.store === 'string' ? params.store : ''));
  const [title, setTitle] = useState(() => initialDraft?.title ?? '');
  const [price, setPrice] = useState('');
  const [noTimer, setNoTimer] = useState(false);
  const [timerValue, setTimerValue] = useState('30');
  const [timerUnit, setTimerUnit] = useState<(typeof TIMER_UNITS)[number]>('minutes');
  const [freeShippingThreshold, setFreeShippingThreshold] = useState('199');
  const [cartOpen, setCartOpen] = useState(false);
  const [linkHelpOpen, setLinkHelpOpen] = useState(false);
  const [insights, setInsights] = useState<SharedProductInsights | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(Boolean(initialDraft));
  const [linkMessage, setLinkMessage] = useState('');
  const create = useCreateOrder();
  const pushToast = useUiStore((s) => s.pushToast);
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const defaultPickupLocation = [profile?.street, profile?.building, profile?.city]
    .filter(Boolean)
    .join(', ');
  const [pickupLocation, setPickupLocation] = useState(defaultPickupLocation);
  const currentDraft = parseSharedProduct({
    url,
    title: title || initialDraft?.title || null,
    manualStoreLabel: storeLabel,
  });

  const urlCheck = productUrlSchema.safeParse(url);
  const parsedPriceAgorot = Math.floor(Number(price) * 100);
  const priceAgorot = insights?.priceAgorot ?? (Number.isFinite(parsedPriceAgorot) && parsedPriceAgorot > 0 ? parsedPriceAgorot : 0);
  const rawTimerValue = Math.max(1, Math.floor(Number(timerValue)) || 30);
  const timerMinutesNumber = Math.max(5, Math.min(10080, timerUnitToMinutes(rawTimerValue, timerUnit)));
  const timerLabel = formatCompactDuration(timerMinutesNumber * 60_000);
  const freeShippingThresholdAgorot =
    insights?.freeShippingThresholdAgorot ??
    Math.max(DEFAULT_FREE_SHIPPING_THRESHOLD_AGOROT, Math.floor(Number(freeShippingThreshold) * 100) || 0);
  const deliveryFeeAgorot =
    typeof insights?.deliveryFeeAgorot === 'number' && insights.deliveryFeeAgorot > 0
      ? insights.deliveryFeeAgorot
      : priceAgorot >= freeShippingThresholdAgorot && freeShippingThresholdAgorot > 0
        ? 0
        : DEFAULT_DELIVERY_FEE_AGOROT;
  const freeShippingGapAgorot = Math.max(0, freeShippingThresholdAgorot - priceAgorot);
  const sourceLabel = insights?.sourceLabel || storeLabel || currentDraft?.storeLabel || copy.detectedAfterPaste;
  const productName = insights?.title || title || currentDraft?.title || copy.waitingForLink;
  const productCostLabel = priceAgorot > 0 ? formatAgorot(priceAgorot) : insightsLoading ? copy.readingPrice : copy.addPrice;
  const freeShippingThresholdLabel =
    freeShippingThresholdAgorot > 0 ? formatAgorot(freeShippingThresholdAgorot) : copy.addThreshold;
  const freeShippingGapLabel =
    freeShippingThresholdAgorot > 0 ? formatAgorot(freeShippingGapAgorot) : copy.unknownThreshold;
  const dealLabel = insights?.promotionText || insights?.dealSummary || copy.noDeal;
  const deliveryFeeLabel = insightsLoading ? copy.readingProduct : formatAgorot(deliveryFeeAgorot);
  const fallbackPickupLocation = language === 'he' ? 'יתואם אחרי פתיחת ההזמנה' : 'Will be coordinated after opening the order';
  const valid =
    urlCheck.success &&
    sourceLabel.trim().length > 1 &&
    productName.trim().length > 1 &&
    priceAgorot > 0 &&
    Boolean(user?.id);

  useEffect(() => {
    if (!pickupLocation.trim() && defaultPickupLocation) {
      setPickupLocation(defaultPickupLocation);
    }
  }, [defaultPickupLocation, pickupLocation]);

  useEffect(() => {
    if (!currentDraft) {
      setInsights(null);
      setInsightsLoading(false);
      return;
    }

    let active = true;
    setInsightsLoading(true);

    void loadSharedProductInsights(currentDraft, fetchProductPageHtml)
      .then((next) => {
        if (!active) return;
        setInsights(next);
        setStoreLabel((prev) => prev || next.sourceLabel);
        if (!title.trim()) setTitle(next.title);
        if (!price.trim() && next.priceAgorot) {
          setPrice((next.priceAgorot / 100).toFixed(2).replace(/\.00$/, ''));
        }
        if (next.freeShippingThresholdAgorot) {
          setFreeShippingThreshold((next.freeShippingThresholdAgorot / 100).toFixed(2).replace(/\.00$/, ''));
        }
      })
      .catch(() => {
        if (active) setInsights(null);
      })
      .finally(() => {
        if (active) setInsightsLoading(false);
      });

    return () => {
      active = false;
    };
    // Re-read only when the product URL changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDraft?.url]);

  const openZara = async () => {
    await Linking.openURL(ZARA_START_URL);
    setLinkMessage(copy.copyLinkHelp);
  };

  const useCopiedLink = async () => {
    const copied = await Clipboard.getStringAsync();
    const draft = parseSharedProduct({ url: copied, text: copied });
    if (!draft) {
      setLinkMessage(copy.noProductLink);
      return;
    }
    setUrl(draft.url);
    setStoreLabel(draft.storeLabel);
    setTitle((prev) => prev || draft.title);
    setLinkMessage(copy.productLinkAdded);
  };

  const submit = async () => {
    if (!valid || create.isPending) return;
    try {
      const order = await create.mutateAsync({
        productUrl: url.trim(),
        productTitle: productName.trim(),
        productPriceAgorot: priceAgorot,
        productImage: insights?.imageUrl ?? undefined,
        storeKey: currentDraft?.source ?? 'manual',
        storeLabel: sourceLabel.trim(),
        estimatedShippingAgorot: deliveryFeeAgorot,
        freeShippingThresholdAgorot,
        timerMinutes: noTimer ? 0 : timerMinutesNumber,
        maxParticipants: 12,
        pickupResponsibleUserId: user!.id,
        preferredPickupLocation: pickupLocation.trim() || fallbackPickupLocation,
      });
      router.replace(`/order/${order.id}`);
    } catch (e) {
      pushToast(e instanceof Error ? e.message : t('order.new.error'), 'error');
    }
  };

  return (
    <ScreenBase padded={false}>
      <ScrollView contentContainerStyle={styles.screen} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <BackBtn onPress={() => router.back()} />
          <Text style={styles.title}>{t('order.new.title')}</Text>
          <View style={{ width: 40 }} />
        </View>

        {isZaraStart ? (
          <View style={styles.guideCard}>
            <Text style={styles.kicker}>ZARA</Text>
            <Text style={styles.guideTitle}>{copy.findProductTitle}</Text>
            <Text style={styles.guideBody}>
              {copy.findProductBody}
            </Text>
            <View style={styles.actions}>
              <Pressable style={styles.primarySmall} onPress={openZara}>
                <Text style={styles.primarySmallText}>{copy.openZara}</Text>
              </Pressable>
              <Pressable style={styles.secondarySmall} onPress={useCopiedLink}>
                <Text style={styles.secondarySmallText}>{copy.useCopiedLink}</Text>
              </Pressable>
            </View>
            {linkMessage ? <Text style={styles.noteText}>{linkMessage}</Text> : null}
          </View>
        ) : null}

        <View style={styles.formCard}>
          <View style={styles.stepHeader}>
            <View style={styles.stepBadge}>
              <Text style={styles.stepBadgeText}>1</Text>
            </View>
            <View style={styles.stepCopy}>
              <Text style={styles.stepTitle}>{copy.stepProduct}</Text>
              <Text style={styles.stepBody}>{copy.stepProductBody}</Text>
            </View>
          </View>
          <Field
            label={t('order.new.urlLabel')}
            value={url}
            onChange={setUrl}
            placeholder="https://..."
            ltr
            keyboardType="url"
            autoCapitalize="none"
          />
          <View style={styles.costCard}>
            <Text style={styles.kicker}>{copy.importantCosts}</Text>
            <View style={styles.costGrid}>
              <View style={styles.costItem}>
                <Text style={styles.costLabel}>{copy.productCost}</Text>
                <Text style={styles.costValue}>{productCostLabel}</Text>
              </View>
              <View style={styles.costItem}>
                <Text style={styles.costLabel}>{copy.deliveryFee}</Text>
                <Text style={styles.costValue}>{deliveryFeeLabel}</Text>
              </View>
              <View style={styles.costItem}>
                <Text style={styles.costLabel}>{copy.freeShippingMinimum}</Text>
                <Text style={styles.costValue}>{freeShippingThresholdLabel}</Text>
              </View>
              <View style={styles.costItem}>
                <Text style={styles.costLabel}>{copy.missingFreeDelivery}</Text>
                <Text style={styles.costValue}>{freeShippingGapLabel}</Text>
              </View>
            </View>
            <Text style={styles.costNote}>{copy.costCardNote}</Text>
          </View>
          <View style={styles.stepHeader}>
            <View style={styles.stepBadge}>
              <Text style={styles.stepBadgeText}>2</Text>
            </View>
            <View style={styles.stepCopy}>
              <Text style={styles.stepTitle}>{copy.timerShipping}</Text>
              <Text style={styles.stepBody}>{copy.timerShippingBody}</Text>
            </View>
          </View>
          <View style={styles.timerPresetRow}>
            <Pressable
              style={[styles.timerPresetChip, noTimer && styles.timerPresetChipActive]}
              onPress={() => setNoTimer(true)}
            >
              <Text style={[styles.timerPresetText, noTimer && styles.timerPresetTextActive]}>{copy.noTimerLabel}</Text>
            </Pressable>
            {TIMER_PRESETS.map((preset) => {
              const selected = !noTimer && timerValue === preset.value && timerUnit === preset.unit;
              return (
                <Pressable
                  key={preset.label}
                  style={[styles.timerPresetChip, selected && styles.timerPresetChipActive]}
                  onPress={() => {
                    setNoTimer(false);
                    setTimerValue(preset.value);
                    setTimerUnit(preset.unit);
                  }}
                >
                  <Text style={[styles.timerPresetText, selected && styles.timerPresetTextActive]}>{preset.label}</Text>
                </Pressable>
              );
            })}
          </View>
          {noTimer ? (
            <View style={styles.timerSummaryBox}>
              <Text style={styles.timerSummaryLabel}>{copy.noTimerDesc}</Text>
            </View>
          ) : (
            <>
              <View style={styles.timerPickRow}>
                <View style={{ flex: 1 }}>
                  <NumField label={copy.timer} value={timerValue} onChange={setTimerValue} placeholder="30" />
                </View>
                <View style={styles.timerUnitWrap}>
                  {TIMER_UNITS.map((unit) => (
                    <Pressable
                      key={unit}
                      style={[styles.unitChip, timerUnit === unit && styles.unitChipActive]}
                      onPress={() => setTimerUnit(unit)}
                    >
                      <Text style={[styles.unitChipText, timerUnit === unit && styles.unitChipTextActive]}>
                        {unit === 'minutes' ? copy.min : unit === 'hours' ? copy.hr : copy.day}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <View style={styles.timerSummaryBox}>
                <Text style={styles.timerSummaryLabel}>{copy.timerClosesIn}</Text>
                <Text style={styles.timerSummaryValue}>{timerLabel}</Text>
              </View>
            </>
          )}
        </View>

        <View style={styles.productCard}>
          <View style={styles.productCopy}>
            <Text style={styles.kicker}>{copy.product}</Text>
            <Text style={styles.productTitle} numberOfLines={2}>
              {insights?.title || title || copy.pasteProductLink}
            </Text>
            <Text style={styles.productBody}>
              {insightsLoading
                ? copy.readingProduct
                : insights?.promotionText
                  ? `${copy.deal}: ${insights.promotionText}`
                  : copy.simpleOrder}
            </Text>
            {insightsLoading ? <ActivityIndicator color={colors.acc} /> : null}
          </View>
          {insights?.imageUrl ? <Image source={{ uri: insights.imageUrl }} style={styles.productImage} /> : null}
        </View>

        <View style={styles.finderCard}>
          <Text style={styles.kicker}>{copy.finderResult}</Text>
          <Text style={styles.finderTitle}>{copy.finderTitle}</Text>
          <View style={styles.finderGrid}>
            <View style={styles.finderCell}>
              <Text style={styles.finderLabel}>{copy.whatItIs}</Text>
              <Text style={styles.finderValue}>{productName}</Text>
            </View>
            <View style={styles.finderCell}>
              <Text style={styles.finderLabel}>{copy.whereFrom}</Text>
              <Text style={styles.finderValue}>{sourceLabel}</Text>
            </View>
            <View style={styles.finderCell}>
              <Text style={styles.finderLabel}>{copy.productCost}</Text>
              <Text style={styles.finderValue}>{productCostLabel}</Text>
            </View>
            <View style={styles.finderCell}>
              <Text style={styles.finderLabel}>{copy.deliveryFee}</Text>
              <Text style={styles.finderValue}>{deliveryFeeLabel}</Text>
            </View>
            <View style={styles.finderCell}>
              <Text style={styles.finderLabel}>{copy.freeDeliveryFrom}</Text>
              <Text style={styles.finderValue}>{freeShippingThresholdLabel}</Text>
            </View>
            <View style={styles.finderCell}>
              <Text style={styles.finderLabel}>{copy.missingFreeDelivery}</Text>
              <Text style={styles.finderValue}>{freeShippingGapLabel}</Text>
            </View>
          </View>
          <View style={styles.dealBox}>
            <Text style={styles.finderLabel}>{copy.dealCheck}</Text>
            <Text style={styles.dealText}>{dealLabel}</Text>
          </View>
          <Text style={styles.finderNote}>{copy.finderNote}</Text>
          <Pressable style={styles.linkHelpButton} onPress={() => setLinkHelpOpen((open) => !open)}>
            <Text style={styles.linkHelpButtonText}>{linkHelpOpen ? copy.closeHelp : copy.linkNotWorking}</Text>
          </Pressable>
          {linkHelpOpen ? (
            <View style={styles.linkHelpCard}>
              <Text style={styles.linkHelpTitle}>{copy.linkHelpTitle}</Text>
              <Text style={styles.linkHelpBody}>{copy.linkHelpBody}</Text>
              <Field label={copy.store} value={storeLabel} onChange={setStoreLabel} placeholder={copy.storePlaceholder} />
              <Field label={t('order.new.titleLabel')} value={title} onChange={setTitle} placeholder={copy.titlePlaceholder} />
              <NumField label={t('order.new.priceLabel')} value={price} onChange={setPrice} placeholder="199" />
              <NumField
                label={copy.freeShippingFrom}
                value={freeShippingThreshold}
                onChange={setFreeShippingThreshold}
                placeholder="199"
              />
            </View>
          ) : null}
        </View>

        <View style={styles.planCard}>
          <Text style={styles.planTitle}>{copy.timerPlan}</Text>
          <Text style={styles.planIntro}>{copy.timerPlanIntro}</Text>
          <View style={styles.planRow}>
            <Text style={styles.planLabel}>{copy.timerClosesIn}</Text>
            <Text style={styles.planValue}>{noTimer ? copy.noTimerLabel : timerLabel}</Text>
          </View>
          <View style={styles.planRow}>
            <Text style={styles.planLabel}>{copy.missingFreeDelivery}</Text>
            <Text style={styles.planValue}>{formatAgorot(freeShippingGapAgorot)}</Text>
          </View>
        </View>

        <Pressable style={styles.drawerHandle} onPress={() => setCartOpen((open) => !open)}>
          <Text style={styles.drawerHandleText}>{cartOpen ? copy.hideCart : copy.showCart}</Text>
          <Text style={styles.drawerCount}>{copy.oneItem}</Text>
        </Pressable>

        {cartOpen ? (
          <View style={styles.cartDrawer}>
            <Text style={styles.kicker}>{copy.shoppingCart}</Text>
            <Text style={styles.cartTitle}>{productName || copy.manualProduct}</Text>
            <Text style={styles.cartLine}>{copy.store}: {sourceLabel || copy.chooseStore}</Text>
            <Text style={styles.cartLine}>{copy.productPrice}: {formatAgorot(priceAgorot)}</Text>
            <Text style={styles.cartLine}>{copy.deliveryFee}: {deliveryFeeLabel}</Text>
            <Text style={styles.cartLine}>{copy.missingFreeDelivery}: {formatAgorot(freeShippingGapAgorot)}</Text>
            <Text style={styles.cartHint}>{copy.cartHint}</Text>
          </View>
        ) : null}

        <View style={styles.pickupCard}>
          <Text style={styles.kicker}>{copy.pickup}</Text>
          <Text style={styles.pickupTitle}>{copy.pickupManager}</Text>
          <Text style={styles.pickupBody}>{copy.pickupBody}</Text>
          <Field
            label={copy.pickupLocation}
            value={pickupLocation}
            onChange={setPickupLocation}
            placeholder={copy.pickupPlaceholder}
          />
          <Text style={styles.uncertainText}>{copy.pickupUncertain}</Text>
        </View>

        <PrimaryBtn label={t('order.new.submit')} onPress={submit} disabled={!valid} loading={create.isPending} />
      </ScrollView>
    </ScreenBase>
  );
}

const styles = StyleSheet.create({
  screen: {
    gap: 14,
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 110,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  title: {
    fontFamily: fontFamily.display,
    fontSize: 22,
    color: colors.tx,
  },
  guideCard: {
    gap: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.brBr,
    borderRadius: radii.lg,
    backgroundColor: colors.white,
    ...shadow.card,
  },
  kicker: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 11,
    letterSpacing: 1.2,
    color: colors.acc,
    textTransform: 'uppercase',
  },
  guideTitle: {
    fontFamily: fontFamily.display,
    fontSize: 21,
    lineHeight: 25,
    color: colors.tx,
  },
  guideBody: {
    fontFamily: fontFamily.body,
    fontSize: 13,
    lineHeight: 20,
    color: colors.mu,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  primarySmall: {
    flex: 1,
    minHeight: 46,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.navy,
  },
  primarySmallText: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 13,
    color: colors.white,
  },
  secondarySmall: {
    flex: 1,
    minHeight: 46,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.brBr,
    backgroundColor: colors.cardSoft,
  },
  secondarySmallText: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 13,
    color: colors.tx,
  },
  noteText: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 12,
    lineHeight: 18,
    color: colors.acc,
  },
  formCard: {
    gap: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(15,122,67,0.12)',
    borderRadius: 30,
    backgroundColor: colors.white,
    ...shadow.card,
  },
  stepHeader: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: 24,
    backgroundColor: colors.limeSoft,
  },
  stepBadge: {
    width: 30,
    height: 30,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.navy,
  },
  stepBadgeText: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 12,
    color: colors.white,
  },
  stepCopy: {
    flex: 1,
    gap: 3,
  },
  stepTitle: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 13,
    color: colors.tx,
  },
  stepBody: {
    fontFamily: fontFamily.body,
    fontSize: 12,
    lineHeight: 17,
    color: colors.mu,
  },
  productCard: {
    flexDirection: 'row',
    gap: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(15,122,67,0.12)',
    borderRadius: 30,
    backgroundColor: colors.white,
    ...shadow.card,
  },
  productCopy: {
    flex: 1,
    gap: 8,
  },
  productTitle: {
    fontFamily: fontFamily.display,
    fontSize: 20,
    color: colors.tx,
  },
  productBody: {
    fontFamily: fontFamily.body,
    fontSize: 13,
    lineHeight: 20,
    color: colors.mu,
  },
  productImage: {
    width: 84,
    height: 104,
    borderRadius: radii.md,
    backgroundColor: colors.s1,
  },
  finderCard: {
    gap: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(15,122,67,0.12)',
    borderRadius: 30,
    backgroundColor: colors.white,
    ...shadow.card,
  },
  costCard: {
    gap: 12,
    padding: 18,
    borderRadius: 30,
    backgroundColor: colors.lime,
    ...shadow.cta,
  },
  costGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  costItem: {
    width: '48%',
    gap: 6,
    padding: 14,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderWidth: 1,
    borderColor: 'rgba(15,122,67,0.12)',
  },
  costLabel: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 11,
    letterSpacing: 0.8,
    color: colors.acc,
    textTransform: 'uppercase',
  },
  costValue: {
    fontFamily: fontFamily.display,
    fontSize: 24,
    color: colors.navy,
  },
  costNote: {
    fontFamily: fontFamily.body,
    fontSize: 12,
    lineHeight: 18,
    color: colors.navy,
  },
  finderTitle: {
    fontFamily: fontFamily.display,
    fontSize: 21,
    color: colors.tx,
  },
  finderGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  finderCell: {
    width: '48%',
    minHeight: 86,
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 22,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(15,122,67,0.13)',
    ...shadow.glass,
  },
  finderLabel: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 10,
    letterSpacing: 0.7,
    color: colors.mu,
    textTransform: 'uppercase',
  },
  finderValue: {
    marginTop: 8,
    fontFamily: fontFamily.bodyBold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.tx,
  },
  dealBox: {
    gap: 6,
    padding: 12,
    borderRadius: 22,
    backgroundColor: colors.limeSoft,
  },
  dealText: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 14,
    color: colors.acc,
  },
  finderNote: {
    fontFamily: fontFamily.body,
    fontSize: 12,
    lineHeight: 18,
    color: colors.mu,
  },
  linkHelpButton: {
    minHeight: 44,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.navy,
  },
  linkHelpButtonText: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 13,
    color: colors.white,
  },
  linkHelpCard: {
    gap: 6,
    padding: 12,
    borderRadius: radii.md,
    backgroundColor: colors.cardSoft,
    borderWidth: 1,
    borderColor: colors.br,
  },
  linkHelpTitle: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 14,
    color: colors.tx,
  },
  linkHelpBody: {
    fontFamily: fontFamily.body,
    fontSize: 12,
    lineHeight: 18,
    color: colors.mu,
  },
  planCard: {
    gap: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(15,122,67,0.12)',
    borderRadius: 30,
    backgroundColor: colors.white,
    ...shadow.card,
  },
  planTitle: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 15,
    color: colors.tx,
  },
  planIntro: {
    fontFamily: fontFamily.body,
    fontSize: 12,
    lineHeight: 18,
    color: colors.mu,
  },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  planLabel: {
    flex: 1,
    fontFamily: fontFamily.body,
    fontSize: 13,
    color: colors.mu,
  },
  planValue: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 14,
    color: colors.tx,
  },
  pickupCard: {
    gap: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(15,122,67,0.12)',
    borderRadius: 30,
    backgroundColor: colors.white,
    ...shadow.card,
  },
  pickupTitle: {
    fontFamily: fontFamily.display,
    fontSize: 20,
    color: colors.tx,
  },
  pickupBody: {
    fontFamily: fontFamily.body,
    fontSize: 13,
    lineHeight: 20,
    color: colors.mu,
  },
  uncertainText: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 12,
    lineHeight: 18,
    color: colors.acc,
  },
  timerPickRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-end',
  },
  timerUnitWrap: {
    flexDirection: 'row',
    gap: 6,
    paddingBottom: 2,
  },
  timerPresetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  timerPresetChip: {
    minHeight: 38,
    minWidth: 64,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.limeSoft,
    borderWidth: 1,
    borderColor: colors.brBr,
  },
  timerPresetChipActive: {
    backgroundColor: colors.acc,
    borderColor: colors.acc,
  },
  timerPresetText: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 12,
    color: colors.navy,
  },
  timerPresetTextActive: {
    color: colors.white,
  },
  timerSummaryBox: {
    minHeight: 58,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.navy,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  timerSummaryLabel: {
    flex: 1,
    fontFamily: fontFamily.bodySemi,
    fontSize: 12,
    color: 'rgba(255,255,255,0.78)',
  },
  timerSummaryValue: {
    fontFamily: fontFamily.display,
    fontSize: 22,
    color: colors.white,
  },
  unitChip: {
    minHeight: 42,
    minWidth: 48,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.br,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardSoft,
  },
  unitChipActive: {
    backgroundColor: colors.acc,
    borderColor: colors.acc,
  },
  unitChipText: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 11,
    color: colors.tx,
  },
  unitChipTextActive: {
    color: colors.white,
  },
  drawerHandle: {
    minHeight: 54,
    paddingHorizontal: 16,
    borderRadius: 24,
    backgroundColor: colors.navy,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  drawerHandleText: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 14,
    color: colors.white,
  },
  drawerCount: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 12,
    color: colors.s1,
  },
  cartDrawer: {
    gap: 8,
    padding: 16,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(15,122,67,0.12)',
    backgroundColor: colors.white,
    ...shadow.card,
  },
  cartTitle: {
    fontFamily: fontFamily.display,
    fontSize: 21,
    color: colors.tx,
  },
  cartLine: {
    fontFamily: fontFamily.body,
    fontSize: 13,
    color: colors.mu,
  },
  cartHint: {
    marginTop: 4,
    fontFamily: fontFamily.bodySemi,
    fontSize: 12,
    lineHeight: 18,
    color: colors.acc,
  },
});

import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { ScreenBase } from '@/components/primitives/ScreenBase';
import { BackBtn } from '@/components/primitives/BackBtn';
import { PrimaryBtn, SecondaryBtn } from '@/components/primitives/Button';
import { Field } from '@/components/primitives/Field';
import { NumField } from '@/components/primitives/NumField';
import { colors, radii } from '@/theme/tokens';
import { fontFamily } from '@/theme/fonts';
import { useAddOrderItem, useCloseOrder, useOrder } from '@/api/orders';
import { useGenerateInvite } from '@/api/invites';
import { useAuthStore } from '@/stores/authStore';
import { useUiStore } from '@/stores/uiStore';
import { formatAgorot } from '@/utils/format';
import { formatCompactDuration } from '@/utils/timer';
import type { Participant } from '@/types/domain';
import { useLocale } from '@/i18n/locale';
import { buildInviteUrl } from '@/lib/deeplinks';
import { loadSharedProductInsights, parseSharedProduct, type SharedProductInsights } from '@/lib/sharedProduct';
import { fetchProductPageHtml } from '@/api/productInsights';

const DEFAULT_DELIVERY_FEE_AGOROT = 3000;
const DEFAULT_FREE_SHIPPING_THRESHOLD_AGOROT = 19900;

function ParticipantTower({
  participants,
  currentUserId,
}: {
  participants: Participant[];
  currentUserId: string | undefined;
}) {
  const { language } = useLocale();
  const isHebrew = language === 'he';
  const slots = participants;
  return (
    <View style={styles.tower}>
      {slots.map((p, i) => {
        const isMe = p && p.user_id === currentUserId;
        return (
          <View key={i} style={[styles.slot, p && styles.slotFilled, isMe && styles.slotMe]}>
            {p ? (
              <Text style={styles.slotText}>
                {isMe ? (isHebrew ? 'אתה' : 'YOU') : `${isHebrew ? 'מקום' : 'SEAT'} ${i + 1}`} | {p.status === 'paid' ? (isHebrew ? 'שולם' : 'PAID') : (isHebrew ? 'פתוח' : 'OPEN')}
              </Text>
            ) : (
              <Text style={styles.slotEmpty}>{isHebrew ? 'מקום פנוי' : 'OPEN SLOT'}</Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

export default function OrderShell() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { language } = useLocale();
  const isHebrew = language === 'he';
  const copy = isHebrew
    ? {
        unableToLoad: 'לא הצלחנו לטעון את ההזמנה.',
        mainProduct: 'המוצר הראשי',
        productAdded: 'המוצר נוסף לסל המשותף.',
        order: 'הזמנה',
        item: 'פריט',
        store: 'חנות',
        timerOrder: 'הזמנה לפי טיימר',
        locked: 'נעול',
        timerBody: 'משתמשים יכולים להצטרף ולהוסיף פריטים עד שהטיימר מסתיים. עריכות ננעלות 15 שניות לפני הסגירה.',
        editsLocked: 'העריכות נעולות.',
        editsOpen: 'העריכות עדיין פתוחות.',
        participants: 'משתתפים',
        finderSummary: 'סיכום איתור מוצר',
        importantCosts: 'עלויות חשובות',
        productCost: 'מחיר המוצר',
        shippingFee: 'דמי משלוח',
        freeShippingMinimum: 'סכום למשלוח חינם',
        costCardNote: 'אלה שלושת המספרים הכי חשובים להזמנה הזאת.',
        whatItIs: 'מה המוצר',
        notDetected: 'שם המוצר לא זוהה',
        whereFrom: 'מאיפה זה מגיע',
        detectedFromLink: 'החנות זוהתה מהקישור',
        productPriceDetected: 'מחיר מוצר שזוהה',
        estimatedShipping: 'משלוח משוער',
        freeDeliveryNeeds: 'כל ההזמנה צריכה להגיע לסכום הזה למשלוח חינם',
        approxEach: 'בערך לכל אחד עכשיו',
        shippingSaved: 'חיסכון משלוח יחד',
        missingParticipants: 'חסר למשלוח חינם לפי משתתפים',
        missingCart: 'חסר למשלוח חינם לפי הסל',
        neighborsCanJoin: 'שכנים שעוד יכולים להצטרף מהקישור',
        dealNote:
          'בדיקת המבצעים קוראת טקסט ציבורי של המוצר עבור 1+1, סייל ומבצעים דומים. אם החנות חוסמת פרטים, המשתמשים עדיין יכולים להוסיף אותם ידנית.',
        fullCart: 'הסל המשותף המלא',
        items: 'פריטים',
        hide: 'הסתר',
        show: 'הצג',
        size: 'מידה',
        productLinkSaved: 'קישור מוצר נשמר',
        manualItem: 'פריט ידני',
        addProduct: 'הוסף את המוצר שלך',
        addProductBody: 'משתמשים שהצטרפו יכולים להוסיף עוד מוצר לאותו סל משותף. בדמו הזה התשלום מדולג, אז זה רק מעדכן את הסל ומקל לבדוק את הזרימה.',
        productName: 'שם מוצר',
        productPlaceholder: 'חולצה מזארה, ג׳ינס מ-H&M...',
        price: 'מחיר',
        sizeNote: 'מידה / הערה',
        sizePlaceholder: 'M, שחור',
        productLink: 'קישור מוצר',
        cartLocked: 'הסל ננעל בגלל הטיימר',
        adding: 'מוסיף...',
        addToCart: 'הוסף לסל המשותף',
        couldNotAdd: 'לא הצלחנו להוסיף את המוצר.',
        pickupPlan: 'תוכנית איסוף',
        pickupManager: 'אחראי איסוף נקבע',
        preferredLocation: 'מיקום מועדף',
        creatorWillAdd: 'יוגדר על ידי יוצר ההזמנה',
        pickupMayVary: 'מיקום האיסוף עשוי להשתנות לפי החנות או חברת המשלוחים',
        founderCheckout: 'פתח Checkout למייסד',
        skippedProgress: 'התשלום מדולג: הצג התקדמות הזמנה',
        createInvite: 'צור קישור הזמנה',
        explainOrder: 'הסבר את ההזמנה',
        noTimer: 'ללא טיימר',
        noTimerOrder: 'הזמנה ידנית',
        noTimerBody: 'ההזמנה פתוחה עד שתסגור אותה ידנית.',
        closeOrder: 'סגור הזמנה',
        closingOrder: 'סוגר...',
      }
    : {
        unableToLoad: 'Unable to load order.',
        mainProduct: 'Main product',
        productAdded: 'Product added to the shared cart.',
        order: 'Order',
        item: 'ITEM',
        store: 'Store',
        timerOrder: 'Timer order',
        locked: 'Locked',
        timerBody: 'Users can join and add cart items until the timer ends. Edits lock 15 seconds before closing.',
        editsLocked: 'Edits are locked.',
        editsOpen: 'Edits are still open.',
        participants: 'Participants',
        finderSummary: 'Product finder summary',
        importantCosts: 'Important costs',
        productCost: 'Product price',
        shippingFee: 'Delivery fee',
        freeShippingMinimum: 'Free delivery minimum',
        costCardNote: 'These are the three most important numbers for this order.',
        whatItIs: 'What it is',
        notDetected: 'Product name was not detected',
        whereFrom: 'Where it comes from',
        detectedFromLink: 'Store detected from link',
        productPriceDetected: 'Product price detected',
        estimatedShipping: 'Estimated shipping',
        freeDeliveryNeeds: 'Whole order needs for free delivery',
        approxEach: 'Approx. each right now',
        shippingSaved: 'Shipping saved together',
        missingParticipants: 'Missing for free shipping by participants',
        missingCart: 'Missing for free shipping by cart total',
        neighborsCanJoin: 'Neighbors who can still join from share link',
        dealNote:
          'Deal detection checks public product text for 1+1, sale, and similar promotions. If the store blocks details, users can still add them manually.',
        fullCart: 'Full shared cart',
        items: 'items',
        hide: 'Hide',
        show: 'Show',
        size: 'Size',
        productLinkSaved: 'Product link saved',
        manualItem: 'Manual item',
        addProduct: 'Add your product',
        addProductBody: 'Joined users can add one more product to the same shared cart. Payment is skipped in this demo, so this only updates the cart and keeps the flow easy to test.',
        productName: 'Product name',
        productPlaceholder: 'Zara shirt, H&M jeans...',
        price: 'Price',
        sizeNote: 'Size / note',
        sizePlaceholder: 'M, black',
        productLink: 'Product link',
        cartLocked: 'Cart locked by timer',
        adding: 'Adding...',
        addToCart: 'Add to shared cart',
        couldNotAdd: 'Could not add the product.',
        pickupPlan: 'Pickup plan',
        pickupManager: 'Pickup manager assigned',
        preferredLocation: 'Preferred location',
        creatorWillAdd: 'Will be added by the order creator',
        pickupMayVary: 'Pickup location may vary depending on the store/shipping provider',
        founderCheckout: 'Open founder checkout',
        skippedProgress: 'Payment skipped: view order progress',
        createInvite: 'Create invite link',
        explainOrder: 'Explain this order',
        noTimer: 'No timer',
        noTimerOrder: 'Manual order',
        noTimerBody: 'Order stays open until you close it manually.',
        closeOrder: 'Close order',
        closingOrder: 'Closing...',
      };
  const actionCopy = {
    changeTimer: isHebrew ? 'שנה' : 'Change',
    chooseBeforeShare: isHebrew ? 'בחר מידה וצבע לפני שיתוף' : 'Choose size and color before sharing',
    shareHint: isHebrew
      ? 'בחר מידה וצבע כדי שהקישור לוואטסאפ יישלח עם פרטי הזמנה נכונים.'
      : 'Choose size and color so the WhatsApp link includes the correct order details.',
    shareAction: isHebrew ? 'שתף ב-WhatsApp' : 'Share on WhatsApp',
    requiredStore: isHebrew ? 'החנות להזמנה הזאת' : 'Store for this order',
    addLinkFirst: isHebrew ? 'אפשר להדביק לינק מוצר נוסף מאותה חנות' : 'Paste another product link from the same store',
    readingItem: isHebrew ? 'קורא את הלינק...' : 'Reading link...',
    wrongStore: isHebrew ? 'הלינק חייב להיות מאותה חנות של ההזמנה.' : 'The link must be from the same store as this order.',
    noOptionsFound: isHebrew ? 'לא נמצאו מידות או צבעים בדף הזה, אז אין צורך לבחור.' : 'No sizes or colors were found on this product page, so no option is required.',
    chooseSize: isHebrew ? 'בחר מידה' : 'Choose size',
    chooseColor: isHebrew ? 'בחר צבע / טעם / אפשרות' : 'Choose color / flavor / option',
    optionRequired: isHebrew ? 'בחר את האפשרויות שנמצאו בדף לפני הוספה לסל.' : 'Choose the options found on the page before adding to cart.',
  };
  const userId = useAuthStore((s) => s.user?.id);
  const pushToast = useUiStore((s) => s.pushToast);
  const { data, isLoading, error } = useOrder(id);
  const closeOrder = useCloseOrder();
  const addItem = useAddOrderItem();
  const generateInvite = useGenerateInvite();
  const [now, setNow] = useState(Date.now());
  const [cartOpen, setCartOpen] = useState(true);
  const [itemTitle, setItemTitle] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [itemSize, setItemSize] = useState('');
  const [itemColor, setItemColor] = useState('');
  const [itemRef, setItemRef] = useState('');
  const [detectedSizes, setDetectedSizes] = useState<string[]>([]);
  const [detectedColors, setDetectedColors] = useState<string[]>([]);
  const [itemInsights, setItemInsights] = useState<SharedProductInsights | null>(null);
  const [itemInsightsLoading, setItemInsightsLoading] = useState(false);
  const [itemStoreError, setItemStoreError] = useState('');

  const order = data?.order;
  const me = data?.participants.find((p) => p.user_id === userId);
  const participantCount = data?.participants.length ?? 0;
  const cartItems = data?.items ?? [];
  const loadErrorMessage = error instanceof Error ? error.message : typeof error === 'string' ? error : null;
  const sizeOptions = detectedSizes;
  const colorOptions = detectedColors;

  useEffect(() => {
    if (!order || !me) return;
    if (order.status === 'completed') router.replace(`/order/${order.id}/complete`);
    else if (order.status === 'escrow' || order.status === 'delivered') router.replace(`/order/${order.id}/escrow`);
  }, [order, me, router]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!order) return;
    setItemTitle((prev) => prev || order.product_title || '');
    setItemPrice((prev) => prev || (order.product_price_agorot / 100).toFixed(2).replace(/\.00$/, ''));
    setItemRef((prev) => prev || order.product_url);
  }, [order]);

  useEffect(() => {
    if (!order?.product_url) return;
    const draft = parseSharedProduct({
      url: order.product_url,
      title: order.product_title,
      manualStoreLabel: order.store_label,
    });
    if (!draft) return;
    let active = true;
    void loadSharedProductInsights(draft, fetchProductPageHtml)
      .then((insights) => {
        if (!active) return;
        setDetectedSizes(insights.availableSizes);
        setDetectedColors(insights.availableColors);
      })
      .catch(() => {
        if (!active) return;
        setDetectedSizes([]);
        setDetectedColors([]);
      });
    return () => {
      active = false;
    };
  }, [order?.product_title, order?.product_url, order?.store_label]);

  useEffect(() => {
    const draft = parseSharedProduct({
      url: itemRef,
      title: itemTitle,
      manualStoreLabel: order?.store_label,
    });
    if (!draft || !order) {
      setItemStoreError('');
      setItemInsights(null);
      return;
    }

    const sameStore = !order.store_key || order.store_key === 'manual' || draft.source === order.store_key;
    if (!sameStore) {
      setItemStoreError(actionCopy.wrongStore);
      setItemInsights(null);
      setDetectedSizes([]);
      setDetectedColors([]);
      return;
    }

    let active = true;
    setItemStoreError('');
    setItemInsightsLoading(true);

    void loadSharedProductInsights(draft, fetchProductPageHtml)
      .then((insights) => {
        if (!active) return;
        setItemInsights(insights);
        setDetectedSizes(insights.availableSizes);
        setDetectedColors(insights.availableColors);
        setItemTitle((prev) => prev.trim() ? prev : insights.title);
        if (insights.priceAgorot) {
          setItemPrice((insights.priceAgorot / 100).toFixed(2).replace(/\.00$/, ''));
        }
      })
      .catch(() => {
        if (!active) return;
        setItemInsights(null);
      })
      .finally(() => {
        if (active) setItemInsightsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [actionCopy.wrongStore, itemRef, order?.store_key, order?.store_label]);

  useEffect(() => {
    if (!order?.closes_at || !['open', 'paying'].includes(order.status) || closeOrder.isPending) return;
    if (new Date(order.closes_at).getTime() <= now) {
      void closeOrder.mutateAsync(order.id).catch(() => {});
    }
  }, [closeOrder, now, order]);

  if (isLoading) {
    return (
      <ScreenBase style={{ alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.acc} />
      </ScreenBase>
    );
  }
  if (error || !data || !order) {
    return (
      <ScreenBase style={styles.loadErrorScreen}>
        <View style={styles.loadErrorCard}>
          <Text style={styles.loadErrorTitle}>{copy.unableToLoad}</Text>
          {loadErrorMessage ? <Text style={styles.loadErrorBody}>{loadErrorMessage}</Text> : null}
          <SecondaryBtn label={isHebrew ? 'חזרה להזמנות' : 'Back to orders'} onPress={() => router.replace('/(tabs)/orders')} />
        </View>
      </ScreenBase>
    );
  }

  const freeShippingThreshold =
    typeof order.free_shipping_threshold_agorot === 'number' && order.free_shipping_threshold_agorot > 0
      ? order.free_shipping_threshold_agorot
      : DEFAULT_FREE_SHIPPING_THRESHOLD_AGOROT;
  const estimatedShipping =
    typeof order.estimated_shipping_agorot === 'number' && order.estimated_shipping_agorot > 0
      ? order.estimated_shipping_agorot
      : order.product_price_agorot >= freeShippingThreshold
        ? 0
        : DEFAULT_DELIVERY_FEE_AGOROT;
  const sharedOrderTotal = order.product_price_agorot * participantCount;
  const freeShippingGap = Math.max(0, freeShippingThreshold - sharedOrderTotal);
  const shippingSaved = Math.max(0, estimatedShipping * Math.max(0, participantCount - 1));
  const perPerson = Math.ceil(order.product_price_agorot + estimatedShipping / Math.max(1, participantCount));
  const closesAtMs = order.closes_at ? new Date(order.closes_at).getTime() : null;
  const editLocksAtMs = order.edit_locks_at ? new Date(order.edit_locks_at).getTime() : null;
  const remainingMs = closesAtMs ? Math.max(0, closesAtMs - now) : null;
  const editLocked = Boolean(editLocksAtMs && editLocksAtMs <= now);
  const timerLabel = remainingMs == null ? copy.noTimer : formatCompactDuration(remainingMs);
  const visibleCartItems = cartItems.length > 0
    ? cartItems
    : [
        {
          id: 'main-product-preview',
          title: order.product_title ?? copy.mainProduct,
          price_agorot: order.product_price_agorot,
          ref: order.product_url,
          size: null,
          participant_id: me?.id ?? '',
          order_id: order.id,
        },
      ];
  const cartTotal = visibleCartItems.reduce((sum, item) => sum + item.price_agorot, 0);
  const cartFreeShippingGap = Math.max(0, freeShippingThreshold - cartTotal);
  const hasSavedOptions = cartItems.some((item) => Boolean(item.size?.trim()));
  const requiresSize = sizeOptions.length > 0;
  const requiresColor = colorOptions.length > 0;
  const hasSelectedOptions = (!requiresSize || itemSize.trim().length > 0) && (!requiresColor || itemColor.trim().length > 0);
  const needsAnyOptions = requiresSize || requiresColor;
  const canShareOrder = hasSavedOptions || !needsAnyOptions || hasSelectedOptions;
  const itemPriceAgorot = Math.floor(Number(itemPrice) * 100);
  const canAddItem =
    Boolean(me?.id) &&
    !editLocked &&
    ['open', 'paying'].includes(order.status) &&
    itemTitle.trim().length > 1 &&
    (!requiresSize || itemSize.trim().length > 0) &&
    (!requiresColor || itemColor.trim().length > 0) &&
    !itemStoreError &&
    Number.isFinite(itemPriceAgorot) &&
    itemPriceAgorot > 0;

  const onAddItem = async () => {
    if (!me?.id || !canAddItem) return;
    const sizeStr = itemSize.trim();
    const colorStr = itemColor.trim();
    const optionParts = [
      sizeStr && `${isHebrew ? 'מידה' : 'Size'}: ${sizeStr}`,
      colorStr && `${isHebrew ? 'צבע' : 'Color'}: ${colorStr}`,
    ].filter(Boolean);
    await addItem.mutateAsync({
      orderId: order.id,
      participantId: me.id,
      title: itemTitle,
      ref: itemRef,
      size: [
        itemSize.trim() ? `${isHebrew ? 'מידה' : 'Size'}: ${itemSize.trim()}` : null,
        itemColor.trim() ? `${isHebrew ? 'צבע/טעם' : 'Color/flavor'}: ${itemColor.trim()}` : null,
      ].filter(Boolean).join(' | ') || null,
      priceAgorot: itemPriceAgorot,
    });
    setItemTitle('');
    setItemPrice('');
    setItemSize('');
    setItemColor('');
    setItemRef('');
    pushToast(copy.productAdded, 'success');
  };

  const onShareOrder = async () => {
    if (!canShareOrder) {
      pushToast(actionCopy.chooseBeforeShare, 'error');
      return;
    }
    try {
      const invite = await generateInvite.mutateAsync(order.id);
      const inviteUrl = buildInviteUrl(invite.token);
      const optionText = hasSelectedOptions
        ? isHebrew
          ? ` מידה: ${itemSize.trim()}, צבע: ${itemColor.trim()}.`
          : ` Size: ${itemSize.trim()}, color: ${itemColor.trim()}.`
        : '';
      const message = isHebrew
        ? `פתחתי הזמנה ב-Shakana: ${order.product_title ?? order.product_url}.${optionText} דמי משלוח: ${formatAgorot(estimatedShipping)}. משלוח חינם מ-${formatAgorot(freeShippingThreshold)}. חסר למשלוח חינם: ${formatAgorot(cartFreeShippingGap)}. ${inviteUrl}`
        : `I opened a Shakana order: ${order.product_title ?? order.product_url}.${optionText} Delivery fee: ${formatAgorot(estimatedShipping)}. Free delivery from ${formatAgorot(freeShippingThreshold)}. Missing for free delivery: ${formatAgorot(cartFreeShippingGap)}. ${inviteUrl}`;
      await Linking.openURL(`https://wa.me/?text=${encodeURIComponent(message)}`);
    } catch (e) {
      pushToast(e instanceof Error ? e.message : isHebrew ? 'לא הצלחנו לפתוח שיתוף.' : 'Could not open sharing.', 'error');
    }
  };

  return (
    <ScreenBase style={{ paddingTop: 20, paddingBottom: 36 }}>
      <View style={styles.header}>
        <BackBtn onPress={() => router.back()} />
        <Text style={styles.headerTitle}>{copy.order}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ gap: 16, paddingBottom: 32 }}>

        {/* ── HERO: Add your product ── */}
        <View style={styles.heroCard}>
          {/* Store badge + timer row */}
          <View style={styles.heroTopRow}>
            <View style={styles.storeBadge}>
              <Text style={styles.storeBadgeText}>{order.store_label ?? copy.store}</Text>
            </View>
            <View style={styles.timerPill}>
              <Text style={styles.timerPillLabel}>{isHebrew ? 'טיימר' : 'Timer'}</Text>
              <Text style={styles.timerPillValue}>
                {order.status === 'locked' ? copy.locked : order.closes_at ? timerLabel : copy.noTimer}
              </Text>
            </View>
          </View>

          {/* Shipping savings strip */}
          <View style={styles.savingsRow}>
            <View style={styles.savingsCell}>
              <Text style={styles.savingsCellLabel}>{isHebrew ? 'חיסכון משלוח' : 'Shipping saved'}</Text>
              <Text style={styles.savingsCellValue}>{formatAgorot(shippingSaved)}</Text>
            </View>
            <View style={styles.savingsDivider} />
            <View style={styles.savingsCell}>
              <Text style={styles.savingsCellLabel}>{isHebrew ? 'חסר למשלוח חינם' : 'Missing for free ship.'}</Text>
              <Text style={styles.savingsCellValue}>{formatAgorot(cartFreeShippingGap)}</Text>
            </View>
            <View style={styles.savingsDivider} />
            <View style={styles.savingsCell}>
              <Text style={styles.savingsCellLabel}>{isHebrew ? 'דמי משלוח' : 'Delivery fee'}</Text>
              <Text style={styles.savingsCellValue}>{formatAgorot(estimatedShipping)}</Text>
            </View>
          </View>

          {/* Add product form */}
          <Text style={styles.heroSectionTitle}>{copy.addProduct}</Text>
          <Field label={copy.productLink} value={itemRef} onChange={setItemRef} placeholder="https://..." ltr />
          {itemInsightsLoading ? <Text style={styles.requiredHint}>{actionCopy.readingItem}</Text> : null}
          {itemStoreError ? <Text style={styles.errorInline}>{itemStoreError}</Text> : null}
          {itemInsights ? (
            <View style={styles.detectedProductCard}>
              <Text style={styles.detectedStore}>{itemInsights.sourceLabel}</Text>
              <Text style={styles.detectedTitle}>{itemInsights.title}</Text>
              <Text style={styles.detectedMeta}>{formatAgorot(itemInsights.priceAgorot ?? itemPriceAgorot)}</Text>
            </View>
          ) : null}
          <Field label={copy.productName} value={itemTitle} onChange={setItemTitle} placeholder={copy.productPlaceholder} />
          <NumField label={copy.price} value={itemPrice} onChange={setItemPrice} placeholder="99" />
          {requiresSize ? (
            <View style={styles.optionGroup}>
              <Text style={styles.optionLabel}>{actionCopy.chooseSize}</Text>
              <View style={styles.optionRow}>
                {sizeOptions.map((size) => {
                  const selected = itemSize === size;
                  return (
                    <Pressable key={size} accessibilityRole="button"
                      style={[styles.optionChip, selected && styles.optionChipActive]}
                      onPress={() => setItemSize(size)}>
                      <Text style={[styles.optionChipText, selected && styles.optionChipTextActive]}>{size}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : (
            <Field
              label={isHebrew ? 'מידה / גרסה (אם רלוונטי)' : 'Size / variant (if applicable)'}
              value={itemSize} onChange={setItemSize}
              placeholder={isHebrew ? 'M, Queen, 42, XL...' : 'M, Queen, 42, XL...'}
            />
          )}
          {requiresColor ? (
            <View style={styles.optionGroup}>
              <Text style={styles.optionLabel}>{actionCopy.chooseColor}</Text>
              <View style={styles.optionRow}>
                {colorOptions.map((color) => {
                  const selected = itemColor === color;
                  return (
                    <Pressable key={color} accessibilityRole="button"
                      style={[styles.optionChip, selected && styles.optionChipActive]}
                      onPress={() => setItemColor(color)}>
                      <Text style={[styles.optionChipText, selected && styles.optionChipTextActive]}>{color}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : (
            <Field
              label={isHebrew ? 'צבע / הערה (אם רלוונטי)' : 'Color / note (if applicable)'}
              value={itemColor} onChange={setItemColor}
              placeholder={isHebrew ? 'שחור, עץ אלון, לבן...' : 'Black, oak wood, white...'}
            />
          )}
          {needsAnyOptions && !hasSelectedOptions ? (
            <Text style={styles.requiredHint}>{actionCopy.optionRequired}</Text>
          ) : null}
          <PrimaryBtn
            label={
              editLocked || order.status === 'locked'
                ? copy.cartLocked
                : addItem.isPending ? copy.adding : copy.addToCart
            }
            onPress={() => void onAddItem().catch((e) => pushToast(e instanceof Error ? e.message : copy.couldNotAdd, 'error'))}
            disabled={!canAddItem}
            loading={addItem.isPending}
          />
        </View>

        {/* ── What's been ordered ── */}
        <Text style={styles.sectionTitle}>{isHebrew ? 'מה הוזמן' : 'What\'s been ordered'}</Text>
        <View style={styles.cartCard}>
          {visibleCartItems.map((item, index) => (
            <View key={item.id} style={[styles.cartItem, index < visibleCartItems.length - 1 && styles.cartItemBorder]}>
              <View style={styles.cartIndex}>
                <Text style={styles.cartIndexText}>{index + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cartItemTitle}>{item.title}</Text>
                {item.size ? <Text style={styles.cartItemMeta}>{item.size}</Text> : null}
              </View>
              <Text style={styles.cartItemPrice}>{formatAgorot(item.price_agorot)}</Text>
            </View>
          ))}
          <View style={styles.cartTotalRow}>
            <Text style={styles.cartTotalLabel}>{isHebrew ? 'סך הכל' : 'Total'}</Text>
            <Text style={styles.cartTotalValue}>{formatAgorot(cartTotal)}</Text>
          </View>
        </View>

        {/* ── Participants ── */}
        <Text style={styles.sectionTitle}>{copy.participants}</Text>
        <ParticipantTower participants={data.participants} currentUserId={userId} />

        {/* ── Pickup ── */}
        <View style={styles.pickupCard}>
          <Text style={styles.kicker}>{copy.pickupPlan}</Text>
          <Text style={styles.pickupTitle}>{order.pickup_responsible_name || copy.pickupManager}</Text>
          <Text style={styles.pickupBody}>{copy.preferredLocation}: {order.preferred_pickup_location || copy.creatorWillAdd}</Text>
          <Text style={styles.pickupNote}>{order.pickup_location_note || copy.pickupMayVary}</Text>
        </View>

        {/* ── Actions ── */}
        <View style={{ gap: 10 }}>
          {order.status === 'locked' && order.creator_id === userId ? (
            <PrimaryBtn label={copy.founderCheckout} onPress={() => void Linking.openURL(order.founder_checkout_url || order.product_url)} />
          ) : order.status !== 'locked' ? (
            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [styles.shareButton, !canShareOrder && styles.shareButtonDisabled, pressed && canShareOrder && { transform: [{ scale: 0.98 }] }]}
              onPress={() => void onShareOrder()}
              disabled={generateInvite.isPending}
            >
              <Text style={styles.shareButtonText}>
                {generateInvite.isPending ? '...' : canShareOrder ? actionCopy.shareAction : actionCopy.chooseBeforeShare}
              </Text>
            </Pressable>
          ) : null}
          {!canShareOrder && order.status !== 'locked' ? <Text style={styles.shareHint}>{actionCopy.shareHint}</Text> : null}
          {!order.closes_at && order.creator_id === userId && ['open', 'paying'].includes(order.status) ? (
            <SecondaryBtn
              label={closeOrder.isPending ? copy.closingOrder : copy.closeOrder}
              onPress={() => void closeOrder.mutateAsync(order.id).catch((e: unknown) => pushToast(e instanceof Error ? e.message : copy.closingOrder, 'error'))}
            />
          ) : null}
        </View>
      </ScrollView>
    </ScreenBase>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  headerTitle: { fontFamily: fontFamily.display, fontSize: 22, color: colors.tx },
  product: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.white,
    borderColor: colors.br,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: 12,
  },
  productImg: { width: 72, height: 72, borderRadius: radii.md },
  productPlaceholder: {
    backgroundColor: colors.s1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.brBr,
  },
  placeholderText: { fontFamily: fontFamily.bodySemi, fontSize: 11, color: colors.tx, letterSpacing: 1.2 },
  productTitle: { fontFamily: fontFamily.bodySemi, fontSize: 15, color: colors.tx },
  productPrice: { fontFamily: fontFamily.body, fontSize: 13, color: colors.mu, marginTop: 4 },
  sectionTitle: { fontFamily: fontFamily.display, fontSize: 20, color: colors.tx },
  sectionSub: { fontFamily: fontFamily.body, fontSize: 13, color: colors.mu, marginTop: 4 },
  tower: { gap: 8 },
  slot: {
    backgroundColor: colors.s1,
    borderRadius: radii.md,
    borderColor: colors.brBr,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    paddingVertical: 16,
    paddingHorizontal: 14,
  },
  slotFilled: {
    backgroundColor: colors.white,
    borderStyle: 'solid',
    borderColor: colors.brBr,
  },
  slotMe: { borderColor: colors.acc, backgroundColor: colors.accLight },
  slotText: { fontFamily: fontFamily.bodySemi, fontSize: 14, color: colors.tx },
  slotEmpty: { fontFamily: fontFamily.body, fontSize: 14, color: colors.mu },
  pickupCard: {
    gap: 10,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.br,
    borderRadius: 24,
    backgroundColor: colors.white,
  },
  costCard: {
    gap: 12,
    padding: 16,
    borderRadius: radii.lg,
    backgroundColor: colors.navy,
  },
  costKicker: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 11,
    letterSpacing: 1.2,
    color: colors.s1,
    textTransform: 'uppercase',
  },
  costGrid: {
    gap: 10,
  },
  costItem: {
    gap: 6,
    padding: 14,
    borderRadius: radii.md,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  costLabel: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 11,
    letterSpacing: 0.8,
    color: 'rgba(255,255,255,0.7)',
    textTransform: 'uppercase',
  },
  costValue: {
    fontFamily: fontFamily.display,
    fontSize: 24,
    color: colors.white,
  },
  costNote: {
    fontFamily: fontFamily.body,
    fontSize: 12,
    lineHeight: 18,
    color: 'rgba(255,255,255,0.78)',
  },
  kicker: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 11,
    letterSpacing: 1.2,
    color: colors.acc,
    textTransform: 'uppercase',
  },
  pickupTitle: { fontFamily: fontFamily.display, fontSize: 20, color: colors.tx },
  pickupBody: { fontFamily: fontFamily.body, fontSize: 13, color: colors.mu, lineHeight: 20 },
  pickupNote: { fontFamily: fontFamily.bodySemi, fontSize: 12, color: colors.acc, lineHeight: 18 },
  cartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  cartToggle: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radii.pill,
    backgroundColor: colors.accLight,
  },
  cartToggleText: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 12,
    color: colors.acc,
  },
  cartItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
  },
  cartIndex: {
    width: 30,
    height: 30,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.navy,
  },
  cartIndexText: { fontFamily: fontFamily.bodyBold, fontSize: 12, color: colors.white },
  cartItemTitle: { fontFamily: fontFamily.bodyBold, fontSize: 14, color: colors.tx },
  cartItemMeta: { fontFamily: fontFamily.body, fontSize: 12, color: colors.mu, marginTop: 3 },
  cartItemPrice: { fontFamily: fontFamily.bodyBold, fontSize: 13, color: colors.tx },
  addRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  storeBanner: {
    gap: 8,
    padding: 20,
    borderRadius: 26,
    backgroundColor: colors.navy,
  },
  storeBannerLabel: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 11,
    letterSpacing: 1,
    color: 'rgba(255,255,255,0.66)',
    textTransform: 'uppercase',
  },
  storeBannerName: {
    fontFamily: fontFamily.display,
    fontSize: 42,
    lineHeight: 48,
    color: colors.white,
    letterSpacing: -1.6,
  },
  storeBannerBody: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 13,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.78)',
  },
  savingsStrip: {
    minHeight: 76,
    borderRadius: 22,
    backgroundColor: colors.lime,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.acc,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  savingsStripLabel: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 13,
    color: colors.tx,
    flex: 1,
  },
  savingsStripValue: {
    fontFamily: fontFamily.display,
    fontSize: 28,
    color: colors.tx,
  },
  detectedProductCard: {
    gap: 5,
    padding: 14,
    borderRadius: radii.md,
    backgroundColor: colors.cardSoft,
    borderWidth: 1,
    borderColor: colors.br,
  },
  detectedStore: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 11,
    color: colors.acc,
    textTransform: 'uppercase',
  },
  detectedTitle: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 14,
    color: colors.tx,
  },
  detectedMeta: {
    fontFamily: fontFamily.display,
    fontSize: 18,
    color: colors.navy,
  },
  optionGroup: {
    gap: 10,
  },
  optionLabel: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 13,
    color: colors.tx,
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionChip: {
    minHeight: 42,
    minWidth: 58,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.brBr,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  optionChipActive: {
    backgroundColor: colors.acc,
    borderColor: colors.acc,
  },
  optionChipText: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 13,
    color: colors.tx,
  },
  optionChipTextActive: {
    color: colors.white,
  },
  requiredHint: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 12,
    lineHeight: 18,
    color: colors.acc,
  },
  optionEmptyHint: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 12,
    lineHeight: 18,
    color: colors.mu,
  },
  errorInline: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 12,
    lineHeight: 18,
    color: colors.err,
  },
  shareButton: {
    width: '100%',
    minHeight: 56,
    borderRadius: radii.pill,
    backgroundColor: colors.lime,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.acc,
  },
  shareButtonDisabled: {
    backgroundColor: colors.s1,
    borderColor: colors.brBr,
  },
  shareButtonText: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 17,
    color: colors.navy,
  },
  shareHint: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 12,
    lineHeight: 18,
    color: colors.acc,
    textAlign: 'center',
  },
  loadErrorScreen: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadErrorCard: {
    width: '100%',
    maxWidth: 420,
    gap: 12,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.brBr,
    borderRadius: radii.lg,
    backgroundColor: colors.white,
  },
  loadErrorTitle: {
    fontFamily: fontFamily.display,
    fontSize: 20,
    color: colors.err,
    textAlign: 'center',
  },
  loadErrorBody: {
    fontFamily: fontFamily.body,
    fontSize: 13,
    lineHeight: 20,
    color: colors.mu,
    textAlign: 'center',
  },
  timerCard: {
    gap: 8,
    padding: 18,
    borderRadius: radii.lg,
    backgroundColor: colors.navy,
  },
  timerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  timerChangeButton: {
    minHeight: 42,
    paddingHorizontal: 16,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.lime,
    borderWidth: 1,
    borderColor: colors.acc,
  },
  timerChangeText: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 13,
    color: colors.navy,
  },
  timerValue: {
    fontFamily: fontFamily.display,
    fontSize: 36,
    color: colors.white,
  },
  timerMetricRow: {
    flexDirection: 'row',
    gap: 10,
  },
  timerMetric: {
    flex: 1,
    gap: 4,
    padding: 12,
    borderRadius: radii.md,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  timerMetricLabel: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.68)',
  },
  timerMetricValue: {
    fontFamily: fontFamily.display,
    fontSize: 18,
    color: colors.white,
  },
  timerBody: { fontFamily: fontFamily.body, fontSize: 13, color: 'rgba(255,255,255,0.86)', lineHeight: 20 },
  timerNote: { fontFamily: fontFamily.bodySemi, fontSize: 12, color: colors.s1, lineHeight: 18 },
  heroCard: {
    gap: 16,
    padding: 20,
    borderRadius: radii.xl,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.br,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  storeBadge: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radii.pill,
    backgroundColor: colors.accLight,
    borderWidth: 1,
    borderColor: colors.acc,
  },
  storeBadgeText: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 12,
    color: colors.acc,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  timerPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radii.pill,
    backgroundColor: colors.s2,
    borderWidth: 1,
    borderColor: colors.brBr,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timerPillLabel: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 11,
    color: colors.mu,
    textTransform: 'uppercase',
  },
  timerPillValue: {
    fontFamily: fontFamily.display,
    fontSize: 14,
    color: colors.tx,
  },
  savingsRow: {
    flexDirection: 'row',
    backgroundColor: colors.limeSoft,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.acc,
    overflow: 'hidden',
  },
  savingsCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 6,
    gap: 3,
  },
  savingsCellLabel: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 10,
    color: colors.mu,
    textAlign: 'center',
  },
  savingsCellValue: {
    fontFamily: fontFamily.display,
    fontSize: 16,
    color: colors.tx,
    textAlign: 'center',
  },
  savingsDivider: {
    width: 1,
    backgroundColor: colors.br,
    marginVertical: 8,
  },
  heroSectionTitle: {
    fontFamily: fontFamily.display,
    fontSize: 18,
    color: colors.tx,
    marginTop: 4,
  },
  cartCard: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.br,
    overflow: 'hidden',
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  cartItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.br,
  },
  cartTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: colors.brBr,
  },
  cartTotalLabel: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 14,
    color: colors.tx,
  },
  cartTotalValue: {
    fontFamily: fontFamily.display,
    fontSize: 18,
    color: colors.tx,
  },
});

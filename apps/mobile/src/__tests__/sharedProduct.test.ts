import { loadSharedProductInsights, parseSharedProduct, summarizeSharedProduct } from '@/lib/sharedProduct';

describe('sharedProduct', () => {
  it('accepts a Zara product url and strips tracking params', () => {
    const draft = parseSharedProduct({
      url: 'https://www.zara.com/il/he/product-name-p123456.html?utm_source=share&fbclid=abc',
      title: '',
    });

    expect(draft).toEqual({
      url: 'https://www.zara.com/il/he/product-name-p123456.html',
      title: 'Product Name P123456',
      source: 'zara',
      storeLabel: 'Zara',
      rawText: undefined,
    });
  });

  it('extracts a Zara product url from shared text', () => {
    const draft = parseSharedProduct({
      text: 'I found this on Zara: https://www.zara.com/il/en/crossbody-bag-p16064110.html?utm_source=app.',
      title: '',
    });

    expect(draft).toEqual({
      url: 'https://www.zara.com/il/en/crossbody-bag-p16064110.html',
      title: 'Crossbody Bag P16064110',
      source: 'zara',
      storeLabel: 'Zara',
      rawText: 'I found this on Zara: https://www.zara.com/il/en/crossbody-bag-p16064110.html?utm_source=app.',
    });
  });

  it('finds a Zara product inside a redirect-style share url', () => {
    const draft = parseSharedProduct({
      url: 'https://example.com/share?url=https%3A%2F%2Fwww.zara.com%2Fil%2Fen%2Ftextured-shirt-p01234567.html%3Futm_medium%3Dshare',
      title: 'Shared',
    });

    expect(draft).toEqual({
      url: 'https://www.zara.com/il/en/textured-shirt-p01234567.html',
      title: 'Shared',
      source: 'zara',
      storeLabel: 'Zara',
      rawText: undefined,
    });
  });

  it('accepts an H&M product url', () => {
    const draft = parseSharedProduct({
      url: 'https://www2.hm.com/hw_il/product-page.html?utm_source=share',
      title: '',
    });

    expect(draft).toEqual({
      url: 'https://www2.hm.com/hw_il/product-page.html',
      title: 'Product Page',
      source: 'hm',
      storeLabel: 'H&M',
      rawText: undefined,
    });
  });

  it('extracts a 1+1 promotion and H&M shipping details', () => {
    const draft = {
      url: 'https://www2.hm.com/hw_il/product-page.html',
      title: 'Shirt',
      source: 'hm' as const,
      storeLabel: 'H&M',
    };

    const html = `
      <html>
        <head>
          <meta property="og:title" content="H&M | Shirt" />
          <meta name="description" content="1+1 on selected items" />
          <meta property="og:image" content="https://example.com/image.jpg" />
          <script type="application/ld+json">
            {
              "@type": "Product",
              "name": "Shirt",
              "brand": { "@type": "Brand", "name": "H&M" },
              "description": "Cotton shirt for everyday wear",
              "color": "Black",
              "sku": "HM123",
              "offers": { "price": "129.00" }
            }
          </script>
        </head>
        <body></body>
      </html>
    `;

    const insights = summarizeSharedProduct(draft, html);

    expect(insights.brandName).toBe('H&M');
    expect(insights.promotionText).toBe('1+1');
    expect(insights.priceAgorot).toBe(12900);
    expect(insights.deliveryFeeAgorot).toBe(3000);
    expect(insights.freeShippingThresholdAgorot).toBe(19900);
    expect(insights.productFacts).toEqual(
      expect.arrayContaining(['H&M', '1+1', 'Color: Black', 'SKU: HM123']),
    );
  });

  it('reads Zara minor-unit prices from embedded page data', () => {
    const draft = {
      url: 'https://www.zara.com/il/en/crossbody-bag-p16064110.html',
      title: 'Bag',
      source: 'zara' as const,
      storeLabel: 'Zara',
    };

    const insights = summarizeSharedProduct(draft, `
      <html>
        <head><meta property="og:title" content="Crossbody Bag | ZARA" /></head>
        <body>{"price":19990,"currency":"ILS"}</body>
      </html>
    `);

    expect(insights.priceAgorot).toBe(19990);
    expect(insights.deliveryFeeAgorot).toBe(0);
  });

  it('keeps unknown stores for manual product entry', () => {
    expect(
      parseSharedProduct({
        url: 'https://example.com/product/123',
        manualStoreLabel: 'Example',
      }),
    ).toEqual({
      url: 'https://example.com/product/123',
      title: 'Example item 123',
      source: 'example',
      storeLabel: 'Example',
      rawText: undefined,
    });
  });

  it('detects a generic store from the product link domain', () => {
    expect(
      parseSharedProduct({
        url: 'https://shop.cool-brand.co.il/products/linen-shirt-blue?utm_campaign=spring',
      }),
    ).toEqual({
      url: 'https://shop.cool-brand.co.il/products/linen-shirt-blue',
      title: 'Linen Shirt Blue',
      source: 'cool-brand',
      storeLabel: 'Cool Brand',
      rawText: undefined,
    });
  });

  it('accepts product-looking links from any store, not only configured stores', () => {
    expect(
      parseSharedProduct({
        url: 'www.random-store.example/products/sour-energy-mango-330ml?utm_source=ad&variant=blue',
      }),
    ).toEqual({
      url: 'https://www.random-store.example/products/sour-energy-mango-330ml?variant=blue',
      title: 'Sour Energy Mango 330ml',
      source: 'random-store',
      storeLabel: 'Random Store',
      rawText: undefined,
    });
  });

  it('lets configured stores fall back to generic product detection', () => {
    expect(
      parseSharedProduct({
        url: 'https://www.zara.com/il/he/products/special-drop-shirt-12345?utm_medium=share',
      }),
    ).toEqual({
      url: 'https://www.zara.com/il/he/products/special-drop-shirt-12345',
      title: 'Special Drop Shirt',
      source: 'zara',
      storeLabel: 'Zara',
      rawText: undefined,
    });
  });

  it('still rejects obvious non-product pages from any store', () => {
    expect(parseSharedProduct({ url: 'https://shop.cool-brand.co.il/cart' })).toBeNull();
    expect(parseSharedProduct({ url: 'https://shop.cool-brand.co.il/search?q=shirt' })).toBeNull();
    expect(parseSharedProduct({ url: 'https://shop.cool-brand.co.il/' })).toBeNull();
  });

  it('detects KSP product links and does not use the app-shell title as the product name', () => {
    const draft = parseSharedProduct({
      url: 'https://ksp.co.il/web/item/330386?utm_source=share&ref=abc',
    });

    expect(draft).toEqual({
      url: 'https://ksp.co.il/web/item/330386',
      title: 'KSP item 330386',
      source: 'ksp',
      storeLabel: 'KSP',
      rawText: undefined,
    });

    const insights = summarizeSharedProduct(draft!, '<html><head><title>KSP</title></head><body></body></html>');

    expect(insights.title).toBe('KSP item 330386');
    expect(insights.sourceLabel).toBe('KSP');
    expect(insights.deliveryFeeAgorot).toBe(3000);
    expect(insights.freeShippingThresholdAgorot).toBe(19900);
  });

  it('reads generic product metadata for price, image, and promotion', () => {
    const draft = {
      url: 'https://shop.cool-brand.co.il/products/linen-shirt-blue',
      title: 'Linen Shirt Blue',
      source: 'cool-brand',
      storeLabel: 'Cool Brand',
    };

    const insights = summarizeSharedProduct(draft, `
      <html>
        <head>
          <meta property="og:title" content="Linen Shirt Blue | Cool Brand" />
          <meta property="og:image" content="https://example.com/linen.jpg" />
          <meta property="product:price:amount" content="149.90" />
          <meta name="description" content="Buy 1 get 1 on selected shirts" />
        </head>
      </html>
    `);

    expect(insights.sourceLabel).toBe('Cool Brand');
    expect(insights.title).toBe('Linen Shirt Blue');
    expect(insights.imageUrl).toBe('https://example.com/linen.jpg');
    expect(insights.priceAgorot).toBe(14990);
    expect(insights.freeShippingThresholdAgorot).toBe(19900);
    expect(insights.amountMissingForFreeShippingAgorot).toBe(4910);
    expect(insights.neighborsNeeded).toBe(2);
    expect(insights.promotionText).toBe('Buy 1 get 1');
  });

  it('reads itemprop and data-price product prices', () => {
    const draft = {
      url: 'https://shop.cool-brand.co.il/products/camera-calibrator',
      title: 'Camera Calibrator',
      source: 'cool-brand',
      storeLabel: 'Cool Brand',
    };

    const itempropInsights = summarizeSharedProduct(draft, `
      <html>
        <head>
          <meta itemprop="price" content="999.90" />
          <meta itemprop="priceCurrency" content="ILS" />
        </head>
      </html>
    `);
    const dataPriceInsights = summarizeSharedProduct(draft, `
      <html>
        <body>
          <section data-price="₪1,299">Camera calibrator</section>
        </body>
      </html>
    `);

    expect(itempropInsights.priceAgorot).toBe(99990);
    expect(dataPriceInsights.priceAgorot).toBe(129900);
  });

  it('reads visible Hebrew shekel prices before asking for manual price', () => {
    const draft = {
      url: 'https://shop.cool-brand.co.il/products/hebrew-price',
      title: 'Hebrew Price',
      source: 'cool-brand',
      storeLabel: 'Cool Brand',
    };

    const insights = summarizeSharedProduct(draft, `
      <html>
        <body>
          <h1>מוצר לדוגמה</h1>
          <p>מחיר: ₪1,049</p>
        </body>
      </html>
    `);

    expect(insights.priceAgorot).toBe(104900);
  });

  it('reads Israeli price formats with shekel text and HTML entities', () => {
    const draft = {
      url: 'https://shop.cool-brand.co.il/products/local-price',
      title: 'Local Price',
      source: 'cool-brand',
      storeLabel: 'Cool Brand',
    };

    const shekelText = summarizeSharedProduct(draft, '<p>מחיר מוצר: 1,299 ש"ח</p>');
    const shekelEntity = summarizeSharedProduct(draft, '<p>Price: &#8362;899.90</p>');

    expect(shekelText.priceAgorot).toBe(129900);
    expect(shekelEntity.priceAgorot).toBe(89990);
  });

  it('reads generic JSON-LD offer arrays and delivery fees', () => {
    const draft = {
      url: 'https://shop.cool-brand.co.il/products/noise-cancelling-headphones',
      title: 'Noise Cancelling Headphones',
      source: 'cool-brand',
      storeLabel: 'Cool Brand',
    };

    const insights = summarizeSharedProduct(draft, `
      <html>
        <head>
          <script type="application/ld+json">
            {
              "@type": "Product",
              "name": "Noise Cancelling Headphones",
              "offers": [
                { "@type": "Offer", "price": "349.90", "priceCurrency": "ILS" }
              ]
            }
          </script>
        </head>
        <body>Delivery ₪29.90</body>
      </html>
    `);

    expect(insights.title).toBe('Noise Cancelling Headphones');
    expect(insights.priceAgorot).toBe(34990);
    expect(insights.deliveryFeeAgorot).toBe(2990);
    expect(insights.amountMissingForFreeShippingAgorot).toBe(0);
  });

  it('does not confuse free-shipping threshold with the delivery fee', () => {
    const draft = {
      url: 'https://shop.cool-brand.co.il/products/green-shirt',
      title: 'Green Shirt',
      source: 'cool-brand',
      storeLabel: 'Cool Brand',
    };

    const insights = summarizeSharedProduct(draft, `
      <html>
        <head>
          <meta property="product:price:amount" content="129.90" />
        </head>
        <body>
          Free shipping from ₪199
        </body>
      </html>
    `);

    expect(insights.priceAgorot).toBe(12990);
    expect(insights.freeShippingThresholdAgorot).toBe(19900);
    expect(insights.amountMissingForFreeShippingAgorot).toBe(6910);
    expect(insights.deliveryFeeAgorot).toBe(3000);
  });

  it('does not invent clothing sizes for non-apparel product pages', () => {
    const draft = {
      url: 'https://www.amazon.com/example-bed/dp/B000000000',
      title: 'Storage Bed',
      source: 'amazon' as const,
      storeLabel: 'Amazon',
    };

    const insights = summarizeSharedProduct(draft, `
      <html>
        <head><meta property="product:price:amount" content="899" /></head>
        <body>
          Storage bed with metal frame. This script has random letters S M L but no variant data.
        </body>
      </html>
    `);

    expect(insights.availableSizes).toEqual([]);
  });

  it('reads real product variant sizes when the store publishes them', () => {
    const draft = {
      url: 'https://www.amazon.com/example-bed/dp/B000000001',
      title: 'Storage Bed',
      source: 'amazon' as const,
      storeLabel: 'Amazon',
    };

    const insights = summarizeSharedProduct(draft, `
      <html>
        <body>
          {"dimensions":"Queen","colorName":"Walnut"}
          {"dimensions":"King","colorName":"Black"}
        </body>
      </html>
    `);

    expect(insights.availableSizes).toEqual(expect.arrayContaining(['Queen', 'King']));
    expect(insights.availableColors).toEqual(expect.arrayContaining(['Walnut', 'Black']));
  });

  it('reads flavor options for drinks and supplements without inventing sizes', () => {
    const draft = {
      url: 'https://shop.cool-brand.co.il/products/energy-drink',
      title: 'Energy Drink',
      source: 'cool-brand',
      storeLabel: 'Cool Brand',
    };

    const insights = summarizeSharedProduct(draft, `
      <html>
        <body>
          {"flavorName":"Mango Passion"}
          {"flavorName":"Blue Raspberry"}
          {"variantName":"Zero Sugar"}
        </body>
      </html>
    `);

    expect(insights.availableSizes).toEqual([]);
    expect(insights.availableColors).toEqual(expect.arrayContaining(['Mango Passion', 'Blue Raspberry', 'Zero Sugar']));
  });

  it('cleans Amazon links and infers the product name from the title slug', () => {
    const draft = parseSharedProduct({
      url: 'https://www.amazon.com/-/he/%D7%9E%D7%97%D7%A9%D7%91-%D7%A0%D7%99%D7%99%D7%93-%D7%92%D7%99%D7%99%D7%9E%D7%99%D7%A0%D7%92-ASUS-Strix/dp/B0DZZWMB2L/ref=sr_1_1?_encoding=UTF8&keywords=gaming&qid=1777482031&sr=8-1&th=1',
    });

    expect(draft).toEqual({
      url: 'https://www.amazon.com/-/he/%D7%9E%D7%97%D7%A9%D7%91-%D7%A0%D7%99%D7%99%D7%93-%D7%92%D7%99%D7%99%D7%9E%D7%99%D7%A0%D7%92-ASUS-Strix/dp/B0DZZWMB2L',
      title: 'מחשב נייד גיימינג ASUS ROG Strix',
      source: 'amazon',
      storeLabel: 'Amazon',
      rawText: undefined,
    });
  });

  it('accepts Amazon gp/product links and normalizes them to a clean dp link', () => {
    const draft = parseSharedProduct({
      url: 'https://www.amazon.com/gp/product/B006UACRTG?ref_=ox_sc_act_title_1&smid=ATVPDKIKX0DER',
    });

    expect(draft).toEqual({
      url: 'https://www.amazon.com/dp/B006UACRTG',
      title: 'Product item',
      source: 'amazon',
      storeLabel: 'Amazon',
      rawText: undefined,
    });
  });

  it('reads Amazon-style title, price, delivery, and promotion hints', () => {
    const draft = {
      url: 'https://www.amazon.com/-/he/%D7%9E%D7%97%D7%A9%D7%91-%D7%A0%D7%99%D7%99%D7%93-%D7%92%D7%99%D7%99%D7%9E%D7%99%D7%A0%D7%92-ASUS-Strix/dp/B0DZZWMB2L',
      title: 'מחשב נייד גיימינג ASUS Strix',
      source: 'amazon' as const,
      storeLabel: 'Amazon',
    };

    const insights = summarizeSharedProduct(draft, `
      <html>
        <head>
          <meta property="og:title" content="ASUS ROG Strix Gaming Laptop - Amazon.com" />
          <meta property="og:image" content="https://example.com/rog.jpg" />
          <meta name="description" content="Limited time sale on gaming laptops" />
        </head>
        <body>
          <span class="a-offscreen">$1,249.99</span>
          <div>FREE delivery Thursday</div>
        </body>
      </html>
    `);

    expect(insights.sourceLabel).toBe('Amazon');
    expect(insights.title).toBe('ASUS ROG Strix Gaming Laptop');
    expect(insights.imageUrl).toBe('https://example.com/rog.jpg');
    expect(insights.priceAgorot).toBe(391247);
    expect(insights.deliveryFeeAgorot).toBe(0);
    expect(insights.promotionText).toBe('Sale');
  });

  it('reads the live Amazon price block shape', () => {
    const draft = {
      url: 'https://www.amazon.com/example-product/dp/B0DZZWMB2L',
      title: 'Gaming laptop',
      source: 'amazon' as const,
      storeLabel: 'Amazon',
    };

    const insights = summarizeSharedProduct(draft, `
      <div id="corePrice_feature_div">
        <span class="a-price a-text-normal apex-pricetopay-value">
          <span class="a-offscreen">$1,299.99</span>
          <span aria-hidden="true">
            <span class="a-price-symbol">$</span>
            <span class="a-price-whole">1,299<span class="a-price-decimal">.</span></span>
            <span class="a-price-fraction">99</span>
          </span>
        </span>
      </div>
    `);

    expect(insights.priceAgorot).toBe(406897);
  });

  it('prefers the main Amazon price block over unrelated hidden prices', () => {
    const draft = {
      url: 'https://www.amazon.com/example-product/dp/B006UACRTG',
      title: 'Datacolor Spyder',
      source: 'amazon' as const,
      storeLabel: 'Amazon',
    };

    const insights = summarizeSharedProduct(draft, `
      <span class="a-offscreen">$99.00</span>
      <div id="corePrice_feature_div">
        <span class="a-price a-text-normal apex-pricetopay-value">
          <span aria-hidden="true">
            <span class="a-price-symbol">$</span>
            <span class="a-price-whole">334<span class="a-price-decimal">.</span></span>
            <span class="a-price-fraction">00</span>
          </span>
        </span>
      </div>
    `);

    expect(insights.priceAgorot).toBe(104542);
  });

  it('converts Amazon dollar prices to estimated shekels', () => {
    const draft = {
      url: 'https://www.amazon.com/example-product/dp/B006UACRTG',
      title: 'Datacolor Spyder',
      source: 'amazon' as const,
      storeLabel: 'Amazon',
    };

    const insights = summarizeSharedProduct(draft, `
      <div id="corePrice_feature_div">
        <span class="a-price a-text-normal apex-pricetopay-value">
          <span class="a-offscreen">$334.00</span>
        </span>
      </div>
    `);

    expect(insights.priceAgorot).toBe(104542);
  });

  it('uses backend-fetched HTML before falling back to browser fetch', async () => {
    const draft = {
      url: 'https://www.amazon.com/example-product/dp/B0DZZWMB2L',
      title: 'Example Product',
      source: 'amazon' as const,
      storeLabel: 'Amazon',
    };

    const insights = await loadSharedProductInsights(draft, async () => `
      <html>
        <head>
          <meta property="og:title" content="Backend Price Product - Amazon.com" />
          <meta property="product:price:amount" content="88.50" />
        </head>
        <body>Shipping $12.00</body>
      </html>
    `);

    expect(insights.title).toBe('Backend Price Product');
    expect(insights.priceAgorot).toBe(8850);
    expect(insights.deliveryFeeAgorot).toBe(3756);
  });

  it('rejects Zara links that are not product pages', () => {
    expect(
      parseSharedProduct({
        url: 'https://www.zara.com/il/en/cart',
      }),
    ).toBeNull();
  });
});

import type { ExpoConfig, ConfigContext } from 'expo/config';

const SCHEME = process.env.EXPO_PUBLIC_APP_SCHEME ?? 'shakana';
const UNIVERSAL = process.env.EXPO_PUBLIC_UNIVERSAL_LINK_HOST ?? 'shakana.app';
const BRAND_BLUE = '#9ECAF2';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Shakana',
  slug: 'shakana',
  scheme: SCHEME,
  version: '1.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  icon: './assets/icon.png',
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: BRAND_BLUE,
  },
  assetBundlePatterns: ['**/*'],
  plugins: [
    'expo-router',
    'expo-font',
    'expo-secure-store',
    'expo-localization',
    [
      'expo-tracking-transparency',
      {
        userTrackingPermission:
          'אנו משתמשים בנתוני פעילות אנונימיים לשיפור האפליקציה.',
      },
    ],
  ],
  web: {
    bundler: 'metro',
    output: 'single',
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'app.shakana',
    buildNumber: '1',
    associatedDomains: [`applinks:${UNIVERSAL}`],
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      UIBackgroundModes: ['remote-notification'],
      NSUserTrackingUsageDescription:
        'אנו משתמשים בנתוני פעילות אנונימיים לשיפור חוויית המשתמש.',
    },
    config: {
      usesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'app.shakana',
    versionCode: 1,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: BRAND_BLUE,
    },
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [
          { scheme: 'https', host: UNIVERSAL, pathPrefix: '/join' },
          { scheme: SCHEME },
        ],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },
  extra: {
    router: {
      origin: false,
    },
    eas: {
      projectId: 'REPLACE_WITH_EAS_PROJECT_ID',
    },
  },
  experiments: {
    typedRoutes: true,
  },
  updates: {
    fallbackToCacheTimeout: 0,
  },
  runtimeVersion: {
    policy: 'appVersion',
  },
});

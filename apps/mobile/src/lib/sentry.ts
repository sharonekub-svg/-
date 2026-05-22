import { ComponentType } from 'react';
import { env } from './env';

// @sentry/react-native has limited and historically flaky web support.
// On the web build we render a no-op so the bundle isn't dragged into
// native-only internals like react-native-permissions probing.
//
// This file has a `.web.ts` shadow that matches this contract; the
// native version below uses the real SDK.
type SentryWrap = <P>(component: ComponentType<P>) => ComponentType<P>;

let _wrap: SentryWrap = (c) => c;
let _captureException: (e: unknown) => void = () => {};
let _setUser: (u: { id: string } | null) => void = () => {};
let _initialized = false;

if (env.sentryDsn) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const RnSentry = require('@sentry/react-native');
    if (!_initialized) {
      _initialized = true;
      RnSentry.init({
        dsn: env.sentryDsn,
        enableAutoSessionTracking: true,
        tracesSampleRate: 0.2,
        enableNative: true,
        debug: false,
      });
    }
    _wrap = RnSentry.wrap as SentryWrap;
    _captureException = (e) => RnSentry.captureException(e);
    _setUser = (u) => RnSentry.setUser(u);
  } catch (e) {
    if (__DEV__) console.warn('Sentry init failed; continuing without it.', e);
  }
}

export function initSentry(): void {
  // Init happens at import time; this is a no-op kept for API parity.
}

export function identifySentryUser(id: string | null): void {
  _setUser(id ? { id } : null);
}

export const Sentry = {
  wrap: _wrap,
  captureException: _captureException,
};

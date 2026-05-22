import { ComponentType } from 'react';

// Web build: skip @sentry/react-native entirely. The native package
// doesn't fully resolve on react-native-web and isn't worth the build
// risk for a side-channel telemetry feature. If the user later wants
// browser error tracking, we'll layer @sentry/browser separately.
export function initSentry(): void {}
export function identifySentryUser(_id: string | null): void {}

export const Sentry = {
  wrap<P>(c: ComponentType<P>): ComponentType<P> {
    return c;
  },
  captureException(_e: unknown): void {},
};

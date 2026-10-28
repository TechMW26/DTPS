/**
 * Opens a URL outside the app.
 *
 * Uses the native bridge when the build exposes one (newer Android/iOS shells), and
 * otherwise performs a normal main-frame navigation. That navigation is handled by the
 * existing WebView clients: Android routes non-DTPS hosts to `shouldOverrideUrlLoading`
 * → system browser, and iOS cancels it and calls `UIApplication.shared.open`. `window.open`
 * must be avoided because the Android WebView is built with multi-window disabled.
 */
type NativeBridgeWindow = Window & {
  NativeApp?: {openExternal?: (target: string) => void};
  webkit?: {
    messageHandlers?: {
      nativeInterface?: {postMessage: (payload: Record<string, unknown>) => void};
    };
  };
};

export function openExternalUrl(url: string): boolean {
  if (typeof window === 'undefined') return false;

  const nativeWindow = window as NativeBridgeWindow;

  const androidBridge = nativeWindow.NativeApp;
  if (androidBridge && typeof androidBridge.openExternal === 'function') {
    try {
      androidBridge.openExternal(url);
      return true;
    } catch {
      // Fall through to the other strategies.
    }
  }

  const iosHandler = nativeWindow.webkit?.messageHandlers?.nativeInterface;
  if (iosHandler && typeof iosHandler.postMessage === 'function') {
    try {
      iosHandler.postMessage({action: 'openExternal', url});
      return true;
    } catch {
      // Fall through to a regular navigation.
    }
  }

  // No native bridge. The Android WebView drops `window.open` popups (it is built with
  // multi-window disabled), but it does route a normal main-frame navigation through
  // shouldOverrideUrlLoading, which hands non-DTPS hosts to the system browser. iOS and
  // desktop browsers then simply open the form.
  try {
    window.location.assign(url);
    return true;
  } catch {
    return false;
  }
}

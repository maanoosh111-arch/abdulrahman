// Browser-side Web Push Notification Registration & Subscription Manager

export type PushSupportState =
  | 'unsupported'
  | 'default'
  | 'granted'
  | 'denied'
  | 'subscribed'
  | 'error';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function getCurrentPushPermission(): NotificationPermission | 'unsupported' {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission;
}

/**
 * Registers the Service Worker and checks if an active push subscription already exists.
 */
export async function syncExistingPushSubscription(customerId: string): Promise<boolean> {
  if (!isPushSupported() || Notification.permission !== 'granted') {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;
    const existingSub = await registration.pushManager.getSubscription();
    if (!existingSub) return false;

    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-customer-id': customerId,
      },
      body: JSON.stringify({
        customerId,
        subscription: existingSub.toJSON(),
      }),
    });

    return true;
  } catch {
    return false;
  }
}

/**
 * Requests notification permission via an explicit user action, subscribes with the server's VAPID key,
 * and persists the subscription in the backend database for this customer.
 */
export async function subscribeCustomerToPush(customerId: string): Promise<{
  success: boolean;
  permission: NotificationPermission | 'unsupported';
  error?: string;
}> {
  if (!isPushSupported()) {
    return {
      success: false,
      permission: 'unsupported',
      error: 'Push notifications are not supported by this browser.',
    };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return {
        success: false,
        permission,
        error:
          permission === 'denied'
            ? 'Notification permission was denied. You can still track order status live in My Orders.'
            : 'Notification permission was not granted.',
      };
    }

    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;

    const vapidRes = await fetch('/api/push/vapid-public-key');
    if (!vapidRes.ok) {
      throw new Error('Failed to retrieve VAPID public key from server');
    }
    const { publicKey } = await vapidRes.json();

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      const convertedVapidKey = urlBase64ToUint8Array(publicKey);
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey as unknown as BufferSource,
      });
    }

    const subRes = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-customer-id': customerId,
      },
      body: JSON.stringify({
        customerId,
        subscription: subscription.toJSON(),
      }),
    });

    if (!subRes.ok) {
      const errData = await subRes.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to save subscription on backend');
    }

    return {
      success: true,
      permission: 'granted',
    };
  } catch (err: any) {
    return {
      success: false,
      permission: Notification.permission,
      error: err?.message || 'Could not complete push notification subscription',
    };
  }
}

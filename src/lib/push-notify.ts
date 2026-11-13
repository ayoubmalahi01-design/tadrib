// D19 — desktop / mobile notification delivery for in-app notifications.
//
// Supabase Realtime already delivers `notifications` rows to the open tab. This
// module turns such an event into an OS-level notification when — and only when —
// the user granted permission and the tab is not visible (a visible tab already
// shows the in-app list, so a system popup would be noise and a duplicate).
//
// Everything is dependency-injected so the rules can be unit tested without a
// browser: no `Notification` global is touched unless it actually exists.

export type PushPermission = 'default' | 'granted' | 'denied' | 'unsupported';

export type PushEnv = {
  supported: boolean;
  permission: PushPermission;
  visible: boolean;
  deliver?: (title: string, body: string) => void;
  request?: () => Promise<PushPermission>;
};

type NotificationLike = {
  permission?: string;
  requestPermission?: () => Promise<string>;
  new (title: string, options?: { body?: string; tag?: string; icon?: string }): unknown;
};

/** Read the real browser environment; safe when no DOM exists (tests, SSR). */
export function pushEnv(): PushEnv {
  const scope = globalThis as unknown as {
    Notification?: NotificationLike;
    document?: { visibilityState?: string };
  };
  const ctor = scope.Notification;
  const supported = typeof ctor === 'function';
  const raw = supported && typeof ctor!.permission === 'string' ? ctor!.permission : 'unsupported';
  const permission: PushPermission =
    raw === 'granted' || raw === 'denied' || raw === 'default' ? raw : 'unsupported';
  const visible = scope.document?.visibilityState === 'visible';
  return {
    supported,
    permission,
    visible,
    deliver: supported
      ? (title, body) => {
          try {
            new ctor!(title, { body, tag: 'tt-notification' });
          } catch {
            /* some browsers refuse construction without a service worker */
          }
        }
      : undefined,
    request: supported && typeof ctor!.requestPermission === 'function'
      ? async () => {
          try {
            const result = await ctor!.requestPermission!();
            return result === 'granted' || result === 'denied' ? result : 'default';
          } catch {
            return 'default';
          }
        }
      : undefined,
  };
}

/** Why a push would not be shown, or null when it would. */
export function pushBlockedReason(env: PushEnv = pushEnv()): 'unsupported' | 'denied' | 'prompt' | 'visible' | null {
  if (!env.supported || env.permission === 'unsupported') return 'unsupported';
  if (env.permission === 'denied') return 'denied';
  if (env.permission === 'default') return 'prompt';
  if (env.visible) return 'visible';
  return null;
}

/**
 * Show an OS notification for an incoming event. Returns true only when one was
 * actually delivered, so callers never assume success.
 */
export function pushNotification(title: string, body: string, env: PushEnv = pushEnv()): boolean {
  const heading = (title || '').trim();
  if (!heading) return false;
  if (pushBlockedReason(env) !== null) return false;
  if (!env.deliver) return false;
  env.deliver(heading, (body || '').trim());
  return true;
}

/** Ask the browser for permission once; resolves to the resulting state. */
export async function requestPushPermission(env: PushEnv = pushEnv()): Promise<PushPermission> {
  if (!env.request) return 'unsupported';
  return env.request();
}

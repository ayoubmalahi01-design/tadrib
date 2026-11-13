/**
 * Non-blocking notification channel (F13).
 *
 * The app previously reported every failure with `window.alert`, which freezes
 * the interface, cannot be translated consistently and is hostile on mobile.
 * Components call `notify(message)`; the shell registers a listener that renders
 * a dismissible status banner.
 *
 * If nothing is mounted (for example during a unit test) the message is logged
 * instead of thrown, so a missing listener can never crash a code path.
 */
type Listener = (message: string) => void

let listener: Listener | null = null

/** Registers the component that renders notifications. Returns an unbind function. */
export function setToastListener(fn: Listener | null): () => void {
  listener = fn
  return () => {
    if (listener === fn) listener = null
  }
}

/** Shows a message to the user, or logs it when no listener is mounted. */
export function notify(message: string | null | undefined): void {
  const text = String(message ?? '').trim()
  if (!text) return
  if (listener) listener(text)
  else console.warn(text)
}

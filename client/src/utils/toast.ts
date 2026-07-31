// A tiny event-bus for app-wide error/success notifications — same pattern
// auth.ts already uses for SESSION_EXPIRED_EVENT, so no Context/Provider
// needs threading through every page. <ToastHost/> (mounted once in
// App.tsx) is the only listener; any page can call showToast/showApiError
// without importing a component or lifting state.
export type ToastKind = 'error' | 'success' | 'info';

export interface ToastDetail {
  message: string;
  kind: ToastKind;
}

export const TOAST_EVENT = 'app:toast';

export function showToast(message: string, kind: ToastKind = 'error') {
  window.dispatchEvent(new CustomEvent<ToastDetail>(TOAST_EVENT, { detail: { message, kind } }));
}

// The overwhelmingly common call shape at every API call site in this app:
// show whatever the server explained, or a sensible fallback if the request
// never made it there at all (network error, CORS, timeout).
export function showApiError(err: any, fallback: string) {
  showToast(err?.response?.data?.error || fallback, 'error');
}

export function showSuccess(message: string) {
  showToast(message, 'success');
}

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

// Turns an axios failure into something worth reading.
//
// This used to be `err?.response?.data?.error || fallback`, which collapsed
// three very different situations into one sentence. With the API
// unreachable, three widgets on one page each said «Не удалось загрузить
// …» — every one of them describing what the app had wanted to do, and
// none of them the single fact that mattered: nothing was going to load,
// because there was nobody to load it from. A person reading that goes
// looking for a broken feature instead of a broken connection.
//
// The order matters. A message the server itself wrote is always the best
// one available — it knows why it refused. Only when there is no response
// at all is the caller's fallback the wrong thing to say.
export function apiErrorMessage(err: any, fallback: string): string {
  const fromServer = err?.response?.data?.error;
  if (fromServer) return fromServer;

  // No `response` means the request never got an answer: the server is
  // down, the network is off, CORS refused it, or it timed out. Which of
  // those it is cannot be told apart from the browser — and does not need
  // to be, because the next step is the same for all of them.
  if (!err?.response) {
    if (err?.code === 'ECONNABORTED' || err?.code === 'ETIMEDOUT') {
      return 'Сервер слишком долго не отвечает. Попробуй ещё раз.';
    }
    return 'Нет связи с сервером. Проверь интернет и попробуй ещё раз.';
  }

  // Answered, but with nothing to say for itself. Worth distinguishing:
  // 5xx is ours to fix and retrying may well work, which is not true of
  // the 4xx that fell through to here.
  if (err.response.status >= 500) {
    return `${fallback} — сервер ответил ошибкой. Если повторится, скажи лиду.`;
  }
  return fallback;
}

export function showApiError(err: any, fallback: string) {
  showToast(apiErrorMessage(err, fallback), 'error');
}


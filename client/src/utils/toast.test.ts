// Three widgets on one page each reported «Не удалось загрузить …» while
// the API was simply unreachable. Every message described what the app had
// wanted to do; none of them said the one thing that mattered, which is
// that nothing was going to load because there was nobody to load it from.
import { describe, it, expect } from 'vitest';
import { apiErrorMessage } from './toast';

const FALLBACK = 'Не удалось загрузить статистику площадки';

describe('apiErrorMessage', () => {
  it('prefers what the server said — it knows why it refused', () => {
    const err = { response: { status: 400, data: { error: 'Сначала нужно пройти тест' } } };
    expect(apiErrorMessage(err, FALLBACK)).toBe('Сначала нужно пройти тест');
  });

  it('says the connection is down when the request never got an answer', () => {
    // No `response` at all: server down, network off, CORS refused. Which
    // one cannot be told apart in the browser, and does not need to be —
    // the next step is the same.
    expect(apiErrorMessage({ message: 'Network Error' }, FALLBACK)).toMatch(/связи с сервером/i);
    expect(apiErrorMessage({ message: 'Network Error' }, FALLBACK)).not.toContain(FALLBACK);
  });

  it('names a timeout as a timeout', () => {
    expect(apiErrorMessage({ code: 'ECONNABORTED' }, FALLBACK)).toMatch(/долго не отвечает/i);
  });

  it('separates a server fault from a refusal, because only one is worth retrying', () => {
    const server = apiErrorMessage({ response: { status: 500, data: {} } }, FALLBACK);
    expect(server).toContain(FALLBACK);
    expect(server).toMatch(/сервер ответил ошибкой/i);

    expect(apiErrorMessage({ response: { status: 404, data: {} } }, FALLBACK)).toBe(FALLBACK);
  });

  it('survives being handed something that is not an axios error', () => {
    expect(apiErrorMessage(undefined, FALLBACK)).toMatch(/связи с сервером/i);
    expect(apiErrorMessage(new Error('boom'), FALLBACK)).toMatch(/связи с сервером/i);
  });
});

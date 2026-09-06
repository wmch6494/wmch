const defaultSleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function fetchWithRetry(url, init = {}, options = {}) {
  const {
    attempts = 5,
    baseDelayMs = 2_000,
    timeoutMs = 15_000,
    label = 'HTTP 요청',
    fetchImpl = globalThis.fetch,
    sleep = defaultSleep,
    onRetry = (message) => console.warn(message),
  } = options;

  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        ...init,
        signal: init.signal ?? AbortSignal.timeout(timeoutMs),
      });

      if (response.ok) return response;

      lastError = new Error(`${label} 실패: ${response.status}`);
      if (typeof response.body?.cancel === 'function') {
        await response.body.cancel().catch(() => {});
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }

    if (attempt === attempts) break;

    const waitMs = baseDelayMs * (2 ** (attempt - 1));
    onRetry(`${label} 재시도 ${attempt}/${attempts - 1}: ${waitMs}ms 후 다시 요청합니다. (${lastError.message})`);
    await sleep(waitMs);
  }

  throw lastError;
}

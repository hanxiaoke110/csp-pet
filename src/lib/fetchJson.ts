/** Covers both headers and body. Never turn HTML/proxy errors into empty data. */
export async function fetchJson<T = any>(url: string, options: RequestInit = {}, timeoutMs = 15000): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const raw = await response.text();
    let data: any;
    try { data = JSON.parse(raw); } catch { throw new Error(`服务暂时返回了非 JSON 内容（HTTP ${response.status}），请稍后重试`); }
    if (!response.ok || data?.error) throw new Error(typeof data?.error === 'string' ? data.error : `服务请求失败（HTTP ${response.status}）`);
    return data as T;
  } finally { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); }
}

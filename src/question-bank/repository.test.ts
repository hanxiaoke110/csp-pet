import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { beginQuestionBankSession, chooseQuestionSnapshot, V2_KEYS } from './repository';

describe('question bank v2 snapshot selection', () => {
  it('prefers a newer valid current cache', () => {
    expect(chooseQuestionSnapshot(
      { revision: 3, valid: true, data: ['current'] },
      null,
      { revision: 2, valid: true, data: ['bundle'] },
    ).data).toEqual(['current']);
  });

  it('falls back to a previous valid cache when current is corrupt', () => {
    expect(chooseQuestionSnapshot(
      { revision: 4, valid: false, data: ['bad'] },
      { revision: 3, valid: true, data: ['previous'] },
      { revision: 2, valid: true, data: ['bundle'] },
    ).data).toEqual(['previous']);
  });

  it('uses bundled data when both cache slots are invalid', () => {
    expect(chooseQuestionSnapshot(
      { revision: 4, valid: false, data: ['bad-current'] },
      { revision: 3, valid: false, data: ['bad-previous'] },
      { revision: 2, valid: true, data: ['bundle'] },
    ).data).toEqual(['bundle']);
  });

  it('prefers bundled over an equal-revision current cache (same-revision bad cache guard)', () => {
    expect(chooseQuestionSnapshot(
      { revision: 2, valid: true, data: ['bad-current'] },
      null,
      { revision: 2, valid: true, data: ['bundle'] },
    ).data).toEqual(['bundle']);
  });

  it('prefers bundled over an equal-revision previous cache', () => {
    expect(chooseQuestionSnapshot(
      null,
      { revision: 2, valid: true, data: ['bad-previous'] },
      { revision: 2, valid: true, data: ['bundle'] },
    ).data).toEqual(['bundle']);
  });

  it('uses a valid current cache when bundled data is broken (corrupted install guard)', () => {
    expect(chooseQuestionSnapshot(
      { revision: 3, valid: true, data: ['current'] },
      null,
      null,
    ).data).toEqual(['current']);
  });

  it('throws when every snapshot source is invalid or missing', () => {
    expect(() => chooseQuestionSnapshot(
      { revision: 4, valid: false, data: ['bad'] },
      null,
      null,
    )).toThrow('No valid question bank snapshot is available');
  });
});

// ── 会话级回归测试：内置数据损坏（安装不完整）时必须回退到有效缓存，而不是整体失败 ──
// 2026-08-18 学生反馈「强制刷新后一直加载」的根因场景：loadBundled 曾是 Promise.all 致命环节。

interface TestManifest {
  schemaVersion: number;
  contentRevision: number;
  verificationRevision: number;
  channelRulesRevision: number;
  generatedAt: string;
  files: Record<string, { path: string; sha256: string }>;
}

interface TestCache {
  manifest: TestManifest;
  files: Record<string, string>;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function makeCache(contentRevision: number): Promise<TestCache> {
  const filesRaw = {
    'daily-gesp.json': JSON.stringify({ questions: [] }),
    'super-cspj.json': JSON.stringify({ questions: [] }),
    'exam-questions.json': JSON.stringify({ questions: [] }),
    'exam-manifests.json': JSON.stringify({ papers: [] }),
    'topic-practice.json': JSON.stringify({ questions: [] }),
  };
  const manifest: TestManifest = {
    schemaVersion: 2,
    contentRevision,
    verificationRevision: 7,
    channelRulesRevision: 8,
    generatedAt: '2026-08-18T00:00:00Z',
    files: {},
  };
  for (const [name, raw] of Object.entries(filesRaw)) {
    manifest.files[name] = { path: `${name.replace(/\.json$/, '')}.a1b2c3d4e5f6.json`, sha256: await sha256Hex(raw) };
  }
  return { manifest, files: filesRaw };
}

function installLocalStorageMock(): void {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
  });
}

// serveBundled = null 模拟内置数据不可读（文件缺失/安装不完整）
function installFetchMock(serveBundled: TestCache | null): void {
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => {
    const target = String(url);
    if (!serveBundled) throw new Error('bundled asset unreadable');
    const prefix = '/course-data/question-bank-v2/';
    if (target === `${prefix}manifest.json`) {
      return new Response(JSON.stringify(serveBundled.manifest), { status: 200 });
    }
    if (target.startsWith(prefix)) {
      const fileName = target.slice(prefix.length);
      const logicalName = Object.keys(serveBundled.files).find(
        name => serveBundled.manifest.files[name].path === fileName,
      );
      if (logicalName) return new Response(serveBundled.files[logicalName], { status: 200 });
    }
    return new Response('not found', { status: 404 });
  }));
}

describe('beginQuestionBankSession robustness (corrupted install guard)', () => {
  beforeEach(() => { installLocalStorageMock(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('falls back to a valid current cache when bundled data is unreadable', async () => {
    installFetchMock(null);
    const cache = await makeCache(3);
    localStorage.setItem(V2_KEYS.current, JSON.stringify({ manifest: cache.manifest, files: cache.files, cachedAt: '' }));
    const session = await beginQuestionBankSession(['daily', 'super', 'exam']);
    expect(session.source).toBe('current');
    expect(session.revision).toBe(3);
  });

  it('falls back to a valid previous cache when current is corrupt and bundled is unreadable', async () => {
    installFetchMock(null);
    const good = await makeCache(3);
    const bad = await makeCache(4);
    bad.files['daily-gesp.json'] = JSON.stringify({ questions: [{ broken: true }] });
    localStorage.setItem(V2_KEYS.current, JSON.stringify({ manifest: bad.manifest, files: bad.files, cachedAt: '' }));
    localStorage.setItem(V2_KEYS.previous, JSON.stringify({ manifest: good.manifest, files: good.files, cachedAt: '' }));
    const session = await beginQuestionBankSession(['daily', 'super', 'exam']);
    expect(session.source).toBe('previous');
    expect(session.revision).toBe(3);
  });

  it('rejects when every source is unavailable so the UI can show a retryable error', async () => {
    installFetchMock(null);
    await expect(beginQuestionBankSession(['daily', 'super', 'exam']))
      .rejects.toThrow('No valid question bank snapshot is available');
  });

  it('loads bundled data when no cache exists and bundled assets are intact', async () => {
    installFetchMock(await makeCache(3));
    const session = await beginQuestionBankSession(['daily', 'super', 'exam', 'topic']);
    expect(session.source).toBe('bundled');
    expect(session.revision).toBe(3);
    expect(session.channels.topic).toEqual([]);
  });

  it('falls back to bundled data when an older cache has no topic channel', async () => {
    const bundled = await makeCache(4);
    const oldCache = await makeCache(3);
    delete oldCache.files['topic-practice.json'];
    delete oldCache.manifest.files['topic-practice.json'];
    localStorage.setItem(V2_KEYS.current, JSON.stringify({ manifest: oldCache.manifest, files: oldCache.files, cachedAt: '' }));
    installFetchMock(bundled);

    const session = await beginQuestionBankSession(['daily', 'super', 'exam', 'topic']);
    expect(session.source).toBe('bundled');
    expect(session.revision).toBe(4);
  });
});

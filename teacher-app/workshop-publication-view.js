/* Classic script: publication checks use only the public static catalog. */
(function (root) {
  'use strict';
  const API = 'https://api.cspstudy.top';
  const CATALOG = 'https://cards.cspstudy.top/workshop/catalog.json';
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (object(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
    return value;
  }
  function imageKey(value) {
    if (typeof value !== 'string' || !value.trim() || value.length > 4096 || /[\x00-\x1f\x7f]/.test(value)) throw Error('图片标识无效');
    if (value.startsWith('/') || /^[a-z][a-z\d+.-]*:\/\//i.test(value)) {
      const url = new URL(value, API);
      if (url.origin !== API || url.username || url.password || url.hash || url.pathname !== '/api/workshop/image' || [...url.searchParams.keys()].length !== 1 || !url.searchParams.has('key')) throw Error('图片地址无效');
      value = url.searchParams.get('key');
      if (!value || value.length > 4096 || /[\x00-\x1f\x7f]/.test(value)) throw Error('图片标识无效');
    } else if (/^(?:https?:|data:|file:|javascript:)/i.test(value)) throw Error('图片地址无效');
    return value;
  }
  function normalizeRecord(record) {
    if (!object(record) || !/^ws-[A-Z0-9]{6,20}$/.test(record.id || '') || !['earth', 'fire', 'wind', 'water', 'light'].includes(record.element) || !['common', 'rare', 'legendary'].includes(record.tier || 'common')) throw Error('精灵记录无效');
    if (record.price != null && (typeof record.price !== 'number' && (typeof record.price !== 'string' || !/^\d+$/.test(record.price)))) throw Error('价格无效');
    const price = Number(record.price ?? 200);
    if (!Number.isSafeInteger(price) || price < 0) throw Error('价格无效');
    const meta = JSON.parse(record.pet_json);
    if (!object(meta) || !integer(meta.frameWidth, 1, 8192) || !integer(meta.frameHeight, 1, 8192) || (meta.maxFrames !== undefined && !integer(meta.maxFrames, 1, 8192)) || !object(meta.anims) || !Object.keys(meta.anims).length) throw Error('精灵配置无效');
    for (const count of Object.values(meta.anims)) {
      if (Array.isArray(count) ? count.length !== 2 || !integer(count[0], 0, 8191) || !integer(count[1], 1, meta.maxFrames ?? 8192) : !integer(count, 1, meta.maxFrames ?? 8192)) throw Error('动画帧数无效');
    }
    for (const key of ['animOrder', 'animsOrder']) if (meta[key] !== undefined && (!Array.isArray(meta[key]) || !meta[key].length || meta[key].some(name => typeof name !== 'string' || !Object.hasOwn(meta.anims, name)))) throw Error('动画顺序无效');
    if (meta.durations !== undefined && (!object(meta.durations) || Object.values(meta.durations).some(n => !integer(n, 1, 3600000)))) throw Error('动画时长无效');
    const result = { id: record.id, element: record.element, tier: record.tier || 'common', price, pet_json: JSON.stringify(canonical(meta)), spritesheet_url: imageKey(record.spritesheet_url), thumbnail_url: imageKey(record.thumbnail_url || record.spritesheet_url) };
    for (const key of ['name', 'style', 'description', 'teacher_name']) {
      if (record[key] !== undefined && typeof record[key] !== 'string') throw Error('精灵信息无效');
      result[key] = record[key] || '';
    }
    if (!result.name.trim()) throw Error('精灵名称无效');
    return result;
  }
  function readCatalog(catalog) {
    if (!object(catalog) || catalog.version !== 2 || !Array.isArray(catalog.items) || catalog.count !== catalog.items.length || catalog.count > 10000 || typeof catalog.updatedAt !== 'string' || !Number.isFinite(Date.parse(catalog.updatedAt))) throw Error('静态目录格式无效');
    const records = new Map();
    for (const item of catalog.items) {
      if (!object(item) || !object(item.source_record)) throw Error('静态记录缺失');
      const record = normalizeRecord(item.source_record);
      if (item.id !== record.id || records.has(record.id)) throw Error('静态记录重复或无效');
      records.set(record.id, record);
    }
    return { updatedAt: catalog.updatedAt, records };
  }
  function status(record, catalog, failed) {
    if (failed) return '检查失败';
    try {
      return catalog && JSON.stringify(normalizeRecord(record)) === JSON.stringify(catalog.records.get(record.id)) ? '已上架' : '同步中';
    } catch (_) { return '同步中'; }
  }
  root.WorkshopPublication = Object.freeze({ CATALOG, imageKey, normalizeRecord, readCatalog, status });
})(globalThis);

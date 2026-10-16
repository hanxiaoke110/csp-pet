import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { normalizeSourceRecord } from './workshop-publication.mjs';

const context = { URL };
runInNewContext(readFileSync(new URL('../teacher-app/workshop-publication-view.js', import.meta.url), 'utf8'), context);
const view = context.WorkshopPublication;
const pet = (changes = {}) => ({ id:'ws-ABC123', name:'小龙', element:'fire', spritesheet_url:'sheet:abc', pet_json:JSON.stringify({ frameWidth:2, frameHeight:3, anims:{ idle:2 }, nested:{ z:1, a:[{ y:2, b:1 }] } }), ...changes });
const catalog = records => ({ version:2, updatedAt:'2026-10-15T00:00:00Z', count:records.length, items:records.map(record => ({ id:record.id, source_record:record })) });
const plain = value => JSON.parse(JSON.stringify(value));

test('normalization matches publisher and recursively canonicalizes JSON without private metadata', () => {
  const record = pet({ teacher_id:'private', created_at:'private', price:'200' });
  assert.deepEqual(plain(view.normalizeRecord(record)), normalizeSourceRecord(record));
  assert.equal(view.normalizeRecord(record).teacher_id, undefined);
  const other = pet({ pet_json:JSON.stringify({ nested:{ a:[{ b:1, y:2 }], z:1 }, anims:{ idle:2 }, frameHeight:3, frameWidth:2 }) });
  assert.equal(view.status(other, view.readCatalog(catalog([record])), false), '已上架');
});

test('matches API and relative image URLs to raw KV keys and rejects foreign URLs', () => {
  for (const prefix of ['https://api.cspstudy.top', '']) {
    const record = pet({ spritesheet_url:prefix + '/api/workshop/image?key=sheet%3Aabc' });
    assert.equal(view.status(record, view.readCatalog(catalog([pet()])), false), '已上架');
  }
  for (const value of ['https://evil.test/api/workshop/image?key=x', 'javascript:alert(1)', '/api/workshop/image?key=x&key=y', 'https://api.cspstudy.top/api/workshop/image?key=x#fragment']) assert.throws(() => view.imageKey(value));
});

test('sparse animation order entries match publisher normalization, while invalid names fail', () => {
  for (const key of ['animOrder', 'animsOrder']) {
    const metadata = { ...JSON.parse(pet().pet_json), [key]:['idle', 'walk', 'sleep'] };
    const record = pet({ pet_json:JSON.stringify(metadata) });
    assert.deepEqual(plain(view.normalizeRecord(record)), normalizeSourceRecord(record));
    assert.equal(view.status(record, view.readCatalog(catalog([record])), false), '已上架');
    for (const order of [[], ['idle', ''], ['idle', ' '], ['idle', null], 'idle']) {
      const invalid = pet({ pet_json:JSON.stringify({ ...metadata, [key]:order }) });
      assert.throws(() => view.normalizeRecord(invalid));
      assert.throws(() => normalizeSourceRecord(invalid));
    }
  }
});

test('new, edited, and removed records remain pending; check errors never show published', () => {
  const published = view.readCatalog(catalog([pet()]));
  assert.equal(view.status(pet(), published, false), '已上架');
  assert.equal(view.status(pet({ id:'ws-DEF456' }), published, false), '同步中');
  for (const changes of [{ name:'新龙' }, { element:'water' }, { tier:'rare' }, { price:250 }, { style:'new' }, { description:'new' }, { teacher_name:'新老师' }, { spritesheet_url:'new-sheet' }, { thumbnail_url:'new-thumb' }, { pet_json:pet().pet_json.replace('"idle":2', '"idle":3') }]) assert.equal(view.status(pet(changes), published, false), '同步中');
  assert.equal(view.status(pet(), view.readCatalog(catalog([])), false), '同步中');
  assert.equal(view.status(pet(), published, true), '检查失败');
  assert.equal(view.status(pet(), null, false), '同步中');
});

test('invalid, old, duplicated, and incomplete catalogs fail checks', () => {
  for (const invalid of [null, {}, { ...catalog([]), version:1 }, { ...catalog([]), count:1 }, { ...catalog([]), updatedAt:'bad' }, { ...catalog([]), items:[{}], count:1 }, catalog([pet(), pet()]), catalog([pet({ pet_json:'{}' })]), catalog([pet({ pet_json:'invalid' })]), catalog([pet({ price:-1 })]), { ...catalog([pet()]), items:[{ id:'ws-OTHER1', source_record:pet() }] }]) assert.throws(() => view.readCatalog(invalid));
});

test('panel checks only static catalog, schedules pending/failure retries, and aborts on unmount', async () => {
  const html = readFileSync(new URL('../teacher-app/index.html', import.meta.url), 'utf8');
  const component = html.slice(html.indexOf('function MyPetsPanel('), html.indexOf('\nfunction QianLongPanel('));
  for (const scenario of ['pending', 'failed', 'published']) {
    let effect, cleanup, nextTimer = 0, requestSignal, now = 0;
    const timers = new Map(), calls = [];
    const sandbox = {
      WorkshopPublication:view, AbortController, Date:class extends Date { static now() { return now; } },
      setTimeout(fn, ms) { const id = ++nextTimer; timers.set(id, { fn, ms }); return id; },
      clearTimeout(id) { timers.delete(id); },
      fetch:async (url, options) => { calls.push({ url, options }); requestSignal = options.signal; return { ok:scenario !== 'failed', json:async () => catalog(scenario === 'published' ? [pet()] : []) }; },
      React:{ useState:value => [value, () => {}], useEffect:fn => { effect = fn; }, createElement:() => null },
      PetThumb:() => null, ELEM_LABEL:{ fire:'火' },
    };
    runInNewContext(component, sandbox);
    sandbox.MyPetsPanel({ pets:[pet()], onRefresh:() => assert.fail('Publication checking must not reload D1') });
    cleanup = effect();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, view.CATALOG);
    assert.equal(calls[0].options.cache, 'no-store');
    assert.equal(calls[0].options.headers, undefined);
    assert.deepEqual([...timers.values()].map(timer => timer.ms), scenario === 'published' ? [] : [scenario === 'failed' ? 60000 : 30000]);
    if (timers.size) {
      const retry = [...timers.values()][0]; timers.clear(); now = 600000;
      await retry.fn();
      assert.equal(calls.length, 1, 'No requests beyond ten-minute bound');
    }
    cleanup();
    assert.equal(requestSignal.aborted, true);
    assert.equal(timers.size, 0);
  }
});

test('teacher list commits all pages together and rejects cursor loops or failed pages', async () => {
  const html = readFileSync(new URL('../teacher-app/index.html', import.meta.url), 'utf8');
  const loader = html.slice(html.indexOf('  async function loadWorkshopPets()'), html.indexOf('\n  // ── Actions ──'));
  for (const scenario of ['complete', 'loop', 'failed']) {
    const calls = [], committed = [], errors = [];
    const sandbox = { URLSearchParams, setWorkshopPets:records => committed.push(records), toast:message => errors.push(message), api:async path => {
      calls.push(path);
      assert.equal(committed.length, 0);
      if (calls.length === 1) return { items:[pet()], hasMore:true, nextCursor:'second+page' };
      if (scenario === 'failed') return { error:'网络错误' };
      return { items:[pet({ id:'ws-DEF456' })], hasMore:scenario === 'loop', nextCursor:'second+page' };
    } };
    runInNewContext(loader, sandbox);
    await sandbox.loadWorkshopPets();
    assert.equal(calls.length, 2);
    assert.equal(calls[0], '/api/workshop/pets?limit=100&paginated=1');
    assert.equal(calls[1], '/api/workshop/pets?limit=100&paginated=1&cursor=second%2Bpage');
    assert.equal(committed.length, scenario === 'complete' ? 1 : 0);
    assert.equal(errors.length, scenario === 'complete' ? 0 : 1);
    if (scenario === 'complete') assert.equal(committed[0].length, 2);
  }
});

test('publication messaging explains scheduler delays without promising a five-minute delivery', () => {
  const html = readFileSync(new URL('../teacher-app/index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /约\s*5\s*分钟/);
  assert.match(html, /平台排队可能延迟/);
  assert.match(html, /已上传，等待自动同步上架；可在「我的精灵」检查状态/);
  assert.match(html, /已删除，等待自动同步下架/);
  assert.match(html, /已保存修改，等待自动同步/);
});

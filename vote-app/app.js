const params = new URLSearchParams(location.search);
const API = (params.get('api') || 'https://api.cspstudy.top').replace(/\/$/, '');
const MAX_CHOICES = 5;
const PAGE_SIZE = 20;

const elementLabels = { fire: '火属性', water: '水属性', wood: '木属性', wind: '风属性', earth: '地属性', light: '光属性', dark: '暗属性', unknown: '神秘属性' };
const elementColors = { fire: '#ff796b', water: '#65cfff', wood: '#79e6a5', wind: '#8ee8d7', earth: '#e4b35d', light: '#ffe483', dark: '#b697ff', unknown: '#9fb3c4' };
const tierLabels = { legendary: '传说', rare: '稀有', common: '普通' };

const state = {
  pets: [],
  filtered: [],
  selected: new Set(),
  filter: 'all',
  query: '',
  visible: PAGE_SIZE,
  voted: false,
  submitting: false,
  receiptCode: '',
  campaign: null,
  turnstileToken: '',
  turnstileWidgetId: null,
};

const el = id => document.getElementById(id);
const grid = el('pet-grid');
const status = el('catalog-status');
const dock = el('vote-dock');
const confirmDialog = el('confirm-dialog');
const successDialog = el('success-dialog');

function randomDeviceId() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  return `vote_${token}`;
}

function getDeviceId() {
  let id = localStorage.getItem('collector_vote_device_id');
  if (!/^vote_[A-Za-z0-9_-]{20,80}$/.test(id || '')) {
    id = randomDeviceId();
    localStorage.setItem('collector_vote_device_id', id);
  }
  return id;
}

const deviceId = getDeviceId();

function seedFrom(text) {
  let value = 2166136261;
  for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
}

function shuffled(items, seedText) {
  const output = [...items];
  let seed = seedFrom(seedText);
  const random = () => {
    seed += 0x6D2B79F5;
    let n = seed;
    n = Math.imul(n ^ n >>> 15, n | 1);
    n ^= n + Math.imul(n ^ n >>> 7, n | 61);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
  for (let index = output.length - 1; index > 0; index--) {
    const target = Math.floor(random() * (index + 1));
    [output[index], output[target]] = [output[target], output[index]];
  }
  return output;
}

function showToast(message) {
  const toast = el('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 3200);
}

async function setupTurnstile(siteKey) {
  if (!siteKey) return;
  const slot = el('turnstile-slot');
  slot.hidden = false;
  await new Promise((resolve, reject) => {
    if (window.turnstile) return resolve();
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error('安全验证加载失败'));
    document.head.append(script);
  });
  state.turnstileWidgetId = window.turnstile.render(slot, {
    sitekey: siteKey,
    theme: 'dark',
    size: 'flexible',
    callback: token => { state.turnstileToken = token; },
    'expired-callback': () => { state.turnstileToken = ''; },
    'error-callback': () => { state.turnstileToken = ''; },
  });
}

async function fetchJson(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  // text/plain keeps the cross-subdomain ballot POST a CORS "simple request",
  // avoiding a second Worker invocation for an OPTIONS preflight.
  if (options.body !== undefined && !headers['Content-Type']) headers['Content-Type'] = 'text/plain;charset=UTF-8';
  const response = await fetch(url, { ...options, headers });
  let body = {};
  try { body = await response.json(); } catch {}
  if (!response.ok) {
    const error = new Error(body.error || '网络开小差了，请稍后重试');
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

function petById(id) { return state.pets.find(pet => pet.id === id); }

function createTeamPet(pet) {
  const item = document.createElement('span');
  item.className = 'team-pet';
  const image = document.createElement('img');
  image.src = pet.image;
  image.alt = '';
  const name = document.createElement('span');
  name.textContent = pet.name;
  item.append(image, name);
  return item;
}

function createPetCard(pet) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'pet-card';
  button.dataset.petId = pet.id;
  button.setAttribute('aria-pressed', String(state.selected.has(pet.id)));
  button.setAttribute('aria-label', `${pet.name}，${elementLabels[pet.element] || elementLabels.unknown}，点击${state.selected.has(pet.id) ? '取消选择' : '选择'}`);
  if (state.selected.has(pet.id)) button.classList.add('selected');
  if (state.voted) button.disabled = true;
  else if (state.campaign?.status !== 'open') button.setAttribute('aria-disabled', 'true');

  const imageWrap = document.createElement('span');
  imageWrap.className = 'pet-image';
  const image = document.createElement('img');
  image.src = pet.image;
  image.alt = pet.name;
  image.loading = 'lazy';
  image.decoding = 'async';
  const star = document.createElement('span');
  star.className = 'select-star';
  star.textContent = '✦';
  star.setAttribute('aria-hidden', 'true');
  imageWrap.append(image, star);

  const copy = document.createElement('span');
  copy.className = 'pet-copy';
  const name = document.createElement('strong');
  name.className = 'pet-name';
  name.textContent = pet.name;
  const meta = document.createElement('span');
  meta.className = 'pet-meta';
  const element = document.createElement('span');
  element.className = 'element-dot';
  element.style.setProperty('--element-color', elementColors[pet.element] || elementColors.unknown);
  element.textContent = elementLabels[pet.element] || elementLabels.unknown;
  const tier = document.createElement('span');
  tier.textContent = tierLabels[pet.tier] || '特别';
  meta.append(element, tier);
  copy.append(name, meta);
  button.append(imageWrap, copy);
  button.addEventListener('click', () => togglePet(pet.id));
  return button;
}

function applyFilters() {
  const query = state.query.trim().toLocaleLowerCase('zh-CN');
  state.filtered = state.pets.filter(pet => {
    const matchesElement = state.filter === 'all' || pet.element === state.filter;
    const matchesSearch = !query || `${pet.name} ${pet.description || ''}`.toLocaleLowerCase('zh-CN').includes(query);
    return matchesElement && matchesSearch;
  });
  state.visible = PAGE_SIZE;
  renderGrid();
}

function renderGrid() {
  grid.replaceChildren();
  const shown = state.filtered.slice(0, state.visible);
  if (!shown.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = '这片星域暂时没有找到智子，换个名字或属性试试看吧。';
    grid.append(empty);
  } else {
    const fragment = document.createDocumentFragment();
    shown.forEach(pet => fragment.append(createPetCard(pet)));
    grid.append(fragment);
  }
  const remaining = Math.max(0, state.filtered.length - shown.length);
  status.textContent = `找到 ${state.filtered.length} 位智子${remaining ? `，还有 ${remaining} 位等待登场` : '，已经全部到齐'}`;
  el('load-more').hidden = remaining === 0;
  updateSelectionUI();
}

function togglePet(id) {
  if (state.voted) return;
  if (state.campaign?.status !== 'open') {
    const finished = Array.isArray(state.campaign?.topTen) && state.campaign.topTen.length > 0;
    showToast(finished ? '本轮投票已经结束，去看看荣耀前十吧！' : '星光通道还没开启，请稍后再来～');
    return;
  }
  if (state.selected.has(id)) {
    state.selected.delete(id);
  } else if (state.selected.size >= MAX_CHOICES) {
    showToast('应援小队只能站 5 位，再纠结一下吧～');
    return;
  } else {
    state.selected.add(id);
  }
  const card = grid.querySelector(`[data-pet-id="${CSS.escape(id)}"]`);
  if (card) {
    const selected = state.selected.has(id);
    card.classList.toggle('selected', selected);
    card.setAttribute('aria-pressed', String(selected));
  }
  updateSelectionUI();
}

function updateSelectionUI() {
  const count = state.selected.size;
  el('selection-count').textContent = String(count);
  const button = el('submit-button');
  button.disabled = count === 0 || state.voted || state.campaign?.status !== 'open' || state.submitting;
  dock.classList.toggle('visible', count > 0 || state.voted);

  const title = el('dock-title');
  const subtitle = el('dock-subtitle');
  if (state.voted) {
    title.textContent = '星光已经送达';
    subtitle.textContent = state.receiptCode ? `回执 ${state.receiptCode}` : '感谢你的认真选择';
    button.textContent = '已经投过票啦';
  } else if (count === MAX_CHOICES) {
    title.textContent = '梦幻阵容集结完毕！';
    subtitle.textContent = '准备把星光送给它们吧';
    button.textContent = '投出我的星光！';
  } else {
    const messages = ['', '第一颗星星亮起来啦！', '两位伙伴加入小队', '应援小队越来越热闹了', '还差最后一位伙伴'];
    title.textContent = messages[count] || '继续点亮智子';
    subtitle.textContent = `已选择 ${count} / ${MAX_CHOICES}，最多还能选 ${MAX_CHOICES - count} 位`;
    button.textContent = count ? `投出星光（${count}/5）` : '投出我的星光！';
  }

  const faces = el('chosen-faces');
  faces.replaceChildren();
  [...state.selected].map(petById).filter(Boolean).forEach(pet => {
    const image = document.createElement('img');
    image.src = pet.image;
    image.alt = '';
    faces.append(image);
  });
}

function fillTeam(container, ids) {
  container.replaceChildren();
  ids.map(petById).filter(Boolean).forEach(pet => container.append(createTeamPet(pet)));
}

function showSuccess(ballot, openDialog = true) {
  state.voted = true;
  state.receiptCode = ballot.receiptCode || '';
  state.selected = new Set(ballot.choices || []);
  localStorage.removeItem('collector_vote_pending');
  fillTeam(el('success-team'), [...state.selected]);
  el('receipt-code').textContent = state.receiptCode || '已安全入库';
  updateSelectionUI();
  renderGrid();
  if (openDialog && !successDialog.open) successDialog.showModal();
}

async function submitBallot() {
  if (state.submitting || state.selected.size === 0) return;
  if (state.campaign?.turnstileSiteKey && !state.turnstileToken) {
    showToast('请先完成安全验证，再把星光送出去');
    return;
  }
  state.submitting = true;
  el('confirm-submit').disabled = true;
  el('confirm-submit').textContent = '星光传送中…';
  updateSelectionUI();
  const pending = { device_hash: deviceId, choices: [...state.selected] };
  localStorage.setItem('collector_vote_pending', JSON.stringify(pending));
  try {
    const result = await fetchJson(`${API}/api/collector-vote/ballots`, {
      method: 'POST',
      body: JSON.stringify({ ...pending, turnstile_token: state.turnstileToken }),
    });
    confirmDialog.close();
    showSuccess(result);
  } catch (error) {
    if (error.status === 409 && error.body?.voted) {
      confirmDialog.close();
      showSuccess(error.body);
    } else {
      showToast(error.message || '还没投出去，请检查网络后重试');
      state.turnstileToken = '';
      if (window.turnstile && state.turnstileWidgetId !== null) window.turnstile.reset(state.turnstileWidgetId);
    }
  } finally {
    state.submitting = false;
    el('confirm-submit').disabled = false;
    el('confirm-submit').textContent = '就是它们，出发！';
    updateSelectionUI();
  }
}

function renderClosedResults(topTen) {
  if (!Array.isArray(topTen) || !topTen.length) return;
  const section = document.createElement('section');
  section.className = 'results-panel';
  const kicker = document.createElement('p');
  kicker.className = 'kicker';
  kicker.textContent = '荣耀揭晓 · TOP 10';
  const heading = document.createElement('h2');
  heading.textContent = '典藏之星已经诞生！';
  const list = document.createElement('ol');
  list.className = 'results-list';
  topTen.forEach(result => {
    const pet = petById(result.petId);
    const item = document.createElement('li');
    const rank = document.createElement('strong');
    rank.textContent = String(result.rank).padStart(2, '0');
    if (pet) {
      const image = document.createElement('img'); image.src = pet.image; image.alt = '';
      item.append(image);
    }
    const name = document.createElement('span'); name.textContent = result.name;
    const votes = document.createElement('small'); votes.textContent = `${result.votes} 束星光`;
    item.append(rank, name, votes); list.append(item);
  });
  section.append(kicker, heading, list);
  document.querySelector('.rules-strip').after(section);
}

async function restoreVoteStatus() {
  try {
    const result = await fetchJson(`${API}/api/collector-vote/status?device_hash=${encodeURIComponent(deviceId)}`);
    if (result.voted) showSuccess(result, false);
  } catch {
    const pendingRaw = localStorage.getItem('collector_vote_pending');
    if (pendingRaw) {
      try {
        const pending = JSON.parse(pendingRaw);
        if (pending.device_hash === deviceId && Array.isArray(pending.choices)) {
          state.selected = new Set(pending.choices.filter(id => petById(id)));
          updateSelectionUI();
          showToast('发现一张还没送达的选票，请再次点击提交');
        }
      } catch { localStorage.removeItem('collector_vote_pending'); }
    }
  }
}

function setupCard() {
  const scene = el('card-scene');
  const card = el('holo-card');
  const canHover = matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (canHover) {
    scene.addEventListener('pointermove', event => {
      if (card.classList.contains('flipped')) return;
      const rect = scene.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
      const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
      card.style.transform = `rotateX(${(0.5 - y) * 11}deg) rotateY(${(x - 0.5) * 14}deg)`;
      card.style.setProperty('--glare-x', `${x * 100}%`);
      card.style.setProperty('--glare-y', `${y * 100}%`);
      card.style.setProperty('--foil-angle', `${x * 240 + y * 80}deg`);
      card.style.setProperty('--foil-x', `${(x - .5) * 18}%`);
      card.style.setProperty('--foil-y', `${(y - .5) * 18}%`);
    });
    scene.addEventListener('pointerleave', () => { if (!card.classList.contains('flipped')) card.style.transform = ''; });
  }
  card.addEventListener('click', () => {
    card.style.transform = '';
    const flipped = card.classList.toggle('flipped');
    card.setAttribute('aria-pressed', String(flipped));
  });
}

async function init() {
  setupCard();
  try {
    const [catalog, campaign] = await Promise.all([
      fetchJson('./catalog.json'),
      fetchJson(`${API}/api/collector-vote/config`),
    ]);
    state.pets = shuffled(catalog.pets || [], deviceId);
    state.filtered = [...state.pets];
    state.campaign = campaign;
    el('candidate-count').textContent = String(state.pets.length);
    el('ballot-count').textContent = new Intl.NumberFormat('zh-CN').format(campaign.ballotCount || 0);
    document.title = campaign.title || document.title;
    renderGrid();
    try { await setupTurnstile(campaign.turnstileSiteKey); }
    catch (error) { showToast(error.message || '安全验证加载失败，请刷新页面重试'); }
    if (campaign.status === 'closed') {
      if (Array.isArray(campaign.topTen) && campaign.topTen.length) {
        status.textContent = '本轮投票已经结束，前十名正式揭晓！';
        renderClosedResults(campaign.topTen);
      } else {
        status.textContent = '星光通道还没开启，先来认识候选智子吧！';
      }
    } else if (campaign.status === 'scheduled') {
      status.textContent = '智子们已经到齐，投票即将开始！';
    }
    await restoreVoteStatus();
  } catch (error) {
    status.textContent = '智子集合时遇到了星际乱流，请刷新页面重试。';
    showToast(error.message || '页面加载失败，请稍后重试');
  }
}

el('search').addEventListener('input', event => { state.query = event.target.value; applyFilters(); });
el('filters').addEventListener('click', event => {
  const button = event.target.closest('[data-element]');
  if (!button) return;
  document.querySelectorAll('.filter').forEach(item => item.classList.toggle('active', item === button));
  state.filter = button.dataset.element;
  applyFilters();
});
el('load-more').addEventListener('click', () => { state.visible += PAGE_SIZE; renderGrid(); });
el('submit-button').addEventListener('click', () => {
  if (!state.selected.size || state.voted) return;
  fillTeam(el('confirm-team'), [...state.selected]);
  confirmDialog.showModal();
});
el('confirm-submit').addEventListener('click', event => { event.preventDefault(); submitBallot(); });
el('success-close').addEventListener('click', () => { successDialog.close(); document.querySelector('#vote').scrollIntoView({ behavior: 'smooth' }); });
successDialog.addEventListener('cancel', event => event.preventDefault());

init();

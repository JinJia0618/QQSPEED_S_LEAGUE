(() => {
  'use strict';

  const host = document.getElementById('pack-app');
  if (!host) return;
  const STORAGE_KEY = 'sleague.fan-collection.v1';
  const LOCK_NAME = 'sleague.fan-collection';
  const VERSION = 1;
  const DUST_PER_DUPLICATE = 10;
  const REDEEM_COST = 50;
  const MAX_VALUE = 1000000000;
  let teams = [], players = [], byId = new Map(), state;
  let storageMode = 'local', storageMessage = '', busy = false;
  let teamFilter = 'all', onlyMissing = false, albumExpanded = false;
  let displayedPackId = null, cardNodes = [], redeemTarget = null;
  let dailyTimer = null;
  let ui = {};

  function localDay(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  function localTime(date = new Date()) {
    return `${localDay(date)} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
  }
  function historyEntry(kind, date = new Date()) {
    return { kind, timestamp: date.toISOString(), localTime: localTime(date), localDate: localDay(date) };
  }
  function validDay(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day, 12);
    return localDay(date) === value;
  }
  function legacyPackDay(pack) {
    const match = pack?.id.match(/^([0-9a-z]{6,12})-[0-9a-z]{1,20}$/);
    if (!match) return null;
    const timestamp = parseInt(match[1], 36);
    if (!Number.isSafeInteger(timestamp)) return null;
    const date = new Date(timestamp);
    return Number.isFinite(date.getTime()) && date.getFullYear() >= 2020 && date.getFullYear() <= 9999 ? localDay(date) : null;
  }
  function nextLocalMidnight(date = new Date()) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  }
  function refreshDailyClock() {
    if (dailyTimer !== null) clearTimeout(dailyTimer);
    updateControls();
    const now = new Date();
    dailyTimer = setTimeout(refreshDailyClock, Math.min(60000, Math.max(250, nextLocalMidnight(now).getTime() - now.getTime() + 50)));
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function button(text, className, action, focusKey) {
    const node = element('button', className, text);
    node.type = 'button';
    if (focusKey) node.dataset.packFocus = focusKey;
    node.addEventListener('click', action);
    return node;
  }
  function picture(src, className, alt = '') {
    const img = element('img', className);
    img.src = src;
    img.alt = alt;
    img.draggable = false;
    img.decoding = 'async';
    return img;
  }
  function validAsset(path) {
    return typeof path === 'string' && /^assets\/[a-zA-Z0-9_./-]+\.(webp|png|jpg|jpeg|svg)$/.test(path) && !path.includes('..');
  }
  function integer(value, fallback = 0) {
    return Number.isSafeInteger(value) && value >= 0 && value <= MAX_VALUE ? value : fallback;
  }
  function blankState() {
    return { version: VERSION, collection: {}, dust: 0, packsOpened: 0, activePack: null, lastOpenedDate: null, history: [] };
  }
  function normalize(raw) {
    const next = blankState();
    let repaired = false;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { state: next, repaired: true };
    if (raw.version !== VERSION) {
      return { state: next, unsupported: true };
    }
    if (raw.collection && typeof raw.collection === 'object' && !Array.isArray(raw.collection)) {
      for (const player of players) {
        const count = integer(raw.collection[player.id]);
        if (count > 0) next.collection[player.id] = count;
        if (raw.collection[player.id] !== undefined && count !== raw.collection[player.id]) repaired = true;
      }
    } else repaired = true;
    next.dust = integer(raw.dust);
    next.packsOpened = integer(raw.packsOpened);
    if (next.dust !== raw.dust || next.packsOpened !== raw.packsOpened) repaired = true;
    if (raw.activePack !== null && raw.activePack !== undefined) {
      const pack = raw.activePack;
      const valid = pack && typeof pack === 'object' && typeof pack.id === 'string' && pack.id.length < 120 &&
        Array.isArray(pack.ids) && pack.ids.length === 5 && new Set(pack.ids).size === 5 &&
        pack.ids.every(id => typeof id === 'string' && byId.has(id) && next.collection[id] > 0) &&
        Array.isArray(pack.isNew) && pack.isNew.length === 5 && pack.isNew.every(value => typeof value === 'boolean') &&
        Array.isArray(pack.revealed) && pack.revealed.length === 5 && pack.revealed.every(value => typeof value === 'boolean') &&
        pack.ids.some(id => byId.get(id).role === 'racing') && pack.ids.some(id => byId.get(id).role === 'item');
      if (valid) {
        const nominalDust = pack.isNew.filter(value => !value).length * DUST_PER_DUPLICATE;
        const dustEarned = Number.isSafeInteger(pack.dustEarned) && pack.dustEarned >= 0 && pack.dustEarned <= nominalDust ? pack.dustEarned : nominalDust;
        next.activePack = { id: pack.id, ids: [...pack.ids], isNew: [...pack.isNew], revealed: [...pack.revealed], dustEarned };
      } else repaired = true;
    }
    // Keep v1 collections intact; old pack IDs contain their creation timestamp.
    if (validDay(raw.lastOpenedDate)) next.lastOpenedDate = raw.lastOpenedDate;
    else {
      next.lastOpenedDate = legacyPackDay(next.activePack);
      if (raw.lastOpenedDate !== undefined && raw.lastOpenedDate !== null) repaired = true;
    }
    if (Array.isArray(raw.history)) {
      const seen = new Set();
      const validId = id => typeof id === 'string' && /^[a-z0-9-]+$/.test(id) && id.length < 120;
      for (const record of raw.history) {
        if (!record || typeof record !== 'object' || typeof record.id !== 'string' || record.id.length > 160 || seen.has(record.id) || !['pack', 'redeem'].includes(record.kind) || typeof record.timestamp !== 'string' || record.timestamp.length > 40 || !Number.isFinite(Date.parse(record.timestamp)) || !validDay(record.localDate) || typeof record.localTime !== 'string' || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(record.localTime)) { repaired = true; continue; }
        const [recordHours, recordMinutes, recordSeconds] = record.localTime.slice(11).split(':').map(Number);
        if (!record.localTime.startsWith(record.localDate + ' ') || recordHours > 23 || recordMinutes > 59 || recordSeconds > 59) { repaired = true; continue; }
        const dustAfterValid = Number.isSafeInteger(record.dustAfter) && record.dustAfter >= 0 && record.dustAfter <= MAX_VALUE;
        const item = { id: record.id, kind: record.kind, timestamp: record.timestamp, localTime: record.localTime, localDate: record.localDate, dustAfter: dustAfterValid ? record.dustAfter : null };
        if (!dustAfterValid && record.dustAfter !== null) repaired = true;
        if (record.kind === 'pack') {
          if (typeof record.packId !== 'string' || record.packId.length > 120 || !Array.isArray(record.cards) || record.cards.length !== 5 || new Set(record.cards.map(card => card?.playerId)).size !== 5 || !record.cards.every(card => card && validId(card.playerId) && typeof card.isNew === 'boolean')) { repaired = true; continue; }
          item.packId = record.packId;
          item.packNumber = integer(record.packNumber);
          item.cards = record.cards.map(card => ({ playerId: card.playerId, isNew: card.isNew }));
          const nominalDust = item.cards.filter(card => !card.isNew).length * DUST_PER_DUPLICATE;
          item.dustChange = Number.isSafeInteger(record.dustChange) && record.dustChange >= 0 && record.dustChange <= nominalDust ? record.dustChange : nominalDust;
          if (record.legacy === true) item.legacy = true;
        } else {
          if (!validId(record.playerId)) { repaired = true; continue; }
          item.playerId = record.playerId;
          item.dustChange = -REDEEM_COST;
        }
        seen.add(record.id);
        next.history.push(item);
      }
    } else if (raw.history !== undefined) repaired = true;
    else if (next.activePack && legacyPackDay(next.activePack)) {
      const date = new Date(parseInt(next.activePack.id.split('-')[0], 36));
      next.history.push({ ...historyEntry('pack', date), id: 'pack-' + next.activePack.id, packId: next.activePack.id, packNumber: next.packsOpened, cards: next.activePack.ids.map((playerId, index) => ({ playerId, isNew: next.activePack.isNew[index] })), dustChange: next.activePack.isNew.filter(value => !value).length * DUST_PER_DUPLICATE, dustAfter: null, legacy: true });
    }
    return { state: next, repaired };
  }
  function useMemory(message) {
    storageMode = 'memory';
    storageMessage = message || '瀏覽器無法儲存收藏；請允許網站儲存資料並重新載入後，再領取每日卡包。既有卡牌仍可查看。';
  }
  function readStorage() {
    if (storageMode !== 'local') return state || blankState();
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === null) return blankState();
      let result;
      try { result = normalize(JSON.parse(saved)); }
      catch (_) {
        storageMessage = '收藏資料無法讀取，已重新建立空白卡冊。新的收藏會從本次開始儲存。';
        return blankState();
      }
      if (result.unsupported) {
        useMemory('此裝置的收藏版本暫不支援。原資料已保留；本頁使用暫存卡冊，重新整理後本次進度不會保留。');
      } else if (result.repaired) {
        storageMessage = '已修復不完整的收藏資料，並保留可讀取的卡牌與星塵。';
      }
      return result.state;
    } catch (_) {
      useMemory();
      return state || blankState();
    }
  }
  function saveStorage(next) {
    if (storageMode !== 'local') return false;
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); return true; }
    catch (_) { useMemory(); return false; }
  }
  function announce(message) { ui.live.textContent = message; }
  function complete(pack = state.activePack) { return !pack || pack.revealed.every(Boolean); }
  function ownedCount() { return players.filter(player => state.collection[player.id] > 0).length; }
  function roleName(player) { return player.role === 'racing' ? '競速' : '道具'; }
  function teamName(player) { return teams.find(team => team.id === player.team)?.name || ''; }
  function rarityFor(player) {
    const team = teams.find(item => item.id === player.team);
    if (team?.overviewTop !== player.id) return { key: 'standard', label: '標準', weight: 100 };
    if (['wolves', 'rsg'].includes(player.team)) return { key: 'ultra', label: '極稀有', weight: 5 };
    if (['rw', 'kz'].includes(player.team)) return { key: 'super', label: '次稀有', weight: 10 };
    return { key: 'rare', label: '稀有', weight: 25 };
  }
  function format(value) { return value.toLocaleString('zh-TW'); }

  // One snapshot commits a whole pack before the reveal animation. Flips never award cards.
  async function transact(change, { requirePersistence = false } = {}) {
    if (busy) return;
    busy = true;
    updateControls();
    const execute = () => {
      state = readStorage();
      if (requirePersistence && storageMode !== 'local') {
        render();
        announce('這項操作需要儲存紀錄。請允許網站儲存資料並重新載入後再試。');
        return;
      }
      const next = JSON.parse(JSON.stringify(state));
      const message = change(next);
      const saved = saveStorage(next);
      if (requirePersistence && !saved) {
        render();
        announce('紀錄未能儲存，這次操作尚未完成。請允許網站儲存資料並重新載入。');
        return;
      }
      state = next;
      render();
      if (message) announce(message);
    };
    try {
      if (storageMode === 'local' && navigator.locks && typeof navigator.locks.request === 'function') {
        await navigator.locks.request(LOCK_NAME, execute);
      } else execute();
    } catch (_) {
      announce('這次操作未完成，請再試一次。');
    } finally {
      busy = false;
      updateControls();
    }
  }
  // Rejection sampling avoids modulo bias. Each integer ticket is uniform within its range.
  function randomIndex(length) {
    if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
      const value = new Uint32Array(1);
      const limit = Math.floor(4294967296 / length) * length;
      do { window.crypto.getRandomValues(value); } while (value[0] >= limit);
      return value[0] % length;
    }
    return Math.floor(Math.random() * length);
  }
  function drawPack() {
    const racing = players.filter(player => player.role === 'racing');
    const item = players.filter(player => player.role === 'item');
    const selected = [pickWeighted(racing), pickWeighted(item)];
    const pool = players.filter(player => !selected.includes(player));
    for (let i = 0; i < 3; i++) {
      const picked = pickWeighted(pool);
      selected.push(picked);
      pool.splice(pool.indexOf(picked), 1);
    }
    for (let i = selected.length - 1; i > 0; i--) {
      const j = randomIndex(i + 1);
      [selected[i], selected[j]] = [selected[j], selected[i]];
    }
    return selected;
  }
  function pickWeighted(pool) {
    let ticket = randomIndex(pool.reduce((sum, player) => sum + rarityFor(player).weight, 0));
    for (const player of pool) {
      ticket -= rarityFor(player).weight;
      if (ticket < 0) return player;
    }
    return pool[pool.length - 1];
  }
  function openPack() {
    const previousId = state.activePack?.id;
    void transact(next => {
      const now = new Date();
      const today = localDay(now);
      if (next.lastOpenedDate === today) return '今天的卡包已領取，當地時間明天 00:00 再來領取。';
      if (!complete(next.activePack)) return '先翻開這一包的全部卡牌，再繼續開包。';
      const cards = drawPack();
      const isNew = cards.map(player => !next.collection[player.id]);
      cards.forEach(player => { next.collection[player.id] = Math.min(MAX_VALUE, (next.collection[player.id] || 0) + 1); });
      const dust = isNew.filter(value => !value).length * DUST_PER_DUPLICATE;
      const dustEarned = Math.min(MAX_VALUE, next.dust + dust) - next.dust;
      next.dust += dustEarned;
      next.packsOpened = Math.min(MAX_VALUE, next.packsOpened + 1);
      next.lastOpenedDate = today;
      next.activePack = {
        id: now.getTime().toString(36) + '-' + Math.random().toString(36).slice(2),
        ids: cards.map(player => player.id), isNew, revealed: cards.map(() => false), dustEarned
      };
      next.history.push({ ...historyEntry('pack', now), id: 'pack-' + next.activePack.id, packId: next.activePack.id, packNumber: next.packsOpened, cards: cards.map((player, index) => ({ playerId: player.id, isNew: isNew[index] })), dustChange: dustEarned, dustAfter: next.dust });
      return '卡包已開啟，5 張卡已自動入藏。點擊卡背逐張翻開，或選擇一鍵翻開。';
    }, { requirePersistence: true }).then(() => {
      if (state.activePack?.id !== previousId && cardNodes[0]) cardNodes[0].card.focus({ preventScroll: true });
    });
  }
  function reveal(index) {
    const packId = state.activePack?.id;
    void transact(next => {
      const pack = next.activePack;
      if (!pack || pack.id !== packId || pack.revealed[index]) return '';
      pack.revealed[index] = true;
      const player = byId.get(pack.ids[index]);
      const result = pack.isNew[index] ? '新收藏' : '重複卡，獲得 10 星塵';
      return `${teamName(player)} ${player.name}，${roleName(player)}，${result}。${complete(pack) ? '本包已全部翻開。' : ''}`;
    });
  }
  function revealAll() {
    const packId = state.activePack?.id;
    void transact(next => {
      const pack = next.activePack;
      if (!pack || pack.id !== packId || complete(pack)) return '';
      pack.revealed.fill(true);
      const fresh = pack.isNew.filter(Boolean).length;
      return `全部翻開：${pack.ids.map(id => byId.get(id).name).join('、')}。本包新增 ${fresh} 張收藏，獲得 ${pack.dustEarned ?? (5 - fresh) * DUST_PER_DUPLICATE} 星塵。`;
    });
  }
  function viewCard(player, trigger) {
    try {
      const viewer = window.SLeagueCardViewer;
      if (!viewer || typeof viewer.open !== 'function' || viewer.open(player.id, trigger) === false) {
        announce('卡牌檢視器正在載入，請稍後再點一次。');
      }
    } catch (_) { announce('卡牌檢視器暫時無法開啟，請稍後再試。'); }
  }
  function makeBack(className = 'pack-card-back') {
    const back = element('span', className);
    back.setAttribute('aria-hidden', 'true');
    back.append(picture(ui.league, 'pack-back-logo'), element('span', 'pack-back-name', 'S LEAGUE'), element('span', 'pack-back-caption', '2026 · 秋季應援卡'));
    return back;
  }
  function buildInterface() {
    host.replaceChildren();
    const header = element('div', 'pack-heading');
    const copy = element('div', 'pack-heading-copy');
    copy.append(element('p', 'pack-eyebrow', 'COLLECT YOUR PASSION'));
    const title = element('h2', 'pack-title', '把應援，收進卡冊。');
    title.id = 'pack-section-title';
    copy.append(title, element('p', 'pack-subtitle', '每天一包免費卡牌，每一張都是你的主場。'));
    const free = element('span', 'pack-free-label', 'FREE / 永遠免費');
    header.append(copy, free);
    ui.warning = element('p', 'pack-storage-warning');
    ui.warning.setAttribute('role', 'status');
    ui.warning.hidden = true;
    ui.live = element('p', 'pack-live');
    ui.live.setAttribute('role', 'status');
    ui.live.setAttribute('aria-live', 'polite');
    ui.live.setAttribute('aria-atomic', 'true');

    const panel = element('div', 'pack-panel');
    const top = element('div', 'pack-panel-top');
    top.append(element('span', 'pack-panel-label', '秋季賽 · 選手應援包'));
    const stats = element('div', 'pack-stats');
    ui.owned = element('strong', 'pack-stat-value');
    ui.dust = element('strong', 'pack-stat-value pack-stat-dust');
    const collectedStat = element('span', 'pack-stat');
    const dustStat = element('span', 'pack-stat');
    collectedStat.append(element('span', 'pack-stat-label', '已收藏'), ui.owned);
    dustStat.append(element('span', 'pack-stat-label', '✦ 星塵'), ui.dust);
    stats.append(collectedStat, dustStat);
    top.append(stats);

    ui.welcome = element('div', 'pack-welcome');
    const packet = element('div', 'pack-packet');
    packet.setAttribute('aria-hidden', 'true');
    const packetInner = element('div', 'pack-packet-inner');
    packetInner.append(picture(ui.league, 'pack-packet-logo'), element('span', 'pack-packet-season', '2026 AUTUMN'), element('strong', 'pack-packet-title', 'S 聯賽'), element('span', 'pack-packet-tag', '選手應援卡包'), element('span', 'pack-packet-count', '5 CARDS / PACK'));
    packet.append(packetInner);
    const welcomeCopy = element('div', 'pack-welcome-copy');
    welcomeCopy.append(element('p', 'pack-eyebrow', 'READY FOR YOUR FIRST FIVE?'), element('h3', 'pack-welcome-title', '今天，會遇見哪位選手？'), element('p', 'pack-welcome-text', '一包 5 張選手卡，同包不重複。至少遇見 1 位競速選手與 1 位道具選手，剩餘 3 張從其餘卡牌隨機抽出。'));
    ui.firstOpen = button('領取今日卡包 →', 'pack-primary pack-first-open', openPack, 'first-open');
    welcomeCopy.append(ui.firstOpen, element('p', 'pack-free-note', '每日 1 包・當地午夜更新・無付費內容'));
    ui.welcome.append(packet, welcomeCopy);

    ui.opened = element('div', 'pack-opened');
    ui.opened.hidden = true;
    const openedHeader = element('div', 'pack-opened-header');
    const revealCopy = element('div', 'pack-reveal-copy');
    ui.packTitle = element('h3', 'pack-opened-title');
    ui.packHint = element('p', 'pack-opened-hint');
    revealCopy.append(ui.packTitle, ui.packHint);
    ui.flipAll = button('一鍵翻開', 'pack-secondary', revealAll, 'flip-all');
    openedHeader.append(revealCopy, ui.flipAll);
    ui.cards = element('div', 'pack-cards');
    ui.cards.setAttribute('role', 'group');
    ui.cards.setAttribute('aria-label', '本包 5 張選手卡；可使用 Tab 與 Enter 翻開');
    const bottom = element('div', 'pack-opened-bottom');
    ui.result = element('p', 'pack-result');
    ui.nextOpen = button('領取今日卡包 →', 'pack-primary', openPack, 'next-open');
    bottom.append(ui.result, ui.nextOpen);
    ui.opened.append(openedHeader, ui.cards, bottom);
    ui.dailyStatus = element('p', 'pack-daily-status');
    panel.append(top, ui.dailyStatus, ui.welcome, ui.opened);

    const rules = element('div', 'pack-rules');
    const rule1 = element('p', 'pack-rule');
    rule1.append(element('span', 'pack-rule-mark', '✦'), element('span', 'pack-rule-copy', '重複卡 +10 星塵，50 星塵可指定兌換任一張未收藏卡。'));
    const rule2 = element('p', 'pack-rule pack-rule-storage', '開包即自動入藏。收藏僅儲存於本瀏覽器；清除網站資料會一併清除進度。');
    rules.append(rule1, rule2);
    const probabilityGuide = element('details', 'pack-rarity-guide');
    probabilityGuide.append(element('summary', 'pack-rarity-summary', '查看一號位稀有度與抽選說明'));
    const probabilityTable = element('table', 'pack-rarity-table');
    const tableHead = element('thead');
    const headings = element('tr');
    ['卡片類型', '選手', '相對權重'].forEach(text => headings.append(element('th', '', text)));
    tableHead.append(headings);
    const tableBody = element('tbody');
    [['極稀有', '廣州狼隊 Shen、RSG 風仔', '5'], ['次稀有', 'RW 沃克、KZ YanG', '10'], ['稀有', 'Ani、千尋、月上、HeiRen', '25'], ['標準', '其餘所有選手（含二號位）', '100']].forEach(cells => {
      const row = element('tr');
      cells.forEach(text => row.append(element('td', '', text)));
      tableBody.append(row);
    });
    probabilityTable.append(tableHead, tableBody);
    probabilityGuide.append(probabilityTable, element('p', 'pack-rarity-note', '權重越低越難抽到；先抽 1 位競速與 1 位道具，再從其餘選手抽 3 張。同包不重複，因此權重不等於每包的固定百分比。'));

    const album = element('div', 'album-panel');
    const albumHeader = element('div', 'album-header');
    const albumTitleGroup = element('div', 'album-title-group');
    albumTitleGroup.append(element('p', 'pack-eyebrow', 'YOUR TEAM, YOUR COLLECTION'));
    const albumTitle = element('h3', 'album-title', '我的應援圖鑑');
    albumTitle.id = 'album-heading';
    ui.albumProgress = element('p', 'album-total-progress');
    albumTitleGroup.append(albumTitle, ui.albumProgress);
    ui.albumToggle = button('展開 49 張圖鑑 ↓', 'pack-secondary album-toggle', () => {
      albumExpanded = !albumExpanded;
      render();
    }, 'album-toggle');
    ui.albumToggle.setAttribute('aria-controls', 'album-content');
    albumHeader.append(albumTitleGroup, ui.albumToggle);
    ui.teamProgress = element('div', 'album-team-progress');
    ui.teamProgress.setAttribute('role', 'group');
    ui.teamProgress.setAttribute('aria-label', '8 隊收集進度；點選隊伍查看卡冊');
    ui.albumContent = element('div', 'album-content');
    ui.albumContent.id = 'album-content';
    const filters = element('div', 'album-filters');
    const filterLabel = element('label', 'album-filter-label', '檢視隊伍');
    ui.teamSelect = element('select', 'album-team-select');
    ui.teamSelect.dataset.packFocus = 'team-select';
    ui.teamSelect.id = 'album-team-select';
    filterLabel.htmlFor = ui.teamSelect.id;
    const all = element('option', '', '全部隊伍');
    all.value = 'all';
    ui.teamSelect.append(all);
    teams.forEach(team => {
      const option = element('option', '', team.name);
      option.value = team.id;
      ui.teamSelect.append(option);
    });
    ui.teamSelect.addEventListener('change', () => { teamFilter = ui.teamSelect.value; render(); });
    const missingLabel = element('label', 'album-missing-label');
    ui.missing = element('input', 'album-missing-checkbox');
    ui.missing.type = 'checkbox';
    ui.missing.dataset.packFocus = 'missing-checkbox';
    ui.missing.addEventListener('change', () => { onlyMissing = ui.missing.checked; render(); });
    missingLabel.append(ui.missing, element('span', 'album-missing-label-text', '只看未收藏'));
    filters.append(filterLabel, ui.teamSelect, missingLabel);
    ui.filterStatus = element('p', 'album-filter-status');
    ui.grid = element('div', 'album-grid');
    ui.grid.setAttribute('aria-labelledby', 'album-heading');
    ui.empty = element('p', 'album-empty', '這個篩選下的選手卡都收齊了。換一隊繼續應援！');
    ui.albumContent.append(filters, ui.filterStatus, ui.grid, ui.empty);
    album.append(albumHeader, ui.teamProgress, ui.albumContent);
    const historyHost = element('section', 'pack-history-panel');
    historyHost.id = 'pack-history-app';
    host.append(header, ui.warning, panel, rules, probabilityGuide, ui.live, album, historyHost);
    buildRedeemDialog();
  }
  function buildRedeemDialog() {
    ui.dialog = element('dialog', 'album-redeem-dialog');
    ui.dialog.setAttribute('aria-labelledby', 'album-redeem-title');
    ui.dialog.setAttribute('aria-describedby', 'album-redeem-description');
    const content = element('div', 'album-redeem-content');
    const title = element('h3', 'album-redeem-title', '讓這張卡，加入你的應援。');
    title.id = 'album-redeem-title';
    ui.redeemImage = picture('', 'album-redeem-image');
    ui.redeemDescription = element('p', 'album-redeem-description');
    ui.redeemDescription.id = 'album-redeem-description';
    const actions = element('div', 'album-redeem-actions');
    ui.redeemCancel = button('再想一下', 'pack-secondary', () => ui.dialog.close());
    ui.redeemConfirm = button('50 星塵兌換', 'pack-primary', confirmRedeem);
    actions.append(ui.redeemCancel, ui.redeemConfirm);
    content.append(title, ui.redeemImage, ui.redeemDescription, actions);
    ui.dialog.append(content);
    ui.dialog.addEventListener('close', () => {
      const triggerKey = redeemTarget ? 'album-' + redeemTarget : '';
      redeemTarget = null;
      const target = Array.from(host.querySelectorAll('[data-pack-focus]')).find(node => node.dataset.packFocus === triggerKey);
      (target || (albumExpanded ? ui.teamSelect : ui.albumToggle)).focus({ preventScroll: true });
    });
    host.append(ui.dialog);
  }
  function requestRedeem(player) {
    if (busy) return;
    state = readStorage();
    render();
    if (storageMode !== 'local') return announce('兌換需要儲存紀錄。請允許網站儲存資料並重新載入後再試。');
    if (state.collection[player.id]) return announce('這張卡已經收藏了，可以點擊卡牌查看。');
    if (state.dust < REDEEM_COST) return announce(`兌換需要 50 星塵，目前有 ${format(state.dust)} 星塵；每天領包可繼續累積。`);
    redeemTarget = player.id;
    ui.redeemImage.src = player.card;
    ui.redeemImage.alt = teamName(player) + ' ' + player.name + ' 選手卡';
    ui.redeemDescription.textContent = `使用 50 星塵收藏「${teamName(player)} ${player.name}」。兌換後剩餘 ${format(state.dust - REDEEM_COST)} 星塵。`;
    ui.dialog.showModal();
    ui.redeemCancel.focus();
  }
  function confirmRedeem() {
    const playerId = redeemTarget;
    if (!playerId || busy) return;
    ui.dialog.close();
    void transact(next => {
      if (next.collection[playerId]) return '這張卡已經收藏，未扣除星塵。';
      if (next.dust < REDEEM_COST) return '目前星塵不足 50，未進行兌換。';
      next.collection[playerId] = 1;
      next.dust -= REDEEM_COST;
      const now = new Date();
      next.history.push({ ...historyEntry('redeem', now), id: 'redeem-' + now.getTime().toString(36) + '-' + Math.random().toString(36).slice(2), playerId, dustChange: -REDEEM_COST, dustAfter: next.dust });
      return `兌換成功！${teamName(byId.get(playerId))} ${byId.get(playerId).name} 已加入收藏，剩餘 ${format(next.dust)} 星塵。`;
    }, { requirePersistence: true });
  }
  function buildPackCards(pack) {
    displayedPackId = pack.id;
    cardNodes = [];
    const fragment = document.createDocumentFragment();
    pack.ids.forEach((id, index) => {
      const player = byId.get(id);
      const slot = element('div', 'pack-card-slot');
      const card = button('', 'pack-card-button', () => {
        const current = state.activePack;
        if (!current || current.id !== pack.id || busy) return;
        if (current.revealed[index]) viewCard(player, card);
        else reveal(index);
      }, 'reveal-' + index);
      const rotor = element('span', 'pack-card-rotor');
      const back = makeBack();
      const front = element('span', 'pack-card-front');
      const image = picture(player.card, 'pack-card-image');
      image.loading = 'eager';
      front.append(image);
      rotor.append(back, front);
      card.append(rotor);
      const label = element('div', 'pack-card-label');
      const name = element('strong', 'pack-card-name');
      const detail = element('span', 'pack-card-detail');
      const badge = element('span', 'pack-card-badge');
      label.append(name, detail, badge);
      slot.append(card, label);
      cardNodes.push({ slot, card, front, image, name, detail, badge });
      fragment.append(slot);
    });
    ui.cards.replaceChildren(fragment);
  }
  function updatePack() {
    const pack = state.activePack;
    ui.welcome.hidden = Boolean(pack);
    ui.opened.hidden = !pack;
    if (!pack) { displayedPackId = null; return; }
    if (displayedPackId !== pack.id) buildPackCards(pack);
    const revealedCount = pack.revealed.filter(Boolean).length;
    ui.packTitle.textContent = `第 ${format(state.packsOpened)} 包 · ${revealedCount} / 5 已翻開`;
    ui.packHint.textContent = complete(pack) ? '本包已入藏，點選手卡查看完整卡面。' : '點擊卡背揭曉；手機可左右滑動查看 5 張卡。';
    cardNodes.forEach((node, index) => {
      const player = byId.get(pack.ids[index]);
      const revealed = pack.revealed[index];
      node.slot.classList.toggle('pack-is-revealed', revealed);
      node.front.setAttribute('aria-hidden', String(!revealed));
      node.image.alt = revealed ? teamName(player) + ' ' + player.name + ' 選手卡' : '';
      node.card.setAttribute('aria-label', revealed ? `${teamName(player)} ${player.name}，${roleName(player)}，${pack.isNew[index] ? '新收藏' : '重複卡加10星塵'}；點擊查看卡牌` : `第 ${index + 1} 張卡，點擊翻開`);
      node.name.textContent = revealed ? player.name : `CARD 0${index + 1}`;
      node.detail.textContent = revealed ? teamName(player) + ' · ' + roleName(player) : '點擊卡背，揭曉應援';
      const rarity = rarityFor(player);
      node.badge.textContent = revealed ? `${rarity.label} · ${pack.isNew[index] ? '新收藏' : '重複卡 +10 星塵'}` : '尚未翻開';
      node.badge.classList.toggle('pack-badge-new', revealed && pack.isNew[index]);
      ['ultra', 'super', 'rare', 'standard'].forEach(key => node.badge.classList.toggle('pack-rarity-' + key, revealed && rarity.key === key));
    });
    if (complete(pack)) {
      const fresh = pack.isNew.filter(Boolean).length;
      ui.result.textContent = `本包新增 ${fresh} 張收藏 · +${pack.dustEarned ?? (5 - fresh) * DUST_PER_DUPLICATE} 星塵${ownedCount() === players.length ? ' · 全圖鑑收齊！' : ''}`;
    } else ui.result.textContent = '5 張卡已自動入藏；重新整理可接著翻，不會重複計入。';
  }
  function updateControls() {
    if (!ui.firstOpen) return;
    const claimed = state.lastOpenedDate === localDay();
    const unavailable = busy || claimed || storageMode !== 'local';
    ui.firstOpen.disabled = unavailable;
    ui.firstOpen.textContent = claimed ? '今日已領取，明天再來' : '領取今日卡包 →';
    ui.nextOpen.disabled = unavailable || !complete();
    ui.nextOpen.textContent = claimed ? '今日已領取，明天再來' : complete() ? '領取今日卡包 →' : '先翻完這一包';
    const nextDay = nextLocalMidnight();
    ui.dailyStatus.textContent = storageMode !== 'local' ? '每日卡包需要儲存領取紀錄，請允許網站儲存資料後重新載入。' : claimed ? `今日已領取 1 / 1 包 · 下次領取：${nextDay.getMonth() + 1}月${nextDay.getDate()}日 00:00（裝置當地時間）` : '今日可領取 1 包 · 每日裝置當地時間 00:00 更新，不累積。';
    ui.flipAll.disabled = busy || complete();
    ui.flipAll.textContent = complete() ? '已全部翻開 ✓' : '一鍵翻開';
    cardNodes.forEach(node => { node.card.disabled = busy; });
    ui.redeemConfirm.disabled = busy || storageMode !== 'local';
    host.querySelectorAll('.album-redeem-button').forEach(node => {
      node.disabled = busy || storageMode !== 'local' || state.dust < REDEEM_COST;
    });
  }
  function updateAlbum() {
    const total = ownedCount();
    ui.albumProgress.textContent = `${total} / ${players.length} 張已收藏${total === players.length ? ' · 8 隊應援，全部集結！' : ' · 8 支戰隊，等你集結'}。`;
    ui.albumToggle.textContent = albumExpanded ? '收起圖鑑 ↑' : `展開 ${players.length} 張圖鑑 ↓`;
    ui.albumToggle.setAttribute('aria-expanded', String(albumExpanded));
    ui.albumContent.hidden = !albumExpanded;
    const teamNodes = document.createDocumentFragment();
    teams.forEach(team => {
      const count = team.players.filter(player => state.collection[player.id] > 0).length;
      const teamButton = button('', 'album-team-button', () => {
        teamFilter = teamFilter === team.id && albumExpanded ? 'all' : team.id;
        albumExpanded = true;
        render();
      }, 'team-' + team.id);
      teamButton.setAttribute('aria-pressed', String(teamFilter === team.id));
      teamButton.setAttribute('aria-label', `${team.name}，已收藏 ${count} / ${team.players.length} 張；點擊篩選圖鑑`);
      teamButton.append(picture(team.logo, 'album-team-logo'), element('span', 'album-team-name', team.name), element('span', 'album-team-count', `${count} / ${team.players.length}`));
      const progress = element('progress', 'album-team-meter');
      progress.max = team.players.length;
      progress.value = count;
      progress.setAttribute('aria-hidden', 'true');
      teamButton.append(progress);
      teamNodes.append(teamButton);
    });
    ui.teamProgress.replaceChildren(teamNodes);
    ui.teamSelect.value = teamFilter;
    ui.missing.checked = onlyMissing;
    if (!albumExpanded) return;
    const filtered = players.filter(player => (teamFilter === 'all' || player.team === teamFilter) && (!onlyMissing || !state.collection[player.id]));
    const teamLabel = teams.find(team => team.id === teamFilter)?.name || '全部隊伍';
    ui.filterStatus.textContent = `${teamLabel} · 顯示 ${filtered.length} 張${onlyMissing ? '未收藏卡' : '選手卡'}。已收藏卡可點擊查看；未收藏卡可用 50 星塵兌換。`;
    ui.empty.hidden = filtered.length > 0;
    const fragment = document.createDocumentFragment();
    filtered.forEach(player => {
      const count = state.collection[player.id] || 0;
      const card = element('article', 'album-card' + (count ? ' album-card-owned' : ' album-card-missing'));
      const imageButton = button('', 'album-card-preview', event => {
        if (count) viewCard(player, event.currentTarget);
        else requestRedeem(player);
      }, 'album-' + player.id);
      imageButton.setAttribute('aria-label', `${teamName(player)} ${player.name}，${roleName(player)}，${count ? '已收藏，點擊查看卡牌' : '尚未收藏，點擊查看兌換'}`);
      if (count) {
        const image = picture(player.card, 'album-card-image');
        image.loading = 'lazy';
        imageButton.append(image, element('span', 'album-owned-count', '×' + format(count)));
      } else {
        const unknown = makeBack('album-card-back');
        unknown.append(element('span', 'album-unknown-mark', '?'));
        imageButton.append(unknown);
      }
      const description = element('div', 'album-card-info');
      description.append(element('strong', 'album-player-name', player.name), element('span', 'album-player-team', teamName(player) + ' · ' + roleName(player)));
      const rarity = rarityFor(player);
      description.append(element('span', 'album-rarity-badge pack-rarity-' + rarity.key, rarity.label));
      if (count) description.append(element('span', 'album-collected-label', '已收藏 ✓'));
      else {
        const redeem = button('✦ 50 兌換', 'album-redeem-button', () => requestRedeem(player), 'redeem-' + player.id);
        redeem.setAttribute('aria-label', `使用 50 星塵兌換 ${teamName(player)} ${player.name}`);
        redeem.disabled = busy || storageMode !== 'local' || state.dust < REDEEM_COST;
        description.append(redeem);
      }
      card.append(imageButton, description);
      fragment.append(card);
    });
    ui.grid.replaceChildren(fragment);
  }
  function render() {
    const focusKey = host.contains(document.activeElement) ? document.activeElement.dataset.packFocus : null;
    ui.owned.textContent = `${ownedCount()} / ${players.length}`;
    ui.dust.textContent = format(state.dust);
    ui.warning.hidden = !storageMessage;
    ui.warning.textContent = storageMessage;
    ui.warning.classList.toggle('pack-warning-memory', storageMode === 'memory');
    updatePack();
    updateAlbum();
    updateControls();
    if (focusKey) {
      const target = Array.from(host.querySelectorAll('[data-pack-focus]')).find(node => node.dataset.packFocus === focusKey);
      if (target && target !== document.activeElement && !target.disabled) target.focus({ preventScroll: true });
    }
    if (typeof window.CustomEvent === 'function') window.dispatchEvent(new window.CustomEvent('sleague:collection-updated', { detail: { history: state.history, players: players.map(player => ({ id: player.id, name: player.name, teamName: teamName(player), role: player.role })), storageMode } }));
  }
  async function initialize() {
    host.append(element('p', 'pack-loading', '應援卡包載入中…'));
    try {
      const response = await fetch('assets/asset-manifest.json', { cache: 'no-cache' });
      if (!response.ok) throw new Error('manifest');
      const manifest = await response.json();
      if (!Array.isArray(manifest.teams) || !validAsset(manifest.league)) throw new Error('manifest');
      const seenTeams = new Set(), seenPlayers = new Set();
      teams = manifest.teams.map(team => {
        if (!team || typeof team.id !== 'string' || !/^[a-z0-9-]+$/.test(team.id) || seenTeams.has(team.id) || typeof team.name !== 'string' || !validAsset(team.logo) || !Array.isArray(team.players)) throw new Error('team');
        seenTeams.add(team.id);
        return { id: team.id, name: team.name, logo: team.logo, overviewTop: team.overviewTop, players: team.players.map(player => {
          if (!player || typeof player.id !== 'string' || !/^[a-z0-9-]+$/.test(player.id) || seenPlayers.has(player.id) || typeof player.name !== 'string' || !validAsset(player.card) || !['racing', 'item'].includes(player.role)) throw new Error('player');
          seenPlayers.add(player.id);
          return { id: player.id, name: player.name, team: team.id, card: player.card, role: player.role };
        }) };
      });
      players = teams.flatMap(team => team.players);
      if (players.length < 5 || !players.some(player => player.role === 'racing') || !players.some(player => player.role === 'item')) throw new Error('pool');
      byId = new Map(players.map(player => [player.id, player]));
      const loadCollection = () => { state = readStorage(); saveStorage(state); };
      if (navigator.locks && typeof navigator.locks.request === 'function') {
        await navigator.locks.request(LOCK_NAME, loadCollection);
      } else loadCollection();
      ui.league = manifest.league;
      buildInterface();
      render();
      refreshDailyClock();
      const refreshOnReturn = () => {
        if (document.visibilityState === 'hidden') return;
        state = readStorage();
        render();
        refreshDailyClock();
      };
      window.addEventListener('focus', refreshOnReturn);
      window.addEventListener('pageshow', refreshOnReturn);
      document.addEventListener('visibilitychange', refreshOnReturn);
      window.addEventListener('storage', event => {
        if (storageMode !== 'local' || (event.key !== STORAGE_KEY && event.key !== null)) return;
        state = readStorage();
        render();
        announce('收藏已與這個瀏覽器的其他分頁同步。');
      });
    } catch (_) {
      host.replaceChildren(element('p', 'pack-loading', '卡包暫時無法載入。請檢查連線後重新載入此頁。'));
      host.append(button('重新載入卡包', 'pack-secondary', () => {
        host.replaceChildren();
        void initialize();
      }));
    }
  }
  window.SLeagueCollectionSnapshot = () => state ? { history: state.history, players: players.map(player => ({ id: player.id, name: player.name, teamName: teamName(player), role: player.role })), storageMode } : null;
  void initialize();
})();

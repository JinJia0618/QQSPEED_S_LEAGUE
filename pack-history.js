(() => {
  'use strict';

  if (window.__sleaguePackHistoryInstalled) return;
  window.__sleaguePackHistoryInstalled = true;

  const PAGE_SIZE = 10;
  const FILTERS = [['all', '全部'], ['pack', '開包'], ['redeem', '兌換']];
  let history = [], players = [], byId = new Map(), storageMode = 'local';
  let filter = 'all', visibleCount = PAGE_SIZE, expanded = false;
  let host = null, ui = null;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function button(text, className, action) {
    const node = element('button', className, text);
    node.type = 'button';
    if (action) node.dataset.packHistoryAction = action;
    return node;
  }

  function mount(nextHost) {
    if (host === nextHost && ui && host.contains(ui.details)) return;
    if (host) host.removeEventListener('click', handleClick);
    host = nextHost;

    const details = element('details', 'pack-history-details');
    details.open = expanded;
    const summary = element('summary', 'pack-history-summary');
    const heading = element('span', 'pack-history-heading', '歷史紀錄');
    const total = element('span', 'pack-history-total');
    const indicator = element('span', 'pack-history-indicator');
    indicator.setAttribute('aria-hidden', 'true');
    summary.append(heading, total, indicator);

    const content = element('div', 'pack-history-content');
    const toolbar = element('div', 'pack-history-toolbar');
    const filters = element('div', 'pack-history-filters');
    filters.setAttribute('role', 'group');
    filters.setAttribute('aria-label', '篩選歷史紀錄');
    const filterButtons = FILTERS.map(([value, label]) => {
      const node = button(label, 'pack-history-filter');
      node.dataset.packHistoryFilter = value;
      node.setAttribute('aria-controls', 'pack-history-list');
      filters.append(node);
      return node;
    });
    const exportButton = button('匯出全部 JSON 備份', 'pack-history-export', 'export');
    toolbar.append(filters, exportButton);

    const note = element('p', 'pack-history-note', '紀錄保存在這個瀏覽器，換裝置不會同步；可匯出備份。');
    const storageWarning = element('p', 'pack-history-storage-warning', '目前無法在這個瀏覽器保存紀錄，關閉頁面後可能遺失，請先匯出備份。');
    const status = element('p', 'pack-history-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.setAttribute('aria-atomic', 'true');
    const list = element('ol', 'pack-history-list');
    list.id = 'pack-history-list';
    list.setAttribute('aria-label', '歷史紀錄，最新在前');
    const empty = element('p', 'pack-history-empty');
    const more = button('載入更多', 'pack-history-more', 'more');
    const feedback = element('p', 'pack-history-feedback');
    feedback.setAttribute('role', 'status');
    feedback.setAttribute('aria-live', 'polite');
    feedback.setAttribute('aria-atomic', 'true');
    content.append(toolbar, note, storageWarning, status, list, empty, more, feedback);
    details.append(summary, content);
    host.replaceChildren(details);
    details.addEventListener('toggle', () => { expanded = details.open; });
    host.addEventListener('click', handleClick);
    ui = { details, total, filterButtons, storageWarning, status, list, empty, more, feedback };
  }

  function cardItem(card, index, recordId) {
    const player = byId.get(card.playerId);
    const item = element('li', 'pack-history-card');
    const name = button(player ? player.name : '未識別卡片', 'pack-history-card-name');
    name.dataset.packHistoryPlayer = card.playerId;
    name.dataset.packHistoryFocus = `${recordId}:${index}`;
    name.disabled = !player;
    name.setAttribute('aria-label', `${player ? player.name : '未識別卡片'}，${card.isNew ? '新卡' : '重複卡'}，查看卡片`);
    const badge = element('span', `pack-history-badge${card.isNew ? ' pack-history-badge-new' : ''}`, card.isNew ? '新卡' : '重複');
    item.append(name, badge);
    if (player) {
      const role = player.role === 'racing' ? '競速' : '道具';
      item.append(element('span', 'pack-history-card-meta', `${player.teamName} · ${role}`));
    }
    return item;
  }

  function recordItem(record) {
    const item = element('li', 'pack-history-record');
    const top = element('div', 'pack-history-record-top');
    const title = element('h4', 'pack-history-record-title', record.kind === 'pack' ? `開啟第 ${record.packNumber} 包` : '星塵兌換');
    const time = element('time', 'pack-history-time', record.localTime || '時間未記錄');
    if (record.timestamp) time.dateTime = record.timestamp;
    top.append(title, time);
    item.append(top);
    if (record.legacy) {
      item.append(element('p', 'pack-history-legacy', '更新前的最後一包，時間依原紀錄還原'));
    }
    const cards = element('ul', `pack-history-cards${record.kind === 'redeem' ? ' pack-history-cards-redeem' : ''}`);
    const recordCards = record.kind === 'pack' ? record.cards : [{ playerId: record.playerId, isNew: true }];
    recordCards.forEach((card, index) => cards.append(cardItem(card, index, record.id)));
    cards.setAttribute('aria-label', record.kind === 'pack' ? `本包 ${recordCards.length} 張卡片` : '兌換卡片');
    const dust = element('p', 'pack-history-dust');
    const change = record.dustChange;
    dust.append(element('span', 'pack-history-dust-change', `星塵 ${change >= 0 ? '+' : '−'}${Math.abs(change)}`));
    dust.append(element('span', 'pack-history-dust-balance', record.dustAfter === null || record.dustAfter === undefined ? '紀錄當時餘額：未保存' : `紀錄當時餘額 ${record.dustAfter}`));
    item.append(cards, dust);
    return item;
  }

  function render() {
    const nextHost = document.getElementById('pack-history-app');
    if (!nextHost) return;
    mount(nextHost);
    const focused = document.activeElement;
    const focusKey = focused && ui.list.contains(focused) ? focused.dataset.packHistoryFocus : null;
    const matching = history.slice().reverse().filter(record => filter === 'all' || record.kind === filter);
    const shown = matching.slice(0, visibleCount);
    ui.total.textContent = `共 ${history.length} 筆`;
    ui.filterButtons.forEach(node => node.setAttribute('aria-pressed', String(node.dataset.packHistoryFilter === filter)));
    ui.storageWarning.hidden = storageMode === 'local';
    ui.status.textContent = matching.length ? `最新在前 · 顯示 ${shown.length} / ${matching.length} 筆` : '';
    ui.list.replaceChildren(...shown.map(recordItem));
    ui.empty.hidden = matching.length > 0;
    ui.empty.textContent = history.length === 0 ? '還沒有歷史紀錄。開啟卡包或兌換卡片後，就會在這裡留下紀錄。' : `還沒有${filter === 'pack' ? '開包' : '兌換'}紀錄。`;
    ui.more.hidden = shown.length >= matching.length;
    ui.more.textContent = `載入更多（還有 ${Math.max(0, matching.length - shown.length)} 筆）`;
    if (focusKey) {
      const replacement = Array.from(ui.list.querySelectorAll('[data-pack-history-focus]')).find(node => node.dataset.packHistoryFocus === focusKey);
      if (replacement) replacement.focus({ preventScroll: true });
    }
  }

  function exportHistory() {
    const now = new Date();
    const backup = {
      format: 'sleague.pack-history.backup',
      version: 1,
      exportedAt: now.toISOString(),
      storageMode,
      history,
      players: players.map(({ id, name, teamName, role }) => ({ id, name, teamName, role }))
    };
    let url = null;
    let link = null;
    try {
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' });
      url = URL.createObjectURL(blob);
      link = element('a', 'pack-history-download');
      const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
      link.href = url;
      link.download = `SLeague-pack-history-${stamp}.json`;
      link.hidden = true;
      host.append(link);
      link.click();
      ui.feedback.textContent = `已準備 ${history.length} 筆完整歷史備份，請查看瀏覽器下載。`;
    } catch (_) {
      ui.feedback.textContent = '目前無法匯出備份，請稍後再試。';
    } finally {
      if (link) link.remove();
      if (url) setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }

  function handleClick(event) {
    if (!(event.target instanceof Element)) return;
    const target = event.target.closest('button');
    if (!target || !host.contains(target)) return;
    const nextFilter = target.dataset.packHistoryFilter;
    if (nextFilter && FILTERS.some(([value]) => value === nextFilter)) {
      filter = nextFilter;
      visibleCount = PAGE_SIZE;
      ui.feedback.textContent = '';
      render();
    } else if (target.dataset.packHistoryAction === 'more') {
      const previousCount = visibleCount;
      visibleCount += PAGE_SIZE;
      render();
      const firstNew = ui.list.children[previousCount]?.querySelector('button');
      if (firstNew) firstNew.focus();
    } else if (target.dataset.packHistoryAction === 'export') {
      exportHistory();
    } else if (target.dataset.packHistoryPlayer) {
      const viewer = window.SLeagueCardViewer;
      try {
        if (!viewer || typeof viewer.open !== 'function' || viewer.open(target.dataset.packHistoryPlayer, target) === false) {
          ui.feedback.textContent = '卡片資料載入中，請稍後再點一次。';
        } else ui.feedback.textContent = '';
      } catch (_) {
        ui.feedback.textContent = '卡片資料載入中，請稍後再點一次。';
      }
    }
  }

  function acceptSnapshot(detail) {
    if (!detail || !Array.isArray(detail.history) || !Array.isArray(detail.players)) return;
    history = detail.history;
    players = detail.players;
    byId = new Map(players.map(player => [player.id, player]));
    storageMode = detail.storageMode || 'local';
    render();
  }
  window.addEventListener('sleague:collection-updated', event => acceptSnapshot(event.detail));
  if (typeof window.SLeagueCollectionSnapshot === 'function') acceptSnapshot(window.SLeagueCollectionSnapshot());
})();

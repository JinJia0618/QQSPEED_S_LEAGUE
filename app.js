'use strict';
(() => {
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const stage = $('#player-stage');
  const roster = $('#player-roster');
  const viewer = $('#card-viewer');
  let data, team, selected;
  let viewerTrigger, viewerScrollY = 0, previousBodyTop = '', backdropPressed = false;
  const escape = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

  function announce(message) { $('#announcement').textContent = message; }

  function renderTeams() {
    $('#team-selector').innerHTML = data.teams.map(item => `<button type="button" class="team-choice" data-team="${item.id}" aria-pressed="${item.id === team.id}" aria-label="瀏覽${escape(item.name)}，${item.players.length}位競速選手"><img src="${item.logo}" alt="" width="48" height="48"><span class="team-choice-name">${escape(item.name)}</span><span class="team-choice-count">${item.players.length} 位競速手</span></button>`).join('');
  }

  function renderDeck() {
    stage.dataset.count = team.players.length;
    stage.classList.remove('has-active');
    const middle = (team.players.length - 1) / 2;
    stage.innerHTML = team.players.map((player, index) => {
      const d = index - middle;
      return `<button type="button" class="card-slot entering" data-player="${player.id}" aria-label="放大檢視${escape(team.name)} ${escape(player.name)} 選手卡" aria-haspopup="dialog" aria-controls="card-viewer" aria-pressed="${selected.id === player.id}" style="--d:${d};--angle:${d * 9};--y:${d * d * 13};--index:${index};--z:${10 - Math.ceil(Math.abs(d))}"><span class="card-visual"><img src="${player.card}" alt="${escape(team.name)} ${escape(player.name)} 秋季賽選手卡" width="600" height="900" draggable="false"></span></button>`;
    }).join('');
    setTimeout(() => $$('.card-slot.entering').forEach(el => el.classList.remove('entering')), 650);
  }

  function renderRoster() {
    $('#roster-team-name').textContent = `${team.name} `;
    roster.setAttribute('aria-label', `${team.name}競速選手名單`);
    roster.innerHTML = team.players.map((player, index) => `<button type="button" class="roster-player" data-player="${player.id}" aria-pressed="${selected.id === player.id}" aria-label="瀏覽${escape(player.name)}選手卡"><span class="roster-player-number" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span><span class="roster-player-name">${escape(player.name)}</span><span class="roster-player-arrow" aria-hidden="true">↗</span></button>`).join('');
  }

  function updateCaption() {
    $('#chosen-name').textContent = selected.name;
    $('#chosen-team').textContent = team.name;
    $$('#player-roster [data-player]').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.player === selected.id)));
  }

  function activate(playerId, {lift = true} = {}) {
    const player = team.players.find(item => item.id === playerId);
    if (!player) return;
    selected = player;
    stage.classList.toggle('has-active', lift);
    $$('.card-slot').forEach(el => {
      el.classList.toggle('is-active', lift && el.dataset.player === playerId);
      el.setAttribute('aria-pressed', String(el.dataset.player === playerId));
    });
    updateCaption();
  }

  function restDeck() {
    stage.classList.remove('has-active');
    $$('.card-slot').forEach(el => el.classList.remove('is-active'));
  }

  function setTeam(id, announceChange = true) {
    const next = data.teams.find(item => item.id === id);
    if (!next) return;
    team = next;
    selected = team.players[Math.floor((team.players.length - 1) / 2)];
    $('#current-team-logo').src = team.logo;
    $('#current-team-logo').alt = `${team.name} 隊伍 Logo`;
    $('#current-team-name').textContent = team.name;
    $('#roster-count').textContent = `${team.players.length} 位競速手`;
    $$('.team-choice').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.team === team.id)));
    renderDeck();
    renderRoster();
    updateCaption();
    if (announceChange) announce(`已切換至${team.name}，${team.players.length}位競速選手：${team.players.map(player => player.name).join('、')}。`);
  }

  function nearestCard(clientX) {
    const centers = $$('.card-slot').map(el => { const box = el.getBoundingClientRect(); return {el, x: box.left + box.width / 2}; });
    return centers.reduce((best, item) => !best || Math.abs(item.x - clientX) < Math.abs(best.x - clientX) ? item : best, null)?.el;
  }

  function openCardViewer(card) {
    if (viewer.open) return;
    const player = team.players.find(item => item.id === card.dataset.player);
    if (!player) return;
    activate(player.id);
    viewerTrigger = card;
    $('#card-viewer-title').textContent = `${team.name} · ${player.name}`;
    $('#card-viewer-image').src = player.card;
    $('#card-viewer-image').alt = `${team.name} ${player.name} 秋季賽選手卡`;
    viewerScrollY = window.scrollY;
    previousBodyTop = document.body.style.top;
    document.body.style.top = `-${viewerScrollY}px`;
    document.body.classList.add('card-viewer-open');
    viewer.showModal();
  }

  function outsideViewer(event) {
    const box = viewer.getBoundingClientRect();
    return event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
  }

  $('#close-card-viewer').addEventListener('click', () => viewer.close());
  viewer.addEventListener('pointerdown', event => {
    backdropPressed = event.target === viewer && outsideViewer(event);
  });
  viewer.addEventListener('pointercancel', () => { backdropPressed = false; });
  viewer.addEventListener('click', event => {
    if (backdropPressed && event.target === viewer && outsideViewer(event)) viewer.close();
    backdropPressed = false;
  });
  viewer.addEventListener('close', () => {
    document.body.classList.remove('card-viewer-open');
    document.body.style.top = previousBodyTop;
    window.scrollTo({top: viewerScrollY, behavior: 'instant'});
    backdropPressed = false;
    if (viewerTrigger?.isConnected) viewerTrigger.focus({preventScroll: true});
    viewerTrigger = null;
  });

  stage.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse' || !data) return;
    const rect = stage.getBoundingClientRect();
    const y = event.clientY - rect.top;
    if (y < 24 || y > rect.height - 10) { restDeck(); return; }
    const nearest = nearestCard(event.clientX);
    if (nearest) activate(nearest.dataset.player);
  });
  stage.addEventListener('pointerleave', () => { if (!stage.contains(document.activeElement)) restDeck(); });
  stage.addEventListener('focusin', event => {
    const card = event.target.closest('.card-slot');
    if (card) activate(card.dataset.player);
  });
  stage.addEventListener('focusout', event => { if (!stage.contains(event.relatedTarget)) restDeck(); });
  stage.addEventListener('click', event => {
    const card = event.target.closest('.card-slot');
    if (card && stage.contains(card) && data) {
      card.focus({preventScroll: true});
      openCardViewer(card);
    }
  });
  stage.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const cards = $$('.card-slot'), index = cards.indexOf(document.activeElement);
    if (index < 0) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? cards.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + cards.length) % cards.length;
    cards[next].focus();
  });
  $('#team-selector').addEventListener('click', event => {
    const button = event.target.closest('[data-team]');
    if (button && data) setTeam(button.dataset.team);
  });
  roster.addEventListener('click', event => {
    const button = event.target.closest('[data-player]');
    if (button && data) {
      activate(button.dataset.player);
      announce(`正在瀏覽${team.name} ${selected.name}選手卡。`);
    }
  });
  roster.addEventListener('focusin', event => {
    const button = event.target.closest('[data-player]');
    if (button && data) activate(button.dataset.player);
  });
  roster.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const buttons = $$('#player-roster [data-player]'), index = buttons.indexOf(document.activeElement);
    if (index < 0) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next].focus();
  });

  fetch('assets/asset-manifest.json').then(response => {
    if (!response.ok) throw Error('Asset manifest unavailable');
    return response.json();
  }).then(manifest => {
    data = manifest;
    team = data.teams[0];
    renderTeams();
    setTeam(team.id, false);
    // Prepare the other teams after the first deck has loaded.
    if ('requestIdleCallback' in window) requestIdleCallback(() => data.players.forEach(player => { const img = new Image(); img.src = player.card; }));
  }).catch(error => {
    console.error(error);
    $('#team-selector').innerHTML = '<p class="loading">卡牌載入失敗，請重新整理頁面。</p>';
    announce('卡牌載入失敗，請重新整理頁面。');
  });
})();

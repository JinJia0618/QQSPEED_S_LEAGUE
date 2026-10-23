'use strict';
(() => {
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const stage = $('#player-stage');
  const roster = $('#player-roster');
  const viewer = $('#card-viewer');
  const viewerInteraction = $('#card-viewer-interaction');
  const viewerTilt = $('#card-viewer-tilt');
  const viewerReducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const viewerFineHover = matchMedia('(hover: hover) and (pointer: fine)');
  let data, team, selected, collectionRole = 'racing';
  let teamPlayers = [], cardView = 'depth';
  const roleName = role => role === 'item' ? '道具' : '競速';
  let viewerTrigger, viewerScrollY = 0, previousBodyTop = '', backdropPressed = false;
  let viewerTiltFrame = 0, viewerPointer = null;
  const escape = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

  function announce(message) { $('#announcement').textContent = message; }

  function renderTeams() {
    $('#team-selector').innerHTML = data.teams.map(item => `<button type="button" class="team-choice" data-team="${item.id}" aria-pressed="${item.id === team.id}" aria-label="瀏覽${escape(item.name)}，${item.players.length}位選手"><img src="${item.logo}" alt="" width="48" height="48"><span class="team-choice-name">${escape(item.name)}</span><span class="team-choice-count">${item.players.length} 位選手</span></button>`).join('');
  }

  function renderDeck() {
    stage.dataset.count = teamPlayers.length;
    stage.classList.toggle('is-overview', collectionRole === 'all');
    stage.classList.remove('has-active');
    const middle = (teamPlayers.length - 1) / 2;
    stage.innerHTML = teamPlayers.map((player, index) => {
      const d = index - middle;
      return `<button type="button" class="card-slot entering" data-player="${player.id}" aria-label="放大檢視${escape(team.name)} ${escape(player.name)} ${roleName(player.role)}選手卡" aria-haspopup="dialog" aria-controls="card-viewer" aria-pressed="${selected?.id === player.id}" style="--d:${d};--angle:${d * 9};--y:${d * d * (collectionRole === 'all' ? 5 : 13)};--index:${index};--z:${10 - Math.ceil(Math.abs(d))}"><span class="card-visual"><img src="${player.card}" alt="${escape(team.name)} ${escape(player.name)} 秋季賽選手卡" width="600" height="900" draggable="false"><span class="card-role-label">${roleName(player.role)}</span></span></button>`;
    }).join('') || '<p class="empty-roster">此隊伍目前沒有這個分類的選手資料。</p>';
    setTimeout(() => $$('.card-slot.entering').forEach(el => el.classList.remove('entering')), 650);
  }

  function renderRoster() {
    $('#roster-team-name').textContent = `${team.name} `;
    $('#roster-role-name').textContent = collectionRole === 'all' ? '完整名單' : `${roleName(collectionRole)}名單`;
    roster.setAttribute('aria-label', `${team.name}選手名單`);
    roster.innerHTML = teamPlayers.map((player, index) => `<button type="button" class="roster-player" data-player="${player.id}" aria-pressed="${selected?.id === player.id}" aria-label="瀏覽${escape(player.name)}選手卡"><span class="roster-player-number" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span><span class="roster-player-name">${escape(player.name)}<small>${roleName(player.role)}</small></span><span class="roster-player-arrow" aria-hidden="true">↗</span></button>`).join('');
  }

  function updateCaption() {
    $('#chosen-name').textContent = selected?.name || '—';
    $('#chosen-team').textContent = selected ? `${team.name} · ${roleName(selected.role)}` : team.name;
    $$('#player-roster [data-player]').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.player === selected?.id)));
  }

  function activate(playerId, {lift = true} = {}) {
    const player = teamPlayers.find(item => item.id === playerId);
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
    teamPlayers = team.players.filter(p => collectionRole === 'all' || (p.role || 'racing') === collectionRole);
    selected = teamPlayers[Math.floor((teamPlayers.length - 1) / 2)];
    $('#current-team-logo').src = team.logo;
    $('#current-team-logo').alt = `${team.name} 隊伍 Logo`;
    $('#current-team-name').textContent = team.name;
    $('#roster-count').textContent = `${teamPlayers.length} 位${collectionRole === 'all' ? '選手' : roleName(collectionRole)+'手'}`;
    $('#racing-player-count').textContent = team.players.filter(p=>(p.role||'racing')==='racing').length;
    $('#item-player-count').textContent = team.players.filter(p=>p.role==='item').length;
    $('#all-player-count').textContent = team.players.length;
    $$('.team-choice').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.team === team.id)));
    renderDeck();
    renderRoster();
    updateCaption();
    if (announceChange) announce(`已切換至${team.name}${collectionRole === 'all' ? '總覽' : roleName(collectionRole)}，${teamPlayers.length}位選手：${teamPlayers.map(player => player.name).join('、')}。`);
  }

  function nearestCard(clientX) {
    const centers = $$('.card-slot').map(el => { const box = el.getBoundingClientRect(); return {el, x: box.left + box.width / 2}; });
    return centers.reduce((best, item) => !best || Math.abs(item.x - clientX) < Math.abs(best.x - clientX) ? item : best, null)?.el;
  }

  function renderPlayerProfile(player) {
    const profile = player.profile || {};
    $('#card-profile-title').textContent = player.name;
    $('#card-profile-team').textContent = team.name;
    $('#card-profile-role').textContent = `${roleName(player.role)}手`;
    $('#card-profile-real-name').textContent = typeof profile.realName === 'string' && profile.realName.trim() ? profile.realName : '待補充';
    const birthday = typeof profile.birthday === 'string' && profile.birthday.match(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);
    $('#card-profile-birthday').textContent = birthday ? `${Number(birthday[1])}月${Number(birthday[2])}日` : '待補充';
    $('#card-profile-intro').textContent = typeof profile.intro === 'string' && profile.intro.trim() ? profile.intro : `${team.name}${roleName(player.role)}選手，出戰2026 S聯賽秋季賽。`;
    $('#card-profile-photo-note').textContent = player.photoNote || '';
    $('#card-profile-photo-note').hidden = !player.photoNote;
    const sourceList = $('#card-profile-sources');
    sourceList.replaceChildren();
    if (Array.isArray(profile.sources)) profile.sources.forEach(source => {
      if (!source || typeof source.url !== 'string') return;
      let url;
      try { url = new URL(source.url); } catch { return; }
      if (!['https:', 'http:'].includes(url.protocol)) return;
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = url.href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = typeof source.label === 'string' && source.label.trim() ? source.label : url.hostname;
      item.append(link);
      sourceList.append(item);
    });
    $('#card-profile-sources-block').hidden = !sourceList.childElementCount;
  }

  function resetViewerTilt() {
    if (viewerTiltFrame) cancelAnimationFrame(viewerTiltFrame);
    viewerTiltFrame = 0;
    viewerPointer = null;
    viewerTilt.classList.remove('is-tilting');
    ['--tilt-x', '--tilt-y', '--card-depth', '--light-x', '--light-y', '--foil-x', '--foil-y', '--foil-opacity', '--glare-opacity', '--shadow-x', '--shadow-y', '--shadow-blur', '--parallax-x', '--parallax-y'].forEach(property => viewerTilt.style.removeProperty(property));
  }

  function queueViewerTilt(event) {
    if (!viewer.open || event.pointerType !== 'mouse' || viewerReducedMotion.matches || !viewerFineHover.matches) return;
    viewerPointer = {x: event.clientX, y: event.clientY};
    if (viewerTiltFrame) return;
    viewerTiltFrame = requestAnimationFrame(() => {
      viewerTiltFrame = 0;
      if (!viewer.open || !viewerPointer || viewerReducedMotion.matches || !viewerFineHover.matches) return;
      // Measure the stationary outer area, never the transformed card surface.
      const box = viewerInteraction.getBoundingClientRect();
      if (!box.width || !box.height) return;
      const x = Math.max(0, Math.min(1, (viewerPointer.x - box.left) / box.width));
      const y = Math.max(0, Math.min(1, (viewerPointer.y - box.top) / box.height));
      const nx = (x - .5) * 2, ny = (y - .5) * 2;
      const strength = Math.min(1, Math.hypot(nx, ny));
      const properties = {
        '--tilt-x': `${(-ny * 14).toFixed(2)}deg`,
        '--tilt-y': `${(nx * 17).toFixed(2)}deg`,
        '--card-depth': '10px',
        '--parallax-x': `${(nx * 6).toFixed(2)}px`,
        '--parallax-y': `${(ny * 4).toFixed(2)}px`,
        '--light-x': `${(x * 100).toFixed(2)}%`,
        '--light-y': `${(y * 100).toFixed(2)}%`,
        '--foil-x': `${(25 + x * 50).toFixed(2)}%`,
        '--foil-y': `${(25 + y * 50).toFixed(2)}%`,
        '--foil-opacity': (.1 + strength * .09).toFixed(2),
        '--glare-opacity': (.10 + strength * .12).toFixed(2),
        '--shadow-x': `${(-nx * 17).toFixed(2)}px`,
        '--shadow-y': `${(23 - ny * 9).toFixed(2)}px`,
        '--shadow-blur': `${(30 + strength * 13).toFixed(2)}px`
      };
      Object.entries(properties).forEach(([property, value]) => viewerTilt.style.setProperty(property, value));
      viewerTilt.classList.add('is-tilting');
    });
  }

  viewerInteraction.addEventListener('pointermove', queueViewerTilt);
  viewerInteraction.addEventListener('pointerleave', resetViewerTilt);
  viewerInteraction.addEventListener('pointercancel', resetViewerTilt);
  viewerReducedMotion.addEventListener('change', resetViewerTilt);
  viewerFineHover.addEventListener('change', resetViewerTilt);
  addEventListener('resize', resetViewerTilt);

  function setCardView(mode) {
    cardView = mode;
    viewerTilt.dataset.view = mode;
    $$('#card-view-controls [data-card-view]').forEach(button=>button.setAttribute('aria-pressed', String(button.dataset.cardView===mode)));
    resetViewerTilt();
  }
  $('#card-view-controls').addEventListener('click',event=>{
    const button=event.target.closest('[data-card-view]');
    if(button)setCardView(button.dataset.cardView);
  });

  function renderDepthCard(player) {
    const depth=player.depth;
    const available=depth && data.depthFrame;
    $('#card-view-controls').hidden=!available;
    if(!available){setCardView('original');return;}
    $('#depth-background').src=data.depthFrame;
    $('#depth-heading').src=player.card;
    $('#depth-plaque').src=player.card;
    $('#depth-league-logo').src=data.league;
    $('#depth-team-logo').src=team.logo;
    const portrait=$('#depth-portrait');
    portrait.src=depth.portrait;
    portrait.style.left=`${depth.left}%`;
    portrait.style.top=`${depth.top}%`;
    portrait.style.width=`${depth.width}%`;
    $('#depth-portrait-wrap').style.setProperty('--portrait-fade-start',`${Math.min(72,depth.fadeStart)}%`);
    $('#depth-portrait-wrap').style.setProperty('--portrait-fade-end',`${Math.min(75,depth.fadeEnd)}%`);
    setCardView('depth');
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
    renderPlayerProfile(player);
    renderDepthCard(player);
    resetViewerTilt();
    viewerScrollY = window.scrollY;
    previousBodyTop = document.body.style.top;
    document.body.style.top = `-${viewerScrollY}px`;
    document.body.classList.add('card-viewer-open');
    viewer.showModal();
    viewer.scrollTop = 0;
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
    resetViewerTilt();
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
  $('#role-selector').addEventListener('click',event=>{
    const button=event.target.closest('[data-role]');
    if(!button||!data||!['racing','item','all'].includes(button.dataset.role))return;
    collectionRole=button.dataset.role;
    $$('#role-selector [data-role]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.role===collectionRole)));
    $('#collection-description').textContent=collectionRole==='all'?'同一隊伍，每一種角色，都在這裡。':collectionRole==='item'?'每一次攻防，都是團隊的默契。':'彎道上的每一秒，都有他的名字。';
    setTeam(team.id);
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

  fetch('assets/asset-manifest.json', {cache:'no-cache'}).then(response => {
    if (!response.ok) throw Error('Asset manifest unavailable');
    return response.json();
  }).then(manifest => {
    data = manifest;
    $('#total-player-count').textContent=data.players.length;
    $('#season-numbers').setAttribute('aria-label',`${data.teams.length}支隊伍，${data.players.length}位選手`);
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

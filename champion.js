(() => {
  const announcement = document.getElementById('champion-dialog');
  if (typeof announcement?.showModal !== 'function') return;

  document.getElementById('champion-photo-source').href = 'https://www.sina.cn/news/detail/5367822042540085.html';
  announcement.showModal();
  window.addEventListener('pageshow', event => {
    if (event.persisted && !announcement.open) announcement.showModal();
  });
})();

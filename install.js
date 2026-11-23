(() => {
  const standalone = matchMedia('(display-mode: standalone)');
  const android = /Android/i.test(navigator.userAgent);
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const mobile = android || ios || navigator.userAgentData?.mobile === true;
  const required = () => mobile && !standalone.matches && navigator.standalone !== true;
  const content = {
    ios: [
      'Открой эту страницу в Safari. Если ссылка открылась в Telegram или другом приложении, скопируй её и вставь в Safari.',
      'Нажми «Поделиться». Если кнопка скрыта, открой меню Safari и выбери «Поделиться».',
      'Прокрути список и выбери «На экран Домой». Если пункта нет, добавь его через «Редактировать действия».',
      'Включи «Открывать как веб-приложение», если этот переключатель есть. Затем нажми «Добавить».',
      'Вернись на экран «Домой» и открой игру через иконку «После семи».'
    ],
    android: [
      'Открой эту страницу в Chrome. Если ссылка открылась внутри мессенджера, выбери «Открыть в браузере».',
      'Нажми «Установить», если кнопка есть ниже. Иначе открой меню Chrome ⋮ вверху справа.',
      'Выбери «Установить приложение» или «Добавить на главный экран» → «Установить». Подтверди установку.',
      'Открой «После семи» с главного экрана или из списка приложений.'
    ]
  };
  if ('serviceWorker' in navigator && isSecureContext && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
  if (!mobile) return;
  document.documentElement.classList.toggle('install-required', required());
  let prompt;
  let installButton;
  let notice;
  window.addEventListener('beforeinstallprompt', event => {
    if (!required()) return;
    event.preventDefault();
    prompt = event;
    if (installButton) installButton.hidden = false;
  });
  function reconcile() {
    document.documentElement.classList.toggle('install-required', required());
    const gate = document.getElementById('install-gate');
    if (gate) gate.hidden = !required();
    for (const child of document.body.children) {
      if (child !== gate && !['SCRIPT','LINK'].includes(child.tagName)) child.inert = required();
    }
  }
  document.addEventListener('DOMContentLoaded', () => {
    if (!required()) return;
    const gate = document.createElement('section');
    gate.id = 'install-gate';
    gate.setAttribute('aria-labelledby', 'install-title');
    gate.innerHTML = '<div class="install-card"><img src="./icons/icon-192.png" width="68" height="68" alt=""><h1 id="install-title">Установи «После семи»</h1><p>На телефоне игра запускается с домашнего экрана.</p><h2></h2><ol></ol><button type="button" hidden>Установить</button><p class="install-notice" role="status"></p></div>';
    gate.querySelector('h2').textContent = ios ? 'iPhone и iPad · Safari' : 'Android · Chrome';
    for (const step of (ios ? content.ios : content.android)) {
      const li = document.createElement('li');
      li.textContent = step;
      gate.querySelector('ol').append(li);
    }
    installButton = gate.querySelector('button');
    notice = gate.querySelector('.install-notice');
    installButton.hidden = !prompt || ios;
    installButton.addEventListener('click', async () => {
      const current = prompt;
      if (!current) return;
      prompt = undefined;
      installButton.hidden = true;
      try {
        await current.prompt();
        if ((await current.userChoice).outcome === 'accepted') {
          notice.textContent = 'Теперь открой «После семи» с главного экрана.';
        }
      } catch {
        notice.textContent = 'Воспользуйся меню Chrome и выбери «Установить приложение».';
      }
    });
    document.body.append(gate);
    reconcile();
  });
  standalone.addEventListener('change', () => { if (document.body) reconcile(); });
  window.addEventListener('appinstalled', () => {
    if (notice) notice.textContent = 'Иконка добавлена. Открой игру с домашнего экрана.';
  });
})();

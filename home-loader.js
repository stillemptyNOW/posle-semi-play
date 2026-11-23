(() => {
  const loader = document.getElementById('home-loader');
  if (!loader) return;
  const cover = document.querySelector('body > main');
  const progress = document.getElementById('home-load-progress');
  const status = document.getElementById('home-load-status');
  const bypass = document.getElementById('home-load-bypass');
  let finished=false;
  let completed=0;
  let fallbackTimer;
  function reveal() {
    if (finished) return;
    finished=true;
    clearTimeout(fallbackTimer);
    loader.hidden=true;
    if (!document.documentElement.classList.contains('install-required')) {
      cover.inert=false;
    }
  }
  if (document.documentElement.classList.contains('install-required')) {
    reveal();
    return;
  }
  cover.inert=true;
  bypass.addEventListener('click',reveal);
  function settle(resource) {
    let timeout;
    return Promise.race([
      resource.catch(()=>false),
      new Promise(resolve=>{timeout=setTimeout(()=>resolve(false),7500);})
    ]).finally(()=>clearTimeout(timeout));
  }
  function image(path) {
    return new Promise(resolve=>{
      const artwork=new Image();
      artwork.onload=()=>resolve(true);
      artwork.onerror=()=>resolve(false);
      artwork.src=path;
    });
  }
  async function file(path) {
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),7400);
    try {
      const response=await fetch(path,{cache:'force-cache',signal:controller.signal});
      if (!response.ok) return false;
      await response.arrayBuffer();
      return true;
    } finally {
      clearTimeout(timeout);
    }
  }
  function localAudio(path) {
    return new Promise(resolve=>{
      const track=new Audio();
      track.preload='auto';
      track.onloadeddata=()=>resolve(true);
      track.onerror=()=>resolve(false);
      track.src=path;
      track.load();
    });
  }
  const artwork=[
    ['Оформление лобби', './assets/bg/bg_yard_evening.jpg'],
    ['Обложка новеллы', './assets/bg/bg_old_building_night.jpg'],
    ['Обложка кликера', './assets/bg/bg_shop_inside.jpg'],
    ['Иконка приложения', './icons/icon-192.png']
  ];
  const resources=artwork.map(([label,path])=>[label,image(path)]);
  if (location.protocol === 'file:') {
    resources.push(['Музыка лобби',localAudio('./local-audio/hello-you.m4a')]);
  } else {
    for (const [label,path] of [
      ['Музыка лобби','./assets/audio/after-seven-through-wall.wav'],
      ['Файлы новеллы','./novella.html'],
      ['Файлы кликера','./clicker.html'],
      ['Настройки веб-приложения','./manifest.webmanifest']
    ]) resources.push([label,file(path)]);
  }
  progress.max=resources.length;
  progress.value=0;
  fallbackTimer=setTimeout(()=>{if(!finished)bypass.hidden=false;},3300);
  Promise.all(resources.map(async ([label,job])=>{
    if (!await settle(job) || finished) return;
    completed++;
    progress.value = completed;
    status.textContent=label+' · '+completed+' из '+resources.length;
  })).then(reveal);
})();

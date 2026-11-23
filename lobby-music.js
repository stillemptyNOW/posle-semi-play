(() => {
  const local = location.protocol === 'file:';
  const defaultTheme = './assets/audio/after-seven-through-wall.wav';
  const localTheme = './local-audio/hello-you.m4a';
  const novelCues = new Set(['mus_seasons_home','mus_seasons_through_wall','mus_seasons_lobby_echo']);
  const track = new window.Audio();
  track.loop = true;
  track.preload = 'metadata';
  let localAvailable = local;
  let scenePlaying = false;
  let lobbyPlaying = false;
  let restoreMusic;
  let toggle;
  let credits;
  let playing;
  function setLevel(value) {
    track.volume = Math.min(1,Math.max(0,value*.55));
    resume();
  }
  function resume() {
    if ((!scenePlaying&&!lobbyPlaying)||document.hidden||track.volume===0) {
      track.pause();
      return;
    }
    if (!track.paused||playing) return;
    playing=track.play().catch(()=>{}).finally(()=>playing=undefined);
  }
  function render() {
    if (!toggle) return;
    toggle.textContent=track.paused ? 'Включить музыку' : 'Выключить музыку';
    toggle.setAttribute('aria-pressed',String(!track.paused));
  }
  track.addEventListener('play',render);
  track.addEventListener('pause',render);
  track.addEventListener('error',()=>{
    if (!localAvailable) return;
    localAvailable=false;
    if (credits) credits.href='./assets/audio/CREDITS.txt';
    if (toggle) {
      track.src=defaultTheme;
      resume();
    }
    const fallback=restoreMusic;
    scenePlaying=false;
    restoreMusic=undefined;
    fallback?.();
  });
  document.addEventListener('visibilitychange',resume);
  document.addEventListener('DOMContentLoaded',()=>{
    toggle=document.getElementById('lobby-music');
    if (!toggle) return;
    credits=document.getElementById('lobby-credits');
    if (credits&&localAvailable) credits.href='./local-audio/CREDITS.txt';
    track.src=localAvailable ? localTheme : defaultTheme;
    setLevel(.48);
    toggle.addEventListener('click',()=>{
      lobbyPlaying=track.paused;
      resume();
    });
    render();
  });
  window.AfterSevenTheme={
    scene(cue,volume,fallback) {
      scenePlaying=localAvailable&&novelCues.has(cue);
      restoreMusic=scenePlaying?fallback:undefined;
      if (scenePlaying&&!track.getAttribute('src')) track.src=localTheme;
      setLevel(volume);
      return scenePlaying;
    },
    setLevel,
    resume,
    get localCredit() {
      return localAvailable?'Blake Neely — Hello, You':'';
    }
  };
})();

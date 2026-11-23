(() => {
  const byId = id => document.getElementById(id);
  const messages = byId('messages'), form = byId('composer'), model = byId('model');
  const text = byId('message'), photo = byId('photo'), send = byId('send');
  const attachment = byId('attachment'), status = byId('chat-status');
  const photoButton = byId('photo-button'), remove = byId('remove-photo'), quota = byId('quota');
  const history = [];
  const names = {user:'Ты',assistant:'Bobert QCold AI'};
  let models = [], remaining = 3, selectedPhoto = null, api;
  const isLocal = ['127.0.0.1','localhost'].includes(location.hostname);
  function bubble(role,content,withPhoto=false) {
    const article = document.createElement('article');
    article.className = 'bubble '+role;
    const label = document.createElement('strong');
    label.textContent = names[role];
    const copy = document.createElement('p');
    copy.textContent = (withPhoto ? 'Фото · ' : '')+content;
    article.append(label,copy);
    messages.append(article);
    return article;
  }
  function renderPhoto() {
    const vision = models.find(item => item.key === model.value)?.vision;
    photoButton.hidden = !vision || remaining <= 0;
    quota.textContent = vision ? 'Фото сегодня: '+remaining+' из 3' : '';
    remove.hidden = !selectedPhoto;
    attachment.textContent = selectedPhoto
      ? selectedPhoto.name+' · Фото отправится выбранной модели.'
      : vision ? 'Лимит обновляется в 00:00 UTC.' : '';
  }
  function clearPhoto() {
    selectedPhoto = null;
    photo.value = '';
    renderPhoto();
  }
  photo.addEventListener('change',() => {
    const file = photo.files[0];
    if (!file) return;
    if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 4*1024*1024) {
      clearPhoto();
      status.textContent = 'Подойдёт JPEG, PNG или WebP до 4 МБ.';
      return;
    }
    selectedPhoto = file;
    status.textContent = '';
    renderPhoto();
  });
  remove.addEventListener('click',clearPhoto);
  model.addEventListener('change',clearPhoto);
  function photoData(file) {
    if (!file) return Promise.resolve(null);
    return new Promise((yes,no) => {
      const reader = new FileReader();
      reader.onload = () => yes(reader.result);
      reader.onerror = no;
      reader.readAsDataURL(file);
    });
  }
  form.addEventListener('submit',async event => {
    event.preventDefault();
    const content = text.value.trim();
    const file = selectedPhoto;
    if ((!content && !file) || send.disabled) return;
    const question = {role:'user',content:content || 'Что видно на фото?'};
    send.disabled = text.disabled = model.disabled = photo.disabled = remove.disabled = true;
    status.textContent = 'Боберт отвечает…';
    const pending = bubble('user',question.content,Boolean(file));
    try {
      const response = await fetch(api+'/chat',{
        method:'POST',headers:{'content-type':'application/json'},cache:'no-store',
        body:JSON.stringify({model:model.value,messages:[...history.slice(-14),question],photo:await photoData(file)})
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Запрос не прошёл.');
      bubble('assistant',result.reply);
      history.push(question,{role:'assistant',content:result.reply.slice(0,2500)});
      if (history.length>16) history.splice(0,history.length-16);
      remaining = result.remainingPhotos;
      text.value = '';
      clearPhoto();
      status.textContent = '';
      pending.nextElementSibling?.scrollIntoView({block:'nearest'});
    } catch (error) {
      pending.remove();
      status.textContent = error.message || 'Связь пропала. Попробуй ещё раз.';
    } finally {
      send.disabled = text.disabled = model.disabled = photo.disabled = remove.disabled = false;
      text.focus();
    }
  });
  async function connect() {
    try {
      if (isLocal) {
        api = '/api';
      } else {
        const config = await fetch('./bobert-api.json',{cache:'no-store'}).then(res=>res.json());
        if (!config.url) throw Error('Сервер Боберта пока не подключён.');
        const endpoint = new URL(config.url);
        if(endpoint.protocol!=='https:') throw Error('Внешний сервер требует HTTPS.');
        api = endpoint.href.replace(/\/$/,'');
      }
      const result = await fetch(api+'/models',{cache:'no-store'}).then(res=>res.json());
      models = result.models;
      remaining = result.remainingPhotos;
      if (!models.length) throw Error('Боберт пока не получил доступ к моделям.');
      model.replaceChildren(...models.map(entry=>new Option(entry.id+(entry.vision?' · фото':''),entry.key)));
      send.disabled = model.disabled = text.disabled = false;
      status.textContent = '';
      renderPhoto();
    } catch (error) {
      model.replaceChildren(new Option('Недоступно'));
      status.textContent = error instanceof TypeError ? 'Не удалось подключиться к серверу Боберта.' : error.message;
    }
  }
  connect();
})();

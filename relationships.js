
const socialNames = {dasha:'Даша',zhenya:'Женя',kozhanka:'Кожанка',danil:'Данил',kolya:'Коля',maxim:'Максим',ilyuza:'Илюза',sofa:'Софа'};
const lovePool = {
  danil:['dasha','zhenya','kozhanka','ilyuza','sofa','kolya','maxim'],
  kolya:['dasha','zhenya','kozhanka','ilyuza','sofa','danil','maxim']
};
function bondKey(a,b) {
  const [x,y]=[a,b].sort();
  return x==='danil'&&y==='kolya'?'bond_danil_kolya':'bond_'+a+'_'+b;
}
const bondKeys = [...new Set(Object.entries(lovePool).flatMap(([a,people])=>people.map(b=>bondKey(a,b))).concat('bond_maxim_zhenya'))];
function eligiblePartners(a,snapshot,min) {
  if(snapshot.flags['dead_'+a])return [];
  return lovePool[a].filter(b=>!snapshot.flags['dead_'+b]&&snapshot.flags.partner!==b &&
    !(snapshot.flags.kiss_maxim_zhenya&&(b==='maxim'||b==='zhenya')) &&
    !(min===4 && snapshot.flags['kiss_robert_'+b]) &&
    (snapshot.stats[bondKey(a,b)]||0)>=min);
}
function findCouples(snapshot,min) {
  const [a,b]=['danil','kolya'];
  const first=eligiblePartners(a,snapshot,min),second=eligiblePartners(b,snapshot,min);
  if(min===4){
    first.splice(0,first.length,...first.filter(p=>!first.some(q=>snapshot.stats[bondKey(a,q)]>snapshot.stats[bondKey(a,p)])));
    second.splice(0,second.length,...second.filter(p=>!second.some(q=>snapshot.stats[bondKey(b,q)]>snapshot.stats[bondKey(b,p)])));
  }
  let best={danil:false,kolya:false},score=0;
  for(const x of [false,...first])for(const y of [false,...second]){
    if(x&&x===y)continue;
    if((x===b)!==(y===a))continue;
    const sum=(snapshot.stats[bondKey(a,x)]||0)+(snapshot.stats[bondKey(b,y)]||0);
    if(sum>score){best={danil:x,kolya:y};score=sum;}
  }
  return best;
}
const mysteryTargets=['dasha','zhenya','kozhanka','danil','kolya','maxim'];
const afterSevenNarr = text => ({t:'narr',text});
const afterSevenSay = (who,text,emo='serious',pos='right')=>({t:'say',who,text,emo,pos,outfit:'street'});
const lossRecords = {
  dasha:['bg_shop_outside','У остановки Роберт вначале увидел шарф. Даша лежала боком и держала его так, будто ещё собиралась завязать. Из кармана торчала заявка в кинокружок. Последнее предложение кончалось на середине строки. Рядом на асфальте лежала ручка с покусанным колпачком.'],
  zhenya:['bg_neighbor_stairs','Женя лежала у перил, плечом к ступеньке. Телефон ещё был тёплый. Последнее набранное сообщение спрашивало, во сколько именно её ждать. Роберт назвал время вслух. На площадке никто не ответил.'],
  kozhanka:['bg_garage_passage','В узком проходе за мастерской снег успел лечь на рукав Кожанки. Роберт узнаёт её по куртке: рваный шов у локтя, который она так и не зашила. На ней наконец была та самая куртка, которую она с первой пары называла своей.'],
  danil:['bg_dec_stairs','Данил лежал у служебной лестницы. Край тетради намок, лист открылся на фразе «Я думаю, он вышел в…». После предлога место ещё оставалось. Роберт положил ладонь на бумагу. Время можно было вписать. Нельзя было заставить Данила зачеркнуть догадку.'],
  kolya:['bg_november_path','В переулке лежал Коля. Коробка с шахматами уцелела, а белого коня не было. Роберт поднял пешку и вспомнил, где остановилась Колина шутка на лестнице. Он сам мог придумать последнее слово. Почему-то именно этого слова ему было страшнее всего.'],
  maxim:['bg_dorm_hall','Из кухни слышно, как свистит чайник. Максим лежал на полпути к лестнице в той же куртке, в которой обещал не уходить надолго. Роберт выключил чайник и вернулся за ним. Вода больше не шумела. На двери осталась фамилия, сдвинутая на четыре сантиметра.']
};
function putWarning(round){
  const first=state.flags.warning_first;
  const pool=mysteryTargets.filter(id=>!state.flags['dead_'+id]&&(!first||round===1||id!==first));
  const next=pool.sort((a,b)=>(state.stats['rel_'+b]||0)-(state.stats['rel_'+a]||0))[0];
  if(round!==2)state.flags.warning_first=next;
  if(round===2)state.flags.warning_first_saved=Boolean(state.flags['warned_'+first]);
  state.flags.warning_target=round===2&&!state.flags['warned_'+first]?first:next;
  const target=state.flags.warning_target;
  if(!target) return;
  queue([{t:'sfx',id:'sfx_seasons_message'},afterSevenNarr('На записи слышно: «'+socialNames[target]+'. 19:10. Не открывай». Под сообщением стоит завтрашняя дата. Роберт видит имя ещё раз, когда включает экран.')]);
}
function warningCall(){
  const roster=mysteryTargets.filter(id=>!state.flags['dead_'+id]);
  queue([{t:'choice',timer:10,onTimeout:roster.length,prompt:'Один звонок · 10 секунд',options:[
    ...roster.map(id=>({text:'Набрать: '+socialNames[id],flags:{['warned_'+id]:true},fx:{['rel_'+id]:3},steps:[{t:'sfx',id:'sfx_incoming_call'},afterSevenSay(id,'Слышу. Скажи адрес. Я останусь там, где светло, пока мне не ответят.')] })),
    {text:'Убрать телефон',steps:[afterSevenNarr('Время вышло, а имя так и осталось на экране.')] }
  ]}]);
}
function warningDeath(){
  const target=state.flags.warning_target;
  if(!target||state.flags.feb_intervened||state.flags['warned_'+target]||state.flags['dead_'+target])return;
  queue([{t:'goto',scene:'feb_body_'+target}]);
}
function pickDate(){
  const f=state.flags;
  const group=[['dasha',18,!!f.kiss_robert_dasha],['zhenya',40,!!f.kiss_robert_zhenya&&!f.nov_zhenya_brushoff&&!f.robert_released_zhenya&&!f.kiss_maxim_zhenya],['kozhanka',18,!!f.kiss_robert_kozhanka]];
  const possible=group.filter(([id,threshold,okay])=>okay&&!f['dead_'+id]&&state.stats['rel_'+id]>=threshold);
  possible.sort(([a],[b])=>state.stats['rel_'+b]-state.stats['rel_'+a]);
  f.date_candidate=possible[0]?.[0]||false;
}
function playNpcKisses(){
  const result=findCouples(state,4);
  const moment=[];
  let illustrated=false;
  for(const id of ['danil','kolya']){
    const partner=result[id];
    if(!partner){
      moment.push(afterSevenNarr(id==='danil'?'Данил моет обе кружки. Синюю ставит у чайника, вторую переставляет трижды, пока она не перестаёт звенеть о сушилку.':'Коля садится на лестнице. Достаёт из коробки одну фигуру, держит её в руке и закрывает крышку.'));
      continue;
    }
    if(id==='kolya'&&partner==='danil')continue;
    if (!illustrated) {
      moment.push({t:'cg',id:'cg_seasons_kiss_silhouette'});
      illustrated=true;
    }
    moment.push(afterSevenNarr(id==='danil'
      ?socialNames[partner]+' стоит рядом с Данилом у чайника. Ложка ударяется о край второй кружки. Когда становится тихо, они смотрят друг на друга и коротко целуются.'
      :socialNames[partner]+' ждёт Колю на площадке. Он ставит коробку на перила, не закрывает крышку. После поцелуя оттуда выкатывается пешка. Оба смеются, пока наверху не хлопает дверь.'));
  }
  queue(moment);
}
function resolveCouples(){
  const result=findCouples(state,6);
  const steps=[];
  for(const id of ['danil','kolya']){
    const mate=result[id];
    state.flags['dating_'+id]=mate;
    if(id==='kolya'&&mate==='danil')continue;
    if(mate){
      steps.push(afterSevenSay(id,id==='danil'?'У меня в тетради есть место только для времени. Но я могу спросить без неё. Будем встречаться?':'Я могу утром прийти и спросить ещё раз. Только хочется понять сейчас: мы вместе?','serious','left'),
        afterSevenSay(mate,'Да. Но завтра скажи ещё раз просто так. Мне нравится слышать, как ты это говоришь.','smile'));
    }else if(state.flags.partner&&(state.stats[bondKey(id,state.flags.partner)]||0)>=6){
      steps.push(afterSevenSay(id,'Я думал, это моё. Ладно. Мне нужно время. Потом встретимся все вместе.'));
    }else{
      steps.push(afterSevenSay(id,'Я пока один. Чай от этого хуже не становится. Налей мне, пожалуйста.'));
    }
  }
  queue(steps);
}
function emptyChair(){
  const lost=mysteryTargets.find(id=>state.flags['dead_'+id]);
  const things={maxim:'синяя кружка',dasha:'шарф',zhenya:'ручка',kozhanka:'куртка',danil:'тетрадь',kolya:'пешка'};
  queue(lost
    ? [afterSevenNarr('Стул оставили между столом и стеной. На сиденье лежит '+things[lost]+'. Роберт смотрит и весь вечер не знает, можно ли подвинуть стул, чтобы никто больше не задевал его ногой.')]
    : [afterSevenNarr('Стул лишний. Его оставили опоздавшему. На площадке слышатся знакомые шаги, и Роберт вдруг понимает: опаздывает он сам, тот, который в октябре шёл по снегу к пустырю. За дверью уже тихо.')]);
}


function runApril(action) {
  const flags = state.flags;
  const alive = id => id && !flags['dead_'+id];
  const callOrder = ['maxim','dasha','zhenya','kozhanka','danil','kolya','ilyuza','sofa'];
  const people = callOrder.filter(alive);
  const partner = flags.partner;
  const lost = mysteryTargets.filter(id => flags['dead_'+id] && lossRecords[id]);
  const pairs = ['danil','kolya'].map(id => [id,flags['dating_'+id]]);
  const group = pairs.flat();
  const say = afterSevenSay;
  const narr = afterSevenNarr;
  const calls = {
    maxim:'Я кружку оставил. Ты сначала сам скажи, где стоишь.',
    dasha:'Я у афиши. Говори с самого начала, я подожду.',
    zhenya:'У перил. Слышу. Только скажи нормально, куда идти.',
    kozhanka:'Я забрала свою куртку. Мне ждать у света?',
    danil:'Я здесь. Секунду. Ладно, время потом запишу.',
    kolya:'Я на лестнице. Могу молчать, пока ты говоришь.',
    ilyuza:'Свой ключ нашла. Если надо, подожду у двери.',
    sofa:'Я не у Илюзы. Я рядом с остановкой. Что случилось?'
  };
  switch (action) {
    case 'line':
      flags.apr_partner_alive = Boolean(alive(partner));
      queue(callOrder.map(id => alive(id) ? say(id,calls[id]) : {t:'silence',ms:1850}));
      break;
    case 'routes':
      flags.apr_four_voices = people.length >= 4;
      flags.apr_two_pairs = group.every(alive) && new Set(group).size===4;
      flags.apr_loss = lost.length>0;
      flags.apr_split_possible = lost.length>0 && ['danil','kolya','zhenya'].some(alive);
      flags.apr_table_ready = Boolean(alive(partner)) && lost.length===0;
      break;
    case 'voices': {
      const stories = [
        'Я услышал удар со двора. Дверь тогда ещё была открыта.',
        'А я пришла уже после. Тот второй стук был из-за двери.',
        'У меня на телефоне стояло 19:10. Потом снова стало 19:07.',
        'На снегу твой след уже был, когда ты подошёл к нам. Роберт, я точно видел.'
      ];
      queue(people.slice(0,4).map((id,index)=>say(id,stories[index])));
      break;
    }
    case 'table': {
      const guests = [...new Set([partner,'danil','kolya',...group].filter(alive))];
      const missing = ['danil','kolya'].filter(id=>alive(id)&&!flags['dating_'+id]);
      queue([narr('Роберт ставит свою кружку рядом с чашками. За столом '+(guests.length+1)+'.'),
        ...guests.map(id=>say(id,id===partner?'Ты опять сел у двери. Сядь ближе.':'Я завтра ещё могу прийти, если вы будете дома.','smile')),
        ...missing.map(id=>narr(socialNames[id]+' пришёл один и придвинул себе стул рядом с Робертом.'))]);
      break;
    }
    case 'goodbye': {
      const things = {dasha:'шарф',zhenya:'ручку',kozhanka:'куртку'};
      queue([say(partner,'Можно один раз, пока автобус не пришёл?'),
        narr('Роберт кивает. Они целуются один раз. Когда становится слышно двигатель, он отдаёт ей '+things[partner]+'.'),
        say('robert','Увидимся во дворе. Если обоим захочется.')]);
      break;
    }
    case 'loss':
      queue(lost.length>1 ? [{t:'choice',prompt:'Чьё имя набрать у дороги?',options:lost.map(id=>({text:socialNames[id],steps:[narr(lossRecords[id][1])]}))}] : [narr(lossRecords[lost[0]][1])]);
      break;
    case 'split': {
      const saved = ['danil','kolya','zhenya'].find(alive);
      queue([say(saved,'Я здесь. Пойдём. Только потом вернёмся за вторым.'),
        narr('Роберт выводит человека к фонарю. В одном окне уже горит свет, и он показывает туда рукой.'),
        narr(lossRecords[lost[0]][1])]);
      break;
    }
    case 'pavilion':
      queue(pairs.map(([a,b])=>narr('Под стеклом Роберт узнаёт двоих. '+socialNames[a]+' и '+socialNames[b]+' лежат рядом, сцепив руки. Между их рукавами набилась мокрая крошка снега.'))
        .concat(say('robert',group.map(id=>socialNames[id]).join('. ')+'. Запишите, пожалуйста.')));
      break;
  }
}
const marchMoments = {
  danil: {
    dasha: [
      afterSevenNarr('На следующий день Даша оставляет открытым кинозал, пока Данил дочитывает её заявку. Он не поправляет последнее предложение. Спрашивает, можно ли завтра посидеть рядом, пока она доработает кадр.'),
      afterSevenSay('dasha','Можно. Только в этот раз сядь рядом сразу. Я всё равно видела, как ты там у двери топтался.','smile'),
      afterSevenNarr('У окна он складывает заявку пополам и возвращает ей. Даша касается его щеки и целует.'),
      {t:'cg',id:'cg_dec_kiss_dasha_danil'}
    ],
    kozhanka: [
      afterSevenNarr('У мастерской остались две кружки на ступеньке. Данил упрямо принёс ту, у которой целая ручка. Кожанка подцепляет блюдце пальцами и садится рядом в своей куртке.'),
      {t:'cg',id:'cg_seasons_danil_kozhanka'},
      afterSevenSay('kozhanka','Поставь тетрадь. Я ещё минуту на тебя хочу посмотреть, пока не стемнело.','smile'),
      afterSevenSay('danil','Хорошо. Кружку могу тут оставить, если завтра тоже придёшь?','smile','left')
    ],
    ilyuza: [
      afterSevenNarr('Илюза задерживается с Данилом на площадке после дня рождения. Она показывает новый ключ с насечкой. Данил приподнимает тетрадь, чтобы дать ей пройти, но она остаётся рядом.'),
      {t:'cg',id:'cg_seasons_danil_ilyuza'},
      afterSevenSay('ilyuza','У меня теперь свой. И мне всё равно нравится, когда ты ждёшь у двери.','smile'),
      afterSevenSay('danil','Тогда завтра сначала зайду за тобой, потом запишу во сколько.','smile','left')
    ]
  },
  kolya: {
    dasha: [
      afterSevenNarr('На следующий вечер Даша кладёт коробку на пустое кресло в кинозале. Коля наконец договаривает шутку с лестницы. Она смотрит на него и начинает смеяться до последних слов.'),
      afterSevenSay('kolya','Подожди. Там ещё одно слово.'),
      afterSevenNarr('Она притягивает его ближе, и слово остаётся между ними. Даша целует его у края проекционного стола.'),
      {t:'cg',id:'cg_dec_kiss_dasha_kolya'}
    ],
    kozhanka: [
      afterSevenNarr('Коля несёт до поворота шахматы, так и не открыв коробку. Кожанка слегка тянет его за рукав. В свете у остановки он успевает заметить, что она в той самой куртке из мастерской.'),
      {t:'cg',id:'cg_seasons_kolya_kozhanka'},
      afterSevenSay('kozhanka','Если завтра скажешь «опять перепутала», я тебя обратно сюда отправлю. Эта моя.'),
      afterSevenSay('kolya','Запомнил. А завтра пойдём тем же путём или мне опять первый попавшийся придумать?','smile')
    ],
    sofa: [
      afterSevenNarr('У окна Коля наконец раскрывает коробку, чтобы показать Софе, где заедает крышка. Пешка выкатывается прямо между ними. Софа ждёт, пока он договорит, и от смеха перестаёт искать свой ключ.'),
      {t:'cg',id:'cg_seasons_kolya_sofa'},
      afterSevenSay('sofa','Смотри. Я даже руками не мешала. Теперь второй раз расскажи, нормально.','smile','left'),
      afterSevenSay('kolya','Давай завтра. Я хочу ещё один повод, чтобы ты сюда пришла.','smile')
    ]
  }
};
function playMarchMoments() {
  for (const id of ['kolya','danil']) {
    const scene = marchMoments[id][state.flags['dating_'+id]];
    if (scene) queue(scene);
  }
}

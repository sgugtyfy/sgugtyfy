'use strict';
(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const $ = id => document.getElementById(id);
  let W = 480;
  const H = 270, T = 16, STEP = 1000 / 60;
  const input = { left: false, right: false, jump: false };
  const keys = new Set(), touches = new Map();
  let mode = 'intro', levelIndex = 0, level, player, camera = 0;
  let gems = 0, lives = 3, totalGems = 0, elapsed = 0, stageFrames = 0;
  let frame = 0, particles = [], jumpBuffer = 0, coyote = 0, respawnTimer = 0;
  let audioCtx, sound = false, toastTimer = 0, bestTime = 0;
  let lastTime = 0, accumulator = 0;
  try { bestTime = Number(localStorage.getItem('mossbound-best-v1')) || 0; } catch (_) {}
  const clockText = seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  $('best-time').textContent = bestTime ? clockText(bestTime) : '--:--';

  const worlds = [
    {name:'苔光森林', region:'THE VERDANT OUTSKIRTS', length:100, sky:'#91bdac', haze:'#b3d2aa', mountain:'#789f91', mountain2:'#628f83', leaf:'#34695b', leafLight:'#4d8566', earth:'#334c44', brick:'#53654e', moss:'#91b96b', water:'#628f9d', accent:'#f0d184',
      pits:[[19,22],[43,46],[68,72],[84,87]], platforms:[[8,12,11],[15,18,9],[25,30,11],[34,38,10],[49,54,11],[58,63,9],[73,79,11],[88,93,10]], enemies:[14,28,36,52,64,77,91], spikes:[40,65,82], checkpoint:48, goal:95},
    {name:'落日遗迹', region:'THE AMBER RUINS', length:108, sky:'#ce9b88', haze:'#e9bd94', mountain:'#b58b81', mountain2:'#917c75', leaf:'#5d6857', leafLight:'#87905e', earth:'#514b49', brick:'#736352', moss:'#b1af6c', water:'#a57977', accent:'#ffdc91',
      pits:[[17,21],[36,40],[61,65],[84,88]], platforms:[[7,12,11],[22,27,11],[29,34,9],[41,46,11],[50,54,10],[66,71,11],[75,81,9],[89,94,11],[97,101,10]], enemies:[13,25,32,44,56,70,80,93,100], spikes:[15,48,59,73,96], checkpoint:55, goal:103},
    {name:'星眠山谷', region:'THE STARLIT HOLLOW', length:114, sky:'#344e68', haze:'#668794', mountain:'#405f76', mountain2:'#304d63', leaf:'#254e53', leafLight:'#40716e', earth:'#253b46', brick:'#3d5661', moss:'#7bb1a5', water:'#345775', accent:'#c2e7cf',
      pits:[[18,22],[39,43],[64,68],[84,88],[99,103]], platforms:[[7,12,11],[14,17,9],[23,28,11],[31,37,10],[44,50,11],[53,58,9],[69,74,11],[77,82,10],[89,94,11],[104,108,11]], enemies:[12,26,35,48,57,72,81,93,107], spikes:[16,30,52,60,76,96], checkpoint:59, goal:109}
  ];

  function buildLevel(index) {
    const spec = worlds[index];
    const tiles = Array.from({length:17}, () => Array(spec.length).fill(0));
    for (let x=0;x<spec.length;x++) {
      if (!spec.pits.some(([a,b]) => x>=a && x<b)) for(let y=14;y<17;y++) tiles[y][x]=1;
    }
    for(const [a,b,y] of spec.platforms) for(let x=a;x<b;x++) tiles[y][x]=2;
    const coins = [];
    for (let x=5;x<spec.goal-2;x+=3) {
      if (tiles[14][x] && !spec.spikes.includes(x)) coins.push({x:x*T+8,y:193,taken:false});
    }
    for(const [a,b,y] of spec.platforms) for(let x=a+1;x<b;x+=2) coins.push({x:x*T+8,y:y*T-22,taken:false});
    for(const [a,b] of spec.pits) coins.push({x:(a+b)*T/2,y:170,taken:false});
    const enemies = spec.enemies.map((x,i) => {
      const platform = spec.platforms.find(([a,b]) => x>=a && x<b);
      return {x:x*T,y:(platform ? platform[2] : 14)*T-12,w:14,h:12,vx:i%2 ? .48 : -.48,alive:true};
    });
    return {...spec,tiles,coins,enemies,spikes:spec.spikes.map(x=>({x:x*T,y:216,w:16,h:8})),checkpoint:{x:spec.checkpoint*T,y:224,active:false},goalX:spec.goal*T};
  }

  function resetPlayer(x=48,y=190) {
    player={x,y,w:12,h:19,vx:0,vy:0,grounded:false,facing:1,invincible:0};
    jumpBuffer=0;coyote=0;respawnTimer=0;
  }
  function loadLevel(index) {
    levelIndex=index;level=buildLevel(index);gems=0;lives=3;stageFrames=0;particles=[];camera=0;
    resetPlayer();updateHud();
    $('level-number').textContent=String(index+1).padStart(2,'0');
    $('level-name').textContent=level.name;$('level-region').textContent=level.region;
    document.querySelectorAll('.progress-track i').forEach((dot,i)=>dot.classList.toggle('active',i<=index));
  }
  function updateHud() {
    $('gem-count').textContent=String(gems).padStart(2,'0');$('gem-total').textContent=`/ ${level.coins.length}`;
    $('health').textContent='♥ '.repeat(lives)+'♡ '.repeat(3-lives);
    $('health').setAttribute('aria-label',`${lives} 条生命`);
    $('timer').textContent=clockText(elapsed/60);
    const statuses={intro:'准备好探索了吗？',paused:'旅途暂停 · 随时继续',gameover:'勇敢的旅人，再试一次',clear:'石门已点亮 · 前往下一站',won:'森林的春天回来了'};
    $('game-status').textContent=mode==='playing' ? `${level.name} · 寻找森林的光` : statuses[mode];
    $('pause-button').disabled= !['playing','paused'].includes(mode);
    $('pause-button').textContent=mode==='paused'?'▶':'Ⅱ';
    $('pause-button').setAttribute('aria-label',mode==='paused'?'继续游戏':'暂停游戏');
  }

  const menus={
    intro:['THE FOREST IS CALLING','苔原旅人','森林的光散落在古老的路上。<br>背好行囊，去把它们带回来。','开始冒险','按 Enter 开始 · 戴上耳机，更有氛围'],
    paused:['TAKE A LITTLE BREATH','歇一歇，再出发','风还在吹，森林会等你。','继续冒险','按 Esc 或 Enter 继续'],
    gameover:['EVERY JOURNEY HAS A NEW START','再试一次吧','每一次跳跃，都离终点更近一点。','重新挑战','本关宝石和检查点将重置'],
    clear:['A LITTLE LIGHT RETURNS','这片森林亮了','', '前往下一站','下一关会有新的风景与挑战'],
    won:['YOU BROUGHT THE SPRING BACK','春天，回来了','', '再冒险一次','最快通关记录保存在当前浏览器']
  };
  function showMenu(nextMode) {
    mode=nextMode;clearInput();
    const data=menus[mode];
    $('menu-kicker').textContent=data[0];$('menu-title').textContent=data[1];
    $('menu-copy').innerHTML=mode==='clear' ? `收集微光 ${gems} / ${level.coins.length} · 本关用时 ${clockText(stageFrames/60)}<br>下一站：${worlds[levelIndex+1].name}` : mode==='won' ? `三座石门都已点亮，森林因你苏醒。<br>收集 ${totalGems} 束微光 · 总用时 ${clockText(elapsed/60)}` : data[2];
    $('play-button').innerHTML=`${data[3]} <span aria-hidden="true">→</span>`;
    $('menu-footnote').textContent=data[4];$('secondary-button').hidden=mode!=='paused';
    $('overlay').hidden=false;$('touch-controls').style.visibility='hidden';updateHud();
  }
  function play() {
    if(mode==='intro'||mode==='won'){elapsed=0;totalGems=0;loadLevel(0);}
    else if(mode==='gameover') loadLevel(levelIndex);
    else if(mode==='clear') loadLevel(levelIndex+1);
    mode='playing';$('overlay').hidden=true;$('touch-controls').style.visibility='visible';
    updateHud();canvas.focus({preventScroll:true});if(sound)ensureAudio();
  }
  function restart() {
    if(!['playing','paused','gameover'].includes(mode))return;
    loadLevel(levelIndex);mode='playing';$('overlay').hidden=true;$('touch-controls').style.visibility='visible';
    clearInput();updateHud();canvas.focus({preventScroll:true});
  }
  function pause(){if(mode==='playing')showMenu('paused');else if(mode==='paused')play();}
  function clearInput(){keys.clear();touches.clear();input.left=input.right=input.jump=false;jumpBuffer=0;document.querySelectorAll('[data-control]').forEach(b=>b.classList.remove('pressed'));}
  function syncInput() {
    input.left=keys.has('ArrowLeft')||keys.has('KeyA')||[...touches.values()].includes('left');
    input.right=keys.has('ArrowRight')||keys.has('KeyD')||[...touches.values()].includes('right');
    const jumping=keys.has('Space')||keys.has('KeyW')||keys.has('ArrowUp')||[...touches.values()].includes('jump');
    if(jumping&&!input.jump)jumpBuffer=8;input.jump=jumping;
  }
  window.addEventListener('keydown', e=>{
    if(['ArrowLeft','ArrowRight','ArrowUp','Space','KeyA','KeyD','KeyW','Escape','KeyR','Enter'].includes(e.code)) {
      if(e.target.tagName==='BUTTON' && ['Space','Enter'].includes(e.code))return;
      e.preventDefault();if(e.repeat)return;
      if(e.code==='Escape'){pause();return;}
      if(e.code==='KeyR'){restart();return;}
      if(e.code==='Enter'&&mode!=='playing'){play();return;}
      if(mode==='playing'){keys.add(e.code);syncInput();}
    }
  });
  window.addEventListener('keyup',e=>{keys.delete(e.code);syncInput();});
  window.addEventListener('blur',()=>{if(mode==='playing')showMenu('paused');else clearInput();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&mode==='playing')showMenu('paused');lastTime=0;accumulator=0;});
  document.querySelectorAll('[data-control]').forEach(button=>{
    button.addEventListener('pointerdown',e=>{e.preventDefault();if(mode!=='playing')return;button.setPointerCapture(e.pointerId);touches.set(e.pointerId,button.dataset.control);button.classList.add('pressed');syncInput();});
    const release=e=>{touches.delete(e.pointerId);button.classList.remove('pressed');syncInput();};
    button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);
    button.addEventListener('contextmenu',e=>e.preventDefault());
  });
  $('play-button').addEventListener('click',play);$('secondary-button').addEventListener('click',restart);$('pause-button').addEventListener('click',pause);
  $('fullscreen-pause').addEventListener('click',pause);
  $('fullscreen-button').addEventListener('click',async()=>{
    try {if(document.fullscreenElement)await document.exitFullscreen();else if($('viewport').requestFullscreen)await $('viewport').requestFullscreen();else toast('此浏览器不支持全屏，可横屏体验');}catch(_){toast('暂时无法进入全屏，可横屏体验');}
  });

  function ensureAudio(){if(!audioCtx){const Audio=window.AudioContext||window.webkitAudioContext;if(Audio)audioCtx=new Audio();}if(audioCtx?.state==='suspended')audioCtx.resume().catch(()=>{});}
  function tone(frequency,duration=.12,type='square',volume=.035,slide=0){
    if(!sound)return;ensureAudio();if(!audioCtx)return;
    const osc=audioCtx.createOscillator(),gain=audioCtx.createGain(),t=audioCtx.currentTime;
    osc.type=type;osc.frequency.setValueAtTime(frequency,t);if(slide)osc.frequency.linearRampToValueAtTime(slide,t+duration);
    gain.gain.setValueAtTime(volume,t);gain.gain.exponentialRampToValueAtTime(.001,t+duration);
    osc.connect(gain);gain.connect(audioCtx.destination);osc.start(t);osc.stop(t+duration);
  }
  $('sound-button').addEventListener('click',()=>{sound=!sound;$('sound-button').classList.toggle('sound-on',sound);$('sound-button').setAttribute('aria-label',sound?'关闭音效':'开启音效');$('sound-button').title=sound?'关闭音效':'开启音效';if(sound)tone(660,.15,'triangle',.08);});
  function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');toastTimer=150;}
  function burst(x,y,color,count=10){for(let i=0;i<count;i++)particles.push({x,y,vx:(Math.random()-.5)*3,vy:-Math.random()*2.6,life:25+Math.random()*15,color,size:i%3?2:3});}

  function solid(tx,ty){return ty>=0&&ty<17&&tx>=0&&tx<level.length&&level.tiles[ty][tx]!==0;}
  function rects(a,b){return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;}
  function moveBody(body,dx,dy) {
    body.x+=dx;
    let x0=Math.floor(body.x/T),x1=Math.floor((body.x+body.w-.01)/T),y0=Math.floor(body.y/T),y1=Math.floor((body.y+body.h-.01)/T);
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)if(solid(x,y)){
      if(dx>0)body.x=x*T-body.w;else if(dx<0)body.x=(x+1)*T;body.vx=0;
    }
    body.y+=dy;body.grounded=false;
    x0=Math.floor(body.x/T);x1=Math.floor((body.x+body.w-.01)/T);y0=Math.floor(body.y/T);y1=Math.floor((body.y+body.h-.01)/T);
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)if(solid(x,y)){
      if(dy>0){body.y=y*T-body.h;body.grounded=true;}else if(dy<0)body.y=(y+1)*T;body.vy=0;
    }
    body.x=Math.max(0,Math.min(level.length*T-body.w,body.x));
  }
  function hurt(fall=false){
    if((player.invincible&&!fall)||respawnTimer||mode!=='playing')return;
    lives--;burst(player.x+6,player.y+9,'#efaa82',18);tone(180,.25,'sawtooth',.03,60);updateHud();
    if(lives<=0){showMenu('gameover');return;}
    respawnTimer=36;clearInput();
  }
  function finish(){
    totalGems+=gems;tone(880,.3,'triangle',.07);burst(level.goalX+15,174,'#f9e1a5',32);
    if(levelIndex===2){const seconds=Math.max(1,Math.floor(elapsed/60));if(!bestTime||seconds<bestTime){bestTime=seconds;try{localStorage.setItem('mossbound-best-v1',String(bestTime));}catch(_){}$('best-time').textContent=clockText(bestTime);}showMenu('won');}
    else showMenu('clear');
  }
  function update(){
    frame++;
    if(toastTimer>0&&--toastTimer===0)$('toast').classList.remove('visible');
    particles=particles.filter(p=>--p.life>0);for(const p of particles){p.x+=p.vx;p.y+=p.vy;p.vy+=.065;}
    if(mode!=='playing')return;
    elapsed++;stageFrames++;if(frame%15===0)$('timer').textContent=clockText(elapsed/60);
    if(respawnTimer){
      if(--respawnTimer===0){const cp=level.checkpoint;resetPlayer(cp.active?cp.x+8:48,190);player.invincible=110;camera=Math.max(0,Math.min(level.length*T-W,player.x-W*.35));}
      return;
    }
    if(player.invincible>0)player.invincible--;
    if(player.grounded)coyote=7;else coyote=Math.max(0,coyote-1);
    const direction=(input.right?1:0)-(input.left?1:0);
    player.vx+=direction*.34;if(!direction)player.vx*=.76;
    player.vx=Math.max(-2.35,Math.min(2.35,player.vx));if(direction)player.facing=direction;
    if(jumpBuffer>0){if(coyote>0){player.vy=-6.4;coyote=0;jumpBuffer=0;player.grounded=false;tone(280,.13,'square',.025,550);burst(player.x+6,player.y+19,'#c9dfb0',5);}else jumpBuffer--;}
    if(!input.jump&&player.vy<-2.5)player.vy=-2.5;
    const previousBottom=player.y+player.h;player.vy=Math.min(player.vy+.31,7.5);
    moveBody(player,player.vx,player.vy);
    if(player.y>H+24){hurt(true);return;}
    for(const coin of level.coins)if(!coin.taken&&Math.abs(player.x+6-coin.x)<12&&Math.abs(player.y+10-coin.y)<15){coin.taken=true;gems++;burst(coin.x,coin.y,'#f9df99',8);tone(950,.1,'triangle',.07,1400);updateHud();}
    const cp=level.checkpoint;
    if(!cp.active&&player.x+player.w>cp.x&&player.x<cp.x+18&&player.y>170){cp.active=true;burst(cp.x+6,180,'#a9e5c6',18);toast('✦ 检查点已点亮');tone(660,.25,'triangle',.06,990);}
    for(const enemy of level.enemies){
      if(!enemy.alive)continue;
      const nextX=enemy.vx>0?enemy.x+enemy.w+1:enemy.x-1;
      if(!solid(Math.floor(nextX/T),Math.floor((enemy.y+enemy.h+2)/T))||solid(Math.floor(nextX/T),Math.floor(enemy.y/T)))enemy.vx=-enemy.vx;
      enemy.x+=enemy.vx;
      if(rects(player,enemy)){
        if(player.vy>0&&previousBottom<=enemy.y+5){enemy.alive=false;player.vy=input.jump?-5.2:-3.8;burst(enemy.x+7,enemy.y+5,'#b9cc93',12);tone(160,.1,'square',.035,380);}
        else if(!player.invincible){hurt();return;}
      }
    }
    for(const spike of level.spikes)if(!player.invincible&&rects(player,{x:spike.x+3,y:spike.y+3,w:10,h:5})){hurt();return;}
    if(player.x>level.goalX+4){finish();return;}
    const target=Math.max(0,Math.min(level.length*T-W,player.x-W*.35));camera+=(target-camera)*.12;
  }

  function rect(x,y,w,h,color){ctx.fillStyle=color;ctx.fillRect(Math.floor(x),Math.floor(y),w,h);}
  function polygon(points,color){ctx.fillStyle=color;ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill();}
  function cloud(x,y,scale=1){const c=levelIndex===2?'#8ba6ad':'#e6e6c4';rect(x,y,38*scale,5*scale,c);rect(x+6*scale,y-5*scale,26*scale,7*scale,c);rect(x+13*scale,y-9*scale,12*scale,6*scale,c);}
  function tree(x,y,s=1){
    rect(x-3*s,y-49*s,6*s,49*s,'#3c5748');rect(x+2*s,y-36*s,3*s,25*s,'#294c43');
    polygon([[x,y-93*s],[x-21*s,y-55*s],[x+21*s,y-55*s]],level.leaf);
    polygon([[x,y-77*s],[x-28*s,y-37*s],[x+28*s,y-37*s]],level.leaf);
    polygon([[x,y-62*s],[x-32*s,y-21*s],[x+32*s,y-21*s]],level.leaf);
    polygon([[x,y-87*s],[x-17*s,y-56*s],[x-4*s,y-56*s]],level.leafLight);
    polygon([[x-7*s,y-66*s],[x-24*s,y-40*s],[x-9*s,y-40*s]],level.leafLight);rect(x-17*s,y-34*s,5*s,2*s,level.leafLight);
  }
  function background(){
    rect(0,0,W,H,level.sky);rect(0,143,W,127,level.haze);
    if(levelIndex===2){
      for(let i=0;i<42;i++){const x=(i*71+19)%W,y=(i*31+7)%125;rect(x,y,i%7?1:2,1,i%3?'#9ebfc0':'#dce9ce');}
      rect(365-camera*.025,28,22,22,'#e7e7bb');rect(374-camera*.025,24,17,22,level.sky);
    }else{rect(369-camera*.025,30,26,26,'#edd9a4');rect(366-camera*.025,36,32,14,'#edd9a4');}
    for(let i=-1;i<7;i++)cloud(i*123-(camera*.12)%123,38+(i%3)*17,i%2?.8:1.2);
    for(let i=-1;i<6;i++){
      const x=i*147-(camera*.18)%147;
      polygon([[x-50,182],[x+34,75+(i%2)*22],[x+118,182]],level.mountain);
      polygon([[x+34,75+(i%2)*22],[x+37,124],[x+118,182]],level.mountain2);
      polygon([[x+34,75+(i%2)*22],[x+17,97+(i%2)*22],[x+34,91+(i%2)*22],[x+43,101+(i%2)*22]],level.haze);
    }
    polygon([[0,178],[60,159],[125,170],[204,151],[279,176],[355,148],[480,170],[480,270],[0,270]],level.mountain2);
    for(let i=-1;i<12;i++)tree(i*63-(camera*.42)%63,228,.55+(i%3)*.15);
    if(levelIndex>0)for(let i=-1;i<6;i++){
      const x=i*171-(camera*.6)%171;rect(x,124,14,100,level.mountain2);rect(x-4,122,22,7,level.mountain);rect(x-4,154,22,4,level.mountain);rect(x+4,132,3,80,level.mountain);
    }
    rect(0,245,W,25,level.water);for(let i=0;i<20;i++)rect((i*37+frame*.12)%W,250+i%4*5,12+i%3*6,1,level.haze);
  }
  function tileArt(x,y,type,tx,ty){
    rect(x,y,16,16,level.earth);
    if(type===2||!solid(tx,ty-1)){
      rect(x,y,16,4,level.moss);rect(x,y+4,16,2,level.brick);rect(x+2,y+4,3,3,level.moss);if(tx%2===0)rect(x+11,y+4,2,5,level.moss);rect(x+1,y,6,1,'#c4d293');
    }
    rect(x+1,y+8,6,4,level.brick);rect(x+9,y+6,6,4,level.brick);rect(x+7,y+13,7,2,level.brick);rect(x+2,y+9,4,1,levelIndex===2?'#57717a':'#768065');
    if((tx+ty)%4===0){rect(x+3,y+14,2,1,'#1c3937');rect(x+12,y+11,1,2,'#1c3937');}
  }
  function decorations(){
    for(let tx=Math.max(0,Math.floor(camera/T)-3);tx<Math.min(level.length,Math.ceil((camera+W)/T)+3);tx++){
      const x=tx*T-camera;
      if(solid(tx,14)){
        if(tx%11===3)tree(x+8,224,.85);
        if(tx%7===0){rect(x+3,220,2,4,level.moss);rect(x+1,218,2,3,level.moss);rect(x+7,219,2,5,level.moss);}
        if(tx%13===6){rect(x+7,219,2,5,'#68816b');rect(x+5,216,6,3,level.accent);rect(x+7,215,2,5,level.accent);}
        if(tx%17===9){rect(x+4,218,10,6,level.brick);rect(x+6,215,6,3,level.brick);rect(x+6,215,6,1,level.moss);}
      }
    }
    const sx=96-camera;rect(sx+6,207,3,17,'#6a6450');rect(sx,200,19,10,'#bdad78');rect(sx+4,204,9,2,'#536550');rect(sx+11,202,2,6,'#536550');
  }
  function checkpointArt(){
    const cp=level.checkpoint,x=Math.floor(cp.x-camera);rect(x+5,195,3,29,'#777b61');rect(x+4,222,5,2,'#c8c89e');
    const color=cp.active?'#b2edc5':'#7b9482';rect(x+8,195,12,10,color);rect(x+8,205,7,3,color);rect(x+11,197,3,5,cp.active?'#eaf6cf':'#b2be9c');
    if(cp.active){rect(x+5,188,3,3,'#eddf9d');if(frame%50<25)rect(x+11,182,1,2,'#e7eed2');}
  }
  function goalArt(){
    const x=Math.floor(level.goalX-camera),y=160;
    rect(x-5,y+59,43,5,level.brick);rect(x,y+10,8,50,level.brick);rect(x+25,y+10,8,50,level.brick);rect(x+4,y,25,10,level.brick);rect(x+8,y+10,17,50,'#183b3c');
    rect(x+2,y+7,6,3,level.moss);rect(x+22,y,8,3,level.moss);rect(x+26,y+27,6,3,level.moss);
    for(let i=0;i<4;i++){rect(x+1,y+17+i*11,6,1,level.earth);rect(x+26,y+13+i*11,6,1,level.earth);}
    ctx.globalAlpha=Math.sin(frame*.04)*.12+.65;rect(x+10,y+14,13,42,'#7bcbb0');rect(x+13,y+15,7,42,'#cfebae');ctx.globalAlpha=1;
    polygon([[x+16,y-10],[x+21,y-4],[x+16,y+2],[x+11,y-4]],level.accent);
    rect(x-12,y+36,3,23,level.brick);rect(x+41,y+36,3,23,level.brick);rect(x-13,y+31,5,5,'#efbe77');rect(x+40,y+31,5,5,'#efbe77');
    if(frame%20<10){rect(x-12,y+28,3,4,'#ffde9d');rect(x+41,y+28,3,4,'#ffde9d');}
  }
  const sprite=[
    '.....hhhhhh.....','....hhhhhhhh....','....hhsssssh....','....hssessss....','....hsssssss....','.....ssssss.....','....mmmmmmmm....','...mmccccccmm...','...ssccccccss...','...ssccccccss...','....cccccccc....','....ccbbcccc....','....cccccccc....','.....dddddd.....','.....dddddd.....','.....dd..dd.....','.....dd..dd.....','....bbb..bbb....','....bbb..bbb....'
  ];
  const spritePalette={h:'#443d36',s:'#edc192',e:'#243d3c',m:'#8ac8ac',c:'#d99158',b:'#634d40',d:'#3a5555'};
  function playerArt(){
    if(respawnTimer||(player.invincible>0&&frame%8<4))return;
    const x=Math.round(player.x-camera)-2,y=Math.round(player.y);
    ctx.save();ctx.translate(x+(player.facing<0?16:0),y);ctx.scale(player.facing,1);
    const walk=player.grounded&&Math.abs(player.vx)>.2?Math.floor(frame/7)%2:0;
    rect(-2,8,4,7,'#7c6951');rect(-1,9,2,2,'#b39a6a');rect(-4,6+walk,5,2,'#8ac8ac');rect(-5,7+walk,2,3,'#8ac8ac');
    sprite.forEach((row,sy)=>[...row].forEach((cell,sx)=>{if(cell!=='.'){const shift=sy>14?((sx<8?-1:1)*walk):0;rect(sx+shift,sy,1,1,spritePalette[cell]);}}));
    if(!player.grounded){rect(5,17,2,2,'#634d40');rect(11,15,3,2,'#634d40');}ctx.restore();
  }
  function enemyArt(enemy){
    const x=Math.floor(enemy.x-camera),y=Math.floor(enemy.y),bob=Math.floor(frame/15)%2;
    rect(x+1,y+5+bob,12,6,'#385d4e');rect(x+3,y+2+bob,8,6,'#9db779');rect(x+1,y+4+bob,12,4,'#9db779');
    rect(x+3,y+3+bob,3,1,'#c0cd90');rect(x+3,y+7+bob,2,2,'#213e38');rect(x+9,y+7+bob,2,2,'#213e38');rect(x+2,y+11,3,1,'#263f39');rect(x+9,y+11,3,1,'#263f39');
    rect(x+6,y-1+bob,1,4,'#567d54');rect(x+7,y-2+bob,3,2,'#7ba264');
  }
  function draw(){
    ctx.imageSmoothingEnabled=false;background();decorations();
    const start=Math.max(0,Math.floor(camera/T)),end=Math.min(level.length,Math.ceil((camera+W)/T)+1);
    for(let y=0;y<17;y++)for(let x=start;x<end;x++)if(level.tiles[y][x])tileArt(x*T-camera,y*T,level.tiles[y][x],x,y);
    for(const s of level.spikes){const x=s.x-camera;polygon([[x+1,224],[x+5,216],[x+9,224]],'#c6c1a0');polygon([[x+7,224],[x+12,216],[x+16,224]],'#e6d8b5');}
    for(const coin of level.coins){if(coin.taken||coin.x<camera-10||coin.x>camera+W+10)continue;const x=Math.floor(coin.x-camera),y=Math.floor(coin.y+Math.sin(frame*.06+coin.x)*2);polygon([[x,y-5],[x+4,y],[x,y+5],[x-4,y]],'#f0ca75');rect(x-1,y-3,2,4,'#fff0b1');if(frame%90<8)rect(x+7,y-6,2,2,'#f9f0c1');}
    checkpointArt();goalArt();for(const enemy of level.enemies)if(enemy.alive)enemyArt(enemy);playerArt();
    for(const p of particles){ctx.globalAlpha=Math.min(1,p.life/15);rect(p.x-camera,p.y,p.size,p.size,p.color);}ctx.globalAlpha=1;
    for(let i=0;i<8;i++){const x=(i*73+frame*.15)%W,y=50+(i*47)%170+Math.sin(frame*.02+i)*8;rect(x,y,2,levelIndex===2?2:1,levelIndex===2?'#b5d9ab':'#d9d69b');}
  }
  // Fixed simulation steps keep jumps and collisions consistent on 60/120/144 Hz displays.
  function tick(time){
    if(!lastTime)lastTime=time;accumulator+=Math.min(time-lastTime,100);lastTime=time;
    while(accumulator>=STEP){update();accumulator-=STEP;}draw();requestAnimationFrame(tick);
  }
  function resizeGame(){
    W=window.innerWidth<=600&&!document.fullscreenElement?360:480;
    canvas.width=W;canvas.style.aspectRatio=`${W} / ${H}`;
    camera=Math.max(0,Math.min(level.length*T-W,player.x-W*.35));
  }
  window.addEventListener('resize',resizeGame);document.addEventListener('fullscreenchange',resizeGame);
  loadLevel(0);resizeGame();showMenu('intro');requestAnimationFrame(tick);
})();

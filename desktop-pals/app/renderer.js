const $=id=>document.getElementById(id);
const bridge=window.desktop||{load:async()=>JSON.parse(localStorage.getItem('deskfur')||'{}'),save:async v=>{localStorage.setItem('deskfur',JSON.stringify(v));return v;},passthrough:()=>{},quit:()=>{},onShow:()=>{}};
if(!window.desktop)document.body.classList.add('preview');
const defaults={shimeji:true,startHidden:false,dual:false,fullness:70,bond:50,energy:80,expression:'neutral',name:'My pet',skin:'cream',size:128,speed:42,volume:.25,muted:false,relay:'',sprite:null,x:.35,y:.78};
let config={...defaults},local={id:'me',name:'My pet',skin:'cream',x:.35,y:.78,behavior:'idle',facing:1,sprite:null};
const buddy={id:'buddy',name:'Companion',skin:'fox',x:.6,y:.8,behavior:'idle',facing:-1,expression:'happy'};
const cursor={x:innerWidth*.5,y:innerHeight*.8};
let selected='me',actionUntil=0,action='',nextRandom=performance.now()+12000;
let lastSpriteSent=0,spriteSendTimer=null;
const peers=new Map(),images=new Map(),bubbles=new Map();
let socket=null,room='',myId='',desiredRoom='',reconnectAttempts=0,reconnectTimer=null,sleeping=false,playUntil=0,drag=null,previousTime=performance.now(),nextWander=0,direction=1,lastSend=0,lastSave=0,hover=false,saveTimer=null;
const canvas=$('pets'),ctx=canvas.getContext('2d');
function feedback(text){$('feedback').textContent=text;}
function persist(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{bridge.save({...config,x:local.x,y:local.y}).catch(()=>feedback('Could not save settings.'));},250);}
function safeRelay(value){try{const u=new URL(value);if(u.username||u.password||u.hash)throw Error();const parts=u.hostname.split('.').map(Number),privateIP=/^\d{1,3}(\.\d{1,3}){3}$/.test(u.hostname)&&parts.every(n=>n>=0&&n<=255)&&(parts[0]===10||(parts[0]===192&&parts[1]===168)||(parts[0]===172&&parts[1]>=16&&parts[1]<=31));if(u.protocol!=='wss:'&&!(u.protocol==='ws:'&&(privateIP||['localhost','127.0.0.1','[::1]'].includes(u.hostname))))throw Error();return u.href;}catch{throw Error('Use wss:// for internet play, or ws://localhost / a private LAN address for local testing.');}}
function loadImage(id,sprite){images.delete(id);if(!sprite)return;try{if(typeof sprite.image!=='string'||!sprite.image.startsWith('data:image/png;base64,')||sprite.image.length>2900000)return;const image=new Image();image.onload=()=>{if(image.width<=4096&&image.height<=4096)images.set(id,image);};image.src=sprite.image;}catch{}}
function send(value){if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify(value));}
function syncSprite(){if(!room)return;clearTimeout(spriteSendTimer);const delay=Math.max(0,2100-(performance.now()-lastSpriteSent));spriteSendTimer=setTimeout(()=>{if(room){send({type:'sprite',sprite:config.sprite});lastSpriteSent=performance.now();}},delay);}
function setSprite(sprite){config.sprite=sprite;local.sprite=sprite;loadImage('me',sprite);updateSpriteForm();persist();syncSprite();}
function updateSpriteForm(){const s=config.sprite;$('spriteInfo').textContent=s?`${s.name} · custom sprite shared with friends`:'Using an original built-in kemono pet.';if(s){const image=images.get('me');if(image){$('columns').value=Math.floor(image.width/s.frameWidth);$('rows').value=Math.floor(image.height/s.frameHeight);}else{const probe=new Image();probe.onload=()=>{$('columns').value=Math.floor(probe.width/s.frameWidth);$('rows').value=Math.floor(probe.height/s.frameHeight);};probe.src=s.image;}$('fps').value=s.fps;for(const key of ['idle','walk','sleep','play'])$('anim'+key[0].toUpperCase()+key.slice(1)).value=(s.animations[key]||s.animations.idle).join(',');for(const pose of ['sit','climb','hang','fall','jump','drag','land'])$('anim'+pose[0].toUpperCase()+pose.slice(1)).value=(s.animations[pose]||[]).join(',');}}
function status(text,online=false){$('connection').textContent=text;document.querySelector('.status').classList.toggle('online',online);$('roomBadge').textContent=room?`${peers.size+1} / 8 pals`:'';}
function people(){window.dispatchEvent(new Event('deskfur-room'));const to=$('messageTo'),old=to.value;to.replaceChildren(new Option('Everyone in room',''));for(const p of peers.values())to.add(new Option(p.name,p.id));to.value=old;const target=$('people');target.replaceChildren();for(const p of [local,...peers.values()]){const row=document.createElement('div');row.textContent=`✦ ${p.name}${p.id===local.id?' (you)':''}`;target.append(row);}$('roomBadge').textContent=room?`${peers.size+1} / 8 pals`:'';}
function message(text){const p=document.createElement('p');p.textContent=text;$('messages').append(p);while($('messages').children.length>30)$('messages').firstChild.remove();$('messages').scrollTop=$('messages').scrollHeight;}
function addPeer(p){if(!p||typeof p.id!=='string'||p.id===myId)return;const state=p.state||{};peers.set(p.id,{id:p.id,name:String(p.name).slice(0,24),skin:p.skin,...state,drawX:state.x??.5,drawY:state.y??.8,sprite:p.sprite||null});loadImage(p.id,p.sprite);}
function disconnect(manual=true){clearTimeout(reconnectTimer);if(manual)desiredRoom='';if(socket){socket.onclose=null;socket.close();socket=null;}room='';peers.clear();images.forEach((_,key)=>{if(key!=='me')images.delete(key);});$('roomInfo').hidden=true;status('Cozy offline');people();window.dispatchEvent(new Event('deskfur-room'));}
function connect(create=false,reconnecting=false){
 let url;try{url=safeRelay($('relay').value.trim());}catch(e){feedback(e.message);return;}
 const code=create?'':$('code').value.toUpperCase().replace(/[^A-Z0-9]/g,'');if(!create&&!code){feedback('Enter the room code your friend shared.');return;}
 disconnect(false);config.relay=url;persist();status(reconnecting?'Reconnecting…':'Connecting…');
 const ws=new WebSocket(url);socket=ws;
 const timeout=setTimeout(()=>{if(ws.readyState!==WebSocket.OPEN){feedback('Relay did not respond. Check its address or wait for it to wake up.');ws.close();}},25000);
 ws.onopen=()=>{clearTimeout(timeout);send({type:create?'create':'join',...(create?{}:{code}),name:config.name,skin:config.skin,state:state()});};
 ws.onmessage=e=>{try{const data=JSON.parse(e.data);queueMicrotask(()=>window.dispatchEvent(new CustomEvent('deskfur-message',{detail:data})));switch(data.type){
 case 'welcome':room=data.code;desiredRoom=room;myId=data.id;reconnectAttempts=0;peers.clear();for(const p of data.peers)addPeer(p);$('roomCode').textContent=room;$('code').value=room;$('roomInfo').hidden=false;status('Together online',true);feedback('Share your relay address and room code with your friend.');people();syncSprite();break;
 case 'profile':if(peers.has(data.id)){Object.assign(peers.get(data.id),{name:data.name,skin:data.skin});people();}break;
 case 'peer_joined':addPeer(data.peer);people();message(`${data.peer.name} joined your little gathering.`);break;
 case 'peer_left':peers.delete(data.id);images.delete(data.id);bubbles.delete(data.id);people();break;
 case 'state':if(peers.has(data.id))Object.assign(peers.get(data.id),data.state);break;
 case 'sprite':if(peers.has(data.id)){peers.get(data.id).sprite=data.sprite;loadImage(data.id,data.sprite);}break;
 case 'emote':bubbles.set(data.id,{text:emoteText(data.emote),until:performance.now()+2600});if(peers.has(data.id)){const p=peers.get(data.id);p.action=data.emote==='food'?'eat':(data.emote==='pet'?'pet':'');p.actionUntil=performance.now()+2600;}tone();break;
 case 'chat':{const name=peers.get(data.id)?.name||'Friend';message(`${name}${data.to?' (private)':''}: ${data.text}`);bubbles.set(data.id,{text:String(data.text).slice(0,40),until:performance.now()+4500});break;}
 case 'error':feedback(data.message||'The room request failed.');if(['ROOM_NOT_FOUND','ROOM_FULL','room_not_found','room_full'].includes(data.code))desiredRoom='';break;
 }}catch{feedback('The relay sent an invalid response.');}};
 ws.onerror=()=>feedback('Could not reach the relay. Check that both friends use the same live address.');
 ws.onclose=()=>{clearTimeout(timeout);if(socket!==ws)return;socket=null;room='';status('Connection lost');peers.clear();people();$('roomInfo').hidden=true;if(desiredRoom&&reconnectAttempts<5){reconnectAttempts++;$('code').value=desiredRoom;reconnectTimer=setTimeout(()=>connect(false,true),Math.min(10000,reconnectAttempts*2000));}else feedback('Offline. Create or rejoin a room when your relay is available.');};
}
function state(){return{pose:local.pose||local.behavior,expression:local.expression||'neutral',x:Math.min(1,Math.max(0,local.x)),y:Math.min(1,Math.max(0,local.y)),behavior:local.behavior,facing:local.facing};}
function emoteText(kind){return{heart:'♡',wave:'Hello! ✦',sleep:'Z z z',play:'✦ Yay!',food:'🍎 Nom nom!',pet:'♡ Purr…',time:'◷'}[kind]||'✦';}
function emote(kind){bubbles.set('me',{text:emoteText(kind),until:performance.now()+2600});send({type:'emote',emote:kind});playUntil=performance.now()+1800;if(kind==='sleep')sleeping=!sleeping;else sleeping=false;tone();}
let audio;function tone(){if(config.muted)return;try{audio||=new AudioContext();audio.resume();const osc=audio.createOscillator(),gain=audio.createGain();osc.type='sine';osc.frequency.setValueAtTime(620,audio.currentTime);osc.frequency.exponentialRampToValueAtTime(900,audio.currentTime+.12);gain.gain.setValueAtTime(config.volume*.15,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.18);osc.connect(gain).connect(audio.destination);osc.start();osc.stop(audio.currentTime+.2);}catch{}}
function showPanel(show){$('panel').hidden=!show;$('restore').hidden=show;config.startHidden=!show;persist();if(show){bridge.passthrough(false);lastIgnore=false;}}
function resize(){const dpr=window.devicePixelRatio||1;canvas.width=Math.round(innerWidth*dpr);canvas.height=Math.round(innerHeight*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);}
function petAt(x,y){const all=[local,...(config.dual?[buddy]:[]),...peers.values()];return all.reverse().find(p=>{const px=(p.drawX??p.x)*innerWidth,py=(p.drawY??p.y)*innerHeight;return Math.abs(x-px)<config.size*.48&&y<py+10&&y>py-config.size*1.08;});}
canvas.addEventListener('pointerdown',e=>{const pet=petAt(e.clientX,e.clientY);if(e.button!==0||!pet)return;if(pet.id==='me'||pet.id==='buddy'){selected=pet.id;feedback(`Selected ${pet.name}.`);drag={pet,dx:e.clientX-pet.x*innerWidth,dy:e.clientY-pet.y*innerHeight,lastX:e.clientX,lastY:e.clientY,lastTime:performance.now(),vx:0,vy:0};if(config.shimeji)PetMotion.grab(pet);bridge.passthrough(false);lastIgnore=false;canvas.setPointerCapture(e.pointerId);sleeping=false;}});
canvas.addEventListener('pointermove',e=>{cursor.x=e.clientX;cursor.y=e.clientY;if(drag){const now=performance.now(),dt=Math.max(.008,(now-drag.lastTime)/1000);drag.vx=Math.max(-1200,Math.min(1200,(e.clientX-drag.lastX)/dt));drag.vy=Math.max(-1200,Math.min(1200,(e.clientY-drag.lastY)/dt));drag.lastX=e.clientX;drag.lastY=e.clientY;drag.lastTime=now;drag.pet.x=Math.min(.97,Math.max(.03,(e.clientX-drag.dx)/innerWidth));drag.pet.y=Math.min(.98,Math.max(config.size/innerHeight,(e.clientY-drag.dy)/innerHeight));drag.pet.behavior='play';}});
function releaseDrag(){if(drag&&config.shimeji)PetMotion.release(drag.pet,{vx:performance.now()-drag.lastTime<120?drag.vx:0,vy:performance.now()-drag.lastTime<120?drag.vy:0});drag=null;persist();}
canvas.addEventListener('pointerup',releaseDrag);canvas.addEventListener('pointercancel',releaseDrag);window.addEventListener('blur',()=>{releaseDrag();$('petMenu').hidden=true;});
canvas.addEventListener('dblclick',e=>{const p=petAt(e.clientX,e.clientY);if(p){if(p.id==='buddy')selected='buddy';else selected='me';care('pet');}});
let lastIgnore=null;document.addEventListener('pointermove',e=>{const element=document.elementFromPoint(e.clientX,e.clientY);hover=!!petAt(e.clientX,e.clientY);const ignore=!drag&&!hover&&!element?.closest('#panel,#restore,#petMenu');if(ignore!==lastIgnore){lastIgnore=ignore;bridge.passthrough(ignore);}});
function drawBubble(p,x,y,now){const bubble=bubbles.get(p.id);if(!bubble||bubble.until<now)return;const text=bubble.text;ctx.font='14px Segoe UI,sans-serif';const width=Math.min(300,ctx.measureText(text).width+24);ctx.fillStyle='#fffdf8';ctx.beginPath();ctx.roundRect(x-width/2,y-config.size-40,width,31,12);ctx.fill();ctx.fillStyle='#55715d';ctx.textAlign='center';ctx.fillText(text,x,y-config.size-20,width-14);}
function frame(now){const dt=Math.min(.05,(now-previousTime)/1000);previousTime=now;const time=now/1000;
 if(config.shimeji){
  PetMotion.update(local,dt,{width:innerWidth,height:innerHeight,size:config.size,speed:config.speed,paused:!!drag&&drag.pet===local,sleeping,target:cursor});
  if(!drag&&now<playUntil&&local.behavior!=='sleep'&&['idle','sit','walk'].includes(local.pose))local.behavior='play';
 }else{
 if(!drag||drag.pet!==local){if(sleeping)local.behavior='sleep';else if(now<playUntil)local.behavior='play';else if(config.speed>0){if(now>nextWander){direction=Math.random()<.5?-1:1;nextWander=now+3000+Math.random()*4000;}local.x+=direction*config.speed*dt/innerWidth;if(local.x<.05){local.x=.05;direction=1;}if(local.x>.95){local.x=.95;direction=-1;}local.facing=direction;local.behavior='walk';}else local.behavior='idle';}
  local.pose=local.behavior;
 }
 if(now<actionUntil){local.action=selected==='me'?action:'';if(config.dual)buddy.action=selected==='buddy'?action:'';}else{local.action='';buddy.action='';}
 config.fullness=Math.max(0,config.fullness-dt*.04);config.energy=Math.min(100,Math.max(0,config.energy+dt*(sleeping?.25:-.01)));
 local.expression=sleeping?'sleepy':(now<actionUntil?'happy':(config.fullness<15?'sad':config.expression));
 if(config.dual&&config.shimeji){PetMotion.update(buddy,dt,{width:innerWidth,height:innerHeight,size:config.size,speed:config.speed*.8,paused:!!drag&&drag.pet===buddy,target:cursor});}
 else{
 if(config.dual&&(!drag||drag.pet!==buddy)){buddy.x+=Math.sin(time*.25)*config.speed*dt*.4/innerWidth;buddy.x=Math.min(.93,Math.max(.08,buddy.x));buddy.facing=Math.sin(time*.25)>0?1:-1;buddy.behavior=config.speed?'walk':'idle';if(Math.abs(buddy.y-local.y)*innerHeight<config.size*.5&&Math.abs(buddy.x-local.x)*innerWidth<config.size*.8)buddy.x=Math.min(.94,Math.max(.06,local.x+(buddy.x<local.x?-1:1)*config.size*.85/innerWidth));}
  buddy.pose=buddy.behavior;
 }
 if(now>nextRandom&&!sleeping){nextRandom=now+16000+Math.random()*22000;const phrases=['✦ Stretch!','A little break?','♡','How is your day?','Yawn…'];bubbles.set('me',{text:phrases[Math.floor(Math.random()*phrases.length)],until:now+2800});playUntil=now+1400;}
 $('fullness').textContent=Math.round(config.fullness);$('bond').textContent=Math.round(config.bond);$('energy').textContent=Math.round(config.energy);
 if(room&&now-lastSend>100){send({type:'state',state:state()});lastSend=now;}
 if(now-lastSave>10000){lastSave=now;persist();}
 ctx.clearRect(0,0,innerWidth,innerHeight);
 const sorted=[local,...(config.dual?[buddy]:[]),...peers.values()].sort((a,b)=>a.y-b.y);
 for(const p of sorted){if(p.actionUntil&&now>p.actionUntil)p.action='';if(p!==local&&p!==buddy){p.drawX+=(p.x-p.drawX)*Math.min(1,dt*12);p.drawY+=(p.y-p.drawY)*Math.min(1,dt*12);}const x=(p.drawX??p.x)*innerWidth,y=(p.drawY??p.y)*innerHeight;PetArt.draw(ctx,p,x,y,config.size,time,images.get(p.id));ctx.font='11px Segoe UI,sans-serif';ctx.textAlign='center';ctx.fillStyle='#fffdf7dc';const labelWidth=ctx.measureText(p.name).width+16;ctx.beginPath();ctx.roundRect(x-labelWidth/2,y+7,labelWidth,19,8);ctx.fill();ctx.fillStyle='#2e4c3f';ctx.fillText(p.name,x,y+20);drawBubble(p,x,y,now);}
 requestAnimationFrame(frame);
}
document.querySelectorAll('.tab').forEach(button=>button.onclick=()=>{document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('selected',b===button));for(const tab of ['pet','friends','sprites','games'])$(tab+'Tab').hidden=tab!==button.dataset.tab;});
document.querySelectorAll('[data-skin]').forEach(button=>button.onclick=()=>{config.skin=button.dataset.skin;local.skin=config.skin;setSprite(null);document.querySelectorAll('[data-skin]').forEach(b=>b.classList.toggle('selected',b===button));if(room)send({type:'profile',name:config.name,skin:config.skin});persist();});
$('name').onchange=()=>{config.name=$('name').value.trim().slice(0,24)||'My pet';local.name=config.name;persist();people();if(room)send({type:'profile',name:config.name,skin:config.skin});};
for(const key of ['size','speed'])$(key).oninput=()=>{config[key]=Number($(key).value);$(key+'Value').textContent=config[key]+(key==='size'?' px':'');persist();};
function care(kind){const target=selected==='buddy'&&config.dual?buddy:local;action=kind;actionUntil=performance.now()+3000;target.action=kind;target.expression='happy';const text=kind==='eat'?'🍎 Nom nom!':'♡ Purr…';bubbles.set(target.id,{text,until:actionUntil});if(kind==='eat')config.fullness=Math.min(100,config.fullness+20);else config.bond=Math.min(100,config.bond+8);playUntil=actionUntil;sleeping=false;if(target===local)send({type:'emote',emote:kind==='eat'?'food':'pet'});feedback(`${target.name} ${kind==='eat'?'enjoyed a snack.':'enjoys the attention.'}`);tone();persist();}
 function tellTime(){const text=new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date());const target=selected==='buddy'&&config.dual?buddy:local;bubbles.set(target.id,{text:`It's ${text}`,until:performance.now()+6000});feedback(`Your local time: ${text}`);}
 $('askForm').onsubmit=e=>{e.preventDefault();const query=$('ask').value.trim().toLowerCase();if(query.includes('time'))tellTime();else if(/eat|food|feed|snack/.test(query))care('eat');else if(/pet|cuddle/.test(query))care('pet');else if(/sleep|nap/.test(query)){if(!sleeping)emote('sleep');}else if(/wake|walk/.test(query)){sleeping=false;feedback('Time for a little walk.');}else{feedback('Try: what time is it, snack, pet, sleep, or walk.');}$('ask').value='';};
 $('feed').onclick=()=>care('eat');$('petting').onclick=()=>care('pet');$('time').onclick=tellTime;
 $('dual').onchange=()=>{config.dual=$('dual').checked;if(config.dual){buddy.x=local.x<.5?Math.min(.9,local.x+.22):Math.max(.1,local.x-.22);buddy.y=local.y;if(config.shimeji)PetMotion.command(buddy,'fall');}if(!config.dual)selected='me';persist();feedback(config.dual?'A local companion has joined your desktop.':'Single-pet mode.');};
 $('expression').onchange=()=>{config.expression=$('expression').value;local.expression=config.expression;persist();};
 $('mute').onchange=()=>{config.muted=$('mute').checked;persist();};
$('wave').onclick=()=>emote('wave');$('heart').onclick=()=>emote('heart');$('sleep').onclick=()=>emote('sleep');$('hide').onclick=()=>showPanel(false);$('show').onclick=()=>showPanel(true);$('quit').onclick=()=>bridge.quit();
$('create').onclick=()=>connect(true);$('join').onclick=()=>connect(false);$('leave').onclick=()=>{send({type:'leave'});disconnect();};
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText(room);feedback('Room code copied. Share the relay address too.');}catch{feedback('Select the room code and copy it manually.');}};
$('chatForm').onsubmit=e=>{e.preventDefault();const text=$('chat').value.trim().slice(0,140);if(/^(\/time|what(?:’s| is|s)? the time\??|what time is it\??|time)$/i.test(text)){tellTime();$('chat').value='';return;}if(!room){feedback('Join a room to send messages. Type /time to ask your pet the time.');return;}if(text){const to=$('messageTo').value;send({type:'chat',text,...(to?{to}:{})});message(`${config.name}${to?' (private)':''}: ${text}`);$('chat').value='';}};
$('import').onclick=async()=>{if(!bridge.importSprite){feedback('Open the desktop app to import PNGs or sprite packs.');return;}const result=await bridge.importSprite();if(result?.error)feedback(result.error);else if(result?.sprite){setSprite(result.sprite);feedback('Sprite imported. Adjust animation frames below.');}};
$('applySprite').onclick=()=>{try{const s=config.sprite,image=images.get('me');if(!s||!image)throw Error('Import a PNG first.');const columns=Number($('columns').value),rows=Number($('rows').value),fps=Number($('fps').value);if(!Number.isInteger(columns)||!Number.isInteger(rows)||columns<1||rows<1||columns*rows>256||image.width%columns||image.height%rows)throw Error('Use a matching grid, at most 256 equal-sized frames.');if(!Number.isInteger(fps)||fps<1||fps>24)throw Error('FPS must be between 1 and 24.');const animations={...s.animations};for(const key of ['idle','walk','sleep','play']){const indices=$('anim'+key[0].toUpperCase()+key.slice(1)).value.split(',').map(n=>Number(n.trim()));if(!indices.length||indices.length>64||indices.some(n=>!Number.isInteger(n)||n<0||n>=columns*rows))throw Error(`${key}: use valid frame numbers from 0 to ${columns*rows-1}.`);animations[key]=indices;}for(const pose of ['sit','climb','hang','fall','jump','drag','land']){const raw=$('anim'+pose[0].toUpperCase()+pose.slice(1)).value.trim();if(!raw){delete animations[pose];continue;}const indices=raw.split(',').map(n=>Number(n.trim()));if(indices.length>64||indices.some(n=>!Number.isInteger(n)||n<0||n>=columns*rows))throw Error(`${pose}: use valid frame numbers from 0 to ${columns*rows-1}.`);animations[pose]=indices;}setSprite({...s,frameWidth:image.width/columns,frameHeight:image.height/rows,fps,animations});feedback('Animation settings applied and saved.');}catch(e){feedback(e.message);}};
$('export').onclick=async()=>{if(!config.sprite){feedback('Import a sprite first, then export its editable pack.');return;}if(!bridge.exportSprite){feedback('Export is available in the desktop app.');return;}const result=await bridge.exportSprite(config.sprite);if(result?.error)feedback(result.error);else if(result)feedback('Sprite pack exported: PNG + editable JSON.');};
$('builtin').onclick=()=>{setSprite(null);feedback('Using the built-in kemono pet.');};
bridge.onShow(()=>showPanel(true));window.addEventListener('keydown',e=>{if(e.ctrlKey&&e.shiftKey&&e.code==='KeyP')showPanel(true);});window.addEventListener('resize',resize);
(async()=>{try{config={...defaults,...await bridge.load()};}catch{}Object.assign(local,{name:config.name,skin:config.skin,x:config.x,y:config.y,sprite:config.sprite});$('name').value=config.name;$('relay').value=config.relay;$('mute').checked=config.muted;$('shimeji').checked=config.shimeji;$('dual').checked=config.dual;$('expression').value=config.expression;for(const key of ['size','speed']){$(key).value=config[key];$(key+'Value').textContent=config[key]+(key==='size'?' px':'');}document.querySelectorAll('[data-skin]').forEach(b=>b.classList.toggle('selected',b.dataset.skin===config.skin));loadImage('me',config.sprite);updateSpriteForm();resize();if(config.shimeji){PetMotion.command(local,'fall');if(config.dual)PetMotion.command(buddy,'fall');}if(config.startHidden)showPanel(false);requestAnimationFrame(frame);})();
// Narrow test/diagnostic surface; contains no filesystem or Electron privileges.
window.pawPals={getState:()=>({config,local,buddy,peers:[...peers.values()],room,myId}),setPosition:(x,y)=>{local.x=x;local.y=y;},setSprite};

window.deskFur={send,getState:()=>({config,local,buddy,peers:[...peers.values()],room,myId}),feedback,emote};

function chosenPet(){return selected==='buddy'&&config.dual?buddy:local;}
function commandPet(command){
 if(!config.shimeji){config.shimeji=true;$('shimeji').checked=true;}
 const pet=chosenPet();sleeping=false;playUntil=0;
 PetMotion.command(pet,command,cursor);$('petMenu').hidden=true;persist();
 feedback(`${pet.name}: ${{walk:'off exploring.',sit:'taking a little rest.',jump:'hop!',climb:'climbing the screen.',follow:'following your cursor.',fall:'letting go.'}[command]||command}`);
}
$('shimeji').onchange=()=>{config.shimeji=$('shimeji').checked;for(const pet of [local,buddy]){delete pet.motion;PetMotion.command(pet,config.shimeji?'fall':'sit');if(!config.shimeji)pet.pose=pet.behavior;}persist();feedback(config.shimeji?'Shimeji-style movement enabled.':'Classic wandering enabled.');};
$('sit').onclick=()=>commandPet('sit');$('jump').onclick=()=>commandPet('jump');$('roam').onclick=()=>commandPet('walk');
canvas.addEventListener('contextmenu',e=>{const pet=petAt(e.clientX,e.clientY);if(!pet||!['me','buddy'].includes(pet.id))return;e.preventDefault();selected=pet.id;$('menuPetName').textContent=pet.name;$('petMenu').hidden=false;$('petMenu').style.left=Math.max(8,Math.min(innerWidth-240,e.clientX))+'px';$('petMenu').style.top=Math.max(8,Math.min(innerHeight-440,e.clientY))+'px';bridge.passthrough(false);lastIgnore=false;});
document.querySelectorAll('#petMenu [data-command]').forEach(b=>b.onclick=()=>commandPet(b.dataset.command));
$('menuCareFeed').onclick=()=>{care('eat');$('petMenu').hidden=true;};$('menuCarePet').onclick=()=>{care('pet');$('petMenu').hidden=true;};
$('menuSettings').onclick=()=>{showPanel(true);$('petMenu').hidden=true;};$('menuDuo').onclick=()=>{$('dual').checked=!config.dual;$('dual').dispatchEvent(new Event('change'));$('petMenu').hidden=true;};
document.addEventListener('pointerdown',e=>{if(!e.target.closest('#petMenu'))$('petMenu').hidden=true;});
window.deskFur.commandPet=commandPet;

/* DeskFur's shared tabletop. Room actions and outcomes are owned by the relay. */
(()=>{
 'use strict';
 const modes={ttt:{title:'Tic-tac-toe',icon:'✕ ○',hint:'Three in a row. You and a friend take turns.'},rps:{title:'Rock, paper, scissors',icon:'✊',hint:'Pick in secret. Both choices reveal together.'},cards:{title:'High Card',icon:'♠',hint:'Draw one card each. Highest card wins; ace is high.'}};
 let selected='ttt',game=null,opponent='',lastRoom='',rollCount=0;
 const $=id=>document.getElementById(id);
 const api=()=>window.deskFur;
 const state=()=>api()?.getState()||{room:'',peers:[],local:{name:'You'},myId:''};
 const selfId=()=>state().myId||state().local?.id||'me';
 const peers=()=>{const value=state().peers;return value instanceof Map?[...value.values()]:Array.isArray(value)?value:[];};
 const name=id=>id===selfId()?'You':peers().find(p=>p.id===id)?.name||'Your friend';
 function element(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=String(text);return node;}
 function button(text,fn,className=''){const node=element('button',className,text);node.type='button';node.addEventListener('click',fn);return node;}
 function feedback(text){api()?.feedback(text);}
 function send(value){if(!state().room){feedback('Join your friend’s room first. Dice also work offline.');return;}api()?.send(value);}
 function randomInteger(max){const limit=Math.floor(0x100000000/max)*max;const values=new Uint32Array(1);do{crypto.getRandomValues(values);}while(values[0]>=limit);return values[0]%max+1;}
 function mount(){
  let root=$('gamesTab');if(!root){root=element('section','tab-content');root.id='gamesTab';root.hidden=true;$('panel')?.append(root);}if(!root)return;
  const intro=element('div','intro');intro.append(element('h2','','A little tabletop magic'),element('p','','Challenge a friend, share a lucky roll, and cheer each other on.'));
  const modesEl=element('div','game-modes');modesEl.setAttribute('role','group');modesEl.setAttribute('aria-label','Choose a game');
  for(const [key,mode] of Object.entries(modes)){const item=button('',()=>{selected=key;render();},'game-mode');item.id='game-mode-'+key;item.append(element('span','game-mode-icon',mode.icon),element('span','',key==='ttt'?'Tic-tac-toe':key==='rps'?'RPS':'High Card'));item.setAttribute('aria-label',mode.title);modesEl.append(item);}
  const setup=element('div','game-setup');const opponentLabel=element('label','','Play with');opponentLabel.htmlFor='game-opponent';const opponentSelect=element('select');opponentSelect.id='game-opponent';opponentSelect.addEventListener('change',()=>{opponent=opponentSelect.value;});opponentLabel.append(opponentSelect);setup.append(opponentLabel);
  const start=button('Invite to play',()=>{opponent=$('game-opponent').value;if(!opponent){feedback('Invite a friend to your room to play together.');return;}send({type:'game',action:'start',game:selected,opponent});},'primary');start.id='game-start';setup.append(start);
  const note=element('p','hint');note.id='game-room-note';setup.append(note);
  const table=element('div','game-table');table.id='game-table';table.setAttribute('aria-live','polite');table.setAttribute('aria-atomic','false');
  const dice=element('div','game-dice-section');const heading=element('div','game-section-heading');heading.append(element('h3','','A roll of destiny'),element('span','game-badge','d20 & friends'));dice.append(heading,element('p','hint','Roll together in a room, or practise offline. No stakes, just luck.'));
  const diceForm=element('form','game-dice-form');diceForm.id='game-dice-form';const sideLabel=element('label','','Die');sideLabel.htmlFor='game-die';const die=element('select');die.id='game-die';for(const sides of [4,6,8,10,12,20,100]){const option=element('option','',`D${sides}`);option.value=sides;option.selected=sides===20;die.append(option);}sideLabel.append(die);
  const modLabel=element('label','','Modifier');modLabel.htmlFor='game-modifier';const modifier=element('input');modifier.id='game-modifier';modifier.type='number';modifier.value='0';modifier.min='-20';modifier.max='20';modifier.step='1';modLabel.append(modifier);
  const roll=element('button','game-roll','Roll ✦');roll.id='game-roll';roll.type='submit';diceForm.append(sideLabel,modLabel,roll);diceForm.addEventListener('submit',event=>{event.preventDefault();const sides=Number(die.value),mod=Number(modifier.value);if(!Number.isInteger(mod)||mod< -20||mod>20){feedback('Choose a whole-number modifier from −20 to +20.');return;}if(state().room)send({type:'roll',sides,modifier:mod});else{const result=randomInteger(sides);addRoll({id:selfId(),sides,roll:result,modifier:mod,total:result+mod,natural20:sides===20&&result===20,natural1:sides===20&&result===1},true);}});
  const result=element('div','game-dice-result');result.id='game-dice-result';result.setAttribute('role','status');result.append(element('span','game-dice-number','✦'),element('span','game-dice-caption','Your next adventure starts with a roll.'));
  const history=element('ol','game-roll-history');history.id='game-roll-history';history.setAttribute('aria-label','Recent dice rolls');dice.append(diceForm,result,history);root.replaceChildren(intro,modesEl,setup,table,dice);render();
 }
 function updateOpponents(){const target=$('game-opponent');if(!target)return;const options=peers().filter(peer=>peer.id!==selfId());const existing=opponent||target.value;target.replaceChildren();if(!options.length){const empty=element('option','',state().room?'Waiting for your friend…':'Join a room to play');empty.value='';target.append(empty);}else for(const peer of options){const item=element('option','',peer.name||'Friend');item.value=peer.id;target.append(item);}target.value=options.some(peer=>peer.id===existing)?existing:options[0]?.id||'';opponent=target.value;target.disabled=!options.length;$('game-start').disabled=!state().room||!options.length||!!game&&game.status!=='finished';$('game-room-note').textContent=state().room?'One shared game table per room. Everyone can watch.':'Join the same relay and room in Friends to play online.';}
 function render(){
  if(!$('game-table'))return;updateOpponents();for(const key of Object.keys(modes)){$('game-mode-'+key).classList.toggle('selected',selected===key);$('game-mode-'+key).setAttribute('aria-pressed',String(selected===key));}
  const table=$('game-table');table.replaceChildren();const current=game?modes[game.kind]:modes[selected];if(!current)return;const title=element('h3','',current.title);table.append(title);
  if(!game){table.append(element('p','hint',current.hint));const empty=element('div','game-empty',selected==='ttt'?'✕   ·   ○':selected==='rps'?'✊   ✋   ✌':'♠   ♥   ♣   ♦');empty.setAttribute('aria-hidden','true');table.append(empty);return;}
  const participants=Array.isArray(game.players)?game.players:[];const participating=participants.includes(selfId());const host=participants[0],guest=participants[1];table.append(element('p','game-players',`${name(host)}  ·  ${name(guest)}`));
  if(game.status==='invited'){
   table.append(element('p','game-invite',selfId()===guest?`${name(host)} invited you to play!`:selfId()===host?`Waiting for ${name(guest)} to accept…`:`${name(host)} invited ${name(guest)} to play.`));
   const actions=element('div','game-actions');if(selfId()===guest){actions.append(button('Accept',()=>send({type:'game',action:'accept'}),'primary'),button('Decline',()=>send({type:'game',action:'cancel'})));}else if(selfId()===host)actions.append(button('Cancel invitation',()=>send({type:'game',action:'cancel'})));table.append(actions);return;
  }
  if(game.kind==='ttt')drawTicTacToe(table,participating);
  else if(game.kind==='rps')drawRps(table,participating);
  else if(game.kind==='cards')drawCards(table,participating);
  if(game.status==='finished'){
   const outcome=game.draw?'A friendly tie!':game.winner===selfId()?'You win! ✦':`${name(game.winner)} wins! ✦`;const result=element('p','game-outcome',outcome);result.setAttribute('role','status');table.append(result);
   if(participating)table.append(button('Clear table / play again',()=>send({type:'game',action:'cancel'}),'game-reset'));
  }else if(participating)table.append(button('Leave this game',()=>send({type:'game',action:'cancel'}),'text game-cancel'));
  else table.append(element('p','hint','You’re watching your friends play.'));
 }
 function drawTicTacToe(table,participating){
  const symbol=game.players.indexOf(selfId())===0?'X':'O';const line=game.status==='finished'?'The board is complete.':game.turn===selfId()?`Your turn — place ${symbol}.`:`${name(game.turn)}’s turn.`;table.append(element('p','game-turn',line));
  const board=element('div','game-board');board.setAttribute('role','group');board.setAttribute('aria-label','Tic-tac-toe board');for(let cell=0;cell<9;cell++){const value=game.board?.[cell];const tile=button(value||'·',()=>send({type:'game',action:'move',cell}),'game-cell');tile.id='game-cell-'+cell;tile.classList.toggle('game-cross',value==='X');tile.classList.toggle('game-circle',value==='O');tile.setAttribute('aria-label',`Row ${Math.floor(cell/3)+1}, column ${cell%3+1}: ${value||'empty'}`);tile.disabled=!participating||game.status!=='active'||game.turn!==selfId()||!!value;board.append(tile);}table.append(board);
 }
 function drawRps(table,participating){
  const choices={rock:{icon:'✊',label:'Rock'},paper:{icon:'✋',label:'Paper'},scissors:{icon:'✌',label:'Scissors'}};
  if(game.status==='finished'){
   const reveal=element('div','game-reveal');for(const id of game.players){const selection=choices[game.choices?.[id]];const item=element('div','game-choice-card');item.append(element('span','game-choice-icon',selection?.icon||'?'),element('strong','',selection?.label||'Unknown'),element('span','',name(id)));reveal.append(item);}table.append(reveal);return;
  }
  const chosen=Array.isArray(game.chosen)?game.chosen:[];const already=chosen.includes(selfId());table.append(element('p','game-turn',participating?already?'Choice locked. Waiting for your friend…':'Make your secret choice.':`${chosen.length} / 2 choices locked in.`));
  const buttons=element('div','game-rps');for(const [key,choice] of Object.entries(choices)){const pick=button('',()=>send({type:'game',action:'choose',choice:key}),'game-choice');pick.id='game-choice-'+key;pick.append(element('span','game-choice-icon',choice.icon),element('span','',choice.label));pick.disabled=!participating||already;buttons.append(pick);}table.append(buttons);
 }
 function drawCards(table,participating){
  const suits={clubs:'♣',diamonds:'♦',hearts:'♥',spades:'♠'};const drawn=Array.isArray(game.drawn)?game.drawn:[];const reveal=game.status==='finished';
  const row=element('div','game-reveal');for(const id of game.players){const card=game.draws?.find(draw=>draw.id===id);const item=element('div','game-card');if(reveal&&card){const rank=({11:'J',12:'Q',13:'K',14:'A'})[card.rank]||String(card.rank);item.classList.toggle('red',card.suit==='hearts'||card.suit==='diamonds');item.setAttribute('aria-label',`${name(id)}: ${rank} of ${card.suit}`);item.append(element('strong','game-card-rank',rank),element('span','game-card-suit',suits[card.suit]||'?'));}else{item.classList.add('game-card-back');item.append(element('span','game-card-suit',drawn.includes(id)?'✦':'?'));}item.append(element('span','game-card-owner',name(id)));row.append(item);}table.append(row);
  if(!reveal){const already=drawn.includes(selfId());table.append(element('p','game-turn',already?'Card drawn. Waiting for your friend…':'Both cards reveal after everyone draws.'));if(participating){const draw=button('Draw my card',()=>send({type:'game',action:'draw'}),'primary');draw.id='game-draw';draw.disabled=already;table.append(draw);}}
 }
 function addRoll(data,offline=false){
  if(!$('game-dice-result')||![4,6,8,10,12,20,100].includes(data.sides)||!Number.isInteger(data.roll)||data.roll<1||data.roll>data.sides)return;
  const modifier=Number.isInteger(data.modifier)?data.modifier:0;const total=data.roll+modifier;const caption=`${name(data.id)} · D${data.sides}${modifier?modifier>0?` + ${modifier}`:` − ${-modifier}`:''} · ${data.natural20?'Natural 20!':data.natural1?'Natural 1!':`rolled ${data.roll}`}${offline?' · offline':''}`;
  const result=$('game-dice-result');result.classList.remove('game-dice-pop');void result.offsetWidth;result.classList.add('game-dice-pop');result.classList.toggle('game-dice-critical',!!data.natural20);result.replaceChildren(element('span','game-dice-number',total),element('span','game-dice-caption',caption));
  const item=element('li','',`${name(data.id)} rolled ${total} (D${data.sides}: ${data.roll}${modifier?modifier>0?` + ${modifier}`:` − ${-modifier}`:''})${offline?' · offline':''}`);$('game-roll-history').prepend(item);while($('game-roll-history').children.length>6)$('game-roll-history').lastChild.remove();rollCount++;if(data.id===selfId())feedback(data.natural20?'Natural 20! ✦':`Rolled ${total} on D${data.sides}${offline?' · offline':''}.`);
 }
 window.addEventListener('deskfur-message',event=>{const data=event.detail;if(!data||typeof data!=='object')return;if(data.type==='welcome'){game=data.game||null;lastRoom=state().room;render();}else if(data.type==='game_state'){game=data.game||null;render();if(data.reason==='invite_expired')feedback('The game invitation expired. Send a fresh invitation to play.');else if(data.reason==='player_left')feedback('The game ended because a player left the room.');}else if(data.type==='dice')addRoll(data);});
 window.addEventListener('deskfur-room',()=>{const room=state().room;if(room!==lastRoom){game=null;lastRoom=room;}render();});
 mount();lastRoom=state().room;
 // Read-only diagnostics for integration tests and support.
 window.deskFurGames={getState:()=>({selected,game,rollCount})};
})();

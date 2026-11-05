const MEMBERS = [
'王俊凯','王源','易烊千玺','马嘉祺','丁程鑫','宋亚轩','刘耀文','张真源','严浩翔','贺峻霖',
'朱志鑫','张泽禹','张极','左航','苏新皓','童禹坤','穆祉丞','邓佳鑫','黄朔','张子墨','张峻豪','余宇涵',
'官俊臣','张桂源','张函瑞','王橹杰','左奇函','陈奕恒','杨博文','杨涵博','张奕然','聂玮辰','陈思罕','魏子宸','李煜东','陈浚铭','王烁然'
].map((name,i)=>({name, img:`/assets/member${String(i+1).padStart(2,'0')}.jpg`}));

function shuffle(items) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function makeCode() {
  const bytes = new Uint8Array(3);
  crypto.getRandomValues(bytes);
  return [...bytes].map(x => x.toString(16).padStart(2,'0')).join('').toUpperCase();
}
function json(data, status=200) {
  return new Response(JSON.stringify(data), {status, headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
}
function publicState(room, pid) {
  const slot = room.players.findIndex(p => p && p.id === pid);
  if (slot < 0) return {error:'你不在这个房间里'};
  const other = room.players[1-slot];
  return {
    code:room.code,
    players:room.players.map(p=>p?{name:p.name,connected:true}:null),
    slot, started:room.started, pool:room.pool, mySecret:room.secrets[slot],
    turn:room.turn, phase:room.phase, pending:room.pending, log:room.log,
    winner:room.winner, loser:room.loser, endReason:room.endReason,
    revealedSecret:room.winner!==null?room.secrets[1-slot]:null,
    canStart:slot===0 && !!other && !room.started,
    otherName:other?.name||'等待对手加入',
    isMyTurn:room.started && room.turn===slot && room.winner===null,
    canAnswer:room.started && room.phase==='answer' && room.turn!==slot && room.winner===null
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      if (request.method !== 'POST') return json({error:'POST only'},405);
      const id = env.GAME.idFromName('guess-who-global');
      return env.GAME.get(id).fetch(request);
    }
    return env.ASSETS.fetch(request);
  }
};

export class GameCoordinator {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }

  async fetch(request) {
    const url = new URL(request.url);
    let body = {};
    try { body = await request.json(); } catch {}
    const path = url.pathname;

    if (path === '/api/create') {
      let code;
      do { code = makeCode(); } while (await this.ctx.storage.get(`room:${code}`));
      const pid = crypto.randomUUID();
      const pool = shuffle(MEMBERS).slice(0,25);
      const room = {
        code,
        players:[{id:pid,name:String(body.name||'玩家1').slice(0,16)},null],
        pool,
        secrets:[pool[Math.floor(Math.random()*pool.length)],null],
        started:false,turn:0,phase:'ask',pending:null,log:[],winner:null,loser:null,endReason:null,
        created:Date.now()
      };
      await this.ctx.storage.put(`room:${code}`,room);
      return json({code,pid,state:publicState(room,pid)});
    }

    if (path === '/api/join') {
      const code = String(body.code||'').toUpperCase().trim();
      const room = await this.getRoom(code);
      if (!room) return json({error:'找不到这个房间，请检查邀请码。'},404);
      if (room.players[1]) return json({error:'房间已满，最多两位玩家。'},409);
      const pid = crypto.randomUUID();
      room.players[1] = {id:pid,name:String(body.name||'玩家2').slice(0,16)};
      room.secrets[1] = room.pool[Math.floor(Math.random()*room.pool.length)];
      room.log.push({type:'system',text:`${room.players[1].name} 加入了房间。`});
      await this.save(room);
      return json({code,pid,state:publicState(room,pid)});
    }

    const code = String(body.code||'').toUpperCase().trim();
    const room = await this.getRoom(code);
    if (!room) return json({error:'房间不存在或已过期，请重新创建。'},404);
    const pid = body.pid;
    const slot = room.players.findIndex(p=>p&&p.id===pid);
    if (slot < 0) return json({error:'玩家身份无效，请重新加入房间。'},403);

    if (path === '/api/state') return json({state:publicState(room,pid)});

    if (path === '/api/start') {
      if (slot!==0) return json({error:'请让创建房间的玩家开始游戏。'},403);
      if (!room.players[1]) return json({error:'还需要邀请另一位玩家加入。'},400);
      if (!room.started) {
        room.started=true; room.turn=0; room.phase='ask';
        room.log.push({type:'system',text:'游戏开始！玩家1先提问。'});
        await this.save(room);
      }
      return json({state:publicState(room,pid)});
    }

    if (room.winner !== null) return json({error:'本局已经结束。'},409);

    if (path === '/api/ask') {
      if (!room.started || room.turn!==slot || room.phase!=='ask') return json({error:'现在还不是你提问的时机。'},409);
      const question=String(body.question||'').trim().slice(0,180);
      if (!question) return json({error:'请先输入问题。'},400);
      room.pending={from:slot,question}; room.phase='answer';
      room.log.push({type:'qa',from:slot,question,answer:null});
      await this.save(room);
      return json({state:publicState(room,pid)});
    }

    if (path === '/api/answer') {
      if (!room.started || room.phase!=='answer' || room.turn===slot || !room.pending) return json({error:'现在没有等待你回答的问题。'},409);
      const answer=String(body.answer||'');
      if (!['是','不是','不确定'].includes(answer)) return json({error:'回答只能选择：是 / 不是 / 不确定。'},400);
      room.log[room.log.length-1].answer=answer;
      room.log.push({type:'system',text:`${room.players[slot].name} 回答：${answer}`});
      room.turn=slot; room.phase='ask'; room.pending=null;
      await this.save(room);
      return json({state:publicState(room,pid)});
    }

    if (path === '/api/guess') {
      if (!room.started || room.turn!==slot || room.phase!=='ask') return json({error:'请在自己的提问回合猜测。'},409);
      const guess=String(body.guess||'').trim().replace(/\s/g,'');
      if (!guess) return json({error:'请输入成员姓名。'},400);
      const correct=guess===room.secrets[1-slot].name;
      if (correct) {
        room.winner=slot; room.loser=1-slot; room.endReason='correct';
        room.log.push({type:'system',text:`${room.players[slot].name} 猜中了 ${room.secrets[1-slot].name}！`});
      } else {
        room.log.push({type:'guess',from:slot,guess,correct:false});
        room.log.push({type:'system',text:`${room.players[slot].name} 猜错了。`});
        room.turn=1-slot; room.phase='ask';
      }
      await this.save(room);
      return json({state:publicState(room,pid),correct});
    }

    if (path === '/api/rematch') {
      if (!room.players[1]) return json({error:'需要两位玩家都在房间内。'},400);
      room.pool=shuffle(MEMBERS).slice(0,25);
      room.secrets=[room.pool[Math.floor(Math.random()*25)],room.pool[Math.floor(Math.random()*25)]];
      room.started=false; room.turn=0; room.phase='ask'; room.pending=null;
      room.winner=null; room.loser=null; room.endReason=null;
      room.log=[{type:'system',text:'新一局已准备好，房主可以点击开始游戏。'}];
      await this.save(room);
      return json({state:publicState(room,pid)});
    }
    return json({error:'未知接口'},404);
  }

  async getRoom(code) {
    if (!/^[A-F0-9]{6}$/.test(code)) return null;
    const key=`room:${code}`;
    const room=await this.ctx.storage.get(key);
    if (room && Date.now()-room.created > 24*60*60*1000) {
      await this.ctx.storage.delete(key);
      return null;
    }
    return room || null;
  }
  async save(room) { await this.ctx.storage.put(`room:${room.code}`,room); }
}

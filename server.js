const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const PORT = Number(process.env.PORT || 3000);
const ROOT = path.join(__dirname, 'public');
const rooms = new Map();
const members = [
'王俊凯','王源','易烊千玺','马嘉祺','丁程鑫','宋亚轩','刘耀文','张真源','严浩翔','贺峻霖',
'朱志鑫','张泽禹','张极','左航','苏新皓','童禹坤','穆祉丞','邓佳鑫','黄朔','张子墨','张峻豪','余宇涵',
'官俊臣','张桂源','张函瑞','王橹杰','左奇函','陈奕恒','杨博文','杨涵博','张奕然','聂玮辰','陈思罕','魏子宸','李煜东','陈浚铭','王烁然'
].map((name,i)=>({name, img:`/assets/member${String(i+1).padStart(2,'0')}.jpg`}));
const shuffle = a => [...a].sort(()=>Math.random()-.5);
const code = () => crypto.randomBytes(3).toString('hex').toUpperCase();
function publicState(room, pid) {
 const slot = room.players.findIndex(p=>p && p.id===pid);
 if(slot<0) return {error:'你不在这个房间里'};
 const me=room.players[slot], other=room.players[1-slot];
 return {code:room.code, players:room.players.map(p=>p?{name:p.name,connected:p.connected}:null), slot,
   started:room.started, pool:room.pool, mySecret:room.secrets[slot], turn:room.turn, phase:room.phase,
   pending:room.pending, log:room.log, winner:room.winner, loser:room.loser, endReason:room.endReason, revealedSecret:room.winner!==null?room.secrets[1-slot]:null,
   canStart:slot===0 && !!other && !room.started, otherName:other?.name||'等待对手加入',
   isMyTurn:room.started && room.turn===slot && !room.winner,
   canAnswer:room.started && room.phase==='answer' && room.turn!==slot && !room.winner};
}
function json(res, status, obj){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':'*','Cache-Control':'no-store'});res.end(JSON.stringify(obj));}
function readBody(req){return new Promise(resolve=>{let b='';req.on('data',d=>b+=d);req.on('end',()=>{try{resolve(JSON.parse(b||'{}'))}catch{resolve({})}})});}
const server=http.createServer(async(req,res)=>{
 if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'GET,POST,OPTIONS'});return res.end();}
 const u=new URL(req.url,`http://${req.headers.host||'localhost'}`);
 if(u.pathname.startsWith('/api/')){
  if(req.method!=='POST') return json(res,405,{error:'POST only'});
  const b=await readBody(req);
  if(u.pathname==='/api/create'){
   let c; do{c=code()}while(rooms.has(c));
   const pid=crypto.randomUUID(); const pool=shuffle(members).slice(0,25);
   const room={code:c,players:[{id:pid,name:String(b.name||'玩家1').slice(0,16),connected:true},null],pool,
    secrets:[pool[Math.floor(Math.random()*pool.length)],null],started:false,turn:0,phase:'ask',pending:null,log:[],winner:null,loser:null,endReason:null,created:Date.now()};
   rooms.set(c,room);return json(res,200,{code:c,pid,state:publicState(room,pid)});
  }
  if(u.pathname==='/api/join'){
   const c=String(b.code||'').toUpperCase().trim(), room=rooms.get(c);
   if(!room)return json(res,404,{error:'找不到这个房间，请检查邀请码。'});
   if(room.players[1])return json(res,409,{error:'房间已满，最多两位玩家。'});
   const pid=crypto.randomUUID();room.players[1]={id:pid,name:String(b.name||'玩家2').slice(0,16),connected:true};
   room.secrets[1]=room.pool[Math.floor(Math.random()*room.pool.length)];
   room.log.push({type:'system',text:`${room.players[1].name} 加入了房间。`});
   return json(res,200,{code:c,pid,state:publicState(room,pid)});
  }
  const c=String(b.code||'').toUpperCase(),room=rooms.get(c),pid=b.pid;
  if(!room)return json(res,404,{error:'房间不存在或服务已重启。'});
  const slot=room.players.findIndex(p=>p&&p.id===pid);
  if(slot<0)return json(res,403,{error:'玩家身份无效，请重新加入房间。'});
  if(u.pathname==='/api/state')return json(res,200,{state:publicState(room,pid)});
  if(u.pathname==='/api/start'){
   if(slot!==0)return json(res,403,{error:'请让创建房间的玩家开始游戏。'});
   if(!room.players[1])return json(res,400,{error:'还需要邀请另一位玩家加入。'});
   if(room.started)return json(res,200,{state:publicState(room,pid)});
   room.started=true;room.turn=0;room.phase='ask';room.log.push({type:'system',text:'游戏开始！玩家1先提问。'});
   return json(res,200,{state:publicState(room,pid)});
  }
  if(room.winner)return json(res,409,{error:'本局已经结束。'});
  if(u.pathname==='/api/ask'){
   if(!room.started||room.turn!==slot||room.phase!=='ask')return json(res,409,{error:'现在还不是你提问的时机。'});
   const q=String(b.question||'').trim().slice(0,180);if(!q)return json(res,400,{error:'请先输入问题。'});
   room.pending={from:slot,question:q};room.phase='answer';room.log.push({type:'qa',from:slot,question:q,answer:null});
   return json(res,200,{state:publicState(room,pid)});
  }
  if(u.pathname==='/api/answer'){
   if(!room.started||room.phase!=='answer'||room.turn===slot||!room.pending)return json(res,409,{error:'现在没有等待你回答的问题。'});
   const answer=String(b.answer||'');if(!['是','不是','不确定'].includes(answer))return json(res,400,{error:'回答只能选择：是、不是、不确定。'});
   room.log[room.log.length-1].answer=answer;room.log.push({type:'system',text:`${room.players[slot].name} 回答：${answer}`});
   room.turn=slot;room.phase='ask';room.pending=null;
   return json(res,200,{state:publicState(room,pid)});
  }
  if(u.pathname==='/api/guess'){
   if(!room.started||room.turn!==slot||room.phase!=='ask')return json(res,409,{error:'请在自己的提问回合猜测。'});
   const guess=String(b.guess||'').trim().replace(/\s/g,'');if(!guess)return json(res,400,{error:'请输入成员姓名。'});
   const secret=room.secrets[1-slot];
   if(guess===secret.name){room.winner=slot;room.loser=1-slot;room.endReason='correct';room.log.push({type:'system',text:`${room.players[slot].name} 猜中了 ${secret.name}！`});}
   else {room.log.push({type:'guess',from:slot,guess,correct:false});room.log.push({type:'system',text:`${room.players[slot].name} 猜错了。`});room.turn=1-slot;room.phase='ask';}
   return json(res,200,{state:publicState(room,pid),correct:guess===secret.name});
  }
  if(u.pathname==='/api/rematch'){
   if(!room.players[1])return json(res,400,{error:'需要两位玩家都在房间内。'});
   room.pool=shuffle(members).slice(0,25);room.secrets=[room.pool[Math.floor(Math.random()*25)],room.pool[Math.floor(Math.random()*25)]];
   room.started=false;room.turn=0;room.phase='ask';room.pending=null;room.winner=null;room.loser=null;room.endReason=null;room.log=[{type:'system',text:'新一局已准备好，房主可以点击开始游戏。'}];
   return json(res,200,{state:publicState(room,pid)});
  }
  return json(res,404,{error:'未知接口'});
 }
 let file=u.pathname==='/'?path.join(ROOT,'index.html'):path.join(ROOT,decodeURIComponent(u.pathname));
 if(!file.startsWith(ROOT)){res.writeHead(403);return res.end('Forbidden');}
 fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);return res.end('Not found');}
  const ext=path.extname(file);const types={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript; charset=utf-8','.jpg':'image/jpeg','.png':'image/png'};
  res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream','Cache-Control':ext==='.html'?'no-cache':'public, max-age=86400'});res.end(data);
 });
});
server.listen(PORT,'0.0.0.0',()=>{
 console.log(`猜猜我是谁多人联机版已启动：http://localhost:${PORT}`);
 for(const [name,addrs] of Object.entries(os.networkInterfaces())) for(const a of (addrs||[])) if(a.family==='IPv4'&&!a.internal) console.log(`同一 Wi-Fi 的好友可访问：http://${a.address}:${PORT}`);
});

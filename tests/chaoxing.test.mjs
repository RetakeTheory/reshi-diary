import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ChaoxingClient, parseRegistration, parseLocation, parseActivities } from "../lib/chaoxing-client.ts";
import { createChaoxingFetch } from "../lib/chaoxing-relay.ts";
import { OneBotChaoxing, MAX_CX_ACCOUNTS } from "../lib/onebot-chaoxing.ts";
function fixture() {
  const data = new Map(), sent = [], order = [];
  const storage = { async get(k) { return structuredClone(data.get(k)); }, async put(k,v) { data.set(k,structuredClone(v)); }, async delete(k) { return data.delete(k); }, async list({prefix}) { return new Map([...data].filter(([k])=>k.startsWith(prefix)).map(([k,v])=>[k,structuredClone(v)])); } };
  const course = {courseId:"1",classId:"2"}; let signCount = 0, failSend = false;
  const client = { cookies: {_uid:"123",vc3:"session"}, async login() { order.push("login"); return {cookies:this.cookies,courses:[course]}; }, async courses() { return [course]; }, async activities() { return [{...course,id:"99",name:"测试签到",otherId:0}]; }, async sign() { signCount++; return "签到成功"; } };
  const bot = new OneBotChaoxing(storage, async (qq,text,image) => { order.push("send"); if(failSend && image) throw Error("offline"); sent.push({qq,text,image}); }, ()=>client);
  return { data, sent, order, bot, client, get signCount(){return signCount;}, set failSend(v){failSend=v;} };
}
test("register preserves special characters and location has explicit latitude then longitude", () => {
  assert.deepEqual(parseRegistration("/register+13800138000+a+b&c "), {phone:"13800138000",password:"a+b&c "});
  assert.equal(parseRegistration("/register 123 secret"),null);
  assert.deepEqual(parseLocation("/location 31.1 121.2 教学楼 A"), {latitude:31.1,longitude:121.2,address:"教学楼 A"});
  assert.equal(parseLocation("/location 121 31 地址"),null);
  assert.equal(parseLocation("/location NaN 31 地址"),null);
});
test("group credentials are rejected without login or storage; private warning precedes login", async () => {
  const f=fixture(), replies=[];
  await f.bot.command("12345","/register+13800138000+secret",true,async t=>replies.push(t));
  assert.match(replies[0],/撤回/); assert.equal(f.data.size,0); assert.equal(f.order.length,0);
  await f.bot.command("12345","/register 13800138000 secret",false,async()=>{});
  assert.deepEqual(f.order.slice(0,2),["send","login"]);
  assert.ok(!JSON.stringify([...f.data]).includes("secret"));
  assert.ok(!JSON.stringify(f.sent).includes("13800138000"));
});
test("successful sign is persisted even when image delivery fails and is not repeated", async () => {
  const f=fixture(); await f.bot.command("12345","/register 13800138000 secret",false,async()=>{});
  f.failSend=true; await f.bot.poll(Date.now()+1000); assert.equal(f.signCount,1);
  assert.equal(f.data.get("cx:account:12345").outbox.length,1);
  f.failSend=false; await f.bot.poll(Date.now()+120000); assert.equal(f.signCount,1);
  assert.equal(f.data.get("cx:account:12345").outbox.length,0);
  assert.ok(f.sent.some(x=>x.image && x.text.includes("签到成功")));
  await f.bot.command("12345","/stop",false,async()=>{}); assert.equal(await f.bot.nextAt(),null);
  await f.bot.command("12345","/unregister",false,async()=>{}); assert.equal(f.data.size,0);
});
test("help produces an image and unrelated verification commands pass through", async()=>{
  const f=fixture(); assert.equal(await f.bot.command("12345","验证 ABC123",false,async()=>{}),false);
  await f.bot.command("12345","/help",false,async()=>{}); assert.equal(f.sent[0].image,true);
});
test("help responds while a Chaoxing poll is still waiting", async()=>{
  const f=fixture(); await f.bot.command("12345","/register 13800138000 secret",false,async()=>{});
  let markStarted, releasePoll;
  const started=new Promise(resolve=>{ markStarted=resolve; });
  const blocked=new Promise(resolve=>{ releasePoll=resolve; });
  f.client.activities=async()=>{ markStarted(); await blocked; return []; };
  const poll=f.bot.poll(Date.now()+1000);
  await started;
  const help=f.bot.command("12345","/help",false,async()=>{});
  await new Promise(resolve=>setImmediate(resolve));
  assert.ok(f.sent.some(item=>item.image && item.text.includes("QQ Bot 菜单")));
  releasePoll();
  await Promise.all([poll,help]);
});
test("help includes both reminder and Chaoxing commands", async()=>{
  const {CX_MENU}=await import("../lib/onebot-chaoxing.ts");
  assert.match(CX_MENU,/10分钟后提醒我/); assert.match(CX_MENU,/\/register/); assert.match(CX_MENU,/\/location/);
});
test("one bot accepts up to 200 monitored Chaoxing accounts",()=>{
  assert.equal(MAX_CX_ACCOUNTS,200);
});
test("activities parse every open sign and reject malformed responses",()=>{
  const rows=parseActivities({data:{activeList:[{id:1,status:1,otherId:0},{id:2,status:1,otherId:4},{id:3,status:2,otherId:0}]}},{courseId:"1",classId:"2"});
  assert.deepEqual(rows.map(x=>x.id),["1","2"]); assert.throws(()=>parseActivities({data:null},{}));
});
test("location submission encodes coordinates and address; photo sign never submits",async()=>{
  const urls=[];
  const client=new ChaoxingClient({_uid:"1"},async url=>{
    urls.push(new URL(url));
    if(url.includes("getPPTActiveInfo")) return Response.json({data:{otherId:4,ifphoto:0}});
    return new Response(url.includes("stuSignajax")?"success":"ok");
  });
  assert.equal(await client.sign({id:"2",courseId:"3",classId:"4",otherId:4,name:"签到"},{latitude:31.1,longitude:121.2,address:"A&B 教学楼"}),"签到成功");
  const url=urls.find(x=>x.pathname.endsWith("stuSignajax"));
  assert.equal(url.searchParams.get("latitude"),"31.1"); assert.equal(url.searchParams.get("longitude"),"121.2"); assert.equal(url.searchParams.get("address"),"A&B 教学楼");
  const photo=new ChaoxingClient({_uid:"1"},async url=>{assert.ok(url.includes("getPPTActiveInfo"));return Response.json({data:{otherId:0,ifphoto:1}});});
  assert.match(await photo.sign({id:"2"}),/验证/);
});
test("login credentials stay out of URLs and upstream error text",async()=>{
  const client=new ChaoxingClient({},async(url,init)=>{
    assert.ok(!url.includes("secret")); assert.ok(!String(init.body).includes("secret"));
    return Response.json({status:false,msg:"secret leaked by upstream"});
  });
  await assert.rejects(client.login("13800138000","secret"), e=>!e.message.includes("secret"));
});
test("Chaoxing requests retry network failures and distinguish timeouts",async()=>{
  let attempts=0;
  const client=new ChaoxingClient({},async()=>{ attempts++; throw new DOMException("timed out","TimeoutError"); });
  await assert.rejects(client.login("13800138000","secret"), e=>/两条登录线路/.test(e.message));
  assert.equal(attempts,2);
});
test("Chaoxing relay keeps credentials out of the relay URL and forwards only selected headers",async()=>{
  let seen;
  const relay=createChaoxingFetch({CHAOXING_RELAY_ORIGIN:"https://relay.example.cn",CHAOXING_RELAY_TOKEN:"x".repeat(32)},async(input,init)=>{
    const request=new Request(input,init); seen={url:request.url,authorization:request.headers.get("authorization"),target:request.headers.get("x-chaoxing-target"),cookie:request.headers.get("cookie"),body:await request.text()};
    return new Response("ok");
  });
  await relay("https://passport2.chaoxing.com/fanyalogin",{method:"POST",headers:{cookie:"vc3=session","x-ignore":"no"},body:"uname=13800138000&password=secret"});
  assert.equal(seen.url,"https://relay.example.cn/internal/chaoxing-relay");
  assert.equal(seen.authorization,"Bearer "+"x".repeat(32)); assert.equal(seen.target,"https://passport2.chaoxing.com/fanyalogin");
  assert.equal(seen.cookie,"vc3=session"); assert.match(seen.body,/password=secret/); assert.ok(!seen.url.includes("secret"));
});
test("login falls back to the POST mobile endpoint without credentials in the URL",async()=>{
  const calls=[];
  const client=new ChaoxingClient({},async(url,init)=>{
    calls.push({url:String(url),body:String(init.body)});
    assert.ok(!String(url).includes("13800138000")); assert.ok(!String(url).includes("secret"));
    if(String(url).includes("loginregister")) return new Response(JSON.stringify({status:true,uid:"123"}),{
      headers:{"Set-Cookie":"vc3=session; Path=/"},
    });
    if(String(url).includes("courselistdata")) return new Response('<div id="course_1_2">课程</div>');
    throw new Error("unexpected request");
  });
  const session=await client.login("13800138000","secret");
  assert.equal(session.cookies._uid,"123"); assert.equal(session.cookies.vc3,"session");
  assert.deepEqual(session.courses,[{courseId:"1",classId:"2"}]);
  assert.match(calls[0].body,/uname=13800138000/); assert.match(calls[0].body,/code=secret/);
});

test("image failures fall back to text and explicit QQ failure is surfaced",async()=>{
  const {sendOneBotReply}=await import("../lib/onebot-reply.ts"); const messages=[];
  await sendOneBotReply(async(_action,params)=>{messages.push(params.message); return {status:params.message[0].type==="image"?"failed":"ok",retcode:params.message[0].type==="image"?100:0};},"private","12345","菜单",async()=>new ArrayBuffer(8));
  assert.deepEqual(messages.map(x=>x[0].type),["image","text"]);
  await assert.rejects(sendOneBotReply(async()=>({status:"failed",retcode:100}),"private","12345","菜单"));
});
test("reminder creation acknowledges without rendering or S3 and command errors reply",async()=>{
  const [scheduler, session, cloudflare] = await Promise.all([
    readFile(new URL("../lib/onebot-scheduler.ts", import.meta.url), "utf8"),
    readFile(new URL("../worker/onebot-session.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/onebot-cloudflare.ts", import.meta.url), "utf8"),
  ]);
  const create = scheduler.slice(scheduler.indexOf("export async function createGroupReminder"), scheduler.indexOf("export async function nextScheduledAt"));
  assert.doesNotMatch(create, /renderOneBotReminderCard|putS3Object/);
  assert.match(scheduler.slice(scheduler.indexOf("async function scheduledMessage")), /renderOneBotReminderCard/);
  assert.match(session, /正在处理，请稍候/);
  assert.match(session, /没有识别到提醒时间/);
  assert.match(session, /未识别的命令/);
  assert.ok(session.indexOf("const response = await this.call(action") < session.indexOf("onebot_reminder_alarm_schedule_failed"));
  assert.match(session, /提醒处理失败或机器人接口超时/);
  assert.match(session, /this\.call\("get_status", \{\}\)/);
  assert.match(session, /verified: true/);
  assert.match(session, /canReply && \(isExplicitCommand \|\| isReminderCommand\)/);
  assert.doesNotMatch(cloudflare, /await import\("\.\/onebot-reminder"\)/);
});

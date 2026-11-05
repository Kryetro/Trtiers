require("dotenv").config();
const express = require("express");
const session = require("express-session");
const crypto = require("crypto");
const Database = require("better-sqlite3");
const path = require("path");

const app = express();
const db = new Database("tierlist.db");
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 discord_id TEXT UNIQUE NOT NULL,
 username TEXT NOT NULL,
 avatar TEXT,
 role TEXT NOT NULL DEFAULT 'User',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS players (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 username TEXT UNIQUE NOT NULL,
 discord_id TEXT UNIQUE,
 points INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS tiers (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 player_id INTEGER NOT NULL,
 gamemode TEXT NOT NULL,
 tier TEXT NOT NULL,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(player_id, gamemode),
 FOREIGN KEY(player_id) REFERENCES players(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS tests (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 player_id INTEGER NOT NULL,
 gamemode TEXT NOT NULL,
 tier TEXT NOT NULL,
 tester_id INTEGER NOT NULL,
 note TEXT DEFAULT '',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(player_id) REFERENCES players(id),
 FOREIGN KEY(tester_id) REFERENCES users(id)
);
`);
const modes = ["Crystal","Sword","NethPot","UHC","SMP","Axe","Mace","DiaPot"];
const tiers = ["HT1","LT1","HT2","LT2","HT3","LT3","HT4","LT4","HT5","LT5"];
const score = Object.fromEntries(tiers.map((t,i)=>[t,50-i*5]));

const ownerId = process.env.OWNER_DISCORD_ID;
if (ownerId) {
  db.prepare(`INSERT INTO users(discord_id,username,role) VALUES(?,?,?)
    ON CONFLICT(discord_id) DO UPDATE SET role='Owner'`).run(ownerId,"Owner","Owner");
}
app.use(express.json({limit:"100kb"}));
app.use(session({
 secret: process.env.SESSION_SECRET || "development-only-change-this",
 resave:false, saveUninitialized:false,
 cookie:{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:7*86400000}
}));
app.use(express.static(path.join(__dirname,"public")));

function currentUser(req) {
 if (!req.session.userId) return null;
 return db.prepare("SELECT id,discord_id,username,avatar,role FROM users WHERE id=?").get(req.session.userId) || null;
}
function auth(req,res,next) {
 const u=currentUser(req); if(!u) return res.status(401).json({error:"Discord ile giriş yapmalısın."});
 req.user=u; next();
}
function allow(...roles) {
 return (req,res,next)=>{ if(!roles.includes(req.user.role)) return res.status(403).json({error:"Bu işlem için yetkin yok."}); next(); };
}
function validMode(m){return modes.includes(m)}
function validTier(t){return tiers.includes(t)}

app.get("/api/config",(req,res)=>res.json({modes,tiers,points:score}));
app.get("/api/me",(req,res)=>res.json({user:currentUser(req)}));

app.get("/auth/discord",(req,res)=>{
 if(!process.env.DISCORD_CLIENT_ID || !process.env.DISCORD_CALLBACK_URL) return res.status(503).send("Discord OAuth ayarları .env dosyasında tamamlanmamış.");
 const state=crypto.randomBytes(24).toString("hex"); req.session.oauthState=state;
 const params=new URLSearchParams({client_id:process.env.DISCORD_CLIENT_ID,redirect_uri:process.env.DISCORD_CALLBACK_URL,response_type:"code",scope:"identify",state});
 res.redirect("https://discord.com/oauth2/authorize?"+params.toString());
});
app.get("/auth/discord/callback",async(req,res)=>{
 try{
  if(!req.query.code || !req.query.state || req.query.state!==req.session.oauthState) return res.status(400).send("Geçersiz OAuth isteği.");
  delete req.session.oauthState;
  const body=new URLSearchParams({client_id:process.env.DISCORD_CLIENT_ID,client_secret:process.env.DISCORD_CLIENT_SECRET,grant_type:"authorization_code",code:req.query.code,redirect_uri:process.env.DISCORD_CALLBACK_URL});
  const tokenRes=await fetch("https://discord.com/api/oauth2/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body});
  const token=await tokenRes.json(); if(!token.access_token) return res.status(401).send("Discord giriş işlemi başarısız.");
  const userRes=await fetch("https://discord.com/api/users/@me",{headers:{Authorization:`Bearer ${token.access_token}`}});
  const d=await userRes.json(); if(!d.id) return res.status(401).send("Discord hesabı alınamadı.");
  const role=d.id===process.env.OWNER_DISCORD_ID?"Owner":"User";
  db.prepare(`INSERT INTO users(discord_id,username,avatar,role) VALUES(?,?,?,?)
   ON CONFLICT(discord_id) DO UPDATE SET username=excluded.username,avatar=excluded.avatar`).run(d.id,d.username,d.avatar||null,role);
  const u=db.prepare("SELECT id FROM users WHERE discord_id=?").get(d.id);
  req.session.userId=u.id; res.redirect("/");
 }catch(e){console.error(e);res.status(500).send("Giriş sırasında hata oluştu.");}
});
app.post("/auth/logout",(req,res)=>req.session.destroy(()=>res.json({ok:true})));

app.get("/api/leaderboard",(req,res)=>{
 const mode=req.query.mode;
 if(mode && !validMode(mode)) return res.status(400).json({error:"Geçersiz oyun modu."});
 const rows=db.prepare(`
 SELECT p.id,p.username,p.points,t.gamemode,t.tier,t.updated_at
 FROM players p LEFT JOIN tiers t ON p.id=t.player_id
 ${mode?"WHERE t.gamemode=?":""}
 ORDER BY CASE t.tier ${tiers.map((t,i)=>`WHEN '${t}' THEN ${i}`).join(" ")} ELSE 99 END,p.username COLLATE NOCASE
 `).all(...(mode?[mode]:[]));
 const grouped=new Map();
 for(const r of rows){if(!grouped.has(r.id))grouped.set(r.id,{id:r.id,username:r.username,points:r.points,tiers:{},updatedAt:r.updated_at});if(r.gamemode)grouped.get(r.id).tiers[r.gamemode]=r.tier;}
 const result=[...grouped.values()];
 if(!mode) result.sort((a,b)=>b.points-a.points || a.username.localeCompare(b.username));
 res.json(result);
});
app.get("/api/players/:id",(req,res)=>{
 const p=db.prepare("SELECT * FROM players WHERE id=?").get(req.params.id);
 if(!p)return res.status(404).json({error:"Oyuncu bulunamadı."});
 p.tiers=Object.fromEntries(db.prepare("SELECT gamemode,tier FROM tiers WHERE player_id=?").all(p.id).map(x=>[x.gamemode,x.tier]));
 res.json(p);
});
app.post("/api/players",auth,allow("Owner","Admin"),(req,res)=>{
 const username=String(req.body.username||"").trim();
 if(username.length<3||username.length>16||!/^[A-Za-z0-9_]+$/.test(username))return res.status(400).json({error:"Minecraft adı 3-16 karakter olmalı."});
 try{const info=db.prepare("INSERT INTO players(username) VALUES(?)").run(username);res.json({id:info.lastInsertRowid,username});}
 catch{return res.status(409).json({error:"Bu oyuncu zaten kayıtlı."});}
});
app.delete("/api/players/:id",auth,allow("Owner","Admin"),(req,res)=>{
 const info=db.prepare("DELETE FROM players WHERE id=?").run(req.params.id);
 if(!info.changes)return res.status(404).json({error:"Oyuncu bulunamadı."});res.json({ok:true});
});
app.put("/api/players/:id",auth,allow("Owner","Admin"),(req,res)=>{
 const username=String(req.body.username||"").trim();
 const discordId=String(req.body.discordId||"").trim()||null;
 if(username.length<3||username.length>16||!/^[A-Za-z0-9_]+$/.test(username))return res.status(400).json({error:"Geçersiz Minecraft adı."});
 if(discordId && !/^\d{17,20}$/.test(discordId))return res.status(400).json({error:"Discord ID 17-20 rakam olmalı."});
 try{const info=db.prepare("UPDATE players SET username=?,discord_id=? WHERE id=?").run(username,discordId,req.params.id);if(!info.changes)return res.status(404).json({error:"Oyuncu bulunamadı."});res.json({ok:true});}
 catch{return res.status(409).json({error:"Bu Minecraft adı veya Discord ID başka kayıtta kullanımda."});}
});
app.put("/api/players/:id/tiers",auth,allow("Owner","Admin","Tester"),(req,res)=>{
 const {gamemode,tier,note=""}=req.body;
 if(!validMode(gamemode)||!validTier(tier))return res.status(400).json({error:"Oyun modu veya tier geçersiz."});
 const p=db.prepare("SELECT id FROM players WHERE id=?").get(req.params.id);if(!p)return res.status(404).json({error:"Oyuncu bulunamadı."});
 const update=db.transaction(()=>{
  db.prepare(`INSERT INTO tiers(player_id,gamemode,tier) VALUES(?,?,?)
   ON CONFLICT(player_id,gamemode) DO UPDATE SET tier=excluded.tier,updated_at=CURRENT_TIMESTAMP`).run(p.id,gamemode,tier);
  db.prepare("UPDATE players SET points=(SELECT COALESCE(SUM("+tiers.map(t=>`CASE WHEN tier='${t}' THEN ${score[t]}`).join(" ")+ " ELSE 0 END),0) FROM tiers WHERE player_id=?) WHERE id=?").run(p.id,p.id);
  db.prepare("INSERT INTO tests(player_id,gamemode,tier,tester_id,note) VALUES(?,?,?,?,?)").run(p.id,gamemode,tier,req.user.id,String(note).slice(0,500));
 });update();res.json({ok:true});
});
app.get("/api/tests",auth,allow("Owner","Admin","Tester"),(req,res)=>{
 res.json(db.prepare(`SELECT tests.*,players.username,users.username AS tester FROM tests JOIN players ON players.id=tests.player_id JOIN users ON users.id=tests.tester_id ORDER BY tests.id DESC LIMIT 100`).all());
});
app.get("/api/users",auth,allow("Owner","Admin"),(req,res)=>res.json(db.prepare("SELECT id,discord_id,username,role,created_at FROM users ORDER BY id DESC").all()));
app.put("/api/users/:id/role",auth,allow("Owner"),(req,res)=>{
 const role=req.body.role;if(!["Admin","Tester","User"].includes(role))return res.status(400).json({error:"Geçersiz rol."});
 const target=db.prepare("SELECT * FROM users WHERE id=?").get(req.params.id);if(!target)return res.status(404).json({error:"Kullanıcı bulunamadı."});
 if(target.role==="Owner")return res.status(403).json({error:"Owner rolü değiştirilemez."});
 db.prepare("UPDATE users SET role=? WHERE id=?").run(role,target.id);res.json({ok:true});
});
app.get("/api/admin/summary",auth,allow("Owner","Admin"),(req,res)=>res.json({
 players:db.prepare("SELECT COUNT(*) n FROM players").get().n,
 users:db.prepare("SELECT COUNT(*) n FROM users").get().n,
 tests:db.prepare("SELECT COUNT(*) n FROM tests").get().n
}));
app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
const port=process.env.PORT||3000;
app.listen(port,()=>console.log(`TR PvP TierList running on http://localhost:${port}`));

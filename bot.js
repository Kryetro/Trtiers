require("dotenv").config();
const {Client,GatewayIntentBits}=require("discord.js");
const Database=require("better-sqlite3");
if(!process.env.DISCORD_BOT_TOKEN){console.error("DISCORD_BOT_TOKEN .env içinde ayarlanmalı.");process.exit(1);}
const db=new Database("tierlist.db");
const client=new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMembers]});
const mode="Crystal";
const tierRoleMap={
 HT1:process.env.ROLE_CRYSTAL_HT1,LT1:process.env.ROLE_CRYSTAL_LT1,
 HT2:process.env.ROLE_CRYSTAL_HT2,LT2:process.env.ROLE_CRYSTAL_LT2,
 HT3:process.env.ROLE_CRYSTAL_HT3,LT3:process.env.ROLE_CRYSTAL_LT3,
 HT4:process.env.ROLE_CRYSTAL_HT4,LT4:process.env.ROLE_CRYSTAL_LT4,
 HT5:process.env.ROLE_CRYSTAL_HT5,LT5:process.env.ROLE_CRYSTAL_LT5
};
client.once("ready",()=>console.log(`Tier role sync bot ready: ${client.user.tag}`));
async function sync(){
 const guild=client.guilds.cache.get(process.env.DISCORD_GUILD_ID);
 if(!guild)return console.warn("DISCORD_GUILD_ID bulunamadı.");
 const rows=db.prepare(`SELECT players.discord_id,tiers.tier FROM players JOIN tiers ON tiers.player_id=players.id WHERE players.discord_id IS NOT NULL AND tiers.gamemode=?`).all(mode);
 for(const row of rows){
  try{
   const member=await guild.members.fetch(row.discord_id);
   const roleId=tierRoleMap[row.tier];if(!roleId)continue;
   const managed=Object.values(tierRoleMap).filter(Boolean);
   const remove=member.roles.cache.filter(r=>managed.includes(r.id)&&r.id!==roleId);
   if(remove.size)await member.roles.remove(remove);
   if(!member.roles.cache.has(roleId))await member.roles.add(roleId);
  }catch(e){console.warn(`Could not sync ${row.discord_id}: ${e.message}`);}
 }
}
client.on("ready",()=>{sync();setInterval(sync,60000);});
client.login(process.env.DISCORD_BOT_TOKEN);

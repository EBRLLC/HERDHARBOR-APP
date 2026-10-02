(function(root,factory){
"use strict";
const api=factory(root);
if(typeof module==="object"&&module.exports)module.exports=api;
if(root)root.HerdHarborMarketplace=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(root){
"use strict";
const VERSION="1.0.0";
const TABLES=Object.freeze({
 profiles:"marketplace_public_profiles",listings:"marketplace_listings",photos:"marketplace_listing_photos",
 attributes:"marketplace_listing_attributes",favorites:"marketplace_favorites",conversations:"marketplace_conversations",
 members:"marketplace_conversation_members",messages:"marketplace_messages",attachments:"marketplace_message_attachments",
 blocks:"marketplace_blocks",reports:"marketplace_reports",moderation:"marketplace_moderation_actions",notifications:"marketplace_notifications"
});
const BUCKETS=Object.freeze({publicMedia:"marketplace-public",messageAttachments:"marketplace-message-attachments"});
const TABLE_SET=new Set(Object.values(TABLES));
const BUCKET_SET=new Set(Object.values(BUCKETS));

function requireClient(client){
 if(!client||typeof client.from!=="function")throw new Error("Marketplace Supabase client is unavailable.");
 return client;
}
function browserClient(){
 const client=root?.HerdHarborCloud?.getClient?.();
 return requireClient(client);
}
function createGateway(client){
 const db=requireClient(client);
 return Object.freeze({
  table(name){if(!TABLE_SET.has(name))throw new Error("Unknown Marketplace table.");return db.from(name);},
  rpc(name,args){if(typeof db.rpc!=="function")throw new Error("Marketplace RPC support is unavailable.");return db.rpc(name,args||{});},
  channel(name){if(typeof db.channel!=="function")throw new Error("Marketplace realtime support is unavailable.");return db.channel(name);},
  bucket(name){if(!BUCKET_SET.has(name))throw new Error("Unknown Marketplace storage bucket.");return db.storage.from(name);},
  async user(){
   const result=await db.auth.getUser();
   const user=result?.data?.user||null;
   if(!user)throw new Error("Sign in to use Marketplace member actions.");
   return user;
  }
 });
}
function gateway(){return createGateway(browserClient());}

const PUBLIC_PROFILE_FIELDS=Object.freeze(["display_name","rabbitry_name","avatar_path","city","region","about","species_breeds"]);
function textValue(value,max){
 const text=String(value===null||value===undefined?"":value).trim();
 return Number.isFinite(max)?text.slice(0,max):text;
}
function normalizePublicProfileDraft(input){
 const raw=input&&typeof input==="object"?input:{};
 return {
  display_name:textValue(raw.display_name||raw.displayName,120),
  rabbitry_name:textValue(raw.rabbitry_name||raw.rabbitryName,160),
  avatar_path:textValue(raw.avatar_path||raw.avatarPath,500),
  city:textValue(raw.city,120),
  region:textValue(raw.region||raw.state,120),
  about:textValue(raw.about,1500),
  species_breeds:Array.isArray(raw.species_breeds||raw.speciesBreeds)?(raw.species_breeds||raw.speciesBreeds).slice(0,100).map(function(item){return textValue(item,120);}).filter(Boolean):[]
 };
}
async function saveSellerProfile(input,customGateway){
 const gw=customGateway||gateway();
 const user=await gw.user();
 const draft=normalizePublicProfileDraft(input);
 const result=await gw.table(TABLES.profiles).upsert(Object.assign({user_id:user.id},draft),{onConflict:"user_id"}).select("public_id,display_name,rabbitry_name,avatar_path,city,region,about,species_breeds,member_since,verification_status").single();
 if(result.error)throw result.error;
 return result.data;
}
async function getPublicSellerProfile(publicId,customGateway){
 const id=textValue(publicId,80);
 if(!id)throw new Error("A public Marketplace profile id is required.");
 const gw=customGateway||gateway();
 const result=await gw.rpc("marketplace_public_profile",{target_public_id:id});
 if(result.error)throw result.error;
 return Array.isArray(result.data)?(result.data[0]||null):result.data||null;
}
function publicProfilePreview(input){
 const draft=normalizePublicProfileDraft(input);
 return Object.freeze({
  display_name:draft.display_name,
  rabbitry_name:draft.rabbitry_name,
  avatar_path:draft.avatar_path,
  city:draft.city,
  region:draft.region,
  about:draft.about,
  species_breeds:draft.species_breeds.slice()
 });
}

return Object.freeze({VERSION,TABLES,BUCKETS,PUBLIC_PROFILE_FIELDS,createGateway,gateway,browserClient,normalizePublicProfileDraft,saveSellerProfile,getPublicSellerProfile,publicProfilePreview});
});

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
return Object.freeze({VERSION,TABLES,BUCKETS,createGateway,gateway,browserClient});
});

"use strict";
// S19 owner-operated utility. Default action is READ-ONLY planning.
// Requires an administrator-managed PostgreSQL connection via standard PG* variables.
const { execFileSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { planMigration } = require("./s19-cloud-migration-core.cjs");
const { sqlForCutover } = require("./s19-cloud-migration-sql.cjs");

function demand(value, why) { if (!value) throw Error("S19_BLOCKED: " + why); }
function sha(buf) { return crypto.createHash("sha256").update(buf).digest("hex"); }
function runPsql(sql) {
  return execFileSync("psql", ["-X","-A","-t","-q","-v","ON_ERROR_STOP=1"], {
    input: sql+"\n", encoding: "utf8", maxBuffer: 64*1024*1024,
    timeout: 90000, stdio: ["pipe","pipe","pipe"]
  }).trim();
}
function readAccount(userId, query = runPsql) {
  demand(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(userId), "invalid account UUID");
  const result = query(`SELECT row_to_json(account) FROM (
    SELECT c.user_id::text AS "userId",c.enabled,c.cohort,
     (SELECT row_to_json(d) FROM (SELECT app_state, updated_at
      FROM public.herdharbor_user_data WHERE user_id=c.user_id) d) AS legacy,
     (SELECT row_to_json(m) FROM (SELECT cutover_stage,sync_generation,metadata
      FROM public.herdharbor_sync_manifest WHERE user_id=c.user_id) m) AS manifest,
     (SELECT coalesce(json_agg(row_to_json(r)),'[]'::json)
        FROM (SELECT namespace,record_id,payload,payload_checksum,deleted_at
        FROM public.herdharbor_sync_records WHERE user_id=c.user_id
        ORDER BY namespace,record_id) r) AS rows
    FROM public.herdharbor_sync_cohort c WHERE c.user_id='${userId}'::uuid
  ) account;`);
  demand(result.startsWith("{"), "account not present in migration cohort");
  const account = JSON.parse(result);
  account.userId = account.userId || account.userid;
  return account;
}
function storeBackup(data, dir, secret) {
  demand(path.isAbsolute(dir || ""), "absolute --backup-dir is required");
  demand(typeof secret === "string" && secret.length >= 24, "S19_BACKUP_PASSPHRASE must contain 24 or more characters");
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(secret,salt,32);
  const plain = Buffer.from(JSON.stringify(data),"utf8");
  const cipher = crypto.createCipheriv("aes-256-gcm",key,iv);
  const encrypted = Buffer.concat([cipher.update(plain),cipher.final()]);
  const pack = {
    format:"hh-s19-aes256gcm-v1",salt:salt.toString("hex"),iv:iv.toString("hex"),
    tag:cipher.getAuthTag().toString("hex"),sha256:sha(plain),
    data:encrypted.toString("base64")
  };
  const name = path.join(dir,`s19-${data.userId}-${crypto.randomUUID()}.enc.json`);
  const handle = fs.openSync(name,"wx",0o600);
  try { fs.writeFileSync(handle,JSON.stringify(pack)); fs.fsyncSync(handle); }
  finally { fs.closeSync(handle); }
  // Verify through the independent recovery reader, not only the writer's cipher.
  const recovered=restoreBackup(name,secret);
  demand(Buffer.from(JSON.stringify(recovered),"utf8").equals(plain),
    "backup readback verification failed");
  return { file:name,checksum:sha(plain) };
}
// Independently open and authenticate a saved recovery artifact before cutover.
function restoreBackup(file, secret) {
  demand(typeof secret === "string" && secret.length >= 24, "S19_BACKUP_PASSPHRASE must contain 24 or more characters");
  const pack=JSON.parse(fs.readFileSync(file,"utf8"));
  demand(pack.format==="hh-s19-aes256gcm-v1","unsupported backup format");
  demand(/^[0-9a-f]{32}$/i.test(pack.salt||"") && /^[0-9a-f]{24}$/i.test(pack.iv||"") &&
    /^[0-9a-f]{32}$/i.test(pack.tag||"") && /^[0-9a-f]{64}$/i.test(pack.sha256||""),
    "invalid backup envelope");
  const key=crypto.scryptSync(secret,Buffer.from(pack.salt,"hex"),32);
  const dec=crypto.createDecipheriv("aes-256-gcm",key,Buffer.from(pack.iv,"hex"));
  dec.setAuthTag(Buffer.from(pack.tag,"hex"));
  const plain=Buffer.concat([dec.update(Buffer.from(pack.data,"base64")),dec.final()]);
  demand(sha(plain)===pack.sha256,"backup checksum mismatch");
  const account=JSON.parse(plain.toString("utf8"));
  demand(account && typeof account.userId==="string" && account.legacy && Array.isArray(account.rows),
    "backup account payload incomplete");
  return account;
}
function options(argv) {
  const parsed = {};
  for(let i=0;i<argv.length;i++) {
    const arg=argv[i];
    if (["--execute","--legacy-clients-closed"].includes(arg)) parsed[arg]=true;
    else if (["--account","--expect-digest","--backup-dir"].includes(arg)) parsed[arg]=argv[++i];
    else throw Error("Unsupported option "+arg);
  }
  demand(parsed["--account"],"--account required");
  return parsed;
}
function execute(argv=process.argv.slice(2), reader=readAccount, query=runPsql) {
  const flags=options(argv);
  const before=reader(flags["--account"]);
  const plan=planMigration(before);
  if (!flags["--execute"]) {
    console.log(JSON.stringify({mode:"read-only",stage:plan.stage,
      recordCount:plan.recordCount,checksum:plan.sourceChecksum,digest:plan.digest}));
    return {plan,executed:false};
  }
  demand(flags["--legacy-clients-closed"],"owner must confirm all legacy clients have saved and closed");
  demand(flags["--expect-digest"]===plan.digest,"source plan changed since owner review");
  demand(plan.stage==="dual_write","non-dual-write accounts must bootstrap through the S20 authenticated sign-in workflow");
  const backup=storeBackup(before,flags["--backup-dir"],process.env.S19_BACKUP_PASSPHRASE);
  // Plan and DB revision are checked again in the serializable SQL transaction.
  query(sqlForCutover(before,plan));
  const after=reader(flags["--account"]);
  demand(after.manifest?.cutover_stage==="normalized","post-commit authority missing");
  demand(after.manifest?.metadata?.source_checksum===plan.sourceChecksum,"post-commit checksum mismatch");
  planMigration({...after,legacy:before.legacy,manifest:{cutover_stage:"dual_write",sync_generation:0}});
  console.log(JSON.stringify({mode:"completed",recordCount:plan.recordCount,
    normalized:true,backupSha256:backup.checksum}));
  return {plan,backup,executed:true};
}
module.exports={readAccount,storeBackup,restoreBackup,options,execute,runPsql};
if (require.main===module) {
  try { execute(); } catch(error) {
    console.error(String(error?.message||error).replace(/password=\S+/gi,"password=[REDACTED]"));
    process.exitCode=1;
  }
}

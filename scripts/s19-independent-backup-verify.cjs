"use strict";
// Independent S19 recovery reader. This deliberately does NOT import the
// migration/backup writer or its restore function. It is suitable for offline
// operator verification of an existing encrypted archive.
//
// Verify only:
//   S19_BACKUP_PASSPHRASE=... node scripts/s19-independent-backup-verify.cjs
//     --backup /offline/s19-...enc.json --expect-user <uuid> --expect-sha256 <sha>
//
// Optional explicit plaintext recovery (secure offline destination ONLY):
//     ... --output /secure-offline-path/recovered.json
//
// Never run the --output form on a shared computer or public CI artifact path.
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const HEX32 = /^[0-9a-f]{32}$/i;
const HEX24 = /^[0-9a-f]{24}$/i;
const HEX64 = /^[0-9a-f]{64}$/i;
const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;

function requireCondition(condition, message) {
  if (!condition) throw new Error("S19_INDEPENDENT_RECOVERY_BLOCKED: " + message);
}

function parseOptions(argv) {
  const opt = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    requireCondition(["--backup", "--expect-user", "--expect-sha256", "--output"].includes(key),
      "unrecognized argument " + key);
    requireCondition(!Object.prototype.hasOwnProperty.call(opt, key), "repeated argument " + key);
    requireCondition(i + 1 < argv.length && !argv[i+1].startsWith("--"), "missing argument " + key);
    opt[key] = argv[++i];
  }
  requireCondition(opt["--backup"], "backup path required");
  requireCondition(UUID.test(opt["--expect-user"] || ""), "explicit expected user UUID required");
  requireCondition(HEX64.test(opt["--expect-sha256"] || ""), "explicit plaintext SHA256 required");
  if (opt["--output"]) {
    requireCondition(path.resolve(opt["--output"]) !== path.resolve(opt["--backup"]),
      "backup and output path must differ");
  }
  return opt;
}

function restoreEncryptedArchive(filename, secret, expectedUser, expectedDigest) {
  requireCondition(typeof secret === "string" && secret.length >= 24, "backup passphrase unavailable");
  const stat = fs.statSync(filename);
  requireCondition(stat.isFile() && stat.size > 0 && stat.size <= MAX_ARCHIVE_BYTES,
    "backup file invalid or exceeds size limit");
  const pack = JSON.parse(fs.readFileSync(filename, "utf8"));
  requireCondition(pack && pack.format === "hh-s19-aes256gcm-v1", "unsupported backup format");
  requireCondition(HEX32.test(pack.salt || "") && HEX24.test(pack.iv || "") &&
    HEX32.test(pack.tag || "") && HEX64.test(pack.sha256 || "") &&
    typeof pack.data === "string" && /^[a-zA-Z0-9+/]*={0,2}$/.test(pack.data),
    "invalid encrypted backup envelope");
  requireCondition(pack.sha256.toLowerCase() === expectedDigest.toLowerCase(),
    "backup digest differs from operator-approved checksum");

  const key = crypto.scryptSync(secret, Buffer.from(pack.salt, "hex"), 32);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(pack.iv, "hex"));
  decipher.setAuthTag(Buffer.from(pack.tag, "hex"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(pack.data, "base64")),
    decipher.final()
  ]);
  const digest = crypto.createHash("sha256").update(plain).digest("hex");
  requireCondition(digest === pack.sha256.toLowerCase(), "backup checksum mismatch");
  const account = JSON.parse(plain.toString("utf8"));
  requireCondition(account && UUID.test(account.userId || "") &&
    account.userId.toLowerCase() === expectedUser.toLowerCase(),
    "backup account mismatch");
  requireCondition(account.legacy && account.legacy.app_state &&
    !Array.isArray(account.legacy.app_state) &&
    typeof account.legacy.app_state === "object" &&
    Array.isArray(account.rows), "backup account payload incomplete");
  // Do not trust the copied backup as sufficient to authorize a production
  // rollback: validation of database ownership and normalized record parity
  // is an independent, mandatory release step.
  return {account, digest, plain};
}

function writeRecoveredJson(output, bytes) {
  const target = path.resolve(output);
  const flags = fs.constants.O_CREAT | fs.constants.O_EXCL |
    fs.constants.O_WRONLY | (fs.constants.O_NOFOLLOW || 0);
  const handle = fs.openSync(target, flags, 0o600);
  try {
    fs.writeFileSync(handle, bytes);
    fs.fsyncSync(handle);
  } finally { fs.closeSync(handle); }
}

function execute(argv = process.argv.slice(2), env = process.env) {
  const opt = parseOptions(argv);
  const result = restoreEncryptedArchive(opt["--backup"], env.S19_BACKUP_PASSPHRASE,
    opt["--expect-user"], opt["--expect-sha256"]);
  if (opt["--output"]) writeRecoveredJson(opt["--output"], result.plain);
  // Never print a plaintext snapshot, a secret, or an archive key.
  return {ok:true, userId:result.account.userId,
    backupSha256:result.digest, recordCount:result.account.rows.length,
    restoredToNewFile:Boolean(opt["--output"])};
}

module.exports = {parseOptions, restoreEncryptedArchive, writeRecoveredJson, execute};
if (require.main === module) {
  try {process.stdout.write(JSON.stringify(execute()) + "\n");}
  catch (e) {process.stderr.write(String(e.message || e) + "\n");process.exitCode=1;}
}

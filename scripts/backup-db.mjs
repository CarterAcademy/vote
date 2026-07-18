#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  chmod,
  mkdir,
  readdir,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

const FILE_PREFIX = "committee-vote-";
const DAY_MS = 24 * 60 * 60 * 1000;

function requiredPositiveInteger(rawValue, name, fallback) {
  const value = rawValue === undefined || rawValue === "" ? fallback : Number(rawValue);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} 必须是正整数`);
  }
  return value;
}

function timestamp(date) {
  return date
    .toISOString()
    .replaceAll("-", "")
    .replaceAll(":", "")
    .replace(".", "")
    .replace("Z", "Z");
}

function databaseEnvironment(sourceEnvironment) {
  const passThroughNames = new Set(["HOME", "LANG", "LC_ALL", "PATH", "TZ"]);
  const childEnvironment = Object.fromEntries(
    Object.entries(sourceEnvironment).filter(
      ([name]) => passThroughNames.has(name) || name.startsWith("PG"),
    ),
  );

  const databaseUrl = sourceEnvironment.DATABASE_URL?.trim();
  if (databaseUrl) {
    let parsed;
    try {
      parsed = new URL(databaseUrl);
    } catch {
      throw new Error("DATABASE_URL 不是合法 URL");
    }

    if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
      throw new Error("DATABASE_URL 必须使用 postgres:// 或 postgresql://");
    }

    const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
    if (!parsed.hostname || !parsed.username || !databaseName) {
      throw new Error("DATABASE_URL 必须包含主机、用户和数据库名");
    }

    childEnvironment.PGHOST = parsed.hostname;
    childEnvironment.PGPORT = parsed.port || "5432";
    childEnvironment.PGUSER = decodeURIComponent(parsed.username);
    childEnvironment.PGDATABASE = databaseName;
    if (parsed.password) {
      childEnvironment.PGPASSWORD = decodeURIComponent(parsed.password);
    } else {
      delete childEnvironment.PGPASSWORD;
    }

    const sslMode = parsed.searchParams.get("sslmode");
    if (sslMode) {
      childEnvironment.PGSSLMODE = sslMode;
    }
  }

  for (const name of ["PGHOST", "PGUSER", "PGDATABASE"]) {
    if (!childEnvironment[name]?.trim()) {
      throw new Error(`缺少数据库连接配置：${name}（或提供完整 DATABASE_URL）`);
    }
  }

  return childEnvironment;
}

function run(command, args, environment) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: environment,
      shell: false,
      stdio: ["ignore", "inherit", "inherit"],
    });

    child.once("error", (error) => {
      reject(new Error(`无法启动 ${command}: ${error.message}`));
    });
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      const reason = signal ? `signal ${signal}` : `exit code ${code}`;
      reject(new Error(`${command} 执行失败（${reason}）`));
    });
  });
}

async function sha256(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

async function removeExpiredBackups(backupDirectory, retentionDays, now) {
  const cutoff = now.getTime() - retentionDays * DAY_MS;
  const entries = await readdir(backupDirectory, { withFileTypes: true });
  let removed = 0;

  for (const entry of entries) {
    if (
      !entry.isFile() ||
      !entry.name.startsWith(FILE_PREFIX) ||
      !entry.name.endsWith(".dump")
    ) {
      continue;
    }

    const dumpPath = path.join(backupDirectory, entry.name);
    const dumpStat = await stat(dumpPath);
    if (dumpStat.mtimeMs >= cutoff) {
      continue;
    }

    await unlink(dumpPath);
    const checksumPath = `${dumpPath}.sha256`;
    try {
      await unlink(checksumPath);
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw error;
      }
    }
    removed += 1;
  }

  return removed;
}

async function main() {
  const now = new Date();
  const retentionDays = requiredPositiveInteger(
    process.env.BACKUP_RETENTION_DAYS,
    "BACKUP_RETENTION_DAYS",
    365,
  );
  const backupDirectory = path.resolve(process.env.BACKUP_DIR || "./backups");
  const pgDumpBinary = process.env.PG_DUMP_BIN?.trim() || "pg_dump";
  const environment = databaseEnvironment(process.env);

  if (backupDirectory === path.parse(backupDirectory).root) {
    throw new Error("BACKUP_DIR 不能是文件系统根目录");
  }

  await mkdir(backupDirectory, { recursive: true, mode: 0o700 });

  const baseName = `${FILE_PREFIX}${timestamp(now)}.dump`;
  const finalPath = path.join(backupDirectory, baseName);
  const partialPath = path.join(
    backupDirectory,
    `.${baseName}.${process.pid}.partial`,
  );

  try {
    await run(
      pgDumpBinary,
      [
        "--format=custom",
        "--no-owner",
        "--no-privileges",
        "--file",
        partialPath,
      ],
      environment,
    );
    await chmod(partialPath, 0o600);
    await rename(partialPath, finalPath);

    const digest = await sha256(finalPath);
    const checksumPath = `${finalPath}.sha256`;
    await writeFile(checksumPath, `${digest}  ${baseName}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await chmod(checksumPath, 0o600);

    const removed = await removeExpiredBackups(
      backupDirectory,
      retentionDays,
      now,
    );
    console.log(
      JSON.stringify({
        ok: true,
        backup: finalPath,
        checksum: checksumPath,
        retentionDays,
        expiredBackupsRemoved: removed,
      }),
    );
  } catch (error) {
    try {
      await unlink(partialPath);
    } catch (cleanupError) {
      if (cleanupError?.code !== "ENOENT") {
        console.error(`清理临时备份失败: ${cleanupError.message}`);
      }
    }
    throw error;
  }
}

main().catch((error) => {
  console.error(`数据库备份失败: ${error.message}`);
  process.exitCode = 1;
});

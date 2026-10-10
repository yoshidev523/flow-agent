import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { FlowError, requireCondition as check } from "../errors.js";

/** All feature access is serialized across local processes. Dead owners are reclaimed under a gate. */
export class Files {
  readonly root: string;
  constructor(root: string) {
    this.root = this.resolveExisting(path.resolve(root));
  }
  private resolveExisting(p: string): string {
    if (fs.existsSync(p)) return fs.realpathSync(p);
    const parent = path.dirname(p);
    return parent === p
      ? p
      : path.join(this.resolveExisting(parent), path.basename(p));
  }
  path(name: string): string {
    check(typeof name === "string" && name.length, "Missing relative path");
    check(
      !path.isAbsolute(name) && !name.split(/[\\/]/).includes(".."),
      "Paths must be feature-relative",
    );
    const resolved = this.resolveExisting(path.join(this.root, name));
    check(
      resolved !== this.root && resolved.startsWith(this.root + path.sep),
      "Path escapes feature directory",
    );
    return resolved;
  }
  async locked<T>(fn: () => T | Promise<T>): Promise<T> {
    fs.mkdirSync(this.root, { recursive: true });
    // The gate serializes acquisition and dead-owner recovery; partial acquisition fails closed.
    const lock = path.join(this.root, ".flowctl.lock");
    const gate = path.join(this.root, ".flowctl.lock.recovery");
    const token = `${process.pid}-${randomUUID()}`;
    const deadline = Date.now() + 30000;
    while (true) {
      let gated = false,
        acquired = false;
      try {
        try {
          fs.mkdirSync(gate);
          gated = true;
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
        }
        if (gated) {
          try {
            const fd = fs.openSync(lock, "wx", 0o600);
            try {
              fs.writeFileSync(fd, token);
              fs.fsyncSync(fd);
            } finally {
              fs.closeSync(fd);
            }
            acquired = true;
          } catch (e) {
            if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
            check(
              fs.lstatSync(lock).isFile(),
              "Legacy or invalid .flowctl.lock; inspect and remove it when no CLI is running",
              true,
            );
            const owner = fs.readFileSync(lock, "utf8"),
              pid = Number(owner.split("-")[0]);
            check(Number.isInteger(pid) && pid > 0, "Invalid lock owner", true);
            let alive = true;
            try {
              process.kill(pid, 0);
            } catch (err) {
              if ((err as NodeJS.ErrnoException).code === "ESRCH")
                alive = false;
              else if ((err as NodeJS.ErrnoException).code !== "EPERM")
                throw err;
            }
            if (!alive) {
              fs.unlinkSync(lock);
              const fd = fs.openSync(lock, "wx", 0o600);
              try {
                fs.writeFileSync(fd, token);
                fs.fsyncSync(fd);
              } finally {
                fs.closeSync(fd);
              }
              acquired = true;
            }
          }
        }
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      } finally {
        if (gated) fs.rmdirSync(gate);
      }
      if (acquired) break;
      if (Date.now() >= deadline)
        throw new FlowError(
          "Feature lock is busy, or acquisition was interrupted; inspect .flowctl.lock.recovery before retrying",
          "condition",
          2,
        );
      await delay(25);
    }
    try {
      return await fn();
    } finally {
      check(
        fs.readFileSync(lock, "utf8") === token,
        "Feature lock ownership changed",
      );
      fs.unlinkSync(lock);
    }
  }
  atomic(name: string, data: string | Uint8Array): void {
    const target = this.path(name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const tmp = path.join(path.dirname(target), ".flowctl-" + randomUUID());
    let fd: number | undefined;
    try {
      fd = fs.openSync(tmp, "wx", 0o600);
      fs.writeFileSync(fd, data);
      fs.fsyncSync(fd);
      fs.closeSync(fd);
      fd = undefined;
      fs.renameSync(tmp, target);
      // Windows does not support fsync on directories; file data is still flushed before rename.
      if (process.platform !== "win32") {
        const directory = fs.openSync(path.dirname(target), "r");
        try {
          fs.fsyncSync(directory);
        } finally {
          fs.closeSync(directory);
        }
      }
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    }
  }
}

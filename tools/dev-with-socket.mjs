#!/usr/bin/env node

import { spawn } from "node:child_process";
import process from "node:process";

const children = new Set();
let stopping = false;

function start(command, args, env = process.env) {
  const child = spawn(command, args, { stdio: "inherit", env });
  children.add(child);
  child.once("exit", (code, signal) => {
    children.delete(child);
    if (!stopping) stop(code || (signal ? 1 : 0));
  });
  return child;
}

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  setTimeout(() => {
    for (const child of children) child.kill("SIGKILL");
    process.exit(code);
  }, 3000).unref();
  if (children.size === 0) process.exit(code);
}

process.once("SIGINT", () => stop(0));
process.once("SIGTERM", () => stop(0));

const socketPort = process.env.SOCKET_PORT || "3001";
let socketAlreadyRunning = false;
try {
  const response = await fetch(`http://127.0.0.1:${socketPort}/health`, {
    signal: AbortSignal.timeout(500),
  });
  socketAlreadyRunning = response.ok;
} catch {
  // The launcher starts the socket service below.
}

if (!socketAlreadyRunning) {
  start(process.execPath, ["socket-server.js"], {
    ...process.env,
    NODE_ENV: "development",
    SOCKET_PORT: socketPort,
  });
} else {
  console.log(`[dev] Reusing Socket.IO server on port ${socketPort}`);
}

start(process.execPath, ["node_modules/next/dist/bin/next", "dev"]);

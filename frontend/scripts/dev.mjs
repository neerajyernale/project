// Starts the shell and the remotes in watch mode (docs/MICROFRONTEND.md §8).
//   npm start                      shell + all 8 remotes
//   npm start -- inventory admin   shell + only those remotes; the others show "unavailable"
//   SHELL_PORT=4210 npm start      shell on another port (remotes keep 4201–4208)
import { spawn } from 'child_process';
import { readFileSync } from 'fs';
import { createServer } from 'net';

const remotes = JSON.parse(readFileSync(new URL('../federation.remotes.json', import.meta.url), 'utf8'));
const wanted = process.argv.slice(2);
const unknown = wanted.filter((n) => !remotes.some((r) => r.name === n));
if (unknown.length) {
  console.error(`Unknown remote(s): ${unknown.join(', ')}. Known: ${remotes.map((r) => r.name).join(', ')}`);
  process.exit(1);
}

const projects = [
  { project: 'shell', port: Number(process.env.SHELL_PORT) || 4200 },
  ...remotes.filter((r) => !wanted.length || wanted.includes(r.name)).map((r) => ({ project: `mfe-${r.name}`, port: r.port })),
];
// ng serve asks interactively when a port is taken, which a background process can't answer.
// ng serve listens on 127.0.0.1; probe there (a probe on the IPv6 wildcard misses it on Windows).
const isFree = (port) =>
  new Promise((resolve) => {
    const probe = createServer().once('error', () => resolve(false));
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
  });
const busy = [];
for (const { project, port } of projects) {
  if (!(await isFree(port))) busy.push(`${port} (${project})`);
}
if (busy.length) {
  console.error(`Port(s) already in use: ${busy.join(', ')}.\nStop whatever runs there (e.g. the old prototype on 4200) and try again.`);
  process.exit(1);
}

const IMPORTANT = /compiled|error|warning|failed|already in use|listening/i;
const width = Math.max(...projects.map((p) => p.project.length));
const children = [];

for (const { project, port } of projects) {
  const child = spawn('npx', ['ng', 'serve', project, '--port', String(port)], { shell: true, env: { ...process.env, FORCE_COLOR: '1' } });
  const prefix = `${project.padEnd(width)} |`;
  let buffer = '';
  const print = (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop();
    // Status and problems only; the per-chunk size tables of nine builds would bury them.
    for (const line of lines) if (IMPORTANT.test(line)) console.log(`${prefix} ${line}`);
  };
  child.stdout.on('data', print);
  child.stderr.on('data', print);
  child.on('exit', (code) => console.log(`${prefix} exited (${code})`));
  children.push(child);
  console.log(`${prefix} http://localhost:${port}`);
}

console.log(`\nOpen http://localhost:${projects[0].port} once every project reports "Compiled successfully".\n`);

const stop = () => {
  for (const child of children) child.kill();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

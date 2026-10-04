// Boot the lab image in v86 (in Node), run the smoke test, and save a booted state
// so the browser restores in seconds instead of booting Linux.
//   node vm/state.mjs <v86 checkout> <out dir>
import fs from 'node:fs';
import path from 'node:path';
import { V86 } from 'v86';

const [V86_REPO, OUT] = process.argv.slice(2);
const emulator = new V86({
  wasm_path: path.join(path.dirname(new URL(import.meta.resolve('v86')).pathname), 'v86.wasm'),
  bios: { url: path.join(V86_REPO, 'bios/seabios.bin') },
  vga_bios: { url: path.join(V86_REPO, 'bios/vgabios.bin') },
  autostart: true,
  memory_size: 256 * 1024 * 1024,
  vga_memory_size: 2 * 1024 * 1024,
  bzimage_initrd_from_filesystem: true,
  cmdline: 'rw root=host9p rootfstype=9p rootflags=trans=virtio,cache=loose modules=virtio_pci tsc=reliable init_on_free=on console=ttyS0',
  filesystem: { baseurl: path.join(OUT, 'flat'), basefs: path.join(OUT, 'fs.json') },
});

let buf = '';
const t0 = Date.now();
const waitFor = (marker, ms) => new Promise((ok, fail) => {
  const start = Date.now();
  const iv = setInterval(() => {
    if (buf.includes(marker)) { clearInterval(iv); ok(); }
    else if (Date.now() - start > ms) { clearInterval(iv); fail(new Error(`timeout waiting for ${marker}\n--- last output ---\n${buf.slice(-3000)}`)); }
  }, 200);
});
const run = async (cmd, ms = 300_000) => {
  // the marker is assembled by printf, so the echoed command line can't match it
  const id = Math.random().toString(36).slice(2, 8);
  const tag = `__END_${id}`;
  buf = '';
  emulator.serial0_send(`${cmd}; printf '%s_%s rc=%s\\n' __END ${id} $?\n`);
  await waitFor(tag + ' rc=', ms);
  const out = buf.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').replace(/\r/g, '');
  const body = out.slice(out.indexOf(' __END ' + id) + 1);
  console.log(`\n$ ${cmd}\n${body.slice(body.indexOf('\n') + 1, body.lastIndexOf(tag))}[${out.match(new RegExp(tag + ' (rc=\\d+)'))?.[1]}]`);
  return out;
};

emulator.add_listener('serial0-output-byte', (b) => { buf += String.fromCharCode(b); });

try {
  await waitFor(':~# ', 600_000);
  console.log(`booted in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  await run('stty cols 120; uname -r; iptables -V; python3 -V; ip -V');
  // smoke test: the firewall lab, exactly as a reader runs it
  await run('cd /root && curl -O https://samadeep.github.io/labs/intranet-to-internet/lab.sh && chmod +x lab.sh && sudo ./lab.sh up && sudo ./lab.sh dnat-bug', 600_000);
  await run('sudo ./lab.sh down; rm -f lab.sh; cd /root; clear');
  await run('sync; echo 3 > /proc/sys/vm/drop_caches');
  await new Promise((r) => setTimeout(r, 3000));
  const state = await emulator.save_state();
  fs.writeFileSync(path.join(OUT, 'state.bin'), new Uint8Array(state));
  console.log(`state saved: ${(state.byteLength / 2 ** 20).toFixed(1)} MiB, total ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  emulator.destroy();
  process.exit(0);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

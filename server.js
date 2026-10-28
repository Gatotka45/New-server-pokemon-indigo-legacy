// Pokemon Anil Cable Club room server (raw TCP). Mirrors CableClubMiniServer.
// Client sends "find,<...>,<8-digit code>,...\n". Two clients with the same code are paired, then relayed.
const net = require('net');
const PORT = process.env.PORT || 25565;
const waiting = new Map(); // code -> {sock, line}
const pairs = new Map();   // sock -> {peer, code}

const send = (s, t) => { try { s.write(t + '\n'); } catch (e) {} };

function dropPair(s) {
  const p = pairs.get(s);
  if (!p) return;
  pairs.delete(s);
  pairs.delete(p.peer);
  send(p.peer, 'disconnect,peer disconnected');
  p.peer.end();
}

net.createServer((sock) => {
  sock.setNoDelay(true);
  sock.setKeepAlive(true, 30000);
  sock.st = 'pending';
  let buf = '';
  const timer = setTimeout(() => { if (sock.st === 'pending') sock.destroy(); }, 20000);

  sock.on('data', (d) => {
    if (sock.st === 'relay') { const p = pairs.get(sock); if (p) p.peer.write(d); return; }
    if (sock.st === 'waiting') return;
    buf += d.toString('latin1');
    if (buf.length > 512 * 1024) return sock.destroy();
    const i = buf.indexOf('\n');
    if (i < 0) return;
    clearTimeout(timer);
    const line = buf.slice(0, i).replace(/\r$/, '');
    const rest = Buffer.from(buf.slice(i + 1), 'latin1');
    const f = line.split(',');
    if (f[0] !== 'find') return sock.destroy();
    const code = (f[2] || '').trim();
    if (!/^\d{8}$/.test(code)) { send(sock, 'disconnect,invalid code'); return sock.end(); }
    if ([...pairs.values()].some((p) => p.code === code)) { send(sock, 'disconnect,group full'); return sock.end(); }
    const w = waiting.get(code);
    if (w && !w.sock.destroyed) {
      waiting.delete(code);
      pairs.set(w.sock, { peer: sock, code });
      pairs.set(sock, { peer: w.sock, code });
      w.sock.st = 'relay'; sock.st = 'relay';
      send(w.sock, line.replace(/^find,/, 'found,0,') + ',0');
      send(sock, w.line.replace(/^find,/, 'found,1,') + ',0');
      if (rest.length) w.sock.write(rest);
    } else {
      waiting.set(code, { sock, line });
      sock.st = 'waiting';
    }
  });

  const gone = () => {
    clearTimeout(timer);
    for (const [c, w] of waiting) if (w.sock === sock) waiting.delete(c);
    dropPair(sock);
  };
  sock.on('close', gone);
  sock.on('error', gone);
}).listen(PORT, '0.0.0.0', () => console.log('Anil server on', PORT));

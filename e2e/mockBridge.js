// A tiny in-memory stand-in for another_bridge, implementing exactly the
// endpoints the app calls. Started once for the whole Detox run (see
// globalSetup.js). Deterministic fixtures, no filesystem, no Claude.
const http = require('http');

const API_KEY = 'e2e-test-key';
const PORT = 8093;

const card = (id, title, project) => ({
  session_id: id,
  title,
  cwd: `/Users/e2e/${project}`,
  project,
  message_count: 2,
  created_at: null,
  last_activity: Math.floor(Date.now() / 1000) - 120,
  size_bytes: 2048,
});

const turn = (index, role, text) => ({
  index,
  uuid: `u${index}`,
  role,
  text,
  tool_calls: 0,
  tools: [],
  timestamp: null,
});

function freshState() {
  return {
    sessions: [card('s1', 'Fix the flaky parser', 'parser-repo'), card('s2', 'Ship dark mode', 'app-repo')],
    // per-session transcripts, oldest-first internally
    turns: {
      s1: [turn(1, 'user', 'why is the parser flaky?'), turn(2, 'assistant', 'It trips on unterminated fences.')],
      s2: [turn(1, 'user', 'plan dark mode'), turn(2, 'assistant', 'Tokens first, then the screens.')],
    },
  };
}

function startMockBridge() {
  const state = freshState();

  const server = http.createServer((req, res) => {
    if (req.headers['x-coder-key'] !== API_KEY) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ detail: 'bad key' }));
      return;
    }

    const url = new URL(req.url, `http://localhost:${PORT}`);
    const parts = url.pathname.split('/').filter(Boolean); // e.g. ['sessions','s1','messages']
    const json = (body, status = 200) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };

    if (req.method === 'GET' && url.pathname === '/sessions') {
      json({ sessions: state.sessions });
      return;
    }

    if (req.method === 'GET' && parts[0] === 'sessions' && parts[2] === 'messages') {
      const t = state.turns[parts[1]] ?? [];
      json({
        messages: [...t].reverse(), // API is newest-first
        total: t.length,
        has_more: false,
        next_before: null,
      });
      return;
    }

    if (req.method === 'GET' && parts[2] === 'resume' && parts[3] === 'status') {
      json({ running: false, started_at: null, queued: [], queue_count: 0 });
      return;
    }

    if (req.method === 'POST' && parts[2] === 'resume' && parts[3] === 'stream') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const { message } = JSON.parse(body || '{}');
        const t = state.turns[parts[1]];
        const reply = `mock reply to: ${message}`;
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });
        // stream the reply in two chunks, then commit it to the
        // transcript and emit done — mirroring the real bridge's order
        res.write(`event: text\ndata: ${JSON.stringify({ chunk: 'mock reply ' })}\n\n`);
        setTimeout(() => {
          res.write(`event: text\ndata: ${JSON.stringify({ chunk: `to: ${message}` })}\n\n`);
          t.push(turn(t.length + 1, 'user', message));
          t.push(turn(t.length + 1, 'assistant', reply));
          res.write('event: done\ndata: {}\n\n');
          res.end();
        }, 300);
      });
      return;
    }

    if (req.method === 'POST' && parts[2] === 'resume' && parts[3] === 'queue') {
      json({ ok: true, session_id: parts[1], queued: 1 });
      return;
    }

    json({ detail: 'not found' }, 404);
  });

  return new Promise((resolve) => {
    server.listen(PORT, () => resolve(server));
  });
}

module.exports = { startMockBridge, PORT, API_KEY };

// Comprehensive pre-event test suite: admin edge cases + 70-player load test.
//
// Usage (from the repo root):
//   PORT=4001 node server.js &     # a server under test — NOT your live one
//   npm run test:e2e
//
// Talks to the real Supabase project via .env, so run it BEFORE the event,
// never during a live game. All test data (sessions, responses, added
// questions) is deleted at the end and the seed bank is verified intact.
import { io } from 'socket.io-client';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const URL = process.env.TEST_URL || 'http://localhost:4001';
const env = Object.fromEntries(
  readFileSync('.env', 'utf8').split('\n').filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail = '') {
  if (cond) { pass += 1; console.log(`  PASS ${name}`); }
  else { fail += 1; failures.push(name + (detail ? ` — ${detail}` : '')); console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function connect() {
  return new Promise((resolve, reject) => {
    const s = io(URL, { transports: ['websocket'], forceNew: true });
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
    setTimeout(() => reject(new Error('connect timeout')), 5000);
  });
}
const emit = (s, ev, payload) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`ack timeout: ${ev}`)), 10000);
    s.emit(ev, payload, (res) => { clearTimeout(t); resolve(res); });
  });
const waitEvent = (s, ev, timeoutMs = 15000) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`event timeout: ${ev}`)), timeoutMs);
    s.once(ev, (data) => { clearTimeout(t); resolve(data); });
  });

const sessionIds = [];
const addedQuestionIds = [];
const draft = (over = {}) => ({
  questionText: 'TEST question — safe to delete',
  options: { A: 'a1', B: 'b2', C: 'c3', D: 'd4' },
  correctOption: 'B',
  timeLimitSeconds: 20,
  ...over,
});

// ---------------------------------------------------------------------------
async function sectionAdminValidation() {
  console.log('\n== A. Admin validation & permissions ==');
  const host = await connect();
  const created = await emit(host, 'create-room', {});
  check('create-room ok, 5 seed questions', created.ok && created.questions.length === 5);
  sessionIds.push(created.sessionId);

  // add-question happy path
  const added = await emit(host, 'add-question', draft());
  check('add-question ok -> 6 questions', added.ok && added.questions.length === 6, added.error);
  const newQ = added.ok ? added.questions[5] : null;
  if (newQ) addedQuestionIds.push(newQ.id);
  check('added question fields correct', newQ && newQ.questionText === 'TEST question — safe to delete' && newQ.correctOption === 'B' && newQ.timeLimitSeconds === 20);

  // validation rejections
  const cases = [
    ['empty text', draft({ questionText: '   ' })],
    ['missing option', draft({ options: { A: 'a', B: '', C: 'c', D: 'd' } })],
    ['bad correct option', draft({ correctOption: 'E' })],
    ['timer too low', draft({ timeLimitSeconds: 4 })],
    ['timer too high', draft({ timeLimitSeconds: 181 })],
    ['timer NaN', draft({ timeLimitSeconds: 'abc' })],
    ['null payload', null],
  ];
  for (const [name, payload] of cases) {
    const res = await emit(host, 'add-question', payload);
    check(`add-question rejects ${name}`, !res.ok);
  }

  // update-question index validation
  for (const idx of [-1, 99, 'abc']) {
    const res = await emit(host, 'update-question', { index: idx, ...draft() });
    check(`update-question rejects index ${idx}`, !res.ok);
  }

  // update persists (edit the test question we just added)
  const upd = await emit(host, 'update-question', { index: 5, ...draft({ questionText: 'TEST edited', timeLimitSeconds: 45 }) });
  check('update-question ok', upd.ok && upd.question.questionText === 'TEST edited' && upd.question.timeLimitSeconds === 45, upd.error);
  if (newQ) {
    const { data } = await supabase.from('questions').select('question_text,time_limit_seconds').eq('id', newQ.id).single();
    check('update persisted to bank', data?.question_text === 'TEST edited' && data?.time_limit_seconds === 45);
  }

  // set-all-timers validation + no-op-value apply (30 == current seed value)
  const badAll = await emit(host, 'set-all-timers', { timeLimitSeconds: 2 });
  check('set-all-timers rejects 2s', !badAll.ok);
  const okAll = await emit(host, 'set-all-timers', { timeLimitSeconds: 30 });
  check('set-all-timers ok, all 30s', okAll.ok && okAll.questions.every((q) => q.timeLimitSeconds === 30), okAll.error);

  // remove-question index validation + happy path (removes the test question)
  const badIdx = await emit(host, 'remove-question', { index: 42 });
  check('remove-question rejects bad index', !badIdx.ok);
  const badId = await emit(host, 'remove-question', { id: 'no-such-id' });
  check('remove-question rejects unknown id', !badId.ok);
  const rem = await emit(host, 'remove-question', { index: 5 });
  check('remove-question ok -> back to 5', rem.ok && rem.questions.length === 5, rem.error);
  if (newQ && rem.ok) {
    const { data } = await supabase.from('questions').select('id,is_active').eq('id', newQ.id).maybeSingle();
    const gone = !data || data.is_active === false;
    check('removed question gone from bank (soft or hard)', gone, JSON.stringify(data));
    if (gone) addedQuestionIds.pop();
  }

  // non-host cannot use admin events
  const stranger = await connect();
  for (const [ev, payload] of [
    ['add-question', draft()],
    ['update-question', { index: 0, ...draft() }],
    ['remove-question', { index: 0 }],
    ['set-all-timers', { timeLimitSeconds: 30 }],
    ['start-game', {}],
    ['next-question', {}],
  ]) {
    const res = await emit(stranger, ev, payload);
    check(`non-host blocked: ${ev}`, !res.ok);
  }
  // even a joined PLAYER cannot
  const joined = await emit(stranger, 'join-room', { gameCode: created.gameCode, nickname: 'Sneaky', playerToken: 'tok-sneaky' });
  check('player can join', joined.ok, joined.error);
  const sneak = await emit(stranger, 'add-question', draft());
  check('joined player blocked from add-question', !sneak.ok);

  // join validations
  check('bad game code rejected', !(await emit(stranger, 'join-room', { gameCode: '99', nickname: 'X', playerToken: 't' })).ok);
  check('empty nickname rejected', !(await emit(stranger, 'join-room', { gameCode: created.gameCode, nickname: '  ', playerToken: 't' })).ok);
  check('unknown room rejected', !(await emit(stranger, 'join-room', { gameCode: '0000', nickname: 'X', playerToken: 't' })).ok);

  // after start, editing is locked
  const started = await emit(host, 'start-game', {});
  check('start-game ok', started.ok, started.error);
  for (const [ev, payload] of [
    ['add-question', draft()],
    ['update-question', { index: 0, ...draft() }],
    ['remove-question', { index: 0 }],
    ['set-all-timers', { timeLimitSeconds: 30 }],
  ]) {
    const res = await emit(host, ev, payload);
    check(`locked after start: ${ev}`, !res.ok && /before the game starts/.test(res.error), res.error);
  }
  const restart = await emit(host, 'start-game', {});
  check('double start-game rejected', !restart.ok);

  host.disconnect();
  stranger.disconnect();
}

// ---------------------------------------------------------------------------
async function sectionAdminConcurrency() {
  console.log('\n== B. Admin concurrency ==');
  const host = await connect();
  const created = await emit(host, 'create-room', {});
  sessionIds.push(created.sessionId);

  // 3 simultaneous adds
  const adds = await Promise.all([1, 2, 3].map((n) => emit(host, 'add-question', draft({ questionText: `TEST concurrent ${n}` }))));
  check('3 concurrent adds all ok', adds.every((r) => r.ok), adds.map((r) => r.error).join(','));
  // acks resolve as each insert lands, so only the fullest one has all 3
  const fullest = adds.reduce((a, b) => ((b.questions?.length ?? 0) > (a.questions?.length ?? 0) ? b : a), adds[0]);
  check('question count is 8 after 3 adds', fullest.questions?.length === 8, `got ${fullest.questions?.length}`);
  const testQs = (fullest.questions ?? []).filter((q) => q.questionText.startsWith('TEST concurrent'));
  addedQuestionIds.push(...testQs.map((q) => q.id));

  // simultaneous removes, targeted by id like the real UI
  const rems = await Promise.all(testQs.map((q) => emit(host, 'remove-question', { id: q.id })));
  check('3 concurrent removes all ok', rems.every((r) => r.ok), rems.map((r) => r.error).join(','));
  const finalCounts = rems.filter((r) => r.ok).map((r) => r.questions.length);
  check('concurrent removes leave exactly 5 questions', Math.min(...finalCounts) === 5, JSON.stringify(finalCounts));
  const emptiest = rems.reduce((a, b) => ((b.questions?.length ?? 99) < (a.questions?.length ?? 99) ? b : a), rems[0]);
  const seedIntact = emptiest.questions?.every((q) => !q.questionText.startsWith('TEST'));
  check('seed questions untouched by concurrent removes', seedIntact);

  // verify bank state (select * — is_active may not exist pre-migration)
  const { data: bank, error: bankErr } = await supabase.from('questions').select('*');
  const activeTests = (bank ?? []).filter((q) => q.question_text.startsWith('TEST') && q.is_active !== false);
  check('no TEST questions active in bank', !bankErr && activeTests.length === 0, bankErr?.message ?? JSON.stringify(activeTests.map((q) => q.id)));

  host.disconnect();
}

// ---------------------------------------------------------------------------
async function sectionLoadTest() {
  console.log('\n== C. Load test: 70 players, full game ==');
  const host = await connect();
  const created = await emit(host, 'create-room', {});
  sessionIds.push(created.sessionId);
  const { gameCode, hostToken } = created;
  const questions = created.questions;

  // 70 players; 10 of them all want the nickname "Karan"
  const players = [];
  const sockets = await Promise.all(Array.from({ length: 70 }, () => connect()));
  const joins = await Promise.all(
    sockets.map((s, i) =>
      emit(s, 'join-room', {
        gameCode,
        nickname: i < 10 ? 'Karan' : `Player${i}`,
        playerToken: `lt-tok-${i}`,
      })
    )
  );
  joins.forEach((res, i) => players.push({ socket: sockets[i], token: `lt-tok-${i}`, res, score: 0, name: res.nickname }));
  check('all 70 players joined', joins.every((r) => r.ok), joins.filter((r) => !r.ok).map((r) => r.error).join(','));
  const karans = new Set(joins.slice(0, 10).map((r) => r.nickname));
  check('duplicate nicknames deduped (10 unique Karans)', karans.size === 10, [...karans].slice(0, 4).join(','));
  check('nickname suffixing works', karans.has('Karan') && karans.has('Karan 2'));

  await sleep(700); // let the throttled broadcast fire
  const playerList = await new Promise((resolve) => {
    host.emit('reclaim-host', { gameCode, hostToken }, (res) => resolve(res.players));
  });
  check('host sees 70 players', playerList?.length === 70, `got ${playerList?.length}`);

  // start and play all questions
  const firstQ = waitEvent(host, 'question-started');
  const st = await emit(host, 'start-game', {});
  check('start-game ok with 70 players', st.ok, st.error);
  let q = await firstQ;

  const OPTS = ['A', 'B', 'C', 'D'];
  let totalAccepted = 0;
  let hostSocket = host;

  for (let round = 0; round < questions.length; round += 1) {
    check(`Q${round} broadcast index/total`, q.index === round && q.total === questions.length);
    check(`Q${round} has no correct answer in payload`, !('correctOption' in q) && !('correct_option' in q));

    const active = players.filter((p) => !p.dropped);

    // register the reveal waiter BEFORE answering: with everyone answered the
    // server auto-reveals in 800ms, which can beat a later-registered listener
    const revealP = waitEvent(hostSocket, 'question-revealed', 8000);

    // everyone answers at once (worst-case burst)
    const answers = await Promise.all(
      active.map((p, i) =>
        emit(p.socket, 'submit-answer', { selectedOption: OPTS[(i + round) % 4] }).then((r) => ({ p, r, opt: OPTS[(i + round) % 4] }))
      )
    );
    const okAnswers = answers.filter((a) => a.r.ok);
    check(`Q${round}: all ${active.length} answers accepted`, okAnswers.length === active.length, `${okAnswers.length}/${active.length}`);
    totalAccepted += okAnswers.length;

    // scoring sanity: correct >= 500 pts, wrong = 0, totals track
    const correctOpt = questions[round].correctOption;
    const scoringOk = answers.every(({ p, r, opt }) => {
      if (!r.ok) return true;
      const expectCorrect = opt === correctOpt;
      const pointsOk = expectCorrect ? r.points >= 500 && r.points <= 1000 : r.points === 0;
      const totalOk = r.totalScore === p.score + r.points;
      p.score += r.points;
      return r.isCorrect === expectCorrect && pointsOk && totalOk;
    });
    check(`Q${round}: scoring correct (500-1000 fast-correct, 0 wrong, totals add up)`, scoringOk);

    // double answer must be rejected
    const dbl = await emit(active[0].socket, 'submit-answer', { selectedOption: 'A' });
    check(`Q${round}: double answer rejected`, !dbl.ok);

    // all answered -> server auto-reveals (~800ms), no host click needed
    const reveal = await revealP;
    const countSum = Object.values(reveal.optionCounts).reduce((a, b) => a + b, 0);
    check(`Q${round}: auto-reveal, optionCounts sum = ${active.length}`, countSum === active.length, `${countSum}`);
    check(`Q${round}: reveal has correct answer + leaderboard`, reveal.correctOption === correctOpt && reveal.leaderboard.length === 5);

    // late answer after reveal is rejected
    const late = await emit(active[1].socket, 'submit-answer', { selectedOption: 'A' });
    check(`Q${round}: answer after reveal rejected`, !late.ok);

    if (round === 1) {
      // drop 5 players after Q2's reveal; 3 will come back
      for (const p of players.slice(60, 65)) { p.dropped = true; p.socket.disconnect(); }
    }

    if (round === 2) {
      // mid-game HOST refresh: reclaim from a brand-new socket
      hostSocket.disconnect();
      const newHost = await connect();
      const rec = await emit(newHost, 'reclaim-host', { gameCode, hostToken });
      check('host reclaim mid-game ok', rec.ok && rec.status === 'reveal', rec.error ?? rec.status);
      hostSocket = newHost;

      // 3 of the dropped players rejoin with their old tokens
      for (const p of players.slice(60, 63)) {
        p.socket = await connect();
        const rj = await emit(p.socket, 'join-room', { gameCode, nickname: p.name, playerToken: p.token });
        check(`player ${p.name} rejoined with score intact`, rj.ok && rj.rejoined && rj.score === p.score, JSON.stringify({ ok: rj.ok, rejoined: rj.rejoined, score: rj.score, expected: p.score }));
        p.dropped = false;
      }

      // brand-new player mid-game is turned away
      const lateJoiner = await connect();
      const lj = await emit(lateJoiner, 'join-room', { gameCode, nickname: 'TooLate', playerToken: 'lt-tok-late' });
      check('new player blocked mid-game', !lj.ok && /already started/.test(lj.error), lj.error);
      lateJoiner.disconnect();
    }

    const isLast = round + 1 >= questions.length;
    const nextQ = isLast ? null : players.find((p) => !p.dropped) && waitEvent(players.find((p) => !p.dropped).socket, 'question-started', 6000);
    const endEvt = isLast ? waitEvent(players.find((p) => !p.dropped).socket, 'game-ended', 6000) : null;
    const adv = await emit(hostSocket, 'next-question', {});
    check(`advance after Q${round} ok`, adv.ok, adv.error);
    if (!isLast) q = await nextQ;
    else {
      const end = await endEvt;
      const lb = end.leaderboard;
      check('final leaderboard <= 10 entries, sorted desc', lb.length <= 10 && lb.every((e, i) => i === 0 || lb[i - 1].score >= e.score));
      const localTop = players.map((p) => p.score).sort((a, b) => b - a).slice(0, lb.length);
      check('final leaderboard scores match local tracking', JSON.stringify(lb.map((e) => e.score)) === JSON.stringify(localTop), `server=${lb.map((e) => e.score)} local=${localTop}`);
    }
  }

  // responses flushed to DB
  await sleep(1500);
  const { count } = await supabase.from('player_responses').select('*', { count: 'exact', head: true }).eq('session_id', created.sessionId);
  check(`all ${totalAccepted} responses logged to Supabase`, count === totalAccepted, `db=${count}`);
  const { data: sess } = await supabase.from('game_sessions').select('status,ended_at').eq('id', created.sessionId).single();
  check('session marked completed', sess?.status === 'completed' && !!sess?.ended_at);

  hostSocket.disconnect();
  for (const p of players) p.socket.disconnect();
}

// ---------------------------------------------------------------------------
async function sectionTimerEdge() {
  console.log('\n== D. Timer edge: auto-reveal with silent players ==');
  const host = await connect();
  const created = await emit(host, 'create-room', {});
  sessionIds.push(created.sessionId);
  const q0 = created.questions[0];

  // shorten Q1 to the 5s minimum so the test is fast (restored after)
  const upd = await emit(host, 'update-question', { index: 0, questionText: q0.questionText, options: q0.options, correctOption: q0.correctOption, timeLimitSeconds: 5 });
  check('set Q1 timer to 5s', upd.ok, upd.error);

  const p1 = await connect(), p2 = await connect();
  await emit(p1, 'join-room', { gameCode: created.gameCode, nickname: 'Fast', playerToken: 'te-1' });
  await emit(p2, 'join-room', { gameCode: created.gameCode, nickname: 'Silent', playerToken: 'te-2' });

  const revealP = waitEvent(host, 'question-revealed', 10000);
  const startedAt = Date.now();
  await emit(host, 'start-game', {});
  await emit(p1, 'submit-answer', { selectedOption: q0.correctOption }); // p2 stays silent
  const reveal = await revealP;
  const elapsed = Date.now() - startedAt;
  check('auto-reveal fired without host click', !!reveal);
  check(`auto-reveal at ~5.8s (got ${elapsed}ms)`, elapsed >= 5000 && elapsed < 9000);
  check('silent player counted as unanswered', reveal.totalAnswered === 1);

  const late = await emit(p2, 'submit-answer', { selectedOption: 'A' });
  check('answer after timeout rejected', !late.ok, late.error);

  // restore the seed timer
  const restore = await emit2Restore();
  async function emit2Restore() {
    // room already advanced past lobby; restore via a fresh room's admin
    const h2 = await connect();
    const c2 = await emit(h2, 'create-room', {});
    sessionIds.push(c2.sessionId);
    const res = await emit(h2, 'set-all-timers', { timeLimitSeconds: 30 });
    h2.disconnect();
    return res;
  }
  check('seed timers restored to 30s', restore.ok && restore.questions.every((x) => x.timeLimitSeconds === 30), restore.error);

  host.disconnect(); p1.disconnect(); p2.disconnect();
}

// ---------------------------------------------------------------------------
async function cleanupAndVerifyBank() {
  console.log('\n== E. Cleanup + bank integrity ==');
  // delete test sessions (cascades player_responses), then any leftover TEST questions
  if (sessionIds.length) {
    const { error } = await supabase.from('game_sessions').delete().in('id', sessionIds);
    check('test sessions deleted (responses cascaded)', !error, error?.message);
  }
  const { data: leftovers } = await supabase.from('questions').select('id,question_text').ilike('question_text', 'TEST%');
  if (leftovers?.length) {
    const { error } = await supabase.from('questions').delete().in('id', leftovers.map((q) => q.id));
    check('leftover TEST questions hard-deleted', !error, error?.message);
  } else {
    check('no leftover TEST questions in bank', true);
  }

  // final: bank must be exactly the 5 seed questions at 30s
  const { data: bank } = await supabase.from('questions').select('*').order('display_order');
  const active = (bank ?? []).filter((q) => q.is_active !== false);
  check('bank has exactly 5 active questions', active.length === 5, `got ${active.length}`);
  check('all seed timers are 30s', active.every((q) => q.time_limit_seconds === 30));
  check('seed order 1..5 intact', active.map((q) => q.display_order).join(',') === '1,2,3,4,5');
}

// ---------------------------------------------------------------------------
// Watchdog: if anything hangs, still run cleanup and exit nonzero instead of
// leaving test rows in the production bank.
const watchdog = setTimeout(async () => {
  console.error('\nWATCHDOG: suite exceeded 120s, forcing cleanup + exit');
  fail += 1; failures.push('WATCHDOG timeout');
  try { await cleanupAndVerifyBank(); } catch {}
  process.exit(1);
}, 120000);

try {
  await sectionAdminValidation();
  await sectionAdminConcurrency();
  await sectionLoadTest();
  await sectionTimerEdge();
} catch (err) {
  fail += 1;
  failures.push(`CRASH: ${err.message}`);
  console.error('\nSUITE CRASH:', err);
} finally {
  await cleanupAndVerifyBank();
}

clearTimeout(watchdog);
console.log(`\n===== ${pass} passed, ${fail} failed =====`);
if (failures.length) { console.log('Failures:'); failures.forEach((f) => console.log('  - ' + f)); }
process.exit(fail === 0 ? 0 : 1);

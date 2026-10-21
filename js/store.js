// 상태 저장소 (데모용: 브라우저 localStorage가 백엔드 역할)
window.S = (function () {
  const KEY = 'wooyeon-table-v1';
  let st = null;
  const listeners = [];

  const now = () => st.clock.now;
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { console.warn('save failed', e); } }
  function load() {
    try { const raw = localStorage.getItem(KEY); if (raw) { st = JSON.parse(raw); if (st.version === 3) return true; } } catch (e) {}
    return false;
  }
  function commit() { save(); listeners.forEach((f) => f()); }
  function onChange(f) { listeners.push(f); }

  function audit(actor, action, detail) { st.audit.unshift({ t: now(), actor, action, detail }); if (st.audit.length > 600) st.audit.length = 600; }
  function log(app, msg) { app.log.push({ t: now(), msg }); }
  function exception(type, title, detail, refs = {}) {
    const dup = st.exceptions.find((e) => e.status === 'OPEN' && e.type === type && JSON.stringify(e.refs) === JSON.stringify(refs));
    if (dup) return dup;
    const ex = { id: U.uid('ex'), type, title, detail, refs, status: 'OPEN', t: now() };
    st.exceptions.unshift(ex);
    audit('SYSTEM', '예외 등록', `${title}`);
    return ex;
  }

  // 알림 (INF-08: 실패 시 자동 재시도, 3회 실패만 운영자 예외로)
  const toastQ = [];
  function notify(userId, template, title, body, link) {
    const u = st.users[userId]; if (!u) return;
    const n = { id: U.uid('n'), userId, t: now(), template, title, body, link: link || '', channel: 'PUSH', status: 'SENT', tries: 1, read: false };
    if (u.pushBroken) {
      n.tries = 3; n.status = 'FAILED';
      exception('NOTIFY_FAIL', '알림 발송 실패 (3회 재시도)', `${u.name}님에게 '${title}' 푸시 발송 실패 · 앱 내 알림함에는 저장됨`, { userId });
    }
    st.notifs.unshift(n);
    if (st.session.userId === userId && !st.session.admin) toastQ.push(n);
  }
  const takeToasts = () => toastQ.splice(0);

  // ─────────── 시드 데이터로 데모 세계 구성 ───────────
  const VENUES = [
    ['HONGDAE', '연남 비스트로 소담', '서울 마포구 연남로 23', 'B2', 2],
    ['HONGDAE', '합정 오스테리아 루체', '서울 마포구 독막로 7길 12', 'B3', 2],
    ['HONGDAE', '망원 한식주점 달빛', '서울 마포구 포은로 81', 'B1', 1],
    ['GANGNAM', '신논현 와인다이닝 무드', '서울 강남구 봉은사로 112', 'B3', 2],
    ['GANGNAM', '강남 이탈리안 파스타랩', '서울 강남구 강남대로 98길 20', 'B2', 2],
    ['EULJIRO', '을지로 노포 이층집', '서울 중구 을지로 15길 6', 'B1', 2],
    ['EULJIRO', '종로 모던한식 소반', '서울 종로구 수표로 28길 9', 'B2', 2],
    ['JAMSIL', '송리단길 비스트로 온', '서울 송파구 백제고분로 45길 18', 'B2', 1],
  ];

  function phoneOf(i) { return `010-${U.pad(2000 + ((i * 37) % 7900)).slice(-4)}-${U.pad(1000 + ((i * 7919) % 8999)).slice(-4)}`; }

  function seed() {
    const T0 = new Date(2026, 9, 21, 14, 0).getTime(); // 2026-10-21(수) 14:00
    const r = U.rng(20261021);
    st = {
      version: 3, clock: { now: T0, start: T0 }, session: { userId: null, admin: false, demoUsers: {} },
      settings: { weights: { age: 30, gender: 25, mbti: 20, interest: 15, wants: 10 }, minScore: 55, newPenalty: 12, algo: 'match-v1.3' },
      users: {}, slots: [], venues: [], apps: [], payments: [], tables: [], chats: {}, runs: [], exceptions: [], feedback: [], reports: [], blocks: [], notifs: [], audit: [], contents: null,
    };
    st.contents = window.CONTENT.defaults();

    SEED_USERS.forEach((p, i) => {
      st.users[p.id] = {
        id: p.id, name: p.name, phone: phoneOf(i + 1), gender: p.gender, birthYear: p.birthYear, job: p.job, mbti: p.mbti,
        interests: p.interests, traits: p.traits, wants: p.wants, budget: p.budget, avoid: p.avoid, allergy: '',
        prefRegions: p.regions, agreed: true, profileDone: true, createdAt: T0 - 120 * U.DAY,
        account: { status: 'ACTIVE', restrictedUntil: null }, penalty: 0,
        wallet: { credits: [], membership: null }, pushBroken: false,
      };
    });
    const ids = Object.keys(st.users);

    VENUES.forEach(([region, name, address, price, cap], i) => st.venues.push({ id: 'v' + (i + 1), region, name, address, price, capacity: cap, active: true, map: `https://map.naver.com/p/search/${encodeURIComponent(name)}` }));

    // 회차: 과거(수기 운영 이력) + 앞으로의 목요일
    const pastDates = U.uniq(SEED_USERS.flatMap((p) => p.dates)).filter((d) => U.fromKey(d) < T0 - U.DAY).sort();
    const future = ['2026-10-22', '2026-10-29', '2026-11-05', '2026-11-12', '2026-11-19'];
    [...pastDates, ...future].forEach((d) => {
      Object.keys(U.REGIONS).forEach((rg) => {
        const start = U.fromKey(d, U.POLICY.eventHour, U.POLICY.eventMin);
        st.slots.push({ id: `s-${d}-${rg}`, date: d, region: rg, start, deadline: U.fromKey(d) - (U.POLICY.deadlineDaysBefore - 1) * U.DAY, capacity: 24, open: true });
      });
    });

    // 과거 이력: 수기 매칭 테이블(DONE) → '이전 만남'·피드백 데이터
    pastDates.forEach((d) => {
      Object.keys(U.REGIONS).forEach((rg) => {
        const ppl = SEED_USERS.filter((p) => p.dates.includes(d) && p.regions[0] === rg && r() < 0.6).sort((a, b) => a.birthYear - b.birthYear);
        for (let k = 0; k + 4 <= ppl.length; k += 5) {
          const grp = ppl.slice(k, Math.min(k + 5, ppl.length));
          if (grp.length < 4) break;
          const tid = U.uid('t');
          const v = st.venues.find((x) => x.region === rg);
          st.tables.push({ id: tid, date: d, region: rg, members: grp.map((p) => p.id), status: 'DONE', legacy: true, venueId: v.id, score: null, breakdown: null, flags: {}, createdAt: U.fromKey(d) - 2 * U.DAY, runId: null, log: ['수기 매칭 (Google Forms 운영 이력)'] });
          grp.forEach((p) => {
            const ns = r() < 0.04;
            st.apps.push({ id: U.uid('a'), userId: p.id, dates: [d], regions: [rg], pass: 'SINGLE', appStatus: 'SUBMITTED', payStatus: 'PAID', matchStatus: 'CONFIRMED', attendance: ns ? 'NO_SHOW' : 'ATTENDED', tableId: tid, date: d, region: rg, log: [], realloc: 0, createdAt: U.fromKey(d) - 7 * U.DAY, legacy: true });
            if (!ns && r() < 0.7) {
              const people = {};
              grp.forEach((o) => { if (o.id !== p.id) { const x = r(); people[o.id] = x < 0.25 ? 'AGAIN' : x < 0.29 ? 'NEVER' : null; } });
              st.feedback.push({ id: U.uid('f'), tableId: tid, userId: p.id, ratings: { mood: 4 + (r() < 0.6 ? 1 : 0), talk: 3 + Math.floor(r() * 3), food: 3 + Math.floor(r() * 3) }, revisit: r() < 0.7 ? 'YES' : 'MAYBE', recommend: r() < 0.6, comment: '', people, t: U.fromKey(d) + U.DAY });
            }
          });
        }
      });
    });

    // 재신청자 일부는 멤버십 보유
    ids.filter((id) => SEED_USERS.find((p) => p.id === id).apps > 1).slice(0, 12).forEach((id, i) => {
      st.users[id].wallet.membership = { plan: i % 2 ? 'M3' : 'M1', start: T0 - 20 * U.DAY, expires: T0 + (i % 2 ? 70 : 10) * U.DAY };
    });

    // 진행 중 신청: 10/22(마감 지남 → 첫 tick에 자동 매칭), 10/29·11/5(모집 중)
    const pool = ids.slice().sort(() => r() - 0.5);
    st.users[pool[40]].pushBroken = true; // 알림 발송 실패 예외 데모용
    const mkApp = (uid, dates, payStatus, createdAt) => {
      const u = st.users[uid];
      const pass = u.wallet.membership ? 'MEMBERSHIP' : 'SINGLE';
      const a = { id: U.uid('a'), userId: uid, dates, regions: u.prefRegions.slice(0, 2), pass, appStatus: 'SUBMITTED', payStatus, matchStatus: 'WAITING', attendance: null, tableId: null, date: null, region: null, log: [], realloc: 0, createdAt };
      a.log.push({ t: createdAt, msg: '신청서 제출' });
      if (payStatus === 'PAID') {
        const pid = U.uid('p');
        st.payments.push({ id: pid, userId: uid, appId: a.id, item: pass === 'MEMBERSHIP' ? '멤버십 이용' : '1회권', amount: pass === 'MEMBERSHIP' ? 0 : 9900, status: 'PAID', method: r() < 0.7 ? '카카오페이' : '신용카드', createdAt, refundFail: false });
        a.paymentId = pid; a.log.push({ t: createdAt + U.MIN * 3, msg: pass === 'MEMBERSHIP' ? '멤버십으로 참가 확정 (결제 불필요)' : '결제 완료 9,900원' });
      } else if (payStatus === 'FAILED') a.log.push({ t: createdAt + U.MIN, msg: '결제 실패 (카드 한도 초과)' });
      st.apps.push(a);
      return a;
    };
    pool.slice(0, 38).forEach((uid, i) => mkApp(uid, i % 4 === 0 ? ['2026-10-22', '2026-10-29'] : ['2026-10-22'], 'PAID', T0 - (3 + (i % 4)) * U.DAY));
    pool.slice(38, 92).forEach((uid, i) => mkApp(uid, i % 3 === 0 ? ['2026-10-29', '2026-11-05'] : ['2026-10-29'], i === 50 ? 'FAILED' : i > 50 ? 'PENDING' : 'PAID', T0 - (i % 5) * U.DAY - 3 * U.HOUR));
    pool.slice(92, 110).forEach((uid, i) => mkApp(uid, ['2026-11-05'], 'PAID', T0 - (i % 3) * U.DAY));

    st.session.demoUsers = {};
    audit('SYSTEM', '데모 데이터 초기화', `참가자 ${ids.length}명 · 신청 ${st.apps.filter((a) => !a.legacy).length}건`);
  }

  // 데모: 매칭 실패자 중 한 명이 이미 환불을 선택했으나 카드사 오류로 실패한 상황
  function seedRefundFailure() {
    const du = Object.values(st.session.demoUsers);
    const a = st.apps.find((x) => !x.legacy && x.matchStatus === 'ALTERNATIVE_OFFERED' && x.payStatus === 'REFUND_AVAILABLE' && !du.includes(x.userId));
    if (!a) return;
    const p = st.payments.find((x) => x.id === a.paymentId); if (!p) return;
    p.refundFail = true;
    ENGINE.resolve(a.id, 'REFUND');
    ENGINE.tick();
  }
  function boot() { seed(); ENGINE.tick(); pickDemoUsers(); seedRefundFailure(); }
  function init() {
    if (!load()) { boot(); save(); }
  }
  function reset() { localStorage.removeItem(KEY); boot(); commit(); }

  // 로그인 화면의 '데모 계정' (상태별 대표 참가자)
  function pickDemoUsers() {
    const live = st.apps.filter((a) => !a.legacy);
    const confirmed = live.find((a) => a.matchStatus === 'CONFIRMED' && a.date === '2026-10-22' && st.tables.find((t) => t.id === a.tableId)?.venueId);
    const failed = live.find((a) => a.matchStatus === 'ALTERNATIVE_OFFERED' && a.pass === 'SINGLE' && a.payStatus === 'REFUND_AVAILABLE');
    const waiting = live.find((a) => a.matchStatus === 'WAITING' && a.dates.includes('2026-10-29') && a.payStatus === 'PAID' && st.apps.filter((x) => x.userId === a.userId && x.legacy && x.attendance === 'ATTENDED').length > 0) || live.find((a) => a.matchStatus === 'WAITING' && a.payStatus === 'PAID');
    st.session.demoUsers = { confirmed: confirmed?.userId, failed: failed?.userId, waiting: waiting?.userId };
  }

  return {
    get st() { return st; }, now, save, commit, onChange, init, reset, audit, log, exception, notify, takeToasts, KEY,
    user: (id) => st.users[id], me: () => st.users[st.session.userId],
  };
})();

// 라우터 · 이벤트 위임 · 토스트/모달 · 데모 시계
window.App = (function () {
  const A = {}; // 액션 레지스트리
  const app = { draft: {}, modal: null, demoOpen: false, lastRoute: '' };

  function parse() {
    const h = location.hash.replace(/^#\/?/, '');
    const [path, q] = h.split('?');
    return { parts: path.split('/').filter(Boolean), query: new URLSearchParams(q || '') };
  }
  const go = (h) => { if (location.hash === h) render(); else location.hash = h; };

  function render() {
    const r = parse();
    const key = r.parts.join('/');
    const sameRoute = key === app.lastRoute;
    const y = window.scrollY;
    const isAdmin = r.parts[0] === 'admin';
    let html;
    try { html = isAdmin ? AdminView.render(r) : PartView.render(r); }
    catch (e) { console.error(e); html = `<div class="page"><div class="card mt24"><h3>화면을 불러오지 못했어요</h3><p class="muted small">${U.esc(e.message)}</p><a class="btn sm" href="#/home">홈으로</a></div></div>`; }
    document.getElementById('root').innerHTML = html + demoBar(isAdmin) + modalHtml();
    document.body.style.background = isAdmin ? '#F6F2EC' : '';
    if (sameRoute) window.scrollTo(0, y); else window.scrollTo(0, 0);
    app.lastRoute = key;
    const chat = document.querySelector('[data-autoscroll]'); if (chat && !sameRoute) window.scrollTo(0, document.body.scrollHeight);
    flushToasts();
  }

  // ── 토스트(푸시 알림 시뮬레이션) ──
  function flushToasts() {
    const box = document.getElementById('toasts');
    S.takeToasts().slice(0, 3).forEach((n, i) => {
      const el = document.createElement('div');
      el.className = 'toast';
      el.innerHTML = `<div class="app">🔔 우연한 식탁 · 푸시 알림</div><div class="tt">${U.esc(n.title)}</div><div class="tb">${U.esc(n.body)}</div>`;
      el.onclick = () => { el.remove(); if (n.link) go(n.link); };
      setTimeout(() => box.appendChild(el), i * 350);
      setTimeout(() => el.remove(), 5200 + i * 350);
    });
  }
  function toast(title, body) {
    const el = document.createElement('div'); el.className = 'toast';
    el.innerHTML = `<div class="tt">${U.esc(title)}</div>${body ? `<div class="tb">${U.esc(body)}</div>` : ''}`;
    document.getElementById('toasts').appendChild(el); setTimeout(() => el.remove(), 3200);
  }

  // ── 모달 ──
  function modalHtml() { return app.modal ? `<div class="modal-bg" data-act="closeModal" data-self="1"><div class="modal">${app.modal()}</div></div>` : ''; }
  function openModal(fn) { app.modal = fn; render(); }
  function closeModal() { app.modal = null; render(); }
  A.closeModal = (d, el, e) => { if (d.self && e.target !== el) return; closeModal(); };

  // ── 데모 시계 ──
  function demoBar(isAdmin) {
    const st = S.st, now = st.clock.now;
    if (!app.demoOpen) return `<div class="demo"><button class="demo-pill" data-act="demoToggle">🕐 ${U.fdt(now)} <span style="opacity:.6">데모 시각</span></button></div>`;
    const me = S.me();
    return `<div class="demo"><div class="demo-panel">
      <h4>DEMO CLOCK · 시간 이동</h4>
      <div class="now">${U.fdt(now)}</div>
      <div class="g">
        <button data-act="demoJump" data-to="h1">+1시간</button>
        <button data-act="demoJump" data-to="d1">+1일</button>
        <button class="full" data-act="demoJump" data-to="deadline">⏩ 다음 매칭 마감 직후<div class="hint">마감 시각에 자동 매칭이 실행돼요</div></button>
        <button data-act="demoJump" data-to="eve">모임 전날 19:30<div class="hint">리마인드 발송</div></button>
        <button data-act="demoJump" data-to="start">모임 시작<div class="hint">대화 주제 게시</div></button>
        <button data-act="demoJump" data-to="checkin">체크인 시간<div class="hint">19:20</div></button>
        <button data-act="demoJump" data-to="end">모임 종료 후<div class="hint">노쇼 후보·피드백</div></button>
      </div>
      <div class="g">
        <button data-act="go" data-to="${isAdmin ? (me ? '#/home' : '#/login') : '#/admin'}">${isAdmin ? '📱 참가자 앱' : '🛠 운영자 어드민'}</button>
        <button data-act="demoReset">↺ 데모 초기화</button>
      </div>
      <button data-act="demoToggle" style="width:100%;text-align:center">닫기</button>
    </div></div>`;
  }
  A.demoToggle = () => { app.demoOpen = !app.demoOpen; render(); };
  A.go = (d) => { app.demoOpen = false; go(d.to); };
  A.demoReset = () => { if (!confirm('데모 데이터를 처음 상태로 되돌릴까요?')) return; S.reset(); app.draft = {}; app.demoOpen = false; go('#/login'); };
  A.demoJump = (d) => {
    const st = S.st, P = U.POLICY; let t = st.clock.now;
    const myTable = () => {
      const me = S.me(); if (!me) return null;
      const a = st.apps.filter((x) => x.userId === me.id && x.matchStatus === 'CONFIRMED' && x.tableId && ['SCHEDULED', 'ATTENDED', null].includes(x.attendance))
        .map((x) => st.tables.find((tb) => tb.id === x.tableId)).filter((tb) => tb && (tb.status === 'CONFIRMED' || (d.to === 'end' && tb.status !== 'DISSOLVED' && U.fromKey(tb.date, P.eventHour, P.eventMin) + P.eventDurationH * U.HOUR > t)));
      return a.sort((x, y) => (x.date < y.date ? -1 : 1))[0];
    };
    const nextEventDate = () => { const tb = myTable(); if (tb) return tb.date; const ds = U.uniq(st.tables.filter((x) => x.status === 'CONFIRMED').map((x) => x.date)).sort(); return ds[0] || ENGINE.openDates()[0]; };
    if (d.to === 'h1') t += U.HOUR;
    if (d.to === 'd1') t += U.DAY;
    if (d.to === 'deadline') {
      const ds = U.uniq(st.apps.filter((a) => !a.legacy && a.appStatus === 'SUBMITTED').flatMap((a) => a.dates)).map(ENGINE.deadlineOf).filter((x) => x > t).sort((a, b) => a - b);
      if (!ds.length) { toast('대기 중인 매칭 마감이 없어요'); return; }
      t = ds[0] + U.MIN;
    }
    const ev = nextEventDate();
    if (['eve', 'start', 'checkin', 'end'].includes(d.to)) {
      if (!ev) { toast('예정된 모임이 없어요'); return; }
      const start = U.fromKey(ev, P.eventHour, P.eventMin);
      const target = { eve: start - U.DAY, start: start + U.MIN, checkin: start - 10 * U.MIN, end: start + P.eventDurationH * U.HOUR + U.MIN }[d.to];
      if (target <= t) { toast('이미 지난 시각이에요', '다른 시점을 선택해주세요'); return; }
      t = target;
    }
    st.clock.now = t; ENGINE.tick(); S.audit('DEMO', '데모 시각 이동', U.fdt(t)); S.commit();
  };

  // ── 이벤트 위임 ──
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]'); if (!el) return;
    const fn = A[el.dataset.act]; if (!fn) return console.warn('no action', el.dataset.act);
    if (el.tagName === 'A' || el.tagName === 'BUTTON') e.preventDefault();
    fn(el.dataset, el, e);
  });
  function setPath(obj, path, val) { const ks = path.split('.'); let o = obj; ks.slice(0, -1).forEach((k) => (o = o[k] ||= {})); o[ks[ks.length - 1]] = val; }
  document.addEventListener('input', (e) => { const el = e.target.closest('[data-bind]'); if (el) setPath(app.draft, el.dataset.bind, el.type === 'checkbox' ? el.checked : el.value); });
  document.addEventListener('change', (e) => { const el = e.target.closest('[data-bind]'); if (el) { setPath(app.draft, el.dataset.bind, el.type === 'checkbox' ? el.checked : el.value); if (el.dataset.rerender) render(); } });
  document.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const el = e.target.closest('[data-enter]'); if (el) { e.preventDefault(); A[el.dataset.enter]?.(el.dataset, el, e); } } });

  function start() {
    S.init();
    S.onChange(render);
    window.addEventListener('hashchange', () => { app.modal = null; render(); });
    if (!location.hash) location.hash = S.st.session.userId ? '#/home' : '#/login';
    render();
    window.AUTH && AUTH.init().catch((e) => console.warn("auth init", e));
  }

  return { A, app, go, render, toast, openModal, closeModal, start, get draft() { return app.draft; }, set draft(v) { app.draft = v; } };
})();

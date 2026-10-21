// 참가자 모바일 웹앱
window.PartView = (function () {
  const A = App.A, st = () => S.st, now = () => S.now(), E = U.esc, P = U.POLICY;
  const RN = (r) => U.REGIONS[r].name, RS = (r) => U.REGIONS[r].short;
  const D = (k) => U.fdate(U.fromKey(k));

  // ───────── 상태 라벨 (신청·결제·매칭·참석 분리 표시) ─────────
  const L = {
    app: { DRAFT: ['작성 중', ''], SUBMITTED: ['신청 완료', 'green'], CANCELED: ['신청 취소', ''] },
    pay: { PENDING: ['결제 대기', 'amber'], PAID: ['결제 완료', 'green'], FAILED: ['결제 실패', 'red'], REFUND_AVAILABLE: ['환불 선택 가능', 'amber'], REFUND_REQUESTED: ['환불 요청', 'blue'], REFUND_PROCESSING: ['환불 처리 중', 'blue'], REFUNDED: ['환불 완료', ''], REFUND_FAILED: ['환불 확인 중', 'red'] },
    match: { WAITING: ['매칭 대기', 'amber'], MATCHING: ['매칭 중', 'blue'], REALLOCATING: ['재배치 중', 'blue'], CONFIRMED: ['확정', 'green'], ALTERNATIVE_OFFERED: ['대체 일정 선택', 'red'], TRANSFERRED: ['일정 이동 · 매칭 대기', 'amber'], NO_MATCH: ['매칭 종료', ''], EXCEPTION: ['확인 중', 'red'] },
    att: { SCHEDULED: ['참석 예정', 'blue'], ATTENDED: ['참석 완료', 'green'], CANCELED_EARLY: ['사전 취소', ''], CANCELED_LATE: ['늦은 취소', 'red'], NO_SHOW: ['노쇼', 'red'] },
  };
  const badge = (grp, s) => { const x = L[grp][s]; return x ? `<span class="badge ${x[1]}">${x[0]}</span>` : ''; };
  const lbl = (grp, s) => (L[grp][s] || ['-'])[0];

  const COLORS = ['#B9774A', '#7C8B5F', '#5F7C8B', '#9A6A8E', '#C08A3E', '#6B7FA8', '#A86B5F', '#5E8D7B'];
  const avatar = (u, size = 40) => `<div class="avatar" style="width:${size}px;height:${size}px;background:${COLORS[U.hash(u.id) % COLORS.length]}">${E(given(u.name)[0])}</div>`;
  const given = (n) => (n.length >= 3 ? n.slice(1) : n);
  const ageBand = (by) => { const a = U.age(by, now()); const d = Math.floor(a / 10) * 10, r = a % 10; return `${d}대 ${r <= 3 ? '초반' : r <= 6 ? '중반' : '후반'}`; };

  // ───────── 공통 셸 ─────────
  function tabbar(tab) {
    const me = S.me();
    const unread = st().notifs.filter((n) => n.userId === me.id && !n.read).length;
    const t = (id, href, ic, label, dot) => `<a href="${href}" class="${tab === id ? 'on' : ''}"><span class="ic">${ic}</span>${label}${dot ? `<span class="dot">${dot}</span>` : ''}</a>`;
    return `<nav class="tabbar">${t('home', '#/home', '🕯️', '홈')}${t('apply', '#/apply', '✍️', '신청')}${t('history', '#/history', '🍽️', '내 식탁')}${t('notifs', '#/notifs', '🔔', '알림', unread > 9 ? '9+' : unread || '')}${t('me', '#/me', '👤', 'MY')}</nav>`;
  }
  function shell(title, body, o = {}) {
    return `<div class="phone" ${o.pb ? `style="padding-bottom:${o.pb}px"` : ''}>
      ${o.noTop ? '' : `<div class="topbar">${o.back ? `<button class="back" data-act="back" aria-label="뒤로">‹</button>` : ''}<h2>${title}</h2>${o.right || ''}</div>`}
      <div class="page">${body}</div>${o.noTab ? '' : tabbar(o.tab)}</div>${o.cta ? `<div class="sticky-cta">${o.cta}</div>` : ''}`;
  }
  A.back = () => (history.length > 1 ? history.back() : App.go('#/home'));
  const logo = (size = 22) => `<span class="logo" style="font-size:${size}px">${[...'우연한식탁'].map((c) => `<span>${c}</span>`).join('')}</span>`;

  // ───────── 데이터 헬퍼 ─────────
  const myApps = (u) => st().apps.filter((a) => a.userId === u.id && !a.legacy).sort((a, b) => b.createdAt - a.createdAt);
  const tableOf = (a) => a && a.tableId && st().tables.find((t) => t.id === a.tableId);
  const startOf = (date) => U.fromKey(date, P.eventHour, P.eventMin);
  const endOf = (date) => startOf(date) + P.eventDurationH * U.HOUR;
  const venueOf = (t) => t && st().venues.find((v) => v.id === t.venueId);
  const hasFb = (t, u) => st().feedback.some((f) => f.tableId === t.id && f.userId === u.id);
  const canCheckIn = (a, t) => a.attendance === 'SCHEDULED' && now() >= startOf(t.date) - 30 * U.MIN && now() < endOf(t.date);

  function focus(u) {
    const Ls = myApps(u);
    const conf = Ls.filter((a) => a.matchStatus === 'CONFIRMED' && a.appStatus === 'SUBMITTED' && tableOf(a)?.status === 'CONFIRMED' && ['SCHEDULED', 'ATTENDED'].includes(a.attendance)).sort((a, b) => (a.date < b.date ? -1 : 1))[0];
    if (conf) return { kind: 'CONFIRMED', a: conf, t: tableOf(conf) };
    const fb = Ls.find((a) => tableOf(a)?.status === 'DONE' && a.attendance === 'ATTENDED' && !hasFb(tableOf(a), u));
    if (fb) return { kind: 'FEEDBACK', a: fb, t: tableOf(fb) };
    const alt = Ls.find((a) => a.matchStatus === 'ALTERNATIVE_OFFERED' && a.appStatus === 'SUBMITTED');
    if (alt) return { kind: 'ALT', a: alt };
    const pend = Ls.find((a) => a.appStatus === 'SUBMITTED' && ['PENDING', 'FAILED'].includes(a.payStatus) && a.matchStatus === 'WAITING');
    if (pend) return { kind: 'PAY', a: pend };
    const wait = Ls.find((a) => a.appStatus === 'SUBMITTED' && ['WAITING', 'TRANSFERRED', 'MATCHING', 'REALLOCATING'].includes(a.matchStatus));
    if (wait) return { kind: 'WAIT', a: wait };
    return { kind: 'NONE' };
  }

  // ═════════ 로그인 ═════════
  function login() {
    const d = (App.draft.login ||= {});
    const du = st().session.demoUsers || {};
    const demo = (uid, ic, title, sub) => { const u = uid && S.user(uid); return u ? `<div class="li" data-act="demoLogin" data-uid="${uid}"><div style="font-size:22px">${ic}</div><div class="grow"><b>${title}</b><div class="small muted">${E(u.name)} · ${sub}</div></div><span class="chev">›</span></div>` : ''; };
    return `<div class="phone" style="padding-bottom:40px">
      <div style="background:radial-gradient(110% 80% at 50% 105%, #E9A35A40 0, transparent 60%),linear-gradient(170deg,#3A2A20,#1B130E);color:#FFF1DE;padding:56px 20px 40px;text-align:center;border-radius:0 0 28px 28px">
        <div class="small" style="opacity:.75;letter-spacing:.2em">· 매주 목요일 저녁 ·</div>
        <div class="logo-wrap mt16"><div class="rule"></div>${logo(30)}<div class="rule"></div><div class="script">by Whatsup House</div></div>
        <p class="serif" style="font-size:18px;margin:22px 0 0;line-height:1.6">처음 보는 사람들과<br>좋은 저녁 한 끼</p>
        <p class="small" style="opacity:.6;margin-top:8px"><span class="candle"></span>마음 따뜻한 공간, 해가 지는 선선한 저녁에 만나요</p>
      </div>
      <div class="page" style="margin-top:20px">
        <div class="card">
          <h3>휴대폰 번호로 시작하기</h3>
          <label class="f">휴대폰 번호</label>
          <div class="row"><input class="input grow" inputmode="tel" placeholder="010-0000-0000" data-bind="login.phone" value="${E(d.phone || '')}" data-enter="sendCode"><button class="btn sm ${d.sent ? 'ghost' : ''}" data-act="sendCode">${d.sent ? '재전송' : '인증번호'}</button></div>
          ${d.sent ? `<label class="f">인증번호</label><input class="input" inputmode="numeric" maxlength="6" placeholder="6자리" data-bind="login.code" value="${E(d.code || '')}" data-enter="verify"><p class="xs faint mt8">해커톤 테스트 로그인: 인증번호 <b>000000</b></p><button class="btn block mt12" data-act="verify">로그인 / 회원가입</button>` : ''}
        </div>
        <div class="section-title">데모 계정으로 바로 체험하기</div>
        <div class="list">
          ${demo(du.confirmed, '🕯️', '테이블 확정된 참가자', '10/22(목) 식탁 · 단체방·체크인·피드백')}
          ${demo(du.waiting, '⏳', '결제 완료 · 매칭 대기 (재방문)', '10/29 자동 매칭 대기')}
          ${demo(du.failed, '🔁', '매칭 실패 참가자', '대체 일정·보관·환불 선택')}
          <div class="li" data-act="demoNew"><div style="font-size:22px">✨</div><div class="grow"><b>처음 가입하는 참가자</b><div class="small muted">프로필 작성부터 신청·결제까지</div></div><span class="chev">›</span></div>
        </div>
        <p class="center mt24"><a href="#/admin" class="small muted">운영자 어드민 바로가기 →</a></p>
      </div></div>`;
  }
  const normPhone = (p) => (p || '').replace(/\D/g, '');
  A.sendCode = () => {
    const d = App.draft.login || {};
    if (!/^01\d{8,9}$/.test(normPhone(d.phone))) return App.toast('휴대폰 번호를 확인해주세요', '예: 010-1234-5678');
    d.sent = true; App.render(); App.toast('인증번호를 보냈어요', '테스트 인증번호는 000000 이에요');
  };
  A.verify = () => {
    const d = App.draft.login || {};
    if (d.code !== '000000') return App.toast('인증번호가 일치하지 않아요');
    const ph = normPhone(d.phone);
    let u = Object.values(st().users).find((x) => normPhone(x.phone) === ph);
    if (!u) u = newUser(d.phone);
    loginAs(u.id);
  };
  function newUser(phone) {
    const id = U.uid('n');
    const u = { id, name: '', phone: phone || `010-${Math.floor(1000 + Math.random() * 8999)}-${Math.floor(1000 + Math.random() * 8999)}`, gender: '', birthYear: null, job: '', mbti: '', interests: [], traits: [], wants: [], budget: [], avoid: '', allergy: '', prefRegions: [], agreed: false, profileDone: false, createdAt: now(), account: { status: 'ACTIVE', restrictedUntil: null }, penalty: 0, wallet: { credits: [], membership: null }, pushBroken: false };
    st().users[id] = u; S.audit('SYSTEM', '회원가입', phone);
    return u;
  }
  function loginAs(id) { st().session.userId = id; st().session.admin = false; App.draft = {}; S.save(); const u = S.user(id); App.go(u.profileDone ? '#/home' : '#/onboard/1'); }
  A.demoLogin = (d) => loginAs(d.uid);
  A.demoNew = () => { const u = newUser(); loginAs(u.id); };
  A.logout = () => { st().session.userId = null; S.save(); App.draft = {}; App.go('#/login'); };

  // ═════════ 프로필 위저드 (ACC-02~05, ACC-06 재사용) ═════════
  const STEPS = ['기본 정보', '나는 이런 사람', '만나고 싶은 사람', '식사 조건', '동의'];
  function onboard(step, edit) {
    const me = S.me();
    const p = (App.draft.p ||= { name: me.name, birthYear: me.birthYear || '', gender: me.gender, job: me.job, mbti: me.mbti, interests: me.interests.slice(), traits: me.traits.slice(), wants: me.wants.slice(), budget: me.budget.slice(), avoid: me.avoid, allergy: me.allergy, prefRegions: me.prefRegions.slice(), agree1: me.agreed, agree2: me.agreed, agree3: me.agreed, mkt: false });
    const chips = (path, opts, multi = true) => `<div class="chips">${opts.map((o) => { const [v, l] = Array.isArray(o) ? o : [o, o]; const cur = p[path]; const on = multi ? cur.includes(v) : cur === v; return `<span class="chip ${on ? 'on' : ''}" data-act="chip" data-path="${path}" data-val="${E(v)}" ${multi ? 'data-multi="1"' : ''}>${E(l)}</span>`; }).join('')}</div>`;
    let body = '';
    if (step === 1) body = `
      <label class="f">이름</label><input class="input" data-bind="p.name" value="${E(p.name)}" placeholder="실명 또는 모임에서 불릴 이름">
      <label class="f">연락처</label><input class="input" value="${E(me.phone)}" disabled>
      <div class="row" style="gap:10px"><div class="grow"><label class="f">출생연도</label><select class="input" data-bind="p.birthYear"><option value="">선택</option>${Array.from({ length: 27 }, (_, i) => 2006 - i).map((y) => `<option ${+p.birthYear === y ? 'selected' : ''}>${y}</option>`).join('')}</select></div>
      <div class="grow"><label class="f">성별</label><div class="seg">${[['F', '여성'], ['M', '남성']].map(([v, l]) => `<button class="${p.gender === v ? 'on' : ''}" data-act="chip" data-path="gender" data-val="${v}">${l}</button>`).join('')}</div></div></div>
      <label class="f">직업 (구체적으로)</label><input class="input" data-bind="p.job" value="${E(p.job)}" placeholder="예) 마케터, 개발자, 간호사">
      <label class="f">자주 가는 지역 (신청 시 기본값)</label>${chips('prefRegions', Object.keys(U.REGIONS).map((r) => [r, RN(r)]))}
      <p class="xs faint mt8">현재 서울 4개 지역에서만 운영해요. 다른 지역은 곧 열릴 예정이에요.</p>`;
    if (step === 2) body = `
      <label class="f">MBTI</label><div class="mbti-grid">${U.MBTIS.map((m) => `<span class="chip ${p.mbti === m ? 'on' : ''}" data-act="chip" data-path="mbti" data-val="${m}">${m}</span>`).join('')}</div>
      <label class="f">요즘 관심사 (복수 선택)</label>${chips('interests', U.INTERESTS)}
      <label class="f">나는 어떤 사람인가요? (복수 선택)</label>${chips('traits', U.TRAITS)}`;
    if (step === 3) body = `<p class="muted small">선택한 성향은 테이블 구성에만 쓰이고 다른 참가자에게 공개되지 않아요.</p>
      <label class="f">어떤 사람을 만나고 싶나요? (복수 선택)</label>${chips('wants', U.WANTS)}`;
    if (step === 4) body = `
      <label class="f">식사에 얼마까지 쓸 수 있나요? (복수 선택)</label>${chips('budget', Object.entries(U.BUDGETS))}
      <label class="f">못 먹는 음식</label><input class="input" data-bind="p.avoid" value="${E(p.avoid)}" placeholder="예) 고수, 날것 (없으면 비워두세요)">
      <label class="f">알레르기</label><input class="input" data-bind="p.allergy" value="${E(p.allergy)}" placeholder="예) 갑각류 (없으면 비워두세요)">
      <p class="xs faint mt8">식당 배정 시 예산과 못 먹는 음식을 함께 고려해요.</p>`;
    if (step === 5) body = `
      <div class="card tight">${[['agree1', '[필수] 개인정보 수집·이용 동의', '이름·연락처·출생연도·성별·직업·성향 정보를 매칭과 모임 안내에 사용해요. 다른 참가자에게는 확정 후에도 이름·연령대·직업·MBTI·관심사만 제한적으로 공개돼요.'], ['agree2', '[필수] 운영 정책 동의', '화요일 24:00 이후 환불 불가 · 당일 취소 불가 · 노쇼 시 4주간 참여 제한'], ['agree3', '[필수] 만 19세 이상입니다', ''], ['mkt', '[선택] 다음 모집 일정 알림 받기', '']].map(([k, t, s]) => `<label class="check"><input type="checkbox" data-bind="p.${k}" ${p[k] ? 'checked' : ''}><div><b class="small">${t}</b>${s ? `<div class="xs muted">${s}</div>` : ''}</div></label>`).join('')}</div>
      <p class="xs faint mt12">자세한 내용은 <a href="#/policy">운영 정책</a>에서 확인할 수 있어요.</p>`;
    const last = step === STEPS.length;
    return shell(edit ? '프로필 수정' : '프로필 만들기', `
      <div class="row between small"><b>${step}. ${STEPS[step - 1]}</b><span class="faint">${step}/${STEPS.length}</span></div>
      <div class="progress mt8"><i style="width:${(step / STEPS.length) * 100}%"></i></div>
      ${step === 1 && !edit ? `<p class="muted small mt12">5분이면 끝나요. 입력한 프로필은 다음 신청 때 그대로 불러와요.</p>` : ''}
      ${body}`, { back: step > 1 || edit, noTab: true, pb: 110, cta: `<button class="btn block" data-act="obNext" data-step="${step}" data-edit="${edit ? 1 : ''}">${last ? (edit ? '저장하기' : '프로필 저장하고 시작하기') : '다음'}</button>` });
  }
  A.chip = (d) => {
    const root = d.path.startsWith('apply.') ? App.draft : d.path.includes('.') ? App.draft : App.draft.p;
    const keys = d.path.split('.'); let o = root; keys.slice(0, -1).forEach((k) => (o = o[k])); const k = keys[keys.length - 1];
    if (d.multi) { const arr = o[k] || (o[k] = []); const i = arr.indexOf(d.val); i >= 0 ? arr.splice(i, 1) : arr.push(d.val); }
    else o[k] = o[k] === d.val && d.toggle ? '' : d.val;
    App.render();
  };
  A.obNext = (d) => {
    const p = App.draft.p, step = +d.step, miss = [];
    if (step === 1) { if (!p.name?.trim()) miss.push('이름'); if (!p.birthYear) miss.push('출생연도'); if (!p.gender) miss.push('성별'); if (!p.job?.trim()) miss.push('직업'); if (!p.prefRegions.length) miss.push('지역'); }
    if (step === 2) { if (!p.mbti) miss.push('MBTI'); if (!p.interests.length) miss.push('관심사'); if (!p.traits.length) miss.push('나의 성향'); }
    if (step === 3 && !p.wants.length) miss.push('만나고 싶은 사람');
    if (step === 4 && !p.budget.length) miss.push('식사 예산');
    if (step === 5 && !(p.agree1 && p.agree2 && p.agree3)) miss.push('필수 동의');
    if (miss.length) return App.toast('필수 항목을 확인해주세요', miss.join(', '));
    if (step < STEPS.length) return App.go(`#/onboard/${step + 1}${d.edit ? '?edit=1' : ''}`);
    const me = S.me();
    Object.assign(me, { name: p.name.trim(), birthYear: +p.birthYear, gender: p.gender, job: p.job.trim(), mbti: p.mbti, interests: p.interests, traits: p.traits, wants: p.wants, budget: p.budget, avoid: p.avoid || '', allergy: p.allergy || '', prefRegions: p.prefRegions, agreed: true, profileDone: true });
    S.audit(me.name, d.edit ? '프로필 수정' : '프로필 등록', '');
    delete App.draft.p; S.commit();
    App.toast(d.edit ? '프로필을 저장했어요' : `${given(me.name)}님, 환영해요!`, d.edit ? '' : '이제 참가할 날짜를 골라볼까요?');
    App.go(d.edit ? '#/me' : '#/apply');
  };

  // ═════════ 홈 ═════════
  function home() {
    const me = S.me(), f = focus(me);
    const nextDate = ENGINE.openDates()[0];
    const grid = (a) => `<div class="state-grid"><div>신청<b>${lbl('app', a.appStatus)}</b></div><div>결제<b>${lbl('pay', a.payStatus)}</b></div><div>매칭<b>${lbl('match', a.matchStatus)}</b></div></div>`;
    const steps = (n) => `<div class="steps">${[1, 2, 3, 4, 5, 6].map((i) => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</div><div class="row between xs" style="opacity:.6"><span>신청</span><span>결제</span><span>매칭</span><span>확정</span><span>식사</span><span>피드백</span></div>`;
    let hero = '';
    if (f.kind === 'NONE') hero = `<div class="hero"><div class="k">매주 목요일 저녁 7시 30분</div><h1>처음 보는 사람들과<br>좋은 저녁 한 끼</h1>
      <p class="small" style="opacity:.8">${nextDate ? `다음 모집 ${D(nextDate)} · 마감 ${U.fdeadline(ENGINE.deadlineOf(nextDate))}` : '다음 모집을 준비 중이에요'}</p><a class="btn block mt12" href="#/apply">참가 신청하기</a></div>`;
    if (f.kind === 'PAY') hero = `<div class="hero"><div class="k">결제 대기</div><h1>결제만 하면 끝나요</h1>
      <p class="small" style="opacity:.8">${U.fdeadline(ENGINE.deadlineOf(f.a.dates[0]))}까지 결제하면 자동 매칭에 포함돼요 (${U.rel(ENGINE.deadlineOf(f.a.dates[0]), now())})</p>${steps(1)}${grid(f.a)}
      <a class="btn block mt12" href="#/pay/${f.a.id}">${f.a.payStatus === 'FAILED' ? '다시 결제하기' : '결제하기'}</a></div>`;
    if (f.kind === 'WAIT') { const dl = ENGINE.deadlineOf(f.a.dates[0]); hero = `<div class="hero"><div class="k">${f.a.matchStatus === 'TRANSFERRED' ? '일정 이동 완료 · ' : ''}매칭 대기 중</div><h1>${f.a.dates.map(D).join(', ')}<br>테이블을 찾고 있어요</h1>
      <p class="small" style="opacity:.8">${U.fdeadline(dl)} 자동 매칭 → 결과를 바로 알려드려요 · ${U.rel(dl, now())}</p>${steps(2)}${grid(f.a)}
      <a class="btn block mt12" href="#/app/${f.a.id}">신청 상세 · 수정/취소</a></div>`; }
    if (f.kind === 'CONFIRMED') {
      const v = venueOf(f.t), s = startOf(f.t.date), dd = Math.ceil((U.fromKey(f.t.date) - U.fromKey(U.dkey(now()))) / U.DAY);
      const ci = canCheckIn(f.a, f.t);
      hero = `<div class="hero"><div class="k">${dd <= 0 ? '오늘' : `D-${dd}`} · 테이블 확정 · ${ENGINE.activeMembers(f.t).length}명</div><h1>${D(f.t.date)} ${U.ftime(s)}<br>${v ? E(v.name) : '식당 배정 중'}</h1>
      <p class="small" style="opacity:.8">${RN(f.t.region)}${f.a.attendance === 'ATTENDED' ? ' · ✅ 체크인 완료' : ''}</p>${steps(f.a.attendance === 'ATTENDED' ? 5 : 4)}
      ${ci ? `<button class="btn block mt12" data-act="checkIn" data-id="${f.a.id}">📍 도착했어요 · 체크인</button>` : ''}
      <div class="row mt12"><a class="btn grow" href="#/chat/${f.t.id}" style="${ci ? 'background:rgba(255,255,255,.12);color:#FFF3E3' : ''}">💬 단체방</a><a class="btn grow" href="#/table/${f.t.id}" style="background:rgba(255,255,255,.12);color:#FFF3E3">테이블 상세</a></div></div>`;
    }
    if (f.kind === 'FEEDBACK') hero = `<div class="hero"><div class="k">${D(f.t.date)} 식탁</div><h1>오늘 식탁은<br>어떠셨나요?</h1><p class="small" style="opacity:.8">1분이면 끝나요. 다음 매칭에 반영돼요.</p>${steps(5)}<a class="btn block mt12" href="#/feedback/${f.t.id}">피드백 남기기</a></div>`;
    if (f.kind === 'ALT') hero = `<div class="hero"><div class="k">매칭 결과</div><h1>이번엔 맞는 테이블을<br>찾지 못했어요</h1><p class="small" style="opacity:.8">${E(f.a.reason || '')}</p>${grid(f.a)}<a class="btn block mt12" href="#/resolve/${f.a.id}">대체 일정 · 보관 · 환불 선택</a></div>`;

    const others = myApps(me).filter((a) => a !== f.a && a.appStatus === 'SUBMITTED' && !['NO_MATCH'].includes(a.matchStatus) && !(tableOf(a) && tableOf(a).status !== 'CONFIRMED'));
    const recs = ENGINE.recommend(me);
    const u = me.wallet;
    return shell('', `
      <div class="row between" style="padding:16px 2px 14px">${logo(15)}</div>
      <p class="serif" style="font-size:19px;margin:0 2px 14px">${E(given(me.name))}님, 좋은 저녁이에요 <span class="candle"></span></p>
      ${me.account.status !== 'ACTIVE' ? `<div class="card tight" style="background:var(--red-soft);margin-bottom:12px"><b class="small" style="color:var(--red)">참여 제한 중</b><div class="xs">${me.account.status === 'BANNED' ? '이용이 영구 제한되었어요.' : `${U.fdate(me.account.restrictedUntil)}까지 신청이 제한돼요 (노쇼·당일 취소 누적)`}</div></div>` : ''}
      ${hero}
      ${others.length ? `<div class="section-title">진행 중인 다른 신청</div><div class="list">${others.map((a) => `<a class="li" href="#/app/${a.id}"><div class="grow"><b class="small">${(a.date ? [a.date] : a.dates).map(D).join(', ')}</b><div class="xs muted">${a.regions.map(RS).join('·')}</div></div>${badge('pay', a.payStatus)} ${badge('match', a.matchStatus)}<span class="chev">›</span></a>`).join('')}</div>` : ''}
      ${recs.length ? `<div class="section-title">${E(given(me.name))}님께 추천하는 다음 식탁</div><div class="col">${recs.map((r) => `<div class="card tight row"><div class="grow"><b>${D(r.date)} ${P.eventHour}:${U.pad(P.eventMin)}</b> <span class="badge">${RN(r.region)}</span><div class="xs muted mt8" style="margin-top:2px">마감 ${U.fdeadline(ENGINE.deadlineOf(r.date))} · 현재 ${r.waiting}명 대기</div></div><button class="btn sm soft" data-act="quickApply" data-date="${r.date}" data-region="${r.region}">신청</button></div>`).join('')}</div>` : ''}
      <div class="section-title">내 이용권</div>
      <a class="card tight row" href="#/me" style="text-decoration:none">${ENGINE.membershipValid(me) ? `<div class="grow"><b>${U.PASSES[u.membership.plan].label}</b><div class="xs muted">${U.fdate(u.membership.expires)}까지 · 횟수 제한 없음</div></div><span class="badge green">이용 중</span>` : `<div class="grow"><b>${u.credits.length ? `보관 중인 1회권 ${u.credits.length}장` : '보유 이용권 없음'}</b><div class="xs muted">1회권 9,900원 · 멤버십 월 20,000원부터</div></div>`}<span class="chev">›</span></a>
      <div class="section-title">우연한 식탁은 이렇게 진행돼요</div>
      <div class="card">${[['✍️', '신청·결제', '날짜와 지역을 여러 개 고를수록 매칭이 잘 돼요'], ['🎲', '화요일 24:00 자동 매칭', '나이·성비·MBTI·관심사·원하는 성향으로 4~6명 구성'], ['💬', '단체방·식당 안내', '확정 즉시 앱 단체방과 식당 정보가 열려요'], ['🍷', '목요일 19:30 식사', '대화 주제가 단체방에 자동으로 도착해요']].map(([i, t, s]) => `<div class="row" style="align-items:flex-start;padding:6px 0"><div style="font-size:20px;width:30px">${i}</div><div><b class="small">${t}</b><div class="xs muted">${s}</div></div></div>`).join('')}</div>
    `, { tab: 'home', noTop: true });
  }
  A.quickApply = (d) => { App.draft.apply = { dates: [d.date], regions: [d.region], agree: false }; App.go('#/apply'); };
  A.checkIn = (d) => { ENGINE.checkIn(d.id); S.commit(); App.toast('체크인 완료!', '즐거운 시간 보내세요 🍷'); };

  // ═════════ 신청 (APP-01~04) ═════════
  function apply() {
    const me = S.me();
    const can = ENGINE.canApply(me);
    if (!can.ok) return shell('참가 신청', `<div class="card mt12"><h3>지금은 신청할 수 없어요</h3><p class="muted small">${E(can.msg)}</p><a class="btn sm ghost" href="#/policy">운영 정책 보기</a></div>`, { tab: 'apply' });
    const a = (App.draft.apply ||= { dates: [], regions: me.prefRegions.slice(), agree: false });
    const taken = new Set(myApps(me).filter((x) => x.appStatus === 'SUBMITTED' && x.matchStatus !== 'NO_MATCH').flatMap((x) => (x.date ? [x.date] : x.dates)));
    const dates = ENGINE.openDates();
    const cnt = (d) => st().apps.filter((x) => !x.legacy && x.appStatus === 'SUBMITTED' && x.dates.includes(d)).length;
    const ok = a.dates.length && a.regions.length && a.agree;
    return shell('참가 신청', `
      <div class="card tight row"><div class="grow"><div class="xs faint">내 프로필로 신청해요</div><b class="small">${E(me.name)} · ${U.age(me.birthYear, now())}세 · ${E(me.job)} · ${me.mbti}</b><div class="xs muted">${me.interests.slice(0, 3).map(E).join(', ')}${me.interests.length > 3 ? ' 외' : ''}</div></div><a class="btn xs ghost" href="#/onboard/1?edit=1">수정</a></div>
      <div class="section-title">참가 가능한 날짜 (복수 선택)</div>
      <div class="date-grid">${dates.map((d) => { const on = a.dates.includes(d), dis = taken.has(d); return `<div class="date-card ${on ? 'on' : ''}" ${dis ? 'style="opacity:.4"' : `data-act="chip" data-path="apply.dates" data-val="${d}" data-multi="1"`}><div class="d">${D(d)}</div><div class="s">${dis ? '이미 신청함' : `마감 ${U.fdeadline(ENGINE.deadlineOf(d))}`}</div><div class="s">${P.eventHour}:${U.pad(P.eventMin)} · 신청 ${cnt(d)}명</div></div>`; }).join('')}</div>
      <p class="xs faint mt8">여러 날짜를 고르면 가장 빠른 날짜부터 매칭하고, 안 되면 다음 날짜로 자동 이월해요. 확정되면 한 번만 참여해요.</p>
      <div class="section-title">희망 지역 (복수 선택)</div>
      <div class="chips">${Object.keys(U.REGIONS).map((r) => `<span class="chip ${a.regions.includes(r) ? 'on' : ''}" data-act="chip" data-path="apply.regions" data-val="${r}" data-multi="1">${RN(r)}</span>`).join('')}</div>
      <p class="xs faint mt8">지역을 2개 이상 고르면 테이블이 성사될 확률이 높아져요.</p>
      <div class="section-title">환불 · 취소 규정</div>
      <div class="card tight small">
        <div>• <b>화요일 24:00(매칭 마감)까지</b> 취소 시 전액 환불</div>
        <div>• 수요일 취소: 환불 불가 · 경고 1점</div>
        <div>• <b>목요일 당일 취소 불가</b> · 노쇼 시 경고 3점 → 4주 참여 제한</div>
        <div>• 매칭이 안 되면 대체 일정 이동 · 이용권 보관 · 전액 환불 중 선택</div>
        <label class="check" style="padding-bottom:0"><input type="checkbox" data-bind="apply.agree" data-rerender="1" ${a.agree ? 'checked' : ''}><b>환불·취소 규정을 확인했어요</b></label>
      </div>
    `, { tab: 'apply', pb: 150, cta: `<button class="btn block" data-act="submitApply" ${ok ? '' : 'disabled'}>${a.dates.length ? `${a.dates.length}개 날짜 · ${a.regions.length}개 지역으로 신청하기` : '날짜를 선택해주세요'}</button>` });
  }
  A.submitApply = () => {
    const a = App.draft.apply, me = S.me();
    const miss = []; if (!a.dates.length) miss.push('날짜'); if (!a.regions.length) miss.push('지역'); if (!a.agree) miss.push('환불 규정 확인');
    if (miss.length) return App.toast('필수 항목을 확인해주세요', miss.join(', '));
    const app = ENGINE.submit(me.id, a.dates, a.regions);
    delete App.draft.apply; S.commit(); App.go('#/pay/' + app.id);
  };

  // ═════════ 결제 (APP-04, PAY-01~03) ═════════
  function pay(id) {
    const a = st().apps.find((x) => x.id === id), me = S.me();
    if (!a || a.userId !== me.id) return notFound();
    if (a.payStatus === 'PAID') return done(id);
    const opts = [];
    if (ENGINE.membershipValid(me)) opts.push(['MEMBERSHIP_OWNED', '보유 멤버십 사용', `${U.fdate(me.wallet.membership.expires)}까지 · 무제한`, 0]);
    if (me.wallet.credits.length) opts.push(['CREDIT', '보관 중인 1회권 사용', `${me.wallet.credits.length}장 보유`, 0]);
    Object.entries(U.PASSES).forEach(([k, v]) => opts.push([k, v.label, v.desc, v.price, v.badge]));
    const d = (App.draft.pay ||= { choice: opts[0][0], method: '카카오페이', fail: false });
    if (!opts.find((o) => o[0] === d.choice)) d.choice = opts[0][0];
    const sel = opts.find((o) => o[0] === d.choice);
    return shell('이용권 · 결제', `
      <div class="card tight"><div class="xs faint">신청 내역</div><b>${a.dates.map(D).join(', ')}</b><div class="small muted">${a.regions.map(RN).join(' · ')} · ${P.eventHour}:${U.pad(P.eventMin)}</div><div class="xs muted mt8">결제 기한 ${U.fdeadline(ENGINE.deadlineOf(a.dates[0]))} (매칭 마감)</div></div>
      ${a.payStatus === 'FAILED' ? `<div class="card tight mt12" style="background:var(--red-soft)"><b class="small" style="color:var(--red)">이전 결제가 실패했어요</b><div class="xs">다른 결제수단으로 다시 시도해주세요.</div></div>` : ''}
      <div class="section-title">이용권 선택</div>
      ${opts.map(([k, t, s, price, b]) => `<div class="opt ${d.choice === k ? 'on' : ''}" data-act="chip" data-path="pay.choice" data-val="${k}"><div class="row between"><div><b>${t}</b> ${b ? `<span class="badge brown">${b}</span>` : ''}<div class="xs muted">${s}</div></div><b>${price ? U.won(price) : '0원'}</b></div></div>`).join('')}
      <p class="xs faint mt8">멤버십은 기간 안에 횟수 제한 없이 참여할 수 있고, 매칭에 실패하면 실패한 횟수만큼 기한이 7일씩 연장돼요.</p>
      ${sel[3] ? `<div class="section-title">결제 수단 (모의 결제)</div><div class="seg">${['카카오페이', '토스페이', '신용카드'].map((m) => `<button class="${d.method === m ? 'on' : ''}" data-act="chip" data-path="pay.method" data-val="${m}">${m}</button>`).join('')}</div>
      <label class="check small"><input type="checkbox" data-bind="pay.fail" ${d.fail ? 'checked' : ''}><span class="muted">결제 실패 상황 테스트하기 (데모)</span></label>` : ''}
    `, { back: true, noTab: true, pb: 110, cta: `<button class="btn block accent" data-act="doPay" data-id="${a.id}">${sel[3] ? `${U.won(sel[3])} 결제하기` : '이용권으로 신청 완료하기'}</button>` });
  }
  A.doPay = (dd) => {
    const d = App.draft.pay;
    const r = ENGINE.pay(dd.id, d.choice, d.method, !d.fail);
    delete App.draft.pay; S.commit();
    if (r.ok) App.go('#/done/' + dd.id); else App.toast('결제에 실패했어요', '다른 결제수단으로 다시 시도해주세요');
  };
  function done(id) {
    const a = st().apps.find((x) => x.id === id);
    const dl = ENGINE.deadlineOf(a.dates[0]);
    return shell('', `<div class="center" style="padding:40px 0 10px"><div style="font-size:54px">🕯️</div><h1 class="serif" style="font-size:24px;margin-top:10px">신청이 완료되었어요</h1><p class="muted small">결과가 나오면 푸시와 앱 알림으로 바로 알려드려요.</p></div>
      <div class="card"><div class="timeline">
        <div class="ev"><b class="small">신청 · 결제 완료</b><div class="t">${U.fdt(now())}</div></div>
        <div class="ev"><b class="small">자동 매칭 실행</b><div class="t">${U.fdeadline(dl)} · ${U.rel(dl, now())}</div><div class="xs muted">4~6명 테이블 자동 구성 · 운영자 검수 없이 확정</div></div>
        <div class="ev"><b class="small">테이블 확정 · 단체방 · 식당 안내</b><div class="t">매칭 직후</div></div>
        <div class="ev"><b class="small">전날 리마인드</b><div class="t">${U.fdate(startOf(a.dates[0]) - U.DAY)} 19:30</div></div>
        <div class="ev last"><b class="small">우연한 식탁</b><div class="t">${D(a.dates[0])} ${P.eventHour}:${U.pad(P.eventMin)}</div></div>
      </div></div>
      <p class="xs faint center mt12">${U.fdeadline(dl)}까지는 앱에서 언제든 취소하고 전액 환불받을 수 있어요.</p>`,
      { noTop: true, noTab: true, pb: 110, cta: `<a class="btn block" href="#/home">홈으로</a>` });
  }

  // ═════════ 신청 상세 · 취소 (STA-01,02) ═════════
  function appDetail(id) {
    const a = st().apps.find((x) => x.id === id), me = S.me();
    if (!a || a.userId !== me.id) return notFound();
    const t = tableOf(a), phase = a.appStatus === 'SUBMITTED' ? ENGINE.cancelPhase(a) : null;
    const nextDl = a.dates.map(ENGINE.deadlineOf).find((x) => x > now());
    let cancelBox = '';
    if (a.appStatus === 'SUBMITTED' && !['NO_MATCH'].includes(a.matchStatus) && !(t && t.status === 'DONE')) {
      if (phase === 'FREE') cancelBox = `<div class="card tight"><b class="small">지금 취소하면</b><div class="xs muted">${a.pass === 'SINGLE' && a.payStatus === 'PAID' ? '결제 금액 전액이 원결제수단으로 자동 환불돼요.' : '위약 없이 취소돼요.'}</div><button class="btn sm ghost block mt8" data-act="askCancel" data-id="${a.id}">신청 취소하기</button></div>`;
      if (phase === 'LATE') cancelBox = `<div class="card tight"><b class="small">매칭 마감 이후예요</b><div class="xs muted">지금 취소하면 환불이 불가하고 경고 1점이 쌓여요. 남은 분들의 테이블은 자동으로 충원·재배치돼요.</div><button class="btn sm danger block mt8" data-act="askCancel" data-id="${a.id}">환불 없이 취소하기</button></div>`;
      if (phase === 'DAYOF' && a.attendance === 'SCHEDULED') cancelBox = `<div class="card tight"><b class="small">당일에는 취소할 수 없어요</b><div class="xs muted">부득이하게 참석이 어렵다면 미리 알려주세요. 노쇼(경고 3점) 대신 경고 2점으로 처리되고, 테이블에도 안내돼요.</div><button class="btn sm danger block mt8" data-act="askDayOf" data-id="${a.id}">참석이 어려워요</button></div>`;
    }
    return shell('신청 상세', `
      <div class="card"><div class="row wrap">${badge('app', a.appStatus)}${badge('pay', a.payStatus)}${badge('match', a.matchStatus)}${a.attendance ? badge('att', a.attendance) : ''}</div>
        <dl class="kv mt12"><dt>희망 날짜</dt><dd>${a.dates.map(D).join(', ')}</dd><dt>희망 지역</dt><dd>${a.regions.map(RN).join(', ')}</dd><dt>이용권</dt><dd>${a.pass === 'MEMBERSHIP' ? '멤버십' : a.pass === 'SINGLE' ? '1회권' : '-'}</dd>
        ${nextDl && !t ? `<dt>매칭 발표</dt><dd>${U.fdeadline(nextDl)} <span class="faint xs">(${U.rel(nextDl, now())})</span></dd>` : ''}
        ${t ? `<dt>확정 테이블</dt><dd><a href="#/table/${t.id}">${D(t.date)} ${RN(t.region)} →</a></dd>` : ''}${a.realloc ? `<dt>자동 재배치</dt><dd>${a.realloc}회</dd>` : ''}</dl>
        ${a.payStatus === 'PENDING' || a.payStatus === 'FAILED' ? `<a class="btn block mt12" href="#/pay/${a.id}">결제하기</a>` : ''}
        ${a.matchStatus === 'ALTERNATIVE_OFFERED' && a.appStatus === 'SUBMITTED' ? `<a class="btn block mt12" href="#/resolve/${a.id}">해결 방법 선택하기</a>` : ''}
      </div>
      <div class="section-title">진행 기록</div>
      <div class="card"><div class="timeline">${a.log.map((l, i) => `<div class="ev ${i === a.log.length - 1 ? 'last' : ''}"><div class="small">${E(l.msg)}</div><div class="t">${U.fdt(l.t)}</div></div>`).join('')}</div></div>
      ${cancelBox ? `<div class="section-title">취소</div>${cancelBox}` : ''}
    `, { back: true, tab: 'home' });
  }
  A.askCancel = (d) => {
    const a = st().apps.find((x) => x.id === d.id), phase = ENGINE.cancelPhase(a);
    App.openModal(() => `<h3>${phase === 'FREE' ? '신청을 취소할까요?' : '환불 없이 취소할까요?'}</h3><p class="muted small mt8">${phase === 'FREE' ? (a.pass === 'SINGLE' && a.payStatus === 'PAID' ? '9,900원이 원결제수단으로 자동 환불돼요.' : '위약 없이 취소돼요.') : '매칭 마감(화 24:00) 이후라 환불이 불가하고 경고 1점이 쌓여요.'}</p><div class="row mt16"><button class="btn ghost grow" data-act="closeModal">돌아가기</button><button class="btn grow ${phase === 'FREE' ? '' : 'danger'}" data-act="doCancel" data-id="${a.id}">취소하기</button></div>`);
  };
  A.doCancel = (d) => {
    const r = ENGINE.cancel(d.id); App.app.modal = null; S.commit();
    if (!r.ok) return App.toast(r.msg);
    App.toast('신청이 취소되었어요', r.phase === 'FREE' ? '환불은 자동으로 처리돼요' : '');
    setTimeout(() => { ENGINE.tick(); S.commit(); }, 1500);
  };
  A.askDayOf = (d) => App.openModal(() => `<h3>오늘 참석이 어려우신가요?</h3><p class="muted small mt8">당일 취소·환불은 불가해요. 미리 알려주시면 노쇼(3점) 대신 경고 2점으로 처리되고, 테이블 단체방에도 안내돼요.</p><div class="row mt16"><button class="btn ghost grow" data-act="closeModal">참석할게요</button><button class="btn danger grow" data-act="doDayOf" data-id="${d.id}">불참 알리기</button></div>`);
  A.doDayOf = (d) => { ENGINE.dayOfNotice(d.id); App.app.modal = null; S.commit(); App.toast('테이블에 불참을 알렸어요'); };

  // ═════════ 매칭 실패 해결 (STA-04~06) ═════════
  function resolveView(id) {
    const a = st().apps.find((x) => x.id === id), me = S.me();
    if (!a || a.userId !== me.id) return notFound();
    if (a.matchStatus !== 'ALTERNATIVE_OFFERED' || a.appStatus !== 'SUBMITTED') return appDetail(id);
    const mem = a.pass === 'MEMBERSHIP';
    const regions = U.uniq([...a.regions, ...Object.keys(U.REGIONS)]);
    const cands = ENGINE.openDates().flatMap((d) => regions.map((r) => ({ d, r, mine: a.regions.includes(r), n: st().apps.filter((x) => !x.legacy && x.userId !== me.id && x.appStatus === 'SUBMITTED' && x.dates.includes(d) && x.regions.includes(r) && Math.abs(S.user(x.userId).birthYear - me.birthYear) <= P.maxAgeGap).length })))
      .sort((x, y) => (y.mine - x.mine) || (x.d < y.d ? -1 : x.d > y.d ? 1 : 0) || y.n - x.n).slice(0, 6);
    const chance = (n) => (n >= 8 ? ['성사 가능성 높음', 'green'] : n >= 3 ? ['성사 가능성 보통', 'amber'] : ['신청자 모집 중', '']);
    return shell('매칭 결과', `
      <div class="card"><div class="xs faint">${a.failedDate ? D(a.failedDate) : ''} 매칭 결과</div><h3 class="serif" style="font-size:19px;margin:4px 0 6px">이번엔 맞는 테이블을 찾지 못했어요</h3>
        <div class="small muted">사유: ${E(a.reason)}</div>
        <div class="xs faint mt8">조건(나이 차 8살 이내·희망 날짜·지역)을 지키기 위해 억지로 테이블을 만들지 않았어요.</div>
        ${mem ? `<div class="badge green mt12">멤버십 기한이 ${P.membershipExtendDaysPerFail}일 자동 연장되었어요 → ${U.fdate(me.wallet.membership.expires)}</div>` : ''}</div>
      <div class="section-title">① 다른 일정으로 이동 (결제 유지)</div>
      <div class="col">${cands.map((c) => { const [t, cl] = chance(c.n); return `<div class="card tight row"><div class="grow"><b>${D(c.d)}</b> · ${RN(c.r)} ${c.mine ? '' : '<span class="badge">새 지역</span>'}<div class="xs muted">나와 나이대가 맞는 대기 ${c.n}명 · 마감 ${U.fdeadline(ENGINE.deadlineOf(c.d))} <span class="badge ${cl}" style="padding:1px 6px">${t}</span></div></div><button class="btn sm" data-act="askMove" data-id="${a.id}" data-date="${c.d}" data-region="${c.r}">이동</button></div>`; }).join('') || '<p class="muted small">모집 중인 일정이 없어요.</p>'}</div>
      <div class="section-title">${mem ? '② 이번엔 쉬어가기' : '② 이용권 보관 · ③ 환불'}</div>
      ${mem ? `<button class="btn ghost block" data-act="askResolve" data-id="${a.id}" data-kind="KEEP">이번 신청 종료하기 (멤버십은 계속 사용 가능)</button>` : `
      <div class="row"><button class="btn ghost grow" data-act="askResolve" data-id="${a.id}" data-kind="KEEP">이용권 보관하기</button><button class="btn soft grow" data-act="askResolve" data-id="${a.id}" data-kind="REFUND">9,900원 환불받기</button></div>
      <p class="xs faint mt8">보관한 1회권은 다음 신청 때 결제 없이 사용할 수 있어요. 환불은 계좌 입력 없이 원결제수단으로 자동 처리돼요.</p>`}
    `, { back: true, tab: 'home' });
  }
  A.askMove = (d) => App.openModal(() => `<h3>${D(d.date)} · ${RN(d.region)}로 이동할까요?</h3><p class="muted small mt8">기존 결제를 그대로 유지한 채 새 회차의 매칭 대기로 바뀌어요. ${U.fdeadline(ENGINE.deadlineOf(d.date))}에 자동 매칭돼요.</p><div class="row mt16"><button class="btn ghost grow" data-act="closeModal">취소</button><button class="btn grow" data-act="doResolve" data-kind="MOVE" data-id="${d.id}" data-date="${d.date}" data-region="${d.region}">이동하기</button></div>`);
  A.askResolve = (d) => App.openModal(() => `<h3>${d.kind === 'REFUND' ? '9,900원을 환불할까요?' : '이용권을 보관할까요?'}</h3><p class="muted small mt8">${d.kind === 'REFUND' ? '원결제수단으로 자동 환불돼요. 운영자 승인이나 계좌 입력은 필요 없어요.' : '다음에 신청할 때 결제 없이 바로 사용할 수 있어요.'}</p><div class="row mt16"><button class="btn ghost grow" data-act="closeModal">취소</button><button class="btn grow" data-act="doResolve" data-kind="${d.kind}" data-id="${d.id}">확인</button></div>`);
  A.doResolve = (d) => {
    const a = st().apps.find((x) => x.id === d.id);
    const regions = d.region ? U.uniq([d.region, ...a.regions.filter((r) => r === d.region)]) : null;
    ENGINE.resolve(d.id, d.kind, { date: d.date, regions });
    App.app.modal = null; S.commit();
    if (d.kind === 'REFUND') { App.toast('환불을 요청했어요', '자동 환불 처리 중이에요'); setTimeout(() => { ENGINE.tick(); S.commit(); }, 1500); }
    if (d.kind === 'KEEP') App.toast('이용권을 보관했어요');
    App.go(d.kind === 'MOVE' ? '#/home' : '#/home');
  };

  // ═════════ 테이블 상세 (INF-03, INF-06, MAT-12) ═════════
  function tableView(id) {
    const t = st().tables.find((x) => x.id === id), me = S.me();
    if (!t || !t.members.includes(me.id)) return notFound();
    const a = st().apps.find((x) => x.tableId === t.id && x.userId === me.id);
    const v = venueOf(t), members = ENGINE.activeMembers(t).map(S.user);
    const c = CONTENT.forTable(members, st());
    const bd = t.breakdown;
    const mine = bd?.perWants?.find((x) => x.id === me.id);
    const ys = members.map((u) => u.birthYear);
    const phase = a.appStatus === 'SUBMITTED' ? ENGINE.cancelPhase(a) : null;
    return shell('내 테이블', `
      <div class="card" style="background:linear-gradient(160deg,#3A2A20,#241913);color:#FFF3E3;border:0">
        <div class="xs" style="opacity:.7">${t.status === 'DONE' ? '지난 식탁' : '확정된 식탁'} · ${members.length}명</div>
        <h2 class="serif" style="font-size:22px;margin:4px 0">${D(t.date)} ${P.eventHour}:${U.pad(P.eventMin)}</h2>
        <div class="small" style="opacity:.85">${RN(t.region)}</div>
        <div class="row wrap mt12">${badge('match', a.matchStatus)}${a.attendance ? badge('att', a.attendance) : ''}</div>
      </div>
      ${canCheckIn(a, t) ? `<button class="btn block accent mt12" data-act="checkIn" data-id="${a.id}">📍 도착했어요 · 체크인</button>` : ''}
      <div class="section-title">식당 안내</div>
      ${v ? `<div class="card"><h3>${E(v.name)}</h3><dl class="kv mt8"><dt>주소</dt><dd>${E(v.address)}</dd><dt>집합 시간</dt><dd>${D(t.date)} ${P.eventHour}:${U.pad(P.eventMin)} (10분 전 도착 권장)</dd><dt>예약명</dt><dd><b>${E(t.booking)}</b></dd><dt>식사 가격</dt><dd>${U.BUDGETS[v.price]} · 각자 결제</dd></dl><a class="btn sm ghost block mt12" href="${v.map}" target="_blank" rel="noopener">🗺 지도에서 보기</a></div>`
        : `<div class="card"><b>식당을 배정하고 있어요</b><p class="small muted">파트너 식당 재고를 확인 중이에요. 배정되면 바로 알려드릴게요.</p></div>`}
      <div class="section-title">함께하는 사람들</div>
      <div class="members">${members.map((u) => `<div class="member">${avatar(u, 36)}<div style="min-width:0"><b class="small">${E(given(u.name))}${u.id === me.id ? ' (나)' : ''}</b><div class="xs muted">${ageBand(u.birthYear)} · ${E(u.job)}</div><div class="xs faint">${u.mbti}</div></div></div>`).join('')}</div>
      <p class="xs faint mt8">연락처·출생연도 등 상세 정보는 공개되지 않아요.</p>
      <div class="section-title">왜 이 테이블인가요?</div>
      <div class="card small col" style="gap:6px">
        <div>✅ 희망 날짜(${D(t.date)})·지역(${RS(t.region)}) 일치</div>
        <div>✅ 연령대 ${Math.min(...ys.map((y) => U.age(y, now())))}~${Math.max(...ys.map((y) => U.age(y, now())))}세 (나이 차 ${P.maxAgeGap}살 이내)</div>
        ${c.shared.length ? `<div>✅ 공통 관심사: ${c.shared.map(E).join(', ')}</div>` : ''}
        ${mine && mine.ok.length ? `<div>✅ 원했던 사람: ${mine.ok.map(E).join(', ')}</div>` : ''}
        ${bd && bd.metPairs === 0 ? '<div>✅ 모두 처음 만나는 분들이에요</div>' : ''}
      </div>
      <a class="btn block mt16" href="#/chat/${t.id}">💬 단체방 입장</a>
      ${t.status === 'DONE' && a.attendance === 'ATTENDED' ? `<a class="btn block soft mt8" href="#/feedback/${t.id}">${hasFb(t, me) ? '피드백 수정하기' : '피드백 남기기'}</a>` : ''}
      ${t.status === 'CONFIRMED' && a.attendance === 'SCHEDULED' ? `<div class="center mt16">${phase === 'DAYOF' ? `<button class="btn sm ghost" data-act="askDayOf" data-id="${a.id}">오늘 참석이 어려워요</button>` : `<button class="btn sm ghost" data-act="askCancel" data-id="${a.id}">참여 취소</button>`}</div>` : ''}
    `, { back: true, tab: 'history' });
  }

  // ═════════ 단체방 (INF-04,05,07, CON-01~03) ═════════
  function chatView(id) {
    const t = st().tables.find((x) => x.id === id), me = S.me();
    if (!t || !t.members.includes(me.id)) return notFound();
    const msgs = st().chats[t.id] || [];
    const v = venueOf(t);
    const render1 = (m) => {
      if (m.from === 'SYSTEM') {
        if (m.kind === 'venue') return `<div class="sysmsg"><div class="lbl">📍 식당 안내</div>${v ? `<b>${E(v.name)}</b><div class="xs muted">${E(v.address)}</div><div class="xs">예약명 <b>${E(t.booking)}</b> · ${U.BUDGETS[v.price]}</div><a class="xs" href="${v.map}" target="_blank" rel="noopener">지도 보기 →</a>` : '식당 배정 중'}</div>`;
        if (m.kind === 'topics') return `<div class="sysmsg" style="border-style:solid;border-color:var(--accent2);background:#FFF8EE"><div class="lbl">🎲 오늘의 대화 주제 · 자동 게시</div>${m.data.topics.map((q, i) => `<div class="small" style="padding:4px 0"><span class="tag">${E(q.tag)}</span> ${i + 1}. ${E(q.q)}</div>`).join('')}<div class="small mt8"><b>아이스브레이킹 · ${E(m.data.game.title)}</b><div class="xs muted">${E(m.data.game.desc)}</div></div></div>`;
        const lb = { notice: '📢 안내', curation: '✨ 테이블 큐레이션', policy: '📋 취소 정책' }[m.kind] || '안내';
        return `<div class="sysmsg"><div class="lbl">${lb}</div>${E(m.text)}<div class="xs faint mt8" style="margin-top:4px">${U.fdt(m.t)}</div></div>`;
      }
      const u = S.user(m.from), mine = m.from === me.id;
      return `<div class="msg ${mine ? 'me' : 'other'}">${mine ? '' : `<div class="who">${E(given(u.name))}</div>`}${E(m.text)}</div>`;
    };
    return `<div class="phone" style="padding-bottom:0"><div class="topbar"><button class="back" data-act="back">‹</button><h2>${D(t.date)} ${RS(t.region)} 식탁 <span class="faint small">${ENGINE.activeMembers(t).length}</span></h2><a href="#/table/${t.id}" class="small muted">정보</a></div>
      <div class="chat" data-autoscroll>${msgs.map(render1).join('')}</div></div>
      ${t.status === 'DISSOLVED' ? '' : `<div class="chat-input"><input placeholder="메시지 보내기" data-bind="chat" value="${E(App.draft.chat || '')}" data-enter="sendChat" data-id="${t.id}"><button class="btn sm" data-act="sendChat" data-id="${t.id}">전송</button></div>`}`;
  }
  const REPLIES = ['반가워요! 목요일에 봬요 😊', '저도 기대돼요!', '혹시 다들 어디서 오세요?', '맛있는 거 먹어요 ㅎㅎ', '좋아요 👍', '조금 늦을 수도 있는데 최대한 맞춰갈게요!'];
  A.sendChat = (d) => {
    const text = (App.draft.chat || '').trim(); if (!text) return;
    const me = S.me(), t = st().tables.find((x) => x.id === d.id);
    (st().chats[t.id] ||= []).push({ id: U.uid('m'), t: now(), from: me.id, text });
    App.draft.chat = ''; S.commit(); window.scrollTo(0, document.body.scrollHeight);
    const others = ENGINE.activeMembers(t).filter((x) => x !== me.id);
    if (others.length && Math.random() < 0.8) setTimeout(() => { st().chats[t.id].push({ id: U.uid('m'), t: now(), from: others[Math.floor(Math.random() * others.length)], text: REPLIES[Math.floor(Math.random() * REPLIES.length)] }); S.commit(); window.scrollTo(0, document.body.scrollHeight); }, 1400);
  };

  // ═════════ 피드백 · 신고 (FDB-01~04, SAF-01) ═════════
  function feedbackView(id) {
    const t = st().tables.find((x) => x.id === id), me = S.me();
    if (!t || !t.members.includes(me.id)) return notFound();
    if (now() < startOf(t.date)) return shell('피드백', `<div class="card mt12"><b>식사가 끝난 뒤에 남길 수 있어요</b><p class="small muted">${D(t.date)} ${P.eventHour}:${U.pad(P.eventMin)} 이후에 열려요.</p></div>`, { back: true });
    const prev = st().feedback.find((f) => f.tableId === t.id && f.userId === me.id);
    const f = (App.draft.fb && App.draft.fb.t === t.id) ? App.draft.fb : (App.draft.fb = { t: t.id, ratings: { ...(prev?.ratings || { mood: 0, talk: 0, food: 0 }) }, revisit: prev?.revisit || '', recommend: prev?.recommend ?? null, people: { ...(prev?.people || {}) }, comment: prev?.comment || '' });
    const others = t.members.filter((x) => x !== me.id).map(S.user);
    const stars = (k, l) => `<div class="row between" style="padding:6px 0"><span class="small"><b>${l}</b></span><div class="stars">${[1, 2, 3, 4, 5].map((i) => `<button class="${f.ratings[k] >= i ? 'on' : ''}" data-act="fbStar" data-k="${k}" data-v="${i}">★</button>`).join('')}</div></div>`;
    return shell('식탁 피드백', `
      <p class="muted small">${D(t.date)} ${RN(t.region)} 식탁 · 응답은 다음 매칭에만 쓰이고 다른 참가자에게 공개되지 않아요.</p>
      <div class="card">${stars('mood', '테이블 분위기')}${stars('talk', '대화')}${stars('food', '식당')}</div>
      <div class="section-title">다시 참여할 의향이 있나요?</div>
      <div class="seg">${[['YES', '또 올래요'], ['MAYBE', '아마도'], ['NO', '글쎄요']].map(([v, l]) => `<button class="${f.revisit === v ? 'on' : ''}" data-act="fbSet" data-k="revisit" data-v="${v}">${l}</button>`).join('')}</div>
      <div class="section-title">친구에게 추천할 의향이 있나요?</div>
      <div class="seg">${[['1', '추천할래요'], ['0', '아직은요']].map(([v, l]) => `<button class="${String(+f.recommend) === v && f.recommend !== null ? 'on' : ''}" data-act="fbSet" data-k="recommend" data-v="${v}">${l}</button>`).join('')}</div>
      <div class="section-title">함께한 사람들 (비공개)</div>
      <div class="list">${others.map((u) => `<div class="li" style="cursor:default;flex-wrap:wrap">${avatar(u, 34)}<div class="grow"><b class="small">${E(given(u.name))}</b><div class="xs muted">${ageBand(u.birthYear)} · ${E(u.job)}</div></div>
        <div class="row" style="gap:4px">${[['AGAIN', '😊 또 만나요'], ['NEVER', '🙅 다시는']].map(([v, l]) => `<span class="chip ${f.people[u.id] === v ? 'on' : ''}" style="padding:5px 9px;font-size:12px" data-act="fbPerson" data-u="${u.id}" data-v="${v}">${l}</span>`).join('')}</div>
        <div style="width:100%;text-align:right"><a class="xs faint" href="#" data-act="askReport" data-u="${u.id}" data-t="${t.id}">신고·차단</a></div></div>`).join('')}</div>
      <p class="xs faint mt8">'다시는'을 고른 분과는 앞으로 같은 테이블에 배정되지 않아요. 서로 '또 만나요'를 고르면 다음 매칭에서 다시 만날 수도 있어요.</p>
      <label class="f">하고 싶은 말 (선택)</label><textarea class="input" rows="3" data-bind="fb.comment" placeholder="좋았던 점이나 아쉬운 점을 알려주세요">${E(f.comment)}</textarea>
    `, { back: true, noTab: true, pb: 110, cta: `<button class="btn block" data-act="fbSubmit" data-id="${t.id}">피드백 제출하기</button>` });
  }
  A.fbStar = (d) => { App.draft.fb.ratings[d.k] = +d.v; App.render(); };
  A.fbSet = (d) => { App.draft.fb[d.k] = d.k === 'recommend' ? d.v === '1' : d.v; App.render(); };
  A.fbPerson = (d) => { const p = App.draft.fb.people; p[d.u] = p[d.u] === d.v ? null : d.v; App.render(); };
  A.fbSubmit = (d) => {
    const f = App.draft.fb;
    if (!f.ratings.mood || !f.ratings.talk || !f.ratings.food) return App.toast('별점을 모두 남겨주세요');
    if (!f.revisit) return App.toast('재참여 의향을 선택해주세요');
    ENGINE.submitFeedback(d.id, S.me().id, { ratings: f.ratings, revisit: f.revisit, recommend: !!f.recommend, people: f.people, comment: f.comment || '' });
    delete App.draft.fb; S.commit();
    App.openModal(() => { const recs = ENGINE.recommend(S.me()); return `<div class="center"><div style="font-size:44px">💌</div><h3 class="serif" style="font-size:20px">고마워요!</h3><p class="small muted">남겨주신 피드백은 다음 매칭에 바로 반영돼요.</p></div>${recs[0] ? `<div class="card tight mt12 row"><div class="grow"><div class="xs faint">다음 식탁 추천</div><b>${D(recs[0].date)} · ${RN(recs[0].region)}</b><div class="xs muted">${recs[0].waiting}명 대기 중</div></div><button class="btn sm" data-act="quickApply" data-date="${recs[0].date}" data-region="${recs[0].region}">신청</button></div>` : ''}<button class="btn ghost block mt12" data-act="closeModal">닫기</button>`; });
  };
  A.askReport = (d) => {
    App.draft.rep = { u: d.u, t: d.t, reason: '', detail: '' };
    App.openModal(() => `<h3>신고 · 차단</h3><p class="small muted mt8">신고 내용은 상대에게 공개되지 않아요. 접수 즉시 앞으로의 매칭에서 분리되고, 운영자가 검토해요.</p>
      <div class="chips mt12">${['불쾌한 언행', '성희롱·부적절한 접촉', '연락·만남 강요', '종교·영업 권유', '기타'].map((r) => `<span class="chip ${App.draft.rep.reason === r ? 'on' : ''}" data-act="chip" data-path="rep.reason" data-val="${r}">${r}</span>`).join('')}</div>
      <textarea class="input mt12" rows="3" data-bind="rep.detail" placeholder="상황을 간단히 적어주세요 (선택)">${E(App.draft.rep.detail)}</textarea>
      <div class="row mt16"><button class="btn ghost grow" data-act="closeModal">취소</button><button class="btn danger grow" data-act="doReport">신고하고 차단</button></div>`);
  };
  A.doReport = () => {
    const r = App.draft.rep; if (!r.reason) return App.toast('신고 사유를 선택해주세요');
    ENGINE.report(S.me().id, r.u, r.t, r.reason, r.detail || '');
    if (App.draft.fb) App.draft.fb.people[r.u] = 'NEVER';
    App.app.modal = null; S.commit(); App.toast('신고가 접수되었어요', '앞으로 같은 테이블에 배정되지 않아요');
  };

  // ═════════ 내 식탁 (RET-01,02) ═════════
  function historyView() {
    const me = S.me();
    const all = st().apps.filter((a) => a.userId === me.id).sort((a, b) => ((b.date || b.dates[0]) > (a.date || a.dates[0]) ? 1 : -1));
    const attended = all.filter((a) => a.attendance === 'ATTENDED');
    const metIds = U.uniq(attended.flatMap((a) => tableOf(a)?.members || []).filter((x) => x !== me.id));
    const again = st().feedback.filter((f) => f.userId === me.id).flatMap((f) => Object.values(f.people || {})).filter((v) => v === 'AGAIN').length;
    return shell('내 식탁', `
      <div class="row" style="gap:8px">${[['참여', attended.length + '회'], ['만난 사람', metIds.length + '명'], ['또 만나고 싶은', again + '명']].map(([l, v]) => `<div class="card tight grow center" style="margin:0"><div class="xs faint">${l}</div><b style="font-size:18px">${v}</b></div>`).join('')}</div>
      <div class="section-title">참가 이력</div>
      ${all.length ? `<div class="list">${all.map((a) => { const t = tableOf(a); const href = t && t.status !== 'DISSOLVED' ? `#/table/${t.id}` : a.legacy ? '' : `#/app/${a.id}`; return `<a class="li" ${href ? `href="${href}"` : ''}><div class="grow"><b class="small">${(a.date ? [a.date] : a.dates).map(D).join(', ')}</b> <span class="xs muted">${a.region ? RN(a.region) : a.regions.map(RS).join('·')}</span>
        <div class="row wrap" style="gap:4px;margin-top:4px">${a.legacy ? '<span class="badge">수기 운영 시절</span>' : ''}${a.attendance ? badge('att', a.attendance) : badge('match', a.matchStatus)}${t && a.attendance === 'ATTENDED' ? (hasFb(t, me) ? '<span class="badge green">피드백 완료</span>' : '<span class="badge amber">피드백 미작성</span>') : ''}${a.appStatus === 'CANCELED' && !a.attendance ? '<span class="badge">취소</span>' : ''}</div></div>${href ? '<span class="chev">›</span>' : ''}</a>`; }).join('')}</div>` : `<div class="card center"><p class="muted small">아직 참가 이력이 없어요.</p><a class="btn sm" href="#/apply">첫 식탁 신청하기</a></div>`}
    `, { tab: 'history' });
  }

  // ═════════ 알림 ═════════
  function notifsView() {
    const me = S.me();
    const list = st().notifs.filter((n) => n.userId === me.id);
    const html = shell('알림', list.length ? `<div class="list">${list.map((n) => `<a class="li" href="${n.link || '#/home'}" style="align-items:flex-start;${n.read ? '' : 'background:#FFF8EE'}"><div class="grow"><b class="small">${E(n.title)}</b><div class="xs muted">${E(n.body)}</div><div class="xs faint" style="margin-top:2px">${U.fdt(n.t)} · ${U.rel(n.t, now())}</div></div></a>`).join('')}</div>` : `<div class="card center mt12"><p class="muted small">아직 알림이 없어요.</p></div>`, { tab: 'notifs' });
    if (list.some((n) => !n.read)) setTimeout(() => { list.forEach((n) => (n.read = true)); S.save(); }, 800);
    return html;
  }

  // ═════════ MY ═════════
  function meView() {
    const me = S.me(), w = me.wallet;
    const pays = st().payments.filter((p) => p.userId === me.id).sort((a, b) => b.createdAt - a.createdAt);
    return shell('MY', `
      <div class="card row">${avatar(me, 52)}<div class="grow"><h3>${E(me.name)}</h3><div class="small muted">${U.age(me.birthYear, now())}세 · ${E(me.job)} · ${me.mbti}</div><div class="xs faint">${E(me.phone)}</div></div><a class="btn xs ghost" href="#/onboard/1?edit=1">수정</a></div>
      <div class="card"><div class="xs faint mb8">관심사</div>${me.interests.map((i) => `<span class="tag">${E(i)}</span>`).join('')}<div class="xs faint mt12 mb8">나의 성향</div>${me.traits.map((i) => `<span class="tag">${E(i)}</span>`).join('')}<div class="xs faint mt12 mb8">만나고 싶은 사람</div>${me.wants.map((i) => `<span class="tag">${E(i)}</span>`).join('')}<div class="xs faint mt12">식사 조건</div><div class="small">${me.budget.map((b) => U.BUDGETS[b]).join(', ')}${me.avoid ? ` · 못 먹는 음식: ${E(me.avoid)}` : ''}${me.allergy ? ` · 알레르기: ${E(me.allergy)}` : ''}</div></div>
      <div class="section-title">이용권 (RET-03)</div>
      <div class="card">${ENGINE.membershipValid(me) ? `<div class="row between"><b>${U.PASSES[w.membership.plan].label}</b><span class="badge green">이용 중</span></div><div class="small muted">${U.fdate(w.membership.expires)}까지 · 남은 기간 ${Math.ceil((w.membership.expires - now()) / U.DAY)}일 · 횟수 제한 없음</div>` : `<div class="row between"><b>멤버십 없음</b><a class="btn xs soft" href="#/apply">가입하기</a></div>`}
        <div class="row between mt12"><span class="small">보관 중인 1회권</span><b>${w.credits.length}장</b></div></div>
      <div class="section-title">계정 상태</div>
      <div class="card tight row between"><span class="small">${me.account.status === 'ACTIVE' ? '정상 이용 중' : me.account.status === 'RESTRICTED' ? `참여 제한 (${U.fdate(me.account.restrictedUntil)}까지)` : '영구 제한'}</span><span class="badge ${me.penalty ? 'amber' : 'green'}">경고 ${me.penalty}점 / ${P.restrictAt}점</span></div>
      <div class="section-title">결제 · 환불 내역</div>
      ${pays.length ? `<div class="list">${pays.map((p) => `<div class="li" style="cursor:default"><div class="grow"><b class="small">${E(p.item)}</b><div class="xs muted">${U.fdt(p.createdAt)} · ${E(p.method)}</div></div><div style="text-align:right"><b class="small">${U.won(p.amount)}</b><div>${badge('pay', p.status)}</div></div></div>`).join('')}</div>` : '<p class="small muted">결제 내역이 없어요.</p>'}
      <div class="section-title">더보기</div>
      <div class="list"><a class="li" href="#/policy"><span class="grow small">운영 정책 · 환불 규정</span><span class="chev">›</span></a><a class="li" href="#/admin"><span class="grow small">운영자 어드민 (데모)</span><span class="chev">›</span></a><div class="li" data-act="logout"><span class="grow small" style="color:var(--red)">로그아웃</span></div></div>
    `, { tab: 'me' });
  }

  function policyView() {
    const sec = (t, items) => `<div class="section-title">${t}</div><div class="card small col" style="gap:6px">${items.map((i) => `<div>• ${i}</div>`).join('')}</div>`;
    return shell('운영 정책', `
      ${sec('이용권', ['1회권 9,900원 · 1회 참여', '멤버십 1개월 35,000원 / 3개월 75,000원 / 6개월 120,000원 · 기간 내 횟수 제한 없이 참여', '멤버십 이용 중 매칭에 실패하면 실패 1회당 기한 7일 자동 연장'])}
      ${sec('매칭', ['매칭 마감: 모임 2일 전 화요일 24:00 (= 환불 마감)', '마감 시각에 결제 완료자를 대상으로 자동 매칭 · 운영자 검수 없이 확정', '필수 조건: 결제 완료, 희망 날짜·지역 일치, 4~6명, 나이 차 8살 이내, 차단·신고·비선호 관계 없음', '선호 조건: 성비 → MBTI 궁합 → 공통 관심사 → 만나고 싶은 성향 순으로 반영, 이전에 만난 사람보다 새로운 사람 우선', '여러 날짜를 고르면 가장 빠른 날짜부터 시도하고, 실패 시 다음 날짜로 자동 이월'])}
      ${sec('취소 · 환불', ['화요일 24:00까지 취소: 전액 자동 환불 (계좌 입력 불필요)', '수요일 취소: 환불 불가 · 경고 1점', '목요일 당일: 취소 불가. 미리 불참을 알리면 경고 2점', '매칭 실패: 대체 일정 이동 / 이용권 보관 / 전액 환불 중 직접 선택', '확정 후 다른 참가자 취소로 테이블이 해체되면 마감 이후에도 전액 환불'])}
      ${sec('노쇼 · 이용 제한', ['체크인 없이 모임이 끝나면 노쇼 후보 → 운영자 확인 후 확정 (경고 3점, 이용권 차감)', '경고 3점 이상: 4주간 신청 제한 (기간 후 자동 해제, 점수 초기화)', '누적 6점 이상 또는 안전 신고 확인 시 운영자가 영구 제한 검토'])}
      ${sec('개인정보 · 안전', ['확정 전에는 다른 참가자 정보를 공개하지 않아요', '확정 후에도 이름(성 제외)·연령대·직업·MBTI만 공개', '사람별 선호와 신고 내용은 상대에게 공개되지 않아요', '신고 즉시 신고자와 피신고자는 향후 매칭에서 자동 분리'])}
    `, { back: true, noTab: false, tab: 'me' });
  }

  const notFound = () => shell('', `<div class="card center mt24"><p class="muted">찾을 수 없는 화면이에요.</p><a class="btn sm" href="#/home">홈으로</a></div>`, { noTop: true });

  function render(r) {
    const p = r.parts, me = S.me();
    if (p[0] === 'policy') return me ? policyView() : policyView();
    if (!me || p[0] === 'login') return login();
    if (!me.profileDone && p[0] !== 'onboard') return onboard(1);
    switch (p[0]) {
      case 'onboard': return onboard(+(p[1] || 1), r.query.get('edit'));
      case 'home': return home();
      case 'apply': return apply();
      case 'pay': return pay(p[1]);
      case 'done': return done(p[1]);
      case 'app': return appDetail(p[1]);
      case 'resolve': return resolveView(p[1]);
      case 'table': return tableView(p[1]);
      case 'chat': return chatView(p[1]);
      case 'feedback': return feedbackView(p[1]);
      case 'history': return historyView();
      case 'notifs': return notifsView();
      case 'me': return meView();
      default: return home();
    }
  }
  return { render, L, badge, lbl, given, ageBand, avatar };
})();

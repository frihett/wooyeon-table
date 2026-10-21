// 매칭 엔진 + 자동화 스케줄러 + 신청/결제/취소/환불 도메인 로직
window.ENGINE = (function () {
  const P = U.POLICY;
  const st = () => S.st;
  const now = () => S.now();
  const user = (id) => st().users[id];

  // ───────────── 관계(이전 만남 / 차단·신고·비선호) ─────────────
  function relations(excludeDate) {
    const met = new Map(), hard = new Set();
    const k = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
    st().tables.forEach((t) => {
      if (t.status === 'DISSOLVED' || t.date === excludeDate) return;
      for (let i = 0; i < t.members.length; i++) for (let j = i + 1; j < t.members.length; j++) {
        const key = k(t.members[i], t.members[j]); met.set(key, (met.get(key) || 0) + 1);
      }
    });
    const again = new Map();
    st().feedback.forEach((f) => Object.entries(f.people || {}).forEach(([o, v]) => {
      if (v === 'NEVER') hard.add(k(f.userId, o));
      if (v === 'AGAIN') again.set(f.userId + '>' + o, true);
    }));
    st().blocks.forEach((b) => hard.add(k(b.from, b.to)));
    st().reports.forEach((r) => hard.add(k(r.reporter, r.target)));
    const mutual = (a, b) => again.get(a + '>' + b) && again.get(b + '>' + a);
    return { met: (a, b) => met.get(k(a, b)) || 0, hard: (a, b) => hard.has(k(a, b)), mutual };
  }

  // ───────────── 조합 검증 / 점수 ─────────────
  function validGroup(ids, rel, sizeCheck = true) {
    if (sizeCheck && (ids.length < P.minSize || ids.length > P.maxSize)) return false;
    const ys = ids.map((id) => user(id).birthYear);
    if (Math.max(...ys) - Math.min(...ys) > P.maxAgeGap) return false;
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) if (rel.hard(ids[i], ids[j])) return false;
    return true;
  }

  const WANT_MAP = {
    '편하고 유머 있는 사람': (o) => o.traits.includes('가볍고 유머 있는 대화를 좋아함'),
    '잔잔하고 안정적인 사람': (o) => o.traits.includes('잔잔하고 조용한 편') || o.traits.includes('경청을 잘 함'),
    '깊은 대화가 되는 사람': (o) => o.traits.includes('깊은 대화를 좋아함'),
    '열정 있는 사람': (o) => o.traits.includes('활기차고 에너지 있는 편') || o.traits.includes('이야기를 이끄는 편'),
    '나와 비슷한 사람': (o, me) => U.inter(o.interests, me.interests).length >= 2,
    '나와 다른 자극을 주는 사람': (o, me) => [0, 1, 2, 3].filter((i) => o.mbti[i] !== me.mbti[i]).length >= 2,
  };

  function score(ids, rel) {
    const us = ids.map(user), n = us.length, w = st().settings.weights;
    const ys = us.map((u) => u.birthYear), gap = Math.max(...ys) - Math.min(...ys);
    const age = Math.max(0, 100 - gap * 8);
    const m = us.filter((u) => u.gender === 'M').length, f = n - m, minor = Math.min(m, f);
    const gender = minor === 0 ? 35 : minor === 1 ? 55 : Math.abs(m - f) <= 1 ? 100 : 80;
    const letter = (i, c) => us.filter((u) => u.mbti[i] === c).length;
    const ei = letter(0, 'E') > 0 && letter(0, 'I') > 0 ? 1 : 0.4;
    const ns = Math.max(letter(1, 'N'), letter(1, 'S')) / n;
    const tf = letter(2, 'T') > 0 && letter(2, 'F') > 0 ? 1 : 0.7;
    const mbti = Math.round((0.4 * ei + 0.35 * ns + 0.25 * tf) * 100);
    let pairs = 0, shared = 0, metPairs = 0, penalty = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      pairs++; shared += U.inter(us[i].interests, us[j].interests).length;
      const mt = rel.met(ids[i], ids[j]);
      if (mt) { metPairs++; if (!rel.mutual(ids[i], ids[j])) penalty += st().settings.newPenalty; }
    }
    const interest = Math.round(Math.min(1, shared / pairs / 2) * 100);
    const perWants = us.map((me) => {
      if (!me.wants.length) return { id: me.id, ok: [], miss: [], r: 1 };
      const ok = [], miss = [];
      me.wants.forEach((wt) => { const fn = WANT_MAP[wt]; (fn && us.some((o) => o !== me && fn(o, me)) ? ok : miss).push(wt); });
      return { id: me.id, ok, miss, r: ok.length / me.wants.length };
    });
    const wants = Math.round((perWants.reduce((s, x) => s + x.r, 0) / n) * 100);
    const parts = { age, gender, mbti, interest, wants };
    const wsum = Object.values(w).reduce((a, b) => a + b, 0) || 1;
    const base = Object.keys(parts).reduce((s, k) => s + parts[k] * (w[k] || 0), 0) / wsum;
    const total = Math.round(Math.max(0, base - penalty));
    return { total, parts, penalty, metPairs, gap, minAge: Math.min(...ys), maxAge: Math.max(...ys), m, f, perWants };
  }

  // 나이순 DP 분할: 4~6인, 나이차·제외관계 충족, 최대 인원 커버 + 테이블 수 최소화
  function partition(ids, rel) {
    const arr = ids.slice().sort((a, b) => user(a).birthYear - user(b).birthYear);
    const n = arr.length, dp = Array(n + 1).fill(null);
    dp[0] = { cov: 0, g: 0, prev: -1, grp: false };
    for (let i = 1; i <= n; i++) {
      let best = { cov: dp[i - 1].cov, g: dp[i - 1].g, prev: i - 1, grp: false };
      for (let s = P.minSize; s <= P.maxSize; s++) {
        const j = i - s; if (j < 0) break;
        if (!validGroup(arr.slice(j, i), rel)) continue;
        const c = { cov: dp[j].cov + s, g: dp[j].g + 1, prev: j, grp: true };
        if (c.cov > best.cov || (c.cov === best.cov && c.g < best.g)) best = c;
      }
      dp[i] = best;
    }
    const groups = [], left = [];
    let i = n;
    while (i > 0) { const d = dp[i]; if (d.grp) groups.push(arr.slice(d.prev, i)); else left.push(arr[i - 1]); i = d.prev; }
    return { groups, left };
  }

  // 지역 내 테이블 간 교환·이동으로 전체 점수 개선 (성비·MBTI·관심사 반영)
  function improve(groups, rel) {
    const sc = groups.map((g) => score(g, rel).total);
    for (let pass = 0; pass < 6; pass++) {
      let changed = false;
      for (let a = 0; a < groups.length; a++) for (let b = a + 1; b < groups.length; b++) {
        for (let i = 0; i < groups[a].length; i++) for (let j = 0; j < groups[b].length; j++) {
          const ga = groups[a].slice(), gb = groups[b].slice();
          [ga[i], gb[j]] = [gb[j], ga[i]];
          if (!validGroup(ga, rel) || !validGroup(gb, rel)) continue;
          const na = score(ga, rel).total, nb = score(gb, rel).total;
          // 합계 개선 + 최저 점수 테이블이 나빠지지 않게
          if (na + nb > sc[a] + sc[b] + 1 && Math.min(na, nb) >= Math.min(sc[a], sc[b]) - 2) {
            groups[a] = ga; groups[b] = gb; sc[a] = na; sc[b] = nb; changed = true;
          }
        }
      }
      if (!changed) break;
    }
    return groups;
  }

  // ───────────── 회차(날짜) 단위 자동 매칭 ─────────────
  function eligible(a, date) {
    const u = user(a.userId);
    if (a.legacy || a.appStatus !== 'SUBMITTED' || a.payStatus !== 'PAID') return false;
    if (!['WAITING', 'TRANSFERRED', 'REALLOCATING'].includes(a.matchStatus)) return false;
    if (!a.dates.includes(date)) return false;
    if (u.account.status === 'BANNED') return false;
    if (u.account.status === 'RESTRICTED' && u.account.restrictedUntil > U.fromKey(date)) return false;
    return true;
  }
  const regionName = (r) => U.REGIONS[r].name;

  function runMatching(date, opts = {}) {
    const S_ = st();
    if (!opts.force && S_.runs.some((r) => r.date === date)) return null; // 멱등: 같은 회차 중복 실행 방지
    const deadline = U.fromKey(date) - (P.deadlineDaysBefore - 1) * U.DAY;
    const saved = S_.clock.now;
    if (!opts.manual && saved > deadline) S_.clock.now = deadline; // 마감 시각 기준으로 기록
    const rel = relations(date);
    const run = { id: U.uid('run'), date, t: now(), algo: S_.settings.algo, trigger: opts.manual ? '운영자 수동 실행' : '마감 시각 자동 실행', candidates: 0, tables: 0, split: 0, merged: 0, realloc: 0, rescued: 0, failed: 0, carried: 0, venueFail: 0, log: [] };
    const L = (m) => run.log.push(m);

    // 결제 미완료자 처리 (매칭 후보 제외 + 기한 안내)
    S_.apps.filter((a) => !a.legacy && a.appStatus === 'SUBMITTED' && ['PENDING', 'FAILED'].includes(a.payStatus) && a.dates.includes(date) && a.matchStatus === 'WAITING').forEach((a) => {
      const later = a.dates.filter((d) => d > date);
      if (later.length) { a.dates = later; S.log(a, `${U.fdate(U.fromKey(date))} 결제 미완료로 후보 제외 → ${U.fdate(U.fromKey(later[0]))} 회차 결제 기한까지 결제하면 매칭`); S.notify(a.userId, 'PAY_DUE', '결제가 필요해요', `${U.fdeadline(U.fromKey(later[0]) - U.DAY)}까지 결제하면 다음 회차 매칭에 포함돼요.`, '#/home'); }
      else { a.matchStatus = 'NO_MATCH'; a.reason = '결제 미완료로 매칭 대상에서 제외'; S.log(a, '결제 기한 경과 → 매칭 제외'); S.notify(a.userId, 'PAY_EXPIRED', '결제 기한이 지났어요', '결제가 완료되지 않아 이번 회차 매칭에서 제외되었어요. 다음 회차에 다시 신청해주세요.', '#/apply'); }
    });

    const cands = S_.apps.filter((a) => eligible(a, date) && !S_.apps.some((o) => o !== a && o.userId === a.userId && o.matchStatus === 'CONFIRMED' && o.date === date));
    run.candidates = cands.length;
    L(`후보 ${cands.length}명 (결제 완료 · 날짜 일치)`);
    if (!cands.length) { S_.runs.unshift(run); S_.clock.now = saved; return run; }
    cands.forEach((a) => { a.matchStatus = 'MATCHING'; });
    const appOf = Object.fromEntries(cands.map((a) => [a.userId, a]));
    const openRegions = Object.keys(U.REGIONS).filter((r) => S_.slots.some((s) => s.date === date && s.region === r && s.open));

    // 1) 지역 배정: 단일 지역 신청자 먼저, 다지역 신청자는 테이블이 성립하도록 보충
    const byRegion = Object.fromEntries(openRegions.map((r) => [r, []]));
    const flex = [];
    cands.forEach((a) => { const rs = a.regions.filter((r) => byRegion[r]); if (rs.length === 1) byRegion[rs[0]].push(a.userId); else if (rs.length > 1) flex.push(a); });
    flex.sort((x, y) => x.regions.length - y.regions.length).forEach((a) => {
      const rs = a.regions.filter((r) => byRegion[r]);
      const need = rs.filter((r) => byRegion[r].length > 0 && byRegion[r].length < P.minSize);
      const pick = (need.length ? need : rs).sort((x, y) => (need.length ? byRegion[y].length - byRegion[x].length : byRegion[y].length - byRegion[x].length))[0];
      byRegion[pick].push(a.userId);
    });

    // 2) 지역별 분할(7명 이상 자동 분리) + 품질 개선
    let groups = [], left = [];
    openRegions.forEach((r) => {
      const ids = byRegion[r]; if (!ids.length) return;
      const p = partition(ids, rel);
      if (p.groups.length > 1) run.split += p.groups.length - 1;
      const g = improve(p.groups, rel);
      g.forEach((m) => groups.push({ region: r, members: m }));
      p.left.forEach((id) => { left.push({ id, from: r }); S.log(appOf[id], `${regionName(r)} 최초 조합에서 제외 (${ids.length < P.minSize ? `신청자 ${ids.length}명으로 4명 미만` : '나이차·제외 조건 불충족'})`); });
      L(`${regionName(r)}: 후보 ${ids.length}명 → 테이블 ${p.groups.length}개, 미배정 ${p.left.length}명`);
    });

    // 3) 최소 점수 미달 테이블 해체
    groups = groups.filter((g) => {
      const s = score(g.members, rel);
      if (s.total >= S_.settings.minScore) return true;
      L(`${regionName(g.region)} 테이블 점수 ${s.total} < 기준 ${S_.settings.minScore} → 해체 후 재배치`);
      g.members.forEach((id) => { left.push({ id, from: g.region }); S.log(appOf[id], `조합 점수 미달(${s.total}점)로 해체 → 재배치 시도`); });
      return false;
    });

    // 4) 자동 재배치: 같은 날짜 · 희망 지역(같은 지역 → 다른 희망 지역) 미확정 테이블에 삽입
    const rescue = () => {
      left = left.filter(({ id, from }) => {
        const a = appOf[id];
        const opts2 = groups.filter((g) => g.members.length < P.maxSize && a.regions.includes(g.region))
          .map((g) => ({ g, ok: validGroup([...g.members, id], rel), s: score([...g.members, id], rel).total, same: g.region === from }))
          .filter((x) => x.ok && x.s >= S_.settings.minScore)
          .sort((x, y) => (y.same - x.same) || (y.s - x.s));
        if (!opts2.length) return true;
        const best = opts2[0];
        best.g.members.push(id); a.realloc++; run.realloc++; run.rescued++;
        S.log(a, `자동 재배치 → ${regionName(best.g.region)} 테이블 (${best.same ? '같은 날짜·같은 지역' : '같은 날짜·다른 희망 지역'})`);
        return false;
      });
    };
    rescue();

    // 5) 미완성 인원 병합: 남은 인원끼리 희망 지역 기준으로 새 테이블 구성
    openRegions.forEach((r) => {
      const pool = left.filter((x) => appOf[x.id].regions.includes(r)).map((x) => x.id);
      if (pool.length < P.minSize) return;
      const p = partition(pool, rel);
      p.groups.forEach((m) => {
        if (score(m, rel).total < S_.settings.minScore) return;
        groups.push({ region: r, members: m }); run.merged++;
        m.forEach((id) => { const a = appOf[id]; a.realloc++; run.realloc++; S.log(a, `미완성 인원 병합 → ${regionName(r)} 새 테이블`); });
        left = left.filter((x) => !m.includes(x.id));
      });
    });
    rescue();

    // 6) 최종 검증 → 자동 확정 (운영자 승인 없음)
    const dateTables = [];
    groups.forEach((g) => {
      if (!validGroup(g.members, rel)) { g.members.forEach((id) => left.push({ id, from: g.region })); L('최종 검증 실패 테이블 해체'); return; }
      const sc = score(g.members, rel);
      const t = { id: U.uid('t'), no: S_.tables.filter((x) => x.date === date).length + 1, date, region: g.region, members: g.members.slice(), status: 'CONFIRMED', venueId: null, score: sc.total, breakdown: sc, flags: {}, createdAt: now(), runId: run.id, booking: '', log: [`자동 확정 (${sc.total}점)`] };
      S_.tables.push(t); dateTables.push(t); run.tables++;
      g.members.forEach((id) => {
        const a = appOf[id];
        Object.assign(a, { matchStatus: 'CONFIRMED', tableId: t.id, date, region: g.region, attendance: 'SCHEDULED', confirmedAt: now() });
        S.log(a, `테이블 자동 확정 · ${regionName(g.region)} ${sc.total}점`);
      });
      assignVenue(t, run);
      openChat(t);
      g.members.forEach((id) => S.notify(id, 'CONFIRMED', '🎉 테이블이 확정되었어요', t.venueId ? CONTENT.fill(S_.contents.templates.CONFIRMED, vars(t)) : `${U.fdate(U.fromKey(date))} ${regionName(g.region)} 테이블이 확정되었어요. 식당 정보는 곧 안내드릴게요.`, `#/table/${t.id}`));
    });

    // 7) 남은 인원: 다음 희망 날짜로 이월 또는 대체 일정 제안
    left.forEach(({ id }) => {
      const a = appOf[id]; if (a.matchStatus === 'CONFIRMED') return;
      const later = a.dates.filter((d) => d > date && U.fromKey(d) - U.DAY > now());
      const regionCount = cands.filter((c) => c.regions.some((r) => a.regions.includes(r))).length;
      const reason = regionCount < P.minSize ? '희망 날짜·지역 신청자가 4명 미만' : '나이 차 8살 이내 · 제외 관계 조건을 충족하는 테이블 없음';
      if (later.length) {
        a.dates = later; a.matchStatus = 'WAITING'; a.realloc++; run.carried++;
        S.log(a, `${U.fdate(U.fromKey(date))} 매칭 실패(${reason}) → 선택한 다른 날짜 ${U.fdate(U.fromKey(later[0]))}로 자동 이월`);
        S.notify(a.userId, 'REALLOC', '다음 희망 날짜로 이어서 매칭해요', `${U.fdate(U.fromKey(date))}에는 조건에 맞는 테이블이 없어 ${U.fdate(U.fromKey(later[0]))} 회차로 자동 이월했어요. 결제는 그대로 유지돼요.`, '#/home');
      } else {
        failApp(a, reason, date); run.failed++;
      }
    });
    run.log.push(`확정 ${run.tables}개 · 재배치 ${run.realloc}회 · 이월 ${run.carried}명 · 실패 ${run.failed}명`);
    S_.runs.unshift(run);
    S.audit('SYSTEM', `자동 매칭 실행 (${U.fdate(U.fromKey(date))})`, run.log[run.log.length - 1]);
    S_.clock.now = saved;
    return run;
  }

  function failApp(a, reason, date) {
    a.matchStatus = 'ALTERNATIVE_OFFERED'; a.reason = reason; a.failedAt = now(); a.failedDate = date;
    const u = user(a.userId);
    if (a.pass === 'MEMBERSHIP' && u.wallet.membership) {
      u.wallet.membership.expires += P.membershipExtendDaysPerFail * U.DAY;
      S.log(a, `매칭 실패(${reason}) → 멤버십 기한 ${P.membershipExtendDaysPerFail}일 자동 연장`);
    } else {
      a.payStatus = 'REFUND_AVAILABLE';
      S.log(a, `매칭 실패(${reason}) → 대체 일정·이용권 보관·환불 선택 대기`);
    }
    S.notify(a.userId, 'FAILED', '매칭 결과 안내', S.st.contents.templates.FAILED, '#/resolve/' + a.id);
  }

  function vars(t) {
    const v = st().venues.find((x) => x.id === t.venueId);
    return { date: U.fdate(U.fromKey(t.date)), time: `${P.eventHour}:${U.pad(P.eventMin)}`, venue: v ? v.name : '식당 배정 중', booking: t.booking || '' };
  }

  function venueLoad(vid, date) { return st().tables.filter((t) => t.venueId === vid && t.date === date && t.status !== 'DISSOLVED').length; }
  function assignVenue(t, run) {
    const us = t.members.map(user);
    const vs = st().venues.filter((v) => v.active && v.region === t.region && venueLoad(v.id, t.date) < v.capacity)
      .map((v) => ({ v, fit: us.filter((u) => u.budget.includes(v.price) || u.budget.includes('B3')).length }))
      .sort((a, b) => b.fit - a.fit);
    if (!vs.length) {
      if (run) run.venueFail++;
      t.log.push('식당 자동 배정 실패: 지역 내 파트너 식당 재고 없음');
      S.exception('VENUE', '식당 자동 배정 실패', `${U.fdate(U.fromKey(t.date))} ${regionName(t.region)} ${t.members.length}인 테이블 · 같은 지역 파트너 식당 모두 만석`, { tableId: t.id });
      return false;
    }
    t.venueId = vs[0].v.id; t.booking = `우연한식탁 ${U.REGIONS[t.region].short}${t.no || ''}`;
    t.log.push(`식당 자동 배정: ${vs[0].v.name}`);
    return true;
  }

  // ───────────── 단체방 ─────────────
  function sys(tid, kind, text, data) { (st().chats[tid] ||= []).push({ id: U.uid('m'), t: now(), from: 'SYSTEM', kind, text, data }); }
  function openChat(t) {
    const us = t.members.map(user);
    const c = CONTENT.forTable(us, st());
    const deep = us.filter((u) => u.traits.includes('깊은 대화를 좋아함')).length;
    const listen = us.filter((u) => u.traits.includes('경청을 잘 함')).length;
    sys(t.id, 'notice', `${U.fdate(U.fromKey(t.date))} ${regionName(t.region)} 테이블이 확정되었어요. 반가워요! 👋`);
    sys(t.id, 'curation', `이번 식탁은 ${us.length}명이 모였어요. ${c.shared.length ? `'${c.shared.slice(0, 2).join("', '")}'을(를) 좋아하는 분들이 많고` : '서로 다른 관심사를 가진 분들이 모였고'}, ${deep >= us.length / 2 ? '깊은 대화를 즐기는 분이 많아요.' : listen >= us.length / 2 ? '잘 들어주는 분들이 많아요.' : '가볍고 유쾌한 대화를 기대해도 좋아요.'}`);
    if (t.venueId) sys(t.id, 'venue', '식당 안내', { tableId: t.id });
    sys(t.id, 'policy', `취소 정책: 모임 전날(수)은 취소 시 환불 불가·경고 1회, 당일 취소 불가. 노쇼 시 4주간 참여가 제한돼요.`);
    t.chatCreated = now();
  }

  // ───────────── 스케줄러 (데모 시계 기준) ─────────────
  function tick() {
    const S_ = st(), t = now();
    // 매칭 마감 도달 회차 자동 실행
    const dates = U.uniq(S_.apps.filter((a) => !a.legacy && a.appStatus === 'SUBMITTED').flatMap((a) => a.dates)).sort();
    dates.forEach((d) => { if (t >= U.fromKey(d) - (P.deadlineDaysBefore - 1) * U.DAY) runMatching(d); });
    // 확정 테이블 일정 작업
    S_.tables.filter((x) => x.status === 'CONFIRMED').forEach((tb) => {
      const start = U.fromKey(tb.date, P.eventHour, P.eventMin), end = start + P.eventDurationH * U.HOUR;
      const live = activeMembers(tb);
      if (!tb.flags.reminder && t >= start - U.DAY) {
        tb.flags.reminder = start - U.DAY;
        const msg = CONTENT.fill(S_.contents.templates.REMINDER, vars(tb));
        live.forEach((id) => S.notify(id, 'REMINDER', '내일 우연한 식탁이 열려요', msg, `#/table/${tb.id}`));
        sys(tb.id, 'notice', '⏰ ' + msg);
      }
      if (!tb.flags.content && t >= start) {
        tb.flags.content = start;
        const c = CONTENT.forTable(tb.members.map(user), S_);
        sys(tb.id, 'topics', '오늘의 대화 주제', c);
        live.forEach((id) => S.notify(id, 'CONTENT', '오늘의 대화 주제가 도착했어요', '단체방에서 아이스브레이킹 게임과 맞춤 주제를 확인해보세요.', `#/chat/${tb.id}`));
        // 데모: 로그인한 사용자 외 가상 참가자는 대부분 앱으로 체크인
        S_.apps.filter((a) => a.tableId === tb.id && a.attendance === 'SCHEDULED' && !isDemoActor(a.userId)).forEach((a) => {
          if (U.hash(a.id) % 100 < 93) { a.attendance = 'ATTENDED'; a.checkedInAt = start - 5 * U.MIN; S.log(a, '앱 체크인 → 참석 완료'); }
        });
      }
      if (!tb.flags.closed && t >= end) {
        tb.flags.closed = end; tb.status = 'DONE';
        S_.apps.filter((a) => a.tableId === tb.id && a.attendance === 'SCHEDULED').forEach((a) => {
          a.noShowCandidate = true; S.log(a, '종료 시각까지 체크인 없음 → 노쇼 후보 (운영자 확인 대기)');
        });
        live.forEach((id) => S.notify(id, 'FEEDBACK', '오늘 식탁은 어떠셨나요?', S_.contents.templates.FEEDBACK, `#/feedback/${tb.id}`));
        // 데모: 가상 참가자 일부가 피드백 제출 (다음 매칭 반영 시연용)
        const r = U.rng(U.hash(tb.id));
        S_.apps.filter((a) => a.tableId === tb.id && a.attendance === 'ATTENDED' && !isDemoActor(a.userId) && r() < 0.7).forEach((a) => {
          const people = {};
          ENGINE_live(tb).forEach((o) => { if (o !== a.userId) { const x = r(); people[o] = x < 0.3 ? 'AGAIN' : x < 0.33 ? 'NEVER' : null; } });
          S_.feedback.push({ id: U.uid('f'), tableId: tb.id, userId: a.userId, ratings: { mood: 4 + (r() < 0.6 ? 1 : 0), talk: 3 + Math.floor(r() * 3), food: 3 + Math.floor(r() * 3) }, revisit: r() < 0.75 ? 'YES' : 'MAYBE', recommend: r() < 0.65, comment: '', people, t: end + U.HOUR });
        });
        sys(tb.id, 'notice', '오늘 함께해주셔서 감사해요! 앱에서 1분 피드백을 남겨주세요. 서로에 대한 선호는 상대에게 공개되지 않아요.');
      }
    });
    S_.tables.filter((x) => x.status === 'DONE' && !x.legacy && x.flags.closed && !x.flags.fbReminder && t >= x.flags.closed + U.DAY).forEach((tb) => {
      tb.flags.fbReminder = t;
      activeMembers(tb).filter((id) => !S_.feedback.some((f) => f.tableId === tb.id && f.userId === id)).forEach((id) => S.notify(id, 'FEEDBACK_REMIND', '피드백을 기다리고 있어요', '남겨주신 피드백은 다음 매칭에 반영돼요. (미응답이어도 다음 신청은 가능해요)', `#/feedback/${tb.id}`));
    });
    // 환불 처리
    S_.payments.filter((p) => p.status === 'REFUND_PROCESSING').forEach((p) => {
      const a = S_.apps.find((x) => x.id === p.appId);
      if (p.refundFail) {
        p.status = 'REFUND_FAILED'; if (a) { a.payStatus = 'REFUND_FAILED'; S.log(a, '자동 환불 실패 → 운영자 확인 중'); }
        S.exception('REFUND', '자동 환불 실패', `${user(p.userId).name} · ${U.won(p.amount)} · ${p.method} (카드사 응답 오류)`, { paymentId: p.id });
      } else {
        p.status = 'REFUNDED'; p.refundedAt = t; if (a) { a.payStatus = 'REFUNDED'; S.log(a, `환불 완료 ${U.won(p.amount)} → ${p.method}`); }
        S.notify(p.userId, 'REFUNDED', '환불이 완료되었어요', `${U.won(p.amount)}이 ${p.method}(으)로 환불되었어요. 카드사에 따라 반영까지 3~5영업일 걸릴 수 있어요.`, '#/me');
      }
    });
    // 제한 해제
    Object.values(S_.users).forEach((u) => { if (u.account.status === 'RESTRICTED' && u.account.restrictedUntil && t >= u.account.restrictedUntil) { u.account.status = 'ACTIVE'; u.account.restrictedUntil = null; } });
  }

  // 데모 계정·직접 가입한 사용자는 자동 시뮬레이션에서 제외 (직접 조작)
  const isDemoActor = (uid) => uid === st().session.userId || Object.values(st().session.demoUsers || {}).includes(uid) || !/^u\d+$/.test(uid);
  const ENGINE_live = (tb) => activeMembers(tb);
  const activeMembers = (tb) => tb.members.filter((id) => { const a = st().apps.find((x) => x.tableId === tb.id && x.userId === id); return a && !['CANCELED_EARLY', 'CANCELED_LATE'].includes(a.attendance); });

  // ───────────── 참가자 액션 ─────────────
  function deadlineOf(date) { return U.fromKey(date) - (P.deadlineDaysBefore - 1) * U.DAY; }
  function openSlots() { return st().slots.filter((s) => s.open && deadlineOf(s.date) > now()); }
  function openDates() { return U.uniq(openSlots().map((s) => s.date)).sort(); }

  function canApply(u) {
    if (u.account.status === 'BANNED') return { ok: false, msg: '이용이 영구 제한된 계정이에요.' };
    if (u.account.status === 'RESTRICTED') return { ok: false, msg: `노쇼·당일 취소 누적으로 ${U.fdate(u.account.restrictedUntil)}까지 신청이 제한돼요.` };
    return { ok: true };
  }
  function membershipValid(u) { return u.wallet.membership && u.wallet.membership.expires > now(); }

  function submit(userId, dates, regions) {
    const a = { id: U.uid('a'), userId, dates: dates.slice().sort(), regions: regions.slice(), pass: null, appStatus: 'SUBMITTED', payStatus: 'PENDING', matchStatus: 'WAITING', attendance: null, tableId: null, date: null, region: null, log: [], realloc: 0, createdAt: now() };
    S.log(a, `신청서 제출 · ${a.dates.map((d) => U.fdate(U.fromKey(d))).join(', ')} · ${regions.map(regionName).join(', ')}`);
    st().apps.push(a);
    S.audit(user(userId).name, '참가 신청', a.dates.join(','));
    S.notify(userId, 'SUBMITTED', '신청이 접수되었어요', `결제를 완료하면 ${U.fdeadline(deadlineOf(a.dates[0]))} 자동 매칭에 포함돼요. 마감 전까지 앱에서 수정·취소할 수 있어요.`, '#/home');
    return a;
  }

  function pay(appId, choice, method, success) {
    const a = st().apps.find((x) => x.id === appId), u = user(a.userId);
    if (a.payStatus === 'PAID') return { ok: true }; // 중복 승인 방지
    if (choice === 'MEMBERSHIP_OWNED') {
      a.pass = 'MEMBERSHIP'; a.payStatus = 'PAID';
      const pid = U.uid('p');
      st().payments.push({ id: pid, userId: u.id, appId, item: '멤버십 이용', amount: 0, status: 'PAID', method: '멤버십', createdAt: now() });
      a.paymentId = pid; S.log(a, '보유 멤버십으로 참가 확정');
    } else if (choice === 'CREDIT') {
      const c = u.wallet.credits.shift();
      a.pass = 'SINGLE'; a.payStatus = 'PAID'; a.paymentId = c.paymentId;
      const p = st().payments.find((x) => x.id === c.paymentId); if (p) p.appId = appId;
      S.log(a, '보관 중인 1회권 사용');
    } else {
      const pass = U.PASSES[choice];
      const pid = U.uid('p');
      const p = { id: pid, userId: u.id, appId, item: pass.label, amount: pass.price, status: success ? 'PAID' : 'FAILED', method, createdAt: now() };
      st().payments.push(p);
      if (!success) { a.payStatus = 'FAILED'; S.log(a, `결제 실패 (${method})`); S.notify(u.id, 'PAY_FAIL', '결제에 실패했어요', `${U.fdeadline(deadlineOf(a.dates[0]))}까지 다시 결제하면 매칭에 포함돼요.`, '#/pay/' + a.id); return { ok: false }; }
      a.paymentId = pid; a.payStatus = 'PAID';
      if (pass.months) {
        const base = membershipValid(u) ? u.wallet.membership.expires : now();
        u.wallet.membership = { plan: choice, start: now(), expires: base + pass.months * 30 * U.DAY };
        a.pass = 'MEMBERSHIP';
      } else a.pass = 'SINGLE';
      S.log(a, `결제 완료 ${U.won(pass.price)} (${pass.label} · ${method})`);
    }
    S.audit(u.name, '결제', a.pass);
    S.notify(u.id, 'PAID', '결제가 완료되었어요', `${U.fdeadline(deadlineOf(a.dates[0]))}에 자동 매칭이 실행되고, 결과를 바로 알려드려요.`, '#/home');
    return { ok: true };
  }

  // 취소 단계: FREE(마감 전) / LATE(마감 후~전날) / DAYOF(당일)
  function cancelPhase(a) {
    if (a.matchStatus === 'CONFIRMED') {
      const dl = deadlineOf(a.date), day = U.fromKey(a.date);
      if (now() < dl) return 'FREE';
      if (now() < day) return 'LATE';
      return 'DAYOF';
    }
    const next = a.dates.find((d) => deadlineOf(d) > now());
    return next ? 'FREE' : 'LATE';
  }

  function requestRefund(a, reason) {
    const p = st().payments.find((x) => x.id === a.paymentId);
    if (!p || p.amount === 0 || ['REFUND_PROCESSING', 'REFUNDED'].includes(p.status)) return false;
    p.status = 'REFUND_PROCESSING'; a.payStatus = 'REFUND_PROCESSING';
    S.log(a, `환불 요청 (${reason}) → 자동 환불 처리 중`);
    return true;
  }

  function cancel(appId, actor) {
    const a = st().apps.find((x) => x.id === appId), u = user(a.userId);
    const phase = cancelPhase(a);
    if (phase === 'DAYOF') return { ok: false, msg: '당일 취소는 불가해요.' };
    const wasConfirmed = a.matchStatus === 'CONFIRMED';
    a.appStatus = 'CANCELED';
    if (wasConfirmed) a.attendance = phase === 'FREE' ? 'CANCELED_EARLY' : 'CANCELED_LATE';
    if (phase === 'FREE') {
      if (a.pass === 'SINGLE' && a.payStatus === 'PAID') requestRefund(a, '마감 전 취소');
      S.log(a, '마감 전 취소 (위약 없음)');
    } else {
      S.log(a, '마감 이후 취소 → 환불 불가 · 경고 1회');
      addPenalty(u.id, 'CANCELED_LATE');
    }
    if (a.matchStatus !== 'CONFIRMED') a.matchStatus = a.matchStatus === 'ALTERNATIVE_OFFERED' ? 'NO_MATCH' : a.matchStatus;
    S.audit(actor || u.name, '신청 취소', `${phase}`);
    if (wasConfirmed) dropFromTable(a);
    return { ok: true, phase };
  }

  function dayOfNotice(appId) {
    const a = st().apps.find((x) => x.id === appId);
    a.attendance = 'CANCELED_LATE'; a.dayOf = true;
    S.log(a, '당일 불참 사전 알림 (노쇼 대신 처리 · 경고 2점)');
    addPenalty(a.userId, 'DAYOF_NOTICE');
    sys(a.tableId, 'notice', `한 분이 개인 사정으로 오늘 참석이 어렵다고 미리 알려주셨어요. 남은 분들끼리 즐거운 시간 보내세요!`);
    S.audit(user(a.userId).name, '당일 불참 알림', '');
  }

  // 확정 후 이탈 → 대기자 충원 / 다른 테이블 재배치 / 해체 (FAQ Q6 정책)
  function dropFromTable(a) {
    const tb = st().tables.find((t) => t.id === a.tableId); if (!tb) return;
    const rel = relations(null);
    const live = activeMembers(tb);
    sys(tb.id, 'notice', '한 분이 일정 사정으로 참여를 취소했어요.');
    if (live.length >= P.minSize) return;
    // 1) 같은 날짜·지역 조건 대기자 자동 충원
    const waiters = st().apps.filter((w) => !w.legacy && w.appStatus === 'SUBMITTED' && w.userId !== a.userId && !live.includes(w.userId)
      && ((w.matchStatus === 'ALTERNATIVE_OFFERED' && w.failedDate === tb.date && ['REFUND_AVAILABLE', 'PAID'].includes(w.payStatus)) || (w.matchStatus === 'WAITING' && w.payStatus === 'PAID' && w.dates.includes(tb.date)))
      && w.regions.includes(tb.region) && validGroup([...live, w.userId], rel, false));
    if (waiters.length) {
      const w = waiters.sort((x, y) => score([...live, y.userId], rel).total - score([...live, x.userId], rel).total)[0];
      if (w.payStatus === 'REFUND_AVAILABLE') w.payStatus = 'PAID';
      Object.assign(w, { matchStatus: 'CONFIRMED', tableId: tb.id, date: tb.date, region: tb.region, attendance: 'SCHEDULED', confirmedAt: now() });
      tb.members.push(w.userId); w.realloc++;
      S.log(w, '취소 자리 자동 충원 → 테이블 확정'); tb.log.push(`취소 발생 → 대기자 자동 충원 (${user(w.userId).name})`);
      sys(tb.id, 'notice', '새로운 분이 합류했어요. 환영해주세요! 🙌');
      S.notify(w.userId, 'CONFIRMED', '🎉 취소 자리에 자동 배정되었어요', CONTENT.fill(st().contents.templates.CONFIRMED, vars(tb)), `#/table/${tb.id}`);
      return;
    }
    // 2) 남은 인원을 같은 날짜의 다른 확정 테이블로 이동
    const others = st().tables.filter((t) => t.id !== tb.id && t.date === tb.date && t.status === 'CONFIRMED');
    const plan = []; const cap = Object.fromEntries(others.map((t) => [t.id, activeMembers(t).slice()]));
    for (const id of live) {
      const ap = st().apps.find((x) => x.tableId === tb.id && x.userId === id);
      const dest = others.find((t) => cap[t.id].length < P.maxSize && ap.regions.includes(t.region) && validGroup([...cap[t.id], id], rel, false));
      if (!dest) { plan.length = 0; break; }
      cap[dest.id].push(id); plan.push([ap, dest]);
    }
    tb.status = 'DISSOLVED'; tb.log.push('인원 4명 미만 → 테이블 해체');
    if (plan.length === live.length && plan.length) {
      plan.forEach(([ap, dest]) => {
        dest.members.push(ap.userId); ap.tableId = dest.id; ap.region = dest.region; ap.realloc++;
        S.log(ap, `테이블 인원 부족 → 같은 날짜 다른 테이블로 자동 재배치`);
        sys(dest.id, 'notice', '새로운 분이 합류했어요. 환영해주세요! 🙌');
        S.notify(ap.userId, 'REALLOC', '테이블이 변경되었어요', `취소로 인원이 부족해 같은 날짜의 다른 테이블로 옮겨드렸어요.`, `#/table/${dest.id}`);
      });
      return;
    }
    // 3) 해체 → 대체 일정·보관·환불 선택 (운영 사유이므로 마감 이후여도 전액 환불)
    live.forEach((id) => {
      const ap = st().apps.find((x) => x.tableId === tb.id && x.userId === id);
      Object.assign(ap, { tableId: null, attendance: null });
      failApp(ap, '확정 후 취소 발생으로 인원 부족 (운영 사유 · 전액 환불 가능)', tb.date);
    });
  }

  // 매칭 실패 해결: 일정 이동 / 이용권 보관 / 환불 (STA-05,06)
  function resolve(appId, kind, payload) {
    const a = st().apps.find((x) => x.id === appId), u = user(a.userId);
    if (a.matchStatus !== 'ALTERNATIVE_OFFERED') return { ok: false };
    if (kind === 'MOVE') {
      a.dates = [payload.date]; a.regions = payload.regions; a.matchStatus = 'TRANSFERRED'; a.payStatus = 'PAID';
      a.tableId = null; a.date = null; a.realloc++; a.resolution = 'MOVE';
      S.log(a, `대체 일정 선택 → ${U.fdate(U.fromKey(payload.date))} ${payload.regions.map(regionName).join('·')} (결제 유지, 새 회차 매칭 대기)`);
      S.notify(u.id, 'TRANSFERRED', '일정 이동이 완료되었어요', `${U.fdate(U.fromKey(payload.date))} 회차로 옮겼어요. ${U.fdeadline(deadlineOf(payload.date))}에 자동 매칭돼요.`, '#/home');
    } else if (kind === 'KEEP') {
      a.matchStatus = 'NO_MATCH'; a.resolution = 'KEEP'; a.appStatus = 'CANCELED';
      if (a.pass === 'SINGLE') { a.payStatus = 'PAID'; u.wallet.credits.push({ paymentId: a.paymentId, at: now() }); }
      S.log(a, '이용권 보관 선택 → 다음 신청 시 사용 가능');
    } else if (kind === 'REFUND') {
      a.matchStatus = 'NO_MATCH'; a.resolution = 'REFUND'; a.appStatus = 'CANCELED';
      a.payStatus = 'REFUND_REQUESTED'; S.log(a, '환불 선택');
      requestRefund(a, '매칭 불가');
    }
    S.audit(u.name, '매칭 실패 해결 선택', kind);
    return { ok: true };
  }

  function checkIn(appId) {
    const a = st().apps.find((x) => x.id === appId);
    a.attendance = 'ATTENDED'; a.checkedInAt = now(); a.noShowCandidate = false;
    S.log(a, '앱 체크인 → 참석 완료');
  }

  function addPenalty(userId, kind) {
    const u = user(userId), pts = P.penalty[kind];
    u.penalty += pts;
    if (u.penalty >= P.banReviewAt) S.exception('SAFETY', '영구 제한 검토 필요', `${u.name} · 누적 경고 ${u.penalty}점`, { userId });
    if (u.penalty >= P.restrictAt && u.account.status === 'ACTIVE') {
      u.account.status = 'RESTRICTED'; u.account.restrictedUntil = now() + P.restrictWeeks * 7 * U.DAY; u.penalty = 0;
      S.notify(userId, 'RESTRICTED', '참여가 일시 제한되었어요', `노쇼·당일 취소 누적으로 ${U.fdate(u.account.restrictedUntil)}까지 신청이 제한돼요.`, '#/me');
      S.audit('SYSTEM', '이용 제한', `${u.name} ${P.restrictWeeks}주`);
    }
  }

  function submitFeedback(tableId, userId, data) {
    const f = st().feedback.find((x) => x.tableId === tableId && x.userId === userId);
    if (f) Object.assign(f, data, { t: now() }); else st().feedback.push({ id: U.uid('f'), tableId, userId, ...data, t: now() });
    Object.entries(data.people || {}).forEach(([o, v]) => { if (v === 'BLOCK') st().blocks.push({ from: userId, to: o, t: now() }); });
    S.audit(user(userId).name, '피드백 제출', tableId);
  }

  function report(reporter, target, tableId, reason, detail) {
    st().reports.unshift({ id: U.uid('r'), reporter, target, tableId, reason, detail, status: 'OPEN', t: now() });
    if (!st().blocks.some((b) => b.from === reporter && b.to === target)) st().blocks.push({ from: reporter, to: target, t: now() });
    S.exception('SAFETY', '안전 신고 접수', `${reason} · 신고자-피신고자 향후 매칭 자동 분리됨`, { reporter, target });
    S.audit(user(reporter).name, '신고 접수', reason);
  }

  // 다음 일정 추천 (RET-02): 선호 지역·참가 이력 기반
  function recommend(u) {
    const past = st().apps.filter((a) => a.userId === u.id && a.region);
    const favRegion = past.length ? Object.entries(past.reduce((m, a) => ((m[a.region] = (m[a.region] || 0) + 1), m), {})).sort((a, b) => b[1] - a[1])[0][0] : u.prefRegions[0];
    const busy = new Set(st().apps.filter((a) => a.userId === u.id && a.appStatus === 'SUBMITTED' && !['NO_MATCH'].includes(a.matchStatus)).flatMap((a) => (a.date ? [a.date] : a.dates)));
    return openDates().filter((d) => !busy.has(d)).slice(0, 3).map((d) => ({ date: d, region: favRegion, waiting: st().apps.filter((a) => a.dates.includes(d) && a.regions.includes(favRegion) && a.appStatus === 'SUBMITTED' && !a.legacy).length }));
  }

  return { relations, validGroup, score, runMatching, tick, submit, pay, cancel, cancelPhase, dayOfNotice, resolve, checkIn, submitFeedback, report, recommend, openDates, openSlots, deadlineOf, canApply, membershipValid, activeMembers, assignVenue, addPenalty, requestRefund, sys, vars, dropFromTable, regionName };
})();

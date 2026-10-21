// 운영자 웹 어드민
window.AdminView = (function () {
  const A = App.A, st = () => S.st, now = () => S.now(), E = U.esc, P = U.POLICY;
  const RN = (r) => U.REGIONS[r].name, RS = (r) => U.REGIONS[r].short, D = (k) => U.fdate(U.fromKey(k));
  const b = (g, s) => PartView.badge(g, s);
  const live = () => st().apps.filter((a) => !a.legacy);
  const uname = (id) => E(S.user(id)?.name || '-');
  const pct = (a, b2) => (b2 ? Math.round((a / b2) * 100) + '%' : '-');

  const NAV = [
    ['', '📊', '운영 대시보드'], ['slots', '🗓', '회차 관리'], ['venues', '🍽', '식당 재고·자동화'], ['apps', '👥', '신청자 목록'],
    ['match', '🎲', '자동 매칭 모니터'], ['exceptions', '⚠️', '예외 처리함'], ['payments', '💳', '결제·환불'], ['attendance', '✅', '참석·노쇼 관리'],
    ['safety', '🛡', '피드백·안전'], ['messages', '✉️', '자동 메시지'], ['settings', '⚙️', '매칭 가중치'], ['audit', '📜', '변경 이력'],
  ];
  function layout(cur, body) {
    const openEx = st().exceptions.filter((e) => e.status === 'OPEN').length;
    const ns = live().filter((a) => a.noShowCandidate).length;
    const rep = st().reports.filter((r) => r.status === 'OPEN').length;
    const n = { exceptions: openEx, attendance: ns, safety: rep };
    return `<div class="admin"><aside><div class="brand"><div style="color:#F3E3CF"><span class="logo" style="font-size:13px">${[...'우연한식탁'].map((c) => `<span>${c}</span>`).join('')}</span></div><div class="xs" style="color:#A88E74;margin-top:8px">운영자 어드민 · 와썹하우스</div></div>
      ${NAV.map(([k, ic, l]) => `<a href="#/admin${k ? '/' + k : ''}" class="${cur === k ? 'on' : ''}"><span>${ic} ${l}</span>${n[k] ? `<span class="n">${n[k]}</span>` : ''}</a>`).join('')}
      <div class="side-foot" style="margin-top:20px;padding:8px 12px" class="xs"><a href="#/home" style="padding:0;color:#A88E74;font-size:12px">← 참가자 앱으로</a></div></aside><main>${body}</main></div>`;
  }
  const head = (t, sub, right = '') => `<div class="row between wrap"><div><h1>${t}</h1>${sub ? `<div class="small muted">${sub}</div>` : ''}</div><div class="row">${right}</div></div>`;

  // ═════════ 대시보드 ═════════
  function dashboard() {
    const ap = live();
    const paid = ap.filter((a) => a.payStatus !== 'PENDING' && a.payStatus !== 'FAILED' && a.pass);
    const ranDates = new Set(st().runs.map((r) => r.date));
    const evaluated = ap.filter((a) => a.pass && (a.matchStatus === 'CONFIRMED' || a.failedAt || a.resolution));
    const confirmed = ap.filter((a) => a.confirmedAt);
    const runs = st().runs;
    const rescued = runs.reduce((s, r) => s + r.realloc, 0), failedRun = runs.reduce((s, r) => s + r.failed, 0), carried = runs.reduce((s, r) => s + r.carried, 0);
    const altWait = ap.filter((a) => a.matchStatus === 'ALTERNATIVE_OFFERED' && a.appStatus === 'SUBMITTED');
    const altResolved = ap.filter((a) => a.resolution === 'MOVE').length;
    const openEx = st().exceptions.filter((e) => e.status === 'OPEN');
    const ns = ap.filter((a) => a.noShowCandidate);
    const rep = st().reports.filter((r) => r.status === 'OPEN');
    const attended = st().apps.filter((a) => a.attendance === 'ATTENDED');
    const byUser = {}; attended.forEach((a) => (byUser[a.userId] = (byUser[a.userId] || 0) + 1));
    const revisitors = Object.values(byUser).filter((n) => n > 1).length;
    const fbDone = st().feedback.filter((f) => attended.some((a) => a.tableId === f.tableId && a.userId === f.userId)).length;
    const confirmedTables = st().tables.filter((t) => !t.legacy && t.status !== 'DISSOLVED');
    const autoTables = confirmedTables.filter((t) => !t.manualEdit).length;
    const refunds = st().payments.filter((p) => ['REFUNDED', 'REFUND_FAILED', 'REFUND_PROCESSING'].includes(p.status));
    const venueFail = openEx.filter((e) => e.type === 'VENUE').length, notifyFail = openEx.filter((e) => e.type === 'NOTIFY_FAIL').length, refundFail = openEx.filter((e) => e.type === 'REFUND').length;
    const k = (l, v, s, alert, href) => `<${href ? `a href="${href}" style="text-decoration:none;color:inherit"` : 'div'} class="kpi ${alert ? 'alert' : ''}"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${s || ''}</div></${href ? 'a' : 'div'}>`;
    const upcoming = U.uniq(st().slots.filter((s) => U.fromKey(s.date) + U.DAY > now()).map((s) => s.date)).sort().slice(0, 4);
    return layout('', `${head('운영 대시보드', `${U.fdt(now())} 기준 · 정상 흐름은 자동 처리되고, 자동으로 해결되지 않은 예외만 여기에 표시돼요.`, `<button class="btn sm ghost" data-act="csvApps">신청자 CSV</button><button class="btn sm ghost" data-act="csvTables">테이블 CSV</button>`)}
      <div class="kpis">
        ${k('전체 신청', ap.length + '건', `결제 완료 ${paid.length}명`)}
        ${k('결제 전환율', pct(paid.length, ap.length), '신청 완료 → 결제 완료')}
        ${k('매칭 성공률', pct(confirmed.length, evaluated.length), `확정 ${confirmed.length} / 매칭 대상 ${evaluated.length}`)}
        ${k('자동 확정률', pct(autoTables, confirmedTables.length), `테이블 ${confirmedTables.length}개 · 운영자 수정 ${confirmedTables.length - autoTables}`)}
        ${k('자동 재배치 성공', rescued + '명', `다음 날짜 이월 ${carried} · 최종 실패 ${failedRun}`)}
        ${k('대체 일정 전환', altResolved + '명', `선택 대기 ${altWait.length}명`, altWait.length > 0)}
        ${k('자동 환불', refunds.filter((p) => p.status === 'REFUNDED').length + '건', `실패 ${refundFail}건`, refundFail)}
        ${k('재방문율', pct(revisitors, Object.keys(byUser).length), `2회 이상 참석 ${revisitors}명`)}
        ${k('피드백 응답률', pct(fbDone, attended.length), `${fbDone} / 참석 ${attended.length}`)}
        ${k('운영자 개입률', pct(st().exceptions.length, ap.length), `예외 ${st().exceptions.length}건 / 신청 ${ap.length}건`)}
      </div>
      <div class="panel"><h3>처리할 예외 · 지금 확인이 필요한 것만</h3>
        <div class="kpis" style="margin:0">
          ${k('미해결 예외', openEx.length, '전체', openEx.length, '#/admin/exceptions')}
          ${k('식당 배정 실패', venueFail, '자동 배정 가능한 식당 없음', venueFail, '#/admin/exceptions')}
          ${k('알림 발송 실패', notifyFail, '3회 재시도 후 실패', notifyFail, '#/admin/exceptions')}
          ${k('환불 실패', refundFail, '자동 환불 실패', refundFail, '#/admin/exceptions')}
          ${k('노쇼 후보', ns.length, '체크인 없음 · 확인 필요', ns.length, '#/admin/attendance')}
          ${k('미처리 신고', rep.length, '안전 신고', rep.length, '#/admin/safety')}
        </div></div>
      <div class="panel"><h3>다가오는 회차</h3><table class="t"><thead><tr><th>회차</th><th>매칭 마감</th><th>신청</th><th>결제 완료</th><th>결제 대기</th><th>확정 테이블</th><th>확정 인원</th><th>대체 일정 대기</th><th>상태</th></tr></thead><tbody>
        ${upcoming.map((d) => { const as = ap.filter((a) => a.dates.includes(d) || a.date === d); const tbs = st().tables.filter((t) => t.date === d && t.status !== 'DISSOLVED'); const ran = ranDates.has(d); return `<tr><td><b>${D(d)}</b> ${P.eventHour}:${U.pad(P.eventMin)}</td><td>${U.fdeadline(ENGINE.deadlineOf(d))}<div class="xs faint">${U.rel(ENGINE.deadlineOf(d), now())}</div></td><td>${as.length}</td><td>${as.filter((a) => a.payStatus === 'PAID' || a.matchStatus === 'CONFIRMED').length}</td><td>${as.filter((a) => ['PENDING', 'FAILED'].includes(a.payStatus)).length}</td><td>${tbs.length}</td><td>${tbs.reduce((s, t) => s + ENGINE.activeMembers(t).length, 0)}</td><td>${as.filter((a) => a.matchStatus === 'ALTERNATIVE_OFFERED' && a.failedDate === d && a.appStatus === 'SUBMITTED').length}</td><td>${ran ? (tbs.some((t) => t.status === 'DONE') ? '<span class="badge">종료</span>' : '<span class="badge green">자동 매칭 완료</span>') : '<span class="badge amber">모집 중</span>'}</td></tr>`; }).join('')}
      </tbody></table></div>
      <div class="grid2"><div class="panel"><h3>최근 자동 매칭 실행</h3>${runs.slice(0, 4).map((r) => `<div class="row between small" style="padding:6px 0;border-bottom:1px solid #F0E9DF"><span><b>${D(r.date)}</b> · ${U.fdt(r.t)} · ${E(r.trigger)}</span><span class="muted">후보 ${r.candidates} → 확정 ${r.tables}개 · 실패 ${r.failed}</span></div>`).join('') || '<p class="small muted">아직 실행 기록이 없어요.</p>'}<a class="btn xs ghost mt12" href="#/admin/match">매칭 모니터 →</a></div>
      <div class="panel"><h3>최근 변경 이력</h3>${st().audit.slice(0, 7).map((x) => `<div class="small" style="padding:4px 0;border-bottom:1px solid #F0E9DF"><span class="faint xs">${U.fdt(x.t)}</span> <b>${E(x.actor)}</b> ${E(x.action)} <span class="muted xs">${E(x.detail)}</span></div>`).join('')}</div></div>`);
  }

  // ═════════ 회차 관리 ═════════
  function slots() {
    const dates = U.uniq(st().slots.map((s) => s.date)).sort().filter((d) => U.fromKey(d) > now() - 14 * U.DAY);
    const d = (App.draft.newSlot ||= { date: '', regions: Object.keys(U.REGIONS) });
    const next = []; let t = U.fromKey(dates[dates.length - 1] || U.dkey(now())); for (let i = 0; i < 6; i++) { t += 7 * U.DAY; next.push(U.dkey(t)); }
    return layout('slots', `${head('회차 관리', '목요일 19:30 · 매칭 마감은 화요일 24:00 (환불 마감과 동일). 마감 시각에 스케줄러가 자동 매칭을 실행해요.')}
      <div class="panel"><h3>새 회차 열기</h3><div class="filters"><select class="input" data-bind="newSlot.date"><option value="">날짜 선택</option>${next.map((x) => `<option value="${x}" ${d.date === x ? 'selected' : ''}>${D(x)}</option>`).join('')}</select>
        ${Object.keys(U.REGIONS).map((r) => `<span class="chip ${d.regions.includes(r) ? 'on' : ''}" data-act="chip" data-path="newSlot.regions" data-val="${r}" data-multi="1" style="padding:6px 12px">${RN(r)}</span>`).join('')}
        <button class="btn sm" data-act="createSlot">회차 생성</button></div><p class="xs faint mt8">생성하면 모집 중인 회차에 바로 노출되고, 선호 지역이 맞는 참가자에게 다음 모집 알림을 보내요.</p></div>
      <div class="panel"><table class="t"><thead><tr><th>날짜</th><th>매칭 마감</th>${Object.keys(U.REGIONS).map((r) => `<th>${RS(r)}</th>`).join('')}<th>자동 매칭</th><th></th></tr></thead><tbody>
      ${dates.map((dt) => { const ran = st().runs.find((r) => r.date === dt); const past = U.fromKey(dt) + U.DAY < now(); return `<tr><td><b>${D(dt)}</b></td><td>${U.fdeadline(ENGINE.deadlineOf(dt))}</td>
        ${Object.keys(U.REGIONS).map((r) => { const s = st().slots.find((x) => x.date === dt && x.region === r); const n = live().filter((a) => (a.date === dt && a.region === r) || (!a.date && a.dates.includes(dt) && a.regions.includes(r))).length; return `<td>${s ? `<span class="badge ${s.open ? 'green' : ''}" ${past ? '' : `data-act="toggleSlot" data-id="${s.id}" style="cursor:pointer"`}>${s.open ? '모집' : '닫힘'}</span> <span class="xs muted">${n}명</span>` : '-'}</td>`; }).join('')}
        <td>${ran ? `<span class="badge green">${U.fdt(ran.t)} 실행</span>` : '<span class="badge amber">마감 대기</span>'}</td>
        <td>${!ran && !past ? `<button class="btn xs ghost" data-act="runNow" data-date="${dt}">지금 실행</button>` : ''}</td></tr>`; }).join('')}
      </tbody></table><p class="xs faint mt8">'지금 실행'은 테스트용 수동 트리거예요. 같은 회차는 한 번만 실행되어(멱등) 중복 테이블·중복 환불이 생기지 않아요.</p></div>`);
  }
  A.createSlot = () => {
    const d = App.draft.newSlot; if (!d.date || !d.regions.length) return App.toast('날짜와 지역을 선택해주세요');
    d.regions.forEach((r) => { if (!st().slots.find((s) => s.date === d.date && s.region === r)) st().slots.push({ id: `s-${d.date}-${r}`, date: d.date, region: r, start: U.fromKey(d.date, P.eventHour, P.eventMin), deadline: ENGINE.deadlineOf(d.date), capacity: 24, open: true }); });
    let sent = 0;
    Object.values(st().users).filter((u) => u.profileDone && u.prefRegions.some((r) => d.regions.includes(r))).slice(0, 80).forEach((u) => { if (st().apps.some((a) => a.userId === u.id)) { S.notify(u.id, 'NEW_SLOT', `${D(d.date)} 우연한 식탁 모집 시작`, `자주 가는 ${RN(u.prefRegions.find((r) => d.regions.includes(r)))}에서 새 식탁이 열렸어요.`, '#/apply'); sent++; } });
    S.audit('운영자', '회차 생성', `${d.date} ${d.regions.join(',')} · 알림 ${sent}명`); App.draft.newSlot = null; S.commit(); App.toast('회차를 열었어요', `다음 모집 알림 ${sent}명 발송`);
  };
  A.toggleSlot = (d) => { const s = st().slots.find((x) => x.id === d.id); s.open = !s.open; S.audit('운영자', '회차 지역 ' + (s.open ? '열기' : '닫기'), s.id); S.commit(); };
  A.runNow = (d) => { const r = ENGINE.runMatching(d.date, { manual: true }); S.audit('운영자', '수동 매칭 실행', d.date); S.commit(); App.toast(r ? `매칭 완료: 테이블 ${r.tables}개` : '이미 실행된 회차예요', r ? `후보 ${r.candidates}명 · 실패 ${r.failed}명 · 이월 ${r.carried}명` : ''); };

  // ═════════ 식당 재고 ═════════
  function venues() {
    const dates = U.uniq(st().tables.filter((t) => !t.legacy && t.status !== 'DISSOLVED').map((t) => t.date)).sort().slice(-3);
    const nv = (App.draft.nv ||= { name: '', region: 'JAMSIL', address: '', price: 'B2', capacity: 2 });
    return layout('venues', `${head('식당 재고 · 자동화 규칙', '확정 테이블은 같은 지역 · 예산이 맞는 파트너 식당에 자동 배정돼요. 재고가 없을 때만 예외로 올라와요.')}
      <div class="panel"><table class="t"><thead><tr><th>식당</th><th>지역</th><th>가격대</th><th>저녁 수용 테이블</th>${dates.map((d) => `<th>${D(d)} 사용</th>`).join('')}<th>상태</th></tr></thead><tbody>
      ${st().venues.map((v) => `<tr><td><b>${E(v.name)}</b><div class="xs faint">${E(v.address)}</div></td><td>${RN(v.region)}</td><td>${U.BUDGETS[v.price]}</td>
        <td><div class="row"><button class="btn xs ghost" data-act="venueCap" data-id="${v.id}" data-d="-1">−</button><b>${v.capacity}</b><button class="btn xs ghost" data-act="venueCap" data-id="${v.id}" data-d="1">+</button></div></td>
        ${dates.map((d) => { const used = st().tables.filter((t) => t.venueId === v.id && t.date === d && t.status !== 'DISSOLVED').length; return `<td>${used}/${v.capacity}${used >= v.capacity ? ' <span class="badge red">만석</span>' : ''}</td>`; }).join('')}
        <td><span class="badge ${v.active ? 'green' : ''}" data-act="venueToggle" data-id="${v.id}" style="cursor:pointer">${v.active ? '운영' : '중지'}</span></td></tr>`).join('')}
      </tbody></table></div>
      <div class="panel"><h3>파트너 식당 추가</h3><div class="filters"><input class="input" placeholder="식당명" data-bind="nv.name" value="${E(nv.name)}"><select class="input" data-bind="nv.region">${Object.keys(U.REGIONS).map((r) => `<option value="${r}" ${nv.region === r ? 'selected' : ''}>${RN(r)}</option>`).join('')}</select><input class="input" placeholder="주소" data-bind="nv.address" value="${E(nv.address)}" style="min-width:240px"><select class="input" data-bind="nv.price">${Object.entries(U.BUDGETS).map(([k, l]) => `<option value="${k}" ${nv.price === k ? 'selected' : ''}>${l}</option>`).join('')}</select><button class="btn sm" data-act="addVenue">추가</button></div>
      <p class="xs faint mt8">추가 후 예외 처리함의 '식당 배정 실패' 건에서 바로 배정할 수 있어요. 식당 확보 기준: 리뷰 평점이 좋고 단체 예약이 가능한 곳.</p></div>
      <div class="panel"><h3>자동화 규칙</h3><div class="small col" style="gap:4px">
        <div>• 매칭 마감(화 24:00) → 결제 완료자 자동 매칭 → 조건 충족 테이블 자동 확정</div><div>• 확정 즉시: 식당 자동 배정 → 앱 단체방 생성 → 확정 푸시 + 큐레이션·취소정책 게시</div>
        <div>• 모임 하루 전 19:30: 시간·장소·예약명·취소정책 리마인드 (푸시 + 단체방)</div><div>• 모임 시작 시각: 맞춤 대화 주제·아이스브레이킹 자동 게시</div>
        <div>• 종료 시각(+2.5h): 미체크인 → 노쇼 후보, 피드백 요청 발송 · 다음 날 미응답자 1회 리마인드</div><div>• 발송 실패 시 자동 재시도 3회 → 실패만 예외 처리함으로</div></div></div>`);
  }
  A.venueCap = (d) => { const v = st().venues.find((x) => x.id === d.id); v.capacity = Math.max(0, v.capacity + +d.d); S.audit('운영자', '식당 수용 변경', `${v.name} ${v.capacity}`); S.commit(); };
  A.venueToggle = (d) => { const v = st().venues.find((x) => x.id === d.id); v.active = !v.active; S.audit('운영자', '식당 상태 변경', v.name); S.commit(); };
  A.addVenue = () => { const v = App.draft.nv; if (!v.name || !v.address) return App.toast('식당명과 주소를 입력해주세요'); st().venues.push({ id: U.uid('v'), name: v.name, region: v.region, address: v.address, price: v.price, capacity: 2, active: true, map: `https://map.naver.com/p/search/${encodeURIComponent(v.name)}` }); S.audit('운영자', '식당 추가', v.name); App.draft.nv = null; S.commit(); };

  // ═════════ 신청자 목록 ═════════
  function apps() {
    const f = (App.draft.af ||= { q: '', date: '', match: '', pay: '' });
    const dates = U.uniq(live().flatMap((a) => (a.date ? [a.date] : a.dates))).sort();
    let list = live().filter((a) => (!f.date || a.date === f.date || a.dates.includes(f.date)) && (!f.match || a.matchStatus === f.match) && (!f.pay || a.payStatus === f.pay) && (!f.q || S.user(a.userId).name.includes(f.q) || S.user(a.userId).phone.includes(f.q)));
    list = list.sort((a, b) => b.createdAt - a.createdAt);
    const sel = (bind, opts, label) => `<select class="input" data-bind="${bind}" data-rerender="1"><option value="">${label}</option>${opts.map(([v, l]) => `<option value="${v}" ${App.draft.af[bind.split('.')[1]] === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
    return layout('apps', `${head('신청자 목록', `${list.length}건 · 신청·결제·매칭·참석 상태를 분리해서 저장해요`, `<button class="btn sm ghost" data-act="csvApps">CSV 내보내기</button>`)}
      <div class="filters"><input class="input" placeholder="이름·연락처 검색" data-bind="af.q" value="${E(f.q)}" data-enter="rerender">${sel('af.date', dates.map((d) => [d, D(d)]), '전체 회차')}${sel('af.match', Object.entries(PartView.L.match).map(([k, v]) => [k, v[0]]), '매칭 상태')}${sel('af.pay', Object.entries(PartView.L.pay).map(([k, v]) => [k, v[0]]), '결제 상태')}<button class="btn sm ghost" data-act="rerender">검색</button></div>
      <div class="panel" style="max-height:70vh"><table class="t"><thead><tr><th>이름</th><th>나이/성별</th><th>MBTI</th><th>희망 날짜</th><th>지역</th><th>이용권</th><th>신청</th><th>결제</th><th>매칭</th><th>참석</th><th>재배치</th><th>이전 참석</th><th>경고</th></tr></thead><tbody>
      ${list.slice(0, 300).map((a) => { const u = S.user(a.userId); const past = st().apps.filter((x) => x.userId === u.id && x.attendance === 'ATTENDED').length; return `<tr data-act="userModal" data-id="${u.id}" style="cursor:pointer"><td><b>${E(u.name)}</b><div class="xs faint">${E(u.phone)}</div></td><td>${U.age(u.birthYear, now())} · ${u.gender === 'M' ? '남' : '여'}</td><td>${u.mbti}</td><td>${a.date ? `<b>${D(a.date)}</b>` : a.dates.map(D).join(', ')}</td><td>${a.region ? RS(a.region) : a.regions.map(RS).join('·')}</td><td>${a.pass === 'MEMBERSHIP' ? '멤버십' : a.pass === 'SINGLE' ? '1회권' : '-'}</td><td>${b('app', a.appStatus)}</td><td>${b('pay', a.payStatus)}</td><td>${b('match', a.matchStatus)}</td><td>${a.attendance ? b('att', a.attendance) : '-'}${a.noShowCandidate ? ' <span class="badge red">노쇼 후보</span>' : ''}</td><td>${a.realloc || '-'}</td><td>${past}회</td><td>${u.penalty || '-'}${u.account.status !== 'ACTIVE' ? ` <span class="badge red">${u.account.status === 'BANNED' ? '영구' : '제한'}</span>` : ''}</td></tr>`; }).join('')}
      </tbody></table></div>`);
  }
  A.rerender = () => App.render();
  A.userModal = (d) => {
    const u = S.user(d.id);
    const as = st().apps.filter((a) => a.userId === u.id).sort((a, b2) => b2.createdAt - a.createdAt);
    const reps = st().reports.filter((r) => r.target === u.id || r.reporter === u.id);
    App.openModal(() => `<div class="row between"><h3>${E(u.name)} <span class="small muted">${U.age(u.birthYear, now())}세 · ${u.gender === 'M' ? '남' : '여'} · ${E(u.job)} · ${u.mbti}</span></h3><button class="btn xs ghost" data-act="closeModal">닫기</button></div>
      <div class="small mt8">${E(u.phone)} · 선호 ${u.prefRegions.map(RS).join('·')} · 예산 ${u.budget.map((x) => U.BUDGETS[x]).join(', ')}${u.avoid ? ` · 못 먹는 음식: ${E(u.avoid)}` : ''}</div>
      <div class="mt8">${u.interests.map((i) => `<span class="tag">${E(i)}</span>`).join('')}</div>
      <div class="small mt8">경고 ${u.penalty}점 · 계정 ${u.account.status}${u.wallet.membership ? ` · 멤버십 ~${U.fdate(u.wallet.membership.expires)}` : ''} · 보관 1회권 ${u.wallet.credits.length}장</div>
      ${reps.length ? `<div class="small mt8" style="color:var(--red)">신고 관련 ${reps.length}건</div>` : ''}
      <h4 class="mt16">신청 · 참석 이력</h4>${as.map((a) => `<div class="small" style="padding:6px 0;border-bottom:1px solid var(--line)"><b>${(a.date ? [a.date] : a.dates).map(D).join(', ')}</b> ${a.legacy ? '<span class="badge">수기</span>' : ''} ${b('pay', a.payStatus)} ${b('match', a.matchStatus)} ${a.attendance ? b('att', a.attendance) : ''}${a.log.length ? `<div class="xs muted">${a.log.slice(-3).map((l) => `${U.fdt(l.t)} ${E(l.msg)}`).join('<br>')}</div>` : ''}</div>`).join('')}`);
  };

  // ═════════ 매칭 모니터 ═════════
  function scoreBars(bd) {
    if (!bd) return '<div class="xs faint">수기 매칭 (점수 없음)</div>';
    const rows = [['연령', bd.parts.age], ['성비', bd.parts.gender], ['MBTI', bd.parts.mbti], ['관심사', bd.parts.interest], ['원하는 성향', bd.parts.wants]];
    return `<div class="mini-bars">${rows.map(([l, v]) => `<span class="faint">${l}</span><div class="bar"><i style="width:${v}%"></i></div><span>${v}</span>`).join('')}</div>`;
  }
  function tableCard(t) {
    const us = t.members.map(S.user);
    const act = ENGINE.activeMembers(t);
    const v = st().venues.find((x) => x.id === t.venueId);
    const rel = ENGINE.relations(t.date);
    const conflicts = []; for (let i = 0; i < t.members.length; i++) for (let j = i + 1; j < t.members.length; j++) if (rel.hard(t.members[i], t.members[j])) conflicts.push(1);
    const bd = t.breakdown;
    const reall = st().apps.filter((a) => a.tableId === t.id).reduce((s, a) => s + (a.realloc || 0), 0);
    return `<div class="tcard"><div class="row between"><div><b>${RN(t.region)} #${t.no || ''}</b> <span class="badge ${t.status === 'CONFIRMED' ? 'green' : t.status === 'DISSOLVED' ? 'red' : ''}">${{ CONFIRMED: '자동 확정', DONE: '종료', DISSOLVED: '해체' }[t.status]}</span>${t.manualEdit ? ' <span class="badge amber">운영자 수정</span>' : ''}</div><div class="score">${t.score ?? '-'}<span class="xs faint">점</span></div></div>
      <div class="xs muted">${act.length}명 · ${bd ? `${bd.minAge ? U.age(bd.maxAge, now()) + '~' + U.age(bd.minAge, now()) : ''}세 (차이 ${bd.gap}) · 남 ${bd.m} 여 ${bd.f} · 이전 만남 ${bd.metPairs}쌍` : ''} · 충돌 ${conflicts.length ? `<b style="color:var(--red)">${conflicts.length}</b>` : '없음'} · 재배치 ${reall}회</div>
      <div class="mt8">${scoreBars(bd)}</div>
      <div class="mt8" style="font-size:12px">${us.map((u) => `<span class="tag" style="${act.includes(u.id) ? '' : 'text-decoration:line-through;opacity:.5'}">${E(u.name)} ${U.age(u.birthYear, now())}${u.gender === 'M' ? '남' : '여'} ${u.mbti}</span>`).join('')}</div>
      <div class="xs mt8">${v ? `🍽 ${E(v.name)} · ${E(t.booking)}` : '<span style="color:var(--red)">🍽 식당 미배정</span>'} · 단체방 ${t.chatCreated ? '생성' : '-'} · 리마인드 ${t.flags.reminder ? '발송' : '예약'} · 주제 ${t.flags.content ? '게시' : '예약'}</div>
      <a class="btn xs ghost mt8" href="#/admin/table/${t.id}">상세 · 긴급 수정</a></div>`;
  }
  function match() {
    const dates = U.uniq(st().runs.map((r) => r.date)).sort().reverse();
    const sel = App.draft.md || dates[0];
    const run = st().runs.find((r) => r.date === sel);
    const tbs = st().tables.filter((t) => t.date === sel && !t.legacy);
    const failed = live().filter((a) => a.failedDate === sel);
    const carried = live().filter((a) => a.log.some((l) => l.msg.includes(`${D(sel)} 매칭 실패`) && l.msg.includes('이월')));
    return layout('match', `${head('자동 매칭 모니터', `알고리즘 ${E(st().settings.algo)} · 필수 조건(날짜·지역·4~6명·나이 차 8살·제외 관계) + 선호 점수(최소 ${st().settings.minScore}점)`, `<select class="input" style="width:auto" data-bind="md" data-rerender="1">${dates.map((d) => `<option value="${d}" ${d === sel ? 'selected' : ''}>${D(d)}</option>`).join('')}</select>`)}
      ${run ? `<div class="kpis">${[['후보', run.candidates + '명'], ['확정 테이블', run.tables + '개'], ['자동 분리', run.split + '회'], ['미완성 병합', run.merged + '개'], ['자동 재배치', run.realloc + '회'], ['다음 날짜 이월', run.carried + '명'], ['최종 실패', run.failed + '명'], ['식당 배정 실패', run.venueFail + '개']].map(([l, v]) => `<div class="kpi"><div class="l">${l}</div><div class="v">${v}</div></div>`).join('')}</div>
      <div class="panel"><h3>실행 로그 · ${U.fdt(run.t)} · ${E(run.trigger)}</h3>${run.log.map((l) => `<div class="small" style="padding:3px 0">› ${E(l)}</div>`).join('')}</div>` : '<div class="panel"><p class="small muted">아직 실행된 매칭이 없어요. 데모 시계에서 \'다음 매칭 마감 직후\'로 이동해보세요.</p></div>'}
      <h3 class="mt24">확정 테이블 (${tbs.length})</h3><div class="tcards">${tbs.map(tableCard).join('')}</div>
      ${failed.length || carried.length ? `<div class="panel"><h3>미배치 참가자 · 사유</h3><table class="t"><thead><tr><th>이름</th><th>나이/성별</th><th>희망 지역</th><th>처리</th><th>사유</th><th>현재 상태</th></tr></thead><tbody>${[...carried.map((a) => [a, '다음 날짜 이월']), ...failed.map((a) => [a, '대체 일정 제안'])].map(([a, k]) => { const u = S.user(a.userId); return `<tr><td>${E(u.name)}</td><td>${U.age(u.birthYear, now())} · ${u.gender === 'M' ? '남' : '여'}</td><td>${a.regions.map(RS).join('·')}</td><td>${k}</td><td class="small">${E(a.reason || (a.log.find((l) => l.msg.includes('이월'))?.msg || ''))}</td><td>${b('match', a.matchStatus)} ${b('pay', a.payStatus)}</td></tr>`; }).join('')}</tbody></table></div>` : ''}`);
  }

  // ═════════ 테이블 상세 + 긴급 수정 (MAT-14) ═════════
  function tableDetail(id) {
    const t = st().tables.find((x) => x.id === id); if (!t) return layout('match', '<p>테이블을 찾을 수 없어요</p>');
    const others = st().tables.filter((x) => x.date === t.date && x.id !== t.id && x.status === 'CONFIRMED');
    const notifs = st().notifs.filter((n) => t.members.includes(n.userId) && n.link.includes(t.id));
    return layout('match', `${head(`${D(t.date)} ${RN(t.region)} #${t.no || ''}`, `테이블 상세 · ${t.log.join(' → ')}`, `<a class="btn sm ghost" href="#/admin/match">← 모니터</a>`)}
      <div class="grid2"><div>${tableCard(t)}
        <div class="panel"><h3>긴급 수정 (취소·안전 문제 등 예외 상황에서만)</h3>
          ${t.status === 'CONFIRMED' ? ENGINE.activeMembers(t).map((id2) => `<div class="row between small" style="padding:4px 0"><span>${uname(id2)}</span><span class="row"><select class="input" style="width:auto;padding:4px 8px;font-size:12px" data-bind="mv.${id2}"><option value="">이동할 테이블</option>${others.map((o) => `<option value="${o.id}">${RS(o.region)} #${o.no} (${ENGINE.activeMembers(o).length}명)</option>`).join('')}</select><button class="btn xs ghost" data-act="adminMove" data-t="${t.id}" data-u="${id2}">이동</button></span></div>`).join('') : '<p class="small muted">확정 상태 테이블만 수정할 수 있어요.</p>'}
          <p class="xs faint mt8">모든 변경은 변경 이력에 기록되고, 해당 참가자에게 자동 안내돼요.</p></div></div>
        <div class="panel"><h3>단체방 · 발송 이력</h3>${(st().chats[t.id] || []).map((m) => `<div class="small" style="padding:5px 0;border-bottom:1px solid #F0E9DF"><span class="xs faint">${U.fdt(m.t)}</span> <b>${m.from === 'SYSTEM' ? '시스템' : uname(m.from)}</b> ${m.kind === 'topics' ? `대화 주제 ${m.data.topics.length}개 + ${E(m.data.game.title)}` : m.kind === 'venue' ? '식당 안내 카드' : E(m.text)}</div>`).join('')}
          <h3 class="mt16">푸시 발송 (${notifs.length})</h3>${notifs.slice(0, 20).map((n) => `<div class="xs" style="padding:3px 0">${U.fdt(n.t)} · ${uname(n.userId)} · ${E(n.title)} ${n.status === 'FAILED' ? '<span class="badge red">실패</span>' : '<span class="badge green">성공</span>'}</div>`).join('')}</div></div>`);
  }
  A.adminMove = (d) => {
    const to = App.draft.mv?.[d.u]; if (!to) return App.toast('이동할 테이블을 선택해주세요');
    const from = st().tables.find((x) => x.id === d.t), dest = st().tables.find((x) => x.id === to);
    const a = st().apps.find((x) => x.tableId === from.id && x.userId === d.u);
    if (ENGINE.activeMembers(dest).length >= P.maxSize) return App.toast('이동할 테이블이 6명으로 가득 찼어요');
    const rel = ENGINE.relations(null);
    if (!ENGINE.validGroup([...ENGINE.activeMembers(dest), d.u], rel, false)) return App.toast('필수 조건 위반', '나이 차 또는 제외 관계 때문에 이동할 수 없어요');
    from.members = from.members.filter((x) => x !== d.u); dest.members.push(d.u); a.tableId = dest.id; a.region = dest.region;
    from.manualEdit = dest.manualEdit = true; from.log.push(`운영자 수정: ${S.user(d.u).name} 이동`); dest.log.push(`운영자 수정: ${S.user(d.u).name} 합류`);
    S.log(a, '운영자 긴급 수정으로 테이블 변경');
    S.notify(d.u, 'REALLOC', '테이블이 변경되었어요', '운영 사정으로 같은 날짜의 다른 테이블로 옮겨드렸어요.', `#/table/${dest.id}`);
    S.audit('운영자', '테이블 긴급 수정', `${S.user(d.u).name}: ${from.id} → ${dest.id}`);
    if (ENGINE.activeMembers(from).length < P.minSize) ENGINE.dropFromTable({ tableId: from.id, userId: d.u });
    S.commit(); App.toast('이동했어요');
  };

  // ═════════ 예외 처리함 ═════════
  function exceptions() {
    const f = App.draft.exf || 'OPEN';
    const list = st().exceptions.filter((e) => e.status === f);
    const TY = { VENUE: ['식당 배정', 'amber'], REFUND: ['환불', 'red'], NOTIFY_FAIL: ['알림', 'blue'], SAFETY: ['안전', 'red'], DATA: ['데이터', ''] };
    const action = (e) => {
      if (e.type === 'VENUE') { const t = st().tables.find((x) => x.id === e.refs.tableId); if (!t) return ''; const vs = st().venues.filter((v) => v.region === t.region && v.active); return `<div class="row"><select class="input" style="width:auto;padding:6px 10px;font-size:12px" data-bind="ev.${e.id}"><option value="">식당 선택</option>${vs.map((v) => { const used = st().tables.filter((x) => x.venueId === v.id && x.date === t.date && x.status !== 'DISSOLVED').length; return `<option value="${v.id}">${E(v.name)} (${used}/${v.capacity})</option>`; }).join('')}</select><button class="btn xs" data-act="exVenue" data-id="${e.id}">배정 + 안내 발송</button></div><div class="xs faint mt8">재고를 늘리거나 새 파트너 식당을 추가하면 자동 재시도할 수 있어요.</div>`; }
      if (e.type === 'REFUND') return `<button class="btn xs" data-act="exRefundRetry" data-id="${e.id}">재시도</button> <button class="btn xs ghost" data-act="exRefundManual" data-id="${e.id}">수동 환불 완료 처리</button>`;
      if (e.type === 'NOTIFY_FAIL') return `<button class="btn xs ghost" data-act="exResolve" data-id="${e.id}" data-note="문자로 수동 안내 완료">문자로 수동 안내 완료</button>`;
      if (e.type === 'SAFETY') return `<a class="btn xs" href="#/admin/safety">안전 관리에서 처리 →</a>`;
      return `<button class="btn xs ghost" data-act="exResolve" data-id="${e.id}" data-note="확인 완료">확인 완료</button>`;
    };
    return layout('exceptions', `${head('예외 처리함', '자동으로 해결되지 않은 결제·식당·알림·안전 문제만 모여요. 정상 흐름은 여기 올라오지 않아요.')}
      <div class="filters"><div class="seg" style="width:260px"><button class="${f === 'OPEN' ? 'on' : ''}" data-act="setExf" data-v="OPEN">미해결 ${st().exceptions.filter((e) => e.status === 'OPEN').length}</button><button class="${f === 'RESOLVED' ? 'on' : ''}" data-act="setExf" data-v="RESOLVED">처리 완료</button></div></div>
      <div class="panel">${list.length ? `<table class="t"><thead><tr><th>유형</th><th>내용</th><th>발생</th><th>${f === 'OPEN' ? '처리' : '처리 결과'}</th></tr></thead><tbody>${list.map((e) => `<tr><td><span class="badge ${TY[e.type]?.[1]}">${TY[e.type]?.[0] || e.type}</span></td><td><b>${E(e.title)}</b><div class="small muted">${E(e.detail)}</div></td><td class="small">${U.fdt(e.t)}</td><td>${f === 'OPEN' ? action(e) : `<span class="small">${E(e.resolvedNote || '')}</span><div class="xs faint">${e.resolvedAt ? U.fdt(e.resolvedAt) : ''}</div>`}</td></tr>`).join('')}</tbody></table>` : `<p class="small muted center" style="padding:30px">${f === 'OPEN' ? '처리할 예외가 없어요 🎉' : '처리 완료된 예외가 없어요'}</p>`}</div>`);
  }
  const resolveEx = (e, note) => { e.status = 'RESOLVED'; e.resolvedNote = note; e.resolvedAt = now(); S.audit('운영자', '예외 처리', `${e.title} · ${note}`); };
  A.setExf = (d) => { App.draft.exf = d.v; App.render(); };
  A.exResolve = (d) => { resolveEx(st().exceptions.find((x) => x.id === d.id), d.note); S.commit(); };
  A.exVenue = (d) => {
    const e = st().exceptions.find((x) => x.id === d.id), vid = App.draft.ev?.[d.id];
    if (!vid) return App.toast('식당을 선택해주세요');
    const t = st().tables.find((x) => x.id === e.refs.tableId), v = st().venues.find((x) => x.id === vid);
    t.venueId = vid; t.booking = `우연한식탁 ${RS(t.region)}${t.no || ''}`; t.log.push(`운영자 식당 배정: ${v.name}`);
    ENGINE.sys(t.id, 'venue', '식당 안내', { tableId: t.id });
    ENGINE.activeMembers(t).forEach((id) => S.notify(id, 'VENUE', '식당이 배정되었어요', CONTENT.fill(st().contents.templates.CONFIRMED, ENGINE.vars(t)), `#/table/${t.id}`));
    resolveEx(e, `${v.name} 수동 배정 · 참가자 안내 발송`); S.commit(); App.toast('식당 배정 완료', '참가자에게 안내를 보냈어요');
  };
  A.exRefundRetry = (d) => { const e = st().exceptions.find((x) => x.id === d.id), p = st().payments.find((x) => x.id === e.refs.paymentId); p.refundFail = false; p.status = 'REFUND_PROCESSING'; const a = st().apps.find((x) => x.id === p.appId); if (a) a.payStatus = 'REFUND_PROCESSING'; ENGINE.tick(); resolveEx(e, '환불 재시도 성공'); S.commit(); };
  A.exRefundManual = (d) => { const e = st().exceptions.find((x) => x.id === d.id), p = st().payments.find((x) => x.id === e.refs.paymentId); p.status = 'REFUNDED'; p.refundedAt = now(); const a = st().apps.find((x) => x.id === p.appId); if (a) { a.payStatus = 'REFUNDED'; S.log(a, '운영자 수동 환불 완료'); } S.notify(p.userId, 'REFUNDED', '환불이 완료되었어요', `${U.won(p.amount)} 환불이 완료되었어요.`, '#/me'); resolveEx(e, '수동 환불 완료'); S.commit(); };

  // ═════════ 결제·환불 ═════════
  function payments() {
    const ps = st().payments.slice().sort((a, b2) => b2.createdAt - a.createdAt);
    const sum = (f) => ps.filter(f).reduce((s, p) => s + p.amount, 0);
    const mem = Object.values(st().users).filter((u) => u.wallet.membership);
    return layout('payments', `${head('결제 · 환불', '모의 결제(해커톤) · 환불은 참가자 선택 즉시 원결제수단으로 자동 처리, 실패 건만 예외로 전환')}
      <div class="kpis">${[['결제 금액', U.won(sum((p) => p.status !== 'FAILED'))], ['환불 완료', U.won(sum((p) => p.status === 'REFUNDED'))], ['환불 처리 중', ps.filter((p) => p.status === 'REFUND_PROCESSING').length + '건'], ['환불 실패', ps.filter((p) => p.status === 'REFUND_FAILED').length + '건'], ['결제 실패', ps.filter((p) => p.status === 'FAILED').length + '건'], ['멤버십 회원', mem.filter((u) => u.wallet.membership.expires > now()).length + '명']].map(([l, v]) => `<div class="kpi"><div class="l">${l}</div><div class="v" style="font-size:20px">${v}</div></div>`).join('')}</div>
      <div class="panel" style="max-height:60vh"><table class="t"><thead><tr><th>일시</th><th>참가자</th><th>항목</th><th>금액</th><th>수단</th><th>상태</th><th>연결 신청</th></tr></thead><tbody>${ps.map((p) => { const a = st().apps.find((x) => x.id === p.appId); return `<tr><td class="small">${U.fdt(p.createdAt)}</td><td>${uname(p.userId)}</td><td>${E(p.item)}</td><td>${U.won(p.amount)}</td><td>${E(p.method)}</td><td>${b('pay', p.status)}</td><td class="small">${a ? `${(a.date ? [a.date] : a.dates).map(D).join(', ')} ${b('match', a.matchStatus)}` : '-'}</td></tr>`; }).join('')}</tbody></table></div>
      <div class="panel"><h3>멤버십 · 이용권 사용</h3><table class="t"><thead><tr><th>회원</th><th>플랜</th><th>만료</th><th>이번 기간 참여</th><th>매칭 실패 연장</th></tr></thead><tbody>${mem.map((u) => { const used = st().apps.filter((a) => a.userId === u.id && a.pass === 'MEMBERSHIP' && !a.legacy).length; const ext = st().apps.filter((a) => a.userId === u.id && a.pass === 'MEMBERSHIP' && a.failedAt).length; return `<tr><td>${E(u.name)}</td><td>${U.PASSES[u.wallet.membership.plan].label}</td><td>${U.fdate(u.wallet.membership.expires)} ${u.wallet.membership.expires < now() ? '<span class="badge">만료</span>' : ''}</td><td>${used}회</td><td>${ext ? `+${ext * P.membershipExtendDaysPerFail}일` : '-'}</td></tr>`; }).join('')}</tbody></table></div>`);
  }

  // ═════════ 참석·노쇼 ═════════
  function attendance() {
    const cands = live().filter((a) => a.noShowCandidate);
    const tbs = st().tables.filter((t) => !t.legacy && t.status !== 'DISSOLVED' && U.fromKey(t.date) <= now() + 2 * U.DAY).sort((a, b2) => (a.date < b2.date ? 1 : -1)).slice(0, 12);
    const late = live().filter((a) => a.attendance === 'CANCELED_LATE' || a.attendance === 'NO_SHOW');
    return layout('attendance', `${head('참석 · 취소 · 노쇼 관리', `체크인 없이 종료된 참가자는 노쇼 후보로만 올라오고, 운영자가 확인하면 경고 ${P.penalty.NO_SHOW}점(4주 제한)이 적용돼요.`)}
      <div class="panel"><h3>노쇼 후보 (${cands.length})</h3>${cands.length ? `<table class="t"><thead><tr><th>참가자</th><th>회차</th><th>현재 경고</th><th>처리</th></tr></thead><tbody>${cands.map((a) => { const u = S.user(a.userId); return `<tr><td>${E(u.name)} <span class="xs faint">${E(u.phone)}</span></td><td>${D(a.date)} ${RS(a.region)}</td><td>${u.penalty}점</td><td><button class="btn xs danger" data-act="nsConfirm" data-id="${a.id}">노쇼 확정</button> <button class="btn xs ghost" data-act="nsAttend" data-id="${a.id}">참석 처리 (체크인 누락)</button></td></tr>`; }).join('')}</tbody></table>` : '<p class="small muted">노쇼 후보가 없어요.</p>'}</div>
      <div class="panel"><h3>최근 테이블 체크인 현황</h3><table class="t"><thead><tr><th>테이블</th><th>참가자 · 참석 상태</th></tr></thead><tbody>${tbs.map((t) => `<tr><td><b>${D(t.date)}</b> ${RS(t.region)} #${t.no || ''}</td><td>${st().apps.filter((a) => a.tableId === t.id).map((a) => `<span class="tag">${uname(a.userId)} ${PartView.lbl('att', a.attendance)}${a.noShowCandidate ? '?' : ''}</span>`).join('')}</td></tr>`).join('')}</tbody></table></div>
      <div class="panel"><h3>늦은 취소 · 노쇼 기록</h3><table class="t"><thead><tr><th>참가자</th><th>회차</th><th>상태</th><th>누적 경고</th><th>계정</th></tr></thead><tbody>${late.map((a) => { const u = S.user(a.userId); return `<tr><td>${E(u.name)}</td><td>${a.date ? D(a.date) : '-'}</td><td>${b('att', a.attendance)}${a.dayOf ? ' <span class="xs faint">당일 사전 알림</span>' : ''}</td><td>${u.penalty}</td><td>${u.account.status === 'ACTIVE' ? '정상' : `${u.account.status === 'BANNED' ? '영구 제한' : `제한 ~${U.fdate(u.account.restrictedUntil)}`}`}</td></tr>`; }).join('') || '<tr><td colspan="5" class="muted small">기록이 없어요.</td></tr>'}</tbody></table></div>`);
  }
  A.nsConfirm = (d) => { const a = st().apps.find((x) => x.id === d.id); a.attendance = 'NO_SHOW'; a.noShowCandidate = false; S.log(a, '운영자 확인 → 노쇼 확정 (이용권 차감)'); ENGINE.addPenalty(a.userId, 'NO_SHOW'); S.audit('운영자', '노쇼 확정', S.user(a.userId).name); S.commit(); };
  A.nsAttend = (d) => { const a = st().apps.find((x) => x.id === d.id); a.attendance = 'ATTENDED'; a.noShowCandidate = false; S.log(a, '운영자 확인 → 참석 처리 (체크인 누락)'); S.audit('운영자', '참석 처리', S.user(a.userId).name); S.commit(); };

  // ═════════ 피드백·안전 ═════════
  function safety() {
    const fbs = st().feedback.filter((f) => !st().tables.find((t) => t.id === f.tableId)?.legacy);
    const all = st().feedback;
    const avg = (k, arr) => (arr.length ? (arr.reduce((s, f) => s + f.ratings[k], 0) / arr.length).toFixed(1) : '-');
    const never = all.flatMap((f) => Object.values(f.people || {})).filter((v) => v === 'NEVER').length;
    const again = all.flatMap((f) => Object.values(f.people || {})).filter((v) => v === 'AGAIN').length;
    return layout('safety', `${head('피드백 · 안전', '사람별 선호와 신고 내용은 상대에게 공개되지 않고, 다음 매칭의 제외/가점 조건으로만 쓰여요.')}
      <div class="kpis">${[['분위기', avg('mood', all)], ['대화', avg('talk', all)], ['식당', avg('food', all)], ['재참여 의향', pct(all.filter((f) => f.revisit === 'YES').length, all.length)], ['또 만나고 싶어요', again + '건'], ['다시는 (매칭 제외)', never + '건'], ['차단', st().blocks.length + '건']].map(([l, v]) => `<div class="kpi"><div class="l">${l}</div><div class="v">${v}</div></div>`).join('')}</div>
      <div class="panel"><h3>안전 신고</h3>${st().reports.length ? `<table class="t"><thead><tr><th>접수</th><th>신고자 → 피신고자</th><th>사유</th><th>피신고자 이력</th><th>상태 / 조치</th></tr></thead><tbody>${st().reports.map((r) => { const tg = S.user(r.target); const cnt = st().reports.filter((x) => x.target === r.target).length; return `<tr><td class="small">${U.fdt(r.t)}</td><td>${uname(r.reporter)} → <b>${E(tg.name)}</b></td><td><b>${E(r.reason)}</b><div class="xs muted">${E(r.detail)}</div></td><td class="small">신고 ${cnt}건 · 경고 ${tg.penalty}점 · ${tg.account.status}</td><td>${r.status === 'OPEN' ? `<div class="row wrap" style="gap:4px"><button class="btn xs ghost" data-act="repAct" data-id="${r.id}" data-a="WARN">경고</button><button class="btn xs ghost" data-act="repAct" data-id="${r.id}" data-a="RESTRICT">4주 제한</button><button class="btn xs danger" data-act="repAct" data-id="${r.id}" data-a="BAN">영구 제한</button><button class="btn xs ghost" data-act="repAct" data-id="${r.id}" data-a="DISMISS">기각</button></div>` : `<span class="badge">${E(r.action)}</span>`}</td></tr>`; }).join('')}</tbody></table>` : '<p class="small muted">접수된 신고가 없어요.</p>'}</div>
      <div class="panel"><h3>최근 피드백 (앱)</h3>${fbs.length ? `<table class="t"><thead><tr><th>작성자</th><th>테이블</th><th>분위기/대화/식당</th><th>재참여</th><th>사람별 선호</th><th>코멘트</th></tr></thead><tbody>${fbs.slice().reverse().map((f) => { const t = st().tables.find((x) => x.id === f.tableId); return `<tr><td>${uname(f.userId)}</td><td>${t ? `${D(t.date)} ${RS(t.region)}` : ''}</td><td>${f.ratings.mood} / ${f.ratings.talk} / ${f.ratings.food}</td><td>${{ YES: '꼭', MAYBE: '아마도', NO: '글쎄요' }[f.revisit]}</td><td class="small">${Object.entries(f.people || {}).filter(([, v]) => v).map(([id, v]) => `${uname(id)}:${v === 'AGAIN' ? '😊' : '🙅'}`).join(' ')}</td><td class="small">${E(f.comment)}</td></tr>`; }).join('')}</tbody></table>` : '<p class="small muted">앱으로 받은 피드백이 아직 없어요. (수기 운영 시절 피드백 ' + all.length + '건은 매칭에 반영 중)</p>'}</div>`);
  }
  A.repAct = (d) => {
    const r = st().reports.find((x) => x.id === d.id), u = S.user(r.target);
    const label = { WARN: '경고', RESTRICT: '4주 제한', BAN: '영구 제한', DISMISS: '기각' }[d.a];
    if (d.a === 'WARN') u.penalty += 1;
    if (d.a === 'RESTRICT') { u.account.status = 'RESTRICTED'; u.account.restrictedUntil = now() + 28 * U.DAY; }
    if (d.a === 'BAN') u.account.status = 'BANNED';
    if (d.a !== 'DISMISS') S.notify(u.id, 'SAFETY', '운영 정책 위반 안내', `커뮤니티 안전 정책에 따라 ${label} 조치되었어요.`, '#/policy');
    r.status = 'DONE'; r.action = label;
    st().exceptions.filter((e) => e.type === 'SAFETY' && e.status === 'OPEN' && e.refs.target === r.target).forEach((e) => resolveEx(e, label));
    S.audit('운영자', '신고 처리', `${u.name} · ${label}`); S.commit();
  };

  // ═════════ 자동 메시지 ═════════
  function messages() {
    const tp = st().contents.templates;
    const f = App.draft.nf || '';
    const ns = st().notifs.filter((n) => !f || n.status === f).slice(0, 120);
    const names = { CONFIRMED: '매칭 확정', REMINDER: '전날 리마인드', FAILED: '매칭 실패 · 대체 일정', FEEDBACK: '피드백 요청' };
    return layout('messages', `${head('자동 메시지 관리', '큐레이션·리마인드·대체 일정 메시지 템플릿과 자동 발송 이력. 변수: {date} {time} {venue} {booking}')}
      <div class="grid2">${Object.keys(names).map((k) => `<div class="panel" style="margin-top:12px"><h3>${names[k]}</h3><textarea class="input" rows="3" data-bind="tpl.${k}">${E(App.draft.tpl?.[k] ?? tp[k])}</textarea></div>`).join('')}</div>
      <button class="btn sm mt12" data-act="saveTpl">템플릿 저장</button>
      <div class="panel"><h3>대화 콘텐츠 (CON-04)</h3><div class="small muted">관심사별 주제 ${Object.values(st().contents.topics).flat().length}개 · 공통 주제 ${st().contents.general.length + st().contents.deep.length}개 · 아이스브레이킹 ${st().contents.games.length}종. 테이블의 공통 관심사 상위 2개 + 깊은 대화 선호 비율에 따라 5개를 골라 모임 시작 시각에 자동 게시해요.</div>
        <div class="mt8">${Object.entries(st().contents.topics).map(([k, v]) => `<div class="small" style="padding:3px 0"><span class="tag">${E(k)}</span> ${v.map(E).join(' / ')}</div>`).join('')}</div></div>
      <div class="panel"><div class="row between"><h3>발송 이력</h3><select class="input" style="width:auto" data-bind="nf" data-rerender="1"><option value="">전체</option><option value="SENT" ${f === 'SENT' ? 'selected' : ''}>성공</option><option value="FAILED" ${f === 'FAILED' ? 'selected' : ''}>실패</option></select></div>
        <table class="t"><thead><tr><th>일시</th><th>수신자</th><th>유형</th><th>제목</th><th>채널</th><th>결과</th></tr></thead><tbody>${ns.map((n) => `<tr><td class="small">${U.fdt(n.t)}</td><td>${uname(n.userId)}</td><td class="small">${E(n.template)}</td><td class="small">${E(n.title)}</td><td class="small">푸시+앱</td><td>${n.status === 'FAILED' ? `<span class="badge red">실패 (${n.tries}회 시도)</span>` : '<span class="badge green">성공</span>'}</td></tr>`).join('')}</tbody></table></div>`);
  }
  A.saveTpl = () => { Object.assign(st().contents.templates, App.draft.tpl || {}); S.audit('운영자', '메시지 템플릿 수정', Object.keys(App.draft.tpl || {}).join(',')); App.draft.tpl = null; S.commit(); App.toast('템플릿을 저장했어요'); };

  // ═════════ 매칭 가중치 (MAT-15) ═════════
  function settings() {
    const s = st().settings;
    const w = (App.draft.w ||= { ...s.weights, minScore: s.minScore, newPenalty: s.newPenalty });
    const rows = [['age', '연령대 (1순위)'], ['gender', '성비 (2순위)'], ['mbti', 'MBTI 궁합 (3순위)'], ['interest', '공통 관심사 (4순위)'], ['wants', '만나고 싶은 성향 (5순위)']];
    return layout('settings', `${head('매칭 가중치 · 최소 기준', '필수 조건은 완화하지 않고, 선호 조건 점수의 합이 최소 점수 이상이면 자동 확정해요. 변경은 다음 매칭 실행부터 적용돼요.')}
      <div class="grid2"><div class="panel"><h3>선호 조건 가중치</h3>${rows.map(([k, l]) => `<div class="row" style="padding:6px 0"><span class="small" style="width:170px">${l}</span><input type="range" min="0" max="50" value="${w[k]}" data-bind="w.${k}" data-rerender="1" class="grow"><b style="width:30px;text-align:right">${w[k]}</b></div>`).join('')}
        <div class="row" style="padding:6px 0;margin-top:8px;border-top:1px solid #F0E9DF"><span class="small" style="width:170px">최소 매칭 점수</span><input type="range" min="30" max="85" value="${w.minScore}" data-bind="w.minScore" data-rerender="1" class="grow"><b style="width:30px;text-align:right">${w.minScore}</b></div>
        <div class="row" style="padding:6px 0"><span class="small" style="width:170px">이전 만남 감점 (쌍당)</span><input type="range" min="0" max="30" value="${w.newPenalty}" data-bind="w.newPenalty" data-rerender="1" class="grow"><b style="width:30px;text-align:right">${w.newPenalty}</b></div>
        <button class="btn sm mt12" data-act="saveW">저장</button></div>
      <div class="panel"><h3>점수 계산 기준 (직접 정의)</h3><div class="small col" style="gap:6px">
        <div><b>연령</b> · 100 − 최대 나이 차 × 8 (8살 초과는 필수 조건 위반)</div>
        <div><b>성비</b> · 균형(차이 ≤1) 100 · 그 외 혼성 80 · 한 명만 다른 성별 55 · 단일 성별 35 → 허용하되 감점</div>
        <div><b>MBTI 궁합</b> · E/I 섞임 40% (대화 리드+경청) · N/S 같은 비율 35% (관심 화제 공유) · T/F 섞임 25%</div>
        <div><b>공통 관심사</b> · 참가자 쌍별 평균 공통 관심사 2개 이상이면 100</div>
        <div><b>만나고 싶은 성향</b> · 각자 고른 '만나고 싶은 사람'을 테이블 안 다른 사람의 성향이 충족하는 비율</div>
        <div><b>새로운 만남</b> · 이전에 같은 테이블이었던 쌍마다 감점, 서로 '또 만나요'면 감점 없음</div>
        <div><b>제외</b> · 차단·신고·'다시는' 관계는 점수와 무관하게 같은 테이블 금지</div></div></div></div>`);
  }
  A.saveW = () => { const w = App.draft.w; const s = st().settings; ['age', 'gender', 'mbti', 'interest', 'wants'].forEach((k) => (s.weights[k] = +w[k])); s.minScore = +w.minScore; s.newPenalty = +w.newPenalty; S.audit('운영자', '매칭 가중치 변경', JSON.stringify(s.weights) + ` min ${s.minScore}`); App.draft.w = null; S.commit(); App.toast('저장했어요', '다음 매칭부터 적용돼요'); };

  function audit() {
    return layout('audit', `${head('변경 이력', '상태 변경 시각과 주체(SYSTEM / 참가자 / 운영자)를 기록해요.')}<div class="panel"><table class="t"><thead><tr><th>일시</th><th>주체</th><th>작업</th><th>상세</th></tr></thead><tbody>${st().audit.slice(0, 300).map((x) => `<tr><td class="small">${U.fdt(x.t)}</td><td><span class="badge ${x.actor === 'SYSTEM' ? 'blue' : x.actor === '운영자' ? 'brown' : ''}">${E(x.actor)}</span></td><td>${E(x.action)}</td><td class="small muted">${E(x.detail)}</td></tr>`).join('')}</tbody></table></div>`);
  }

  // ═════════ CSV ═════════
  A.csvApps = () => {
    const rows = [['신청ID', '이름', '연락처', '나이', '성별', '직업', 'MBTI', '희망날짜', '희망지역', '확정날짜', '확정지역', '테이블ID', '이용권', '신청상태', '결제상태', '매칭상태', '참석상태', '재배치횟수', '사유']];
    live().forEach((a) => { const u = S.user(a.userId); rows.push([a.id, u.name, u.phone, U.age(u.birthYear, now()), u.gender, u.job, u.mbti, a.dates.join(' '), a.regions.join(' '), a.date || '', a.region || '', a.tableId || '', a.pass || '', a.appStatus, a.payStatus, a.matchStatus, a.attendance || '', a.realloc, a.reason || '']); });
    U.download(`우연한식탁_신청자_${U.dkey(now())}.csv`, U.csv(rows));
  };
  A.csvTables = () => {
    const rows = [['테이블ID', '날짜', '지역', '상태', '인원', '점수', '연령', '성비', 'MBTI', '관심사', '성향', '식당', '예약명', '참가자']];
    st().tables.filter((t) => !t.legacy).forEach((t) => { const v = st().venues.find((x) => x.id === t.venueId); const p = t.breakdown?.parts || {}; rows.push([t.id, t.date, t.region, t.status, ENGINE.activeMembers(t).length, t.score, p.age, p.gender, p.mbti, p.interest, p.wants, v?.name || '', t.booking, ENGINE.activeMembers(t).map((id) => S.user(id).name).join(' ')]); });
    U.download(`우연한식탁_테이블_${U.dkey(now())}.csv`, U.csv(rows));
  };

  function gate() {
    return `<div class="phone" style="display:grid;place-items:center;min-height:100vh"><div class="card center" style="width:100%;max-width:360px"><span class="logo" style="font-size:18px">${[...'우연한식탁'].map((c) => `<span>${c}</span>`).join('')}</span><h3 class="mt16">운영자 어드민</h3><p class="small muted">권한이 있는 운영자 계정만 접근할 수 있어요. 모든 변경은 이력으로 남아요.</p><button class="btn block mt12" data-act="adminLogin">운영자 데모 계정으로 입장</button><a class="small muted mt12" style="display:block" href="#/home">참가자 앱으로</a></div></div>`;
  }
  A.adminLogin = () => { st().session.adminAuthed = true; S.audit('운영자', '어드민 로그인', ''); S.commit(); };

  function render(r) {
    if (!st().session.adminAuthed) return gate();
    const p = r.parts.slice(1);
    switch (p[0]) {
      case 'slots': return slots(); case 'venues': return venues(); case 'apps': return apps(); case 'match': return match();
      case 'table': return tableDetail(p[1]); case 'exceptions': return exceptions(); case 'payments': return payments();
      case 'attendance': return attendance(); case 'safety': return safety(); case 'messages': return messages();
      case 'settings': return settings(); case 'audit': return audit(); default: return dashboard();
    }
  }
  return { render };
})();

// 공통 유틸 + 상수 (정책 값은 여기 한 곳에서 관리)
window.U = (function () {
  const DAY = 864e5, HOUR = 36e5, MIN = 6e4;

  const REGIONS = {
    HONGDAE: { name: '홍대/합정', short: '홍대' },
    GANGNAM: { name: '강남/신논현', short: '강남' },
    EULJIRO: { name: '을지로/종로', short: '을지로' },
    JAMSIL: { name: '잠실', short: '잠실' },
  };
  const INTERESTS = ['운동', '맛집·카페 탐방', '여행', '영화·드라마', '음악', '독서·글쓰기', '자기계발·공부', '전시·공연·아트', '패션·뷰티', '사진·영상'];
  const TRAITS = ['경청을 잘 함', '깊은 대화를 좋아함', '가볍고 유머 있는 대화를 좋아함', '잔잔하고 조용한 편', '활기차고 에너지 있는 편', '이야기를 이끄는 편'];
  const WANTS = ['편하고 유머 있는 사람', '잔잔하고 안정적인 사람', '깊은 대화가 되는 사람', '나와 비슷한 사람', '나와 다른 자극을 주는 사람', '열정 있는 사람'];
  const BUDGETS = { B1: '1~2만원', B2: '2~3만원', B3: '3만원 이상 (상관없음)' };
  const MBTIS = ['ISTJ', 'ISFJ', 'INFJ', 'INTJ', 'ISTP', 'ISFP', 'INFP', 'INTP', 'ESTP', 'ESFP', 'ENFP', 'ENTP', 'ESTJ', 'ESFJ', 'ENFJ', 'ENTJ'];

  // 이용권 (FAQ Q4)
  const PASSES = {
    SINGLE: { label: '1회권', price: 9900, desc: '이번 1회 참여' },
    M1: { label: '멤버십 1개월', price: 35000, months: 1, desc: '기간 내 무제한 참여' },
    M3: { label: '멤버십 3개월', price: 75000, months: 3, desc: '월 25,000원 꼴', badge: '인기' },
    M6: { label: '멤버십 6개월', price: 120000, months: 6, desc: '월 20,000원 꼴', badge: '최저가' },
  };

  // 운영 정책 (PRD에 없는 부분은 FAQ에 따라 직접 정의)
  const POLICY = {
    eventHour: 19, eventMin: 30, eventDurationH: 2.5,
    // 매칭 마감 = 환불 마감 = 행사 2일 전 화요일 24:00
    deadlineDaysBefore: 2,
    penalty: { CANCELED_LATE: 1, DAYOF_NOTICE: 2, NO_SHOW: 3 },
    restrictAt: 3, restrictWeeks: 4, banReviewAt: 6,
    membershipExtendDaysPerFail: 7,
    maxAgeGap: 8, minSize: 4, maxSize: 6,
  };

  function rng(seed) { // 결정적 난수 (데모 재현성)
    let s = seed >>> 0 || 1;
    return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1e6) / 1e6; };
  }
  function hash(str) { let h = 2166136261; for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  let idc = 0;
  function uid(p) { idc++; return p + Date.now().toString(36).slice(-4) + idc.toString(36) + Math.floor(Math.random() * 1e3).toString(36); }
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const won = (n) => n.toLocaleString('ko-KR') + '원';
  const pad = (n) => String(n).padStart(2, '0');
  const WD = ['일', '월', '화', '수', '목', '금', '토'];
  const dkey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const fromKey = (k, h = 0, m = 0) => { const [y, mo, d] = k.split('-').map(Number); return new Date(y, mo - 1, d, h, m).getTime(); };
  const fdate = (t) => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()} (${WD[d.getDay()]})`; };
  const ftime = (t) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const fdt = (t) => `${fdate(t)} ${ftime(t)}`;
  const fdeadline = (t) => { // 자정은 '전날 24:00'으로 표시
    const d = new Date(t);
    if (d.getHours() === 0 && d.getMinutes() === 0) return `${fdate(t - DAY)} 24:00`;
    return fdt(t);
  };
  function rel(t, now) {
    const diff = t - now, a = Math.abs(diff);
    const s = a < HOUR ? `${Math.max(1, Math.round(a / MIN))}분` : a < DAY ? `${Math.round(a / HOUR)}시간` : `${Math.round(a / DAY)}일`;
    return diff >= 0 ? `${s} 후` : `${s} 전`;
  }
  const age = (by, now) => new Date(now).getFullYear() - by;
  const sameDay = (a, b) => dkey(a) === dkey(b);
  const uniq = (a) => [...new Set(a)];
  const inter = (a, b) => a.filter((x) => b.includes(x));

  function csv(rows) {
    return '﻿' + rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  }
  function download(name, text) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    a.download = name; a.click();
  }

  return { DAY, HOUR, MIN, REGIONS, INTERESTS, TRAITS, WANTS, BUDGETS, MBTIS, PASSES, POLICY, rng, hash, uid, esc, won, pad, dkey, fromKey, fdate, ftime, fdt, fdeadline, rel, age, sameDay, uniq, inter, csv, download };
})();

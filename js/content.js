// 대화 콘텐츠 · 메시지 템플릿 (운영자가 어드민에서 수정 가능)
window.CONTENT = (function () {
  function defaults() {
    return {
      topics: {
        '운동': ['요즘 꽂힌 운동이 있다면? 시작하게 된 계기도 궁금해요', '러닝·등산·클라이밍 중 하나만 평생 한다면?'],
        '맛집·카페 탐방': ['최근에 가장 감동받은 한 끼는?', '나만 알고 싶은 동네 단골집 하나씩 공유해요'],
        '여행': ['다녀온 곳 중 다시 가고 싶은 딱 한 곳은?', '내일 당장 떠날 수 있다면 어디로 갈래요?'],
        '영화·드라마': ['인생 영화 한 편과 그 이유', '최근 정주행한 작품 중 추천하고 싶은 것'],
        '음악': ['요즘 플레이리스트 1번 곡은?', '가장 기억에 남는 공연이나 페스티벌'],
        '독서·글쓰기': ['최근 밑줄 그은 문장 하나', '누군가에게 선물하고 싶은 책은?'],
        '자기계발·공부': ['올해 새로 배운 것 중 제일 뿌듯한 것', '요즘 가장 몰입하고 있는 목표'],
        '전시·공연·아트': ['최근 본 전시 중 오래 남은 작품', '직접 해보고 싶은 예술 분야가 있다면?'],
        '패션·뷰티': ['나를 가장 잘 표현하는 아이템', '요즘 빠진 스타일이나 브랜드'],
        '사진·영상': ['휴대폰 앨범에서 가장 아끼는 사진 한 장의 이야기', '찍어보고 싶은 장면이나 장소'],
      },
      general: ['요즘 나를 웃게 하는 작은 행복', '올해가 가기 전에 꼭 해보고 싶은 것', '처음 만난 사람에게 듣는 의외의 말 중 기억나는 것'],
      deep: ['요즘 가장 많이 하는 고민 하나', '10년 전의 나에게 해주고 싶은 말', '내가 좋아하는 나의 모습은?'],
      games: [
        { title: '두 개의 진실, 하나의 거짓', desc: '각자 나에 대한 문장 3개를 말하고, 거짓을 맞혀봐요.' },
        { title: '밸런스 게임', desc: '평생 여름 vs 평생 겨울 · 아침형 vs 저녁형 · 계획 여행 vs 즉흥 여행' },
        { title: '첫인상 키워드', desc: '식사 마무리 전, 서로의 첫인상을 한 단어로 말해줘요.' },
      ],
      templates: {
        CONFIRMED: '테이블이 확정되었어요! {date} {time} · {venue}에서 만나요. 앱 단체방에서 함께할 분들을 미리 확인해보세요.',
        REMINDER: '내일 {time} {venue}에서 우연한 식탁이 열려요. 예약명은 "{booking}"입니다. 당일 취소는 불가하며, 노쇼 시 이용이 제한될 수 있어요.',
        FAILED: '아쉽게도 이번 회차에 맞는 테이블을 찾지 못했어요. 대체 일정으로 이동하거나, 이용권 보관·환불 중 선택해주세요.',
        FEEDBACK: '오늘 식탁은 어떠셨나요? 1분 피드백을 남겨주시면 다음 매칭에 반영돼요.',
      },
    };
  }

  // 테이블 맞춤 주제 (CON-02: 공통 관심사·성향 기반 최소 3개)
  function forTable(members, st) {
    const c = st.contents;
    const cnt = {};
    members.forEach((u) => u.interests.forEach((i) => (cnt[i] = (cnt[i] || 0) + 1)));
    const shared = Object.entries(cnt).sort((a, b) => b[1] - a[1]).map(([k]) => k).filter((k) => c.topics[k]);
    const deepCount = members.filter((u) => u.traits.includes('깊은 대화를 좋아함')).length;
    const out = [];
    shared.slice(0, 2).forEach((k) => out.push({ tag: k, q: c.topics[k][0] }));
    if (shared[0] && c.topics[shared[0]][1]) out.push({ tag: shared[0], q: c.topics[shared[0]][1] });
    const pool = deepCount >= members.length / 2 ? c.deep : c.general;
    pool.forEach((q) => { if (out.length < 5) out.push({ tag: deepCount >= members.length / 2 ? '깊은 대화' : '가벼운 시작', q }); });
    const seed = members.reduce((s, u) => s + U.hash(u.id), 0);
    return { topics: out.slice(0, 5), game: c.games[seed % c.games.length], shared: shared.slice(0, 3) };
  }

  function fill(tpl, vars) { return tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? ''); }

  return { defaults, forTable, fill };
})();

// 실제 인증 (Supabase Auth): 휴대폰 SMS 인증 · 구글 · 카카오
// 로그인한 계정의 프로필은 Supabase `profiles` 테이블에 저장되어 다른 기기에서도 이어져요.
window.AUTH = (function () {
  const C = window.APP_CONFIG || {};
  const enabled = !!(C.supabaseUrl && C.supabaseAnonKey && window.supabase);
  let sb = null;
  let authUser = null;

  const PROFILE_KEYS = ['name', 'phone', 'gender', 'birthYear', 'job', 'mbti', 'interests', 'traits', 'wants', 'budget', 'avoid', 'allergy', 'prefRegions', 'agreed', 'profileDone'];

  // 010-1234-5678 → +821012345678
  const toE164 = (p) => { const d = (p || '').replace(/\D/g, ''); return d.startsWith('0') ? '+82' + d.slice(1) : '+' + d; };
  const fromE164 = (p) => { if (!p) return ''; const d = p.replace(/\D/g, ''); const k = d.startsWith('82') ? '0' + d.slice(2) : d; return k.replace(/^(\d{3})(\d{3,4})(\d{4})$/, '$1-$2-$3'); };
  const redirectTo = () => location.origin + location.pathname.replace(/index\.html$/, '');
  const localId = (uid) => 'sb_' + uid;

  // 카카오톡·인스타 인앱 브라우저에서는 구글이 로그인을 막아요 (disallowed_useragent)
  const inApp = () => /KAKAOTALK|Instagram|FBAN|FBAV|NAVER\(inapp|Line\//i.test(navigator.userAgent);
  const isKakaoTalk = () => /KAKAOTALK/i.test(navigator.userAgent);
  function openExternal() {
    const url = location.href;
    if (isKakaoTalk()) location.href = 'kakaotalk://web/openExternal?url=' + encodeURIComponent(url);
    else navigator.clipboard?.writeText(url).then(() => App.toast('링크를 복사했어요', 'Safari나 Chrome에 붙여넣어 열어주세요'));
  }

  async function init() {
    if (!enabled) return;
    sb = window.supabase.createClient(C.supabaseUrl, C.supabaseAnonKey, { auth: { flowType: 'pkce', persistSession: true, detectSessionInUrl: true } });
    sb.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user && (!authUser || authUser.id !== session.user.id)) onSignedIn(session.user);
      if (event === 'SIGNED_OUT') authUser = null;
    });
    const { data, error } = await sb.auth.getSession();
    // OAuth 리다이렉트 후 주소창의 ?code= 정리
    if (location.search.includes('code=') || location.search.includes('error=')) {
      const err = new URLSearchParams(location.search).get('error_description');
      history.replaceState(null, '', location.pathname + (location.hash || '#/login'));
      if (err) App.toast('로그인에 실패했어요', err);
    }
    if (error) console.warn(error);
    if (data?.session?.user) onSignedIn(data.session.user, true);
  }

  async function onSignedIn(user, restoring) {
    authUser = user;
    const st = S.st, id = localId(user.id);
    const meta = user.user_metadata || {};
    let u = st.users[id];
    if (!u) {
      u = PartView.newUser(fromE164(user.phone) || '');
      delete st.users[u.id];
      u.id = id; st.users[id] = u;
      u.phone = fromE164(user.phone); // 카카오·구글 가입자는 빈 값 → 프로필 1단계에서 입력
      u.name = meta.full_name || meta.name || meta.nickname || meta.preferred_username || '';
      u.authProvider = user.app_metadata?.provider || 'phone';
    }
    // 서버에 저장된 프로필이 있으면 불러오기 (다른 기기에서 가입한 경우)
    try {
      const { data } = await sb.from('profiles').select('data').eq('id', user.id).maybeSingle();
      if (data?.data) PROFILE_KEYS.forEach((k) => { if (data.data[k] !== undefined) u[k] = data.data[k]; });
    } catch (e) { console.warn('profile load failed', e); }
    if (!u.phone && user.phone) u.phone = fromE164(user.phone);
    // 이미 이 계정으로 로그인 중이면(새로고침) 화면 이동 없이 유지
    if (restoring && st.session.userId === id) { S.save(); App.render(); return; }
    S.audit(u.name || '신규 회원', '로그인', u.authProvider);
    PartView.loginAs(id);
  }

  async function saveProfile(u) {
    if (!sb || !authUser || u.id !== localId(authUser.id)) return;
    const data = Object.fromEntries(PROFILE_KEYS.map((k) => [k, u[k]]));
    const { error } = await sb.from('profiles').upsert({ id: authUser.id, data, updated_at: new Date().toISOString() });
    if (error) { console.warn(error); App.toast('프로필을 서버에 저장하지 못했어요', '이 기기에는 저장되었어요. 잠시 후 다시 시도해주세요.'); }
  }

  async function sendOtp(phone) {
    const { error } = await sb.auth.signInWithOtp({ phone: toE164(phone) });
    if (error) throw error;
  }
  async function verifyOtp(phone, token) {
    const { data, error } = await sb.auth.verifyOtp({ phone: toE164(phone), token, type: 'sms' });
    if (error) throw error;
    return data.user;
  }
  async function oauth(provider) {
    const options = { redirectTo: redirectTo() };
    // 일반 카카오 앱은 이메일 동의항목을 쓸 수 없어 닉네임·프로필 사진만 요청 (KOE205 방지)
    if (provider === 'kakao') options.scopes = 'profile_nickname profile_image';
    const { error } = await sb.auth.signInWithOAuth({ provider, options });
    if (error) throw error;
  }
  async function signOut() { if (sb && authUser) { await sb.auth.signOut(); authUser = null; } }

  // 친절한 오류 문구
  function message(e) {
    const m = (e && (e.message || e.error_description)) || '';
    if (/Token has expired|invalid/i.test(m)) return '인증번호가 틀렸거나 만료됐어요. 다시 받아주세요.';
    if (/rate limit|too many|security purposes/i.test(m)) return '요청이 너무 많아요. 잠시 후 다시 시도해주세요.';
    if (/provider is not enabled|Unsupported provider/i.test(m)) return '이 로그인 방식이 아직 설정되지 않았어요. (Supabase Providers 설정 필요)';
    if (/phone/i.test(m) && /invalid/i.test(m)) return '휴대폰 번호 형식을 확인해주세요.';
    return m || '잠시 후 다시 시도해주세요.';
  }

  return { enabled, init, sendOtp, verifyOtp, oauth, signOut, saveProfile, message, inApp, openExternal, get user() { return authUser; }, providers: C.providers || {}, showDemo: C.showDemoLogin !== false };
})();

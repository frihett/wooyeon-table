// 실제 로그인 설정 (Supabase)
// 아래 두 값은 Supabase 대시보드 → Project Settings → API 에서 복사해 넣으세요.
// anon key는 브라우저에 공개돼도 되는 키예요. (service_role 키는 절대 넣지 마세요)
// 비워두면 실제 로그인 없이 데모 로그인(인증번호 000000)만 동작해요.
window.APP_CONFIG = {
  supabaseUrl: '',      // 예: 'https://abcdefgh.supabase.co'
  supabaseAnonKey: '',  // 예: 'eyJhbGciOi...'
  providers: {
    phone: true,   // Supabase Auth → Providers → Phone (Twilio 등 SMS 업체 연결 필요)
    google: true,  // Supabase Auth → Providers → Google
    kakao: true,   // Supabase Auth → Providers → Kakao
  },
  // 심사용: 실제 로그인을 켜도 데모 계정 로그인은 계속 보여줄지
  showDemoLogin: true,
};

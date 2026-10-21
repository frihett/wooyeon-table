# 실제 로그인 켜기 (휴대폰 · 카카오 · 구글)

인증은 **Supabase Auth**를 씁니다. 사이트는 계속 GitHub Pages에 두고, 비밀키는 전부 Supabase 대시보드에만 넣습니다.
코드에 들어가는 값은 공개돼도 되는 `Project URL`과 `anon key` 두 개뿐입니다.

배포 주소 (아래에서 `내 사이트 주소`라고 부름): `https://frihett.github.io/wooyeon-table/`

---

## 1. Supabase 프로젝트 만들기 (5분)

1. https://supabase.com 가입 → **New project** (Region: `Northeast Asia (Seoul)`)
2. **SQL Editor → New query** → `supabase/schema.sql` 내용을 붙여넣고 **Run** (프로필 저장 테이블)
3. **Authentication → URL Configuration**
   - Site URL: `https://frihett.github.io/wooyeon-table/`
   - Redirect URLs에 추가: `https://frihett.github.io/wooyeon-table/`, `http://localhost:5173/` (로컬 테스트용)
4. **Project Settings → API**에서 `Project URL`과 `anon public` 키를 복사 → `js/config.js`에 붙여넣기
   - ⚠️ `service_role` 키는 절대 넣지 마세요.

이 단계까지 하면 로그인 화면에 카카오·구글 버튼이 나타납니다 (아래 설정 전에는 눌러도 "설정되지 않았어요" 안내).

Supabase 콜백 주소 (카카오·구글 설정에 쓰임): `https://<프로젝트ID>.supabase.co/auth/v1/callback`

---

## 2. 카카오 로그인 (10분)

1. https://developers.kakao.com → 내 애플리케이션 → **애플리케이션 추가하기** (앱 이름: 우연한 식탁)
2. **앱 설정 → 플랫폼 → Web**: 사이트 도메인 `https://frihett.github.io` 추가
3. **제품 설정 → 카카오 로그인**: 활성화 **ON**, Redirect URI에 Supabase 콜백 주소 추가
4. **제품 설정 → 카카오 로그인 → 동의항목**: `닉네임`, `프로필 사진` 설정
   - 이메일(`account_email`)은 **비즈 앱**만 쓸 수 있어서 이 앱은 요청하지 않도록 만들어 두었습니다.
5. **앱 설정 → 앱 키**: `REST API 키` 복사 / **보안**: Client Secret 생성 후 **활성화**
6. Supabase **Authentication → Providers → Kakao**: Enable, Client ID = REST API 키, Client Secret 입력,
   **Allow users without an email** 켜기 → Save

## 3. 구글 로그인 (10분)

1. https://console.cloud.google.com → 새 프로젝트
2. **API 및 서비스 → OAuth 동의 화면**: 외부, 앱 이름·지원 이메일 입력 → 게시 상태를 **프로덕션**으로 (테스트 상태면 등록한 계정만 로그인 가능)
3. **사용자 인증 정보 → OAuth 클라이언트 ID 만들기** → 웹 애플리케이션
   - 승인된 JavaScript 원본: `https://frihett.github.io`
   - 승인된 리디렉션 URI: Supabase 콜백 주소
4. Supabase **Providers → Google**: Enable, Client ID / Client Secret 입력 → Save

> 카카오톡·인스타그램 안에서 링크를 열면 구글이 로그인을 막습니다. 앱이 자동으로 감지해 "기본 브라우저로 열기" 버튼을 보여줍니다.

## 4. 휴대폰 문자 인증 (유료)

문자는 SMS 업체를 통해 나가서 **건당 비용**이 있습니다.

- 가장 간단: **Twilio Verify** — Supabase **Providers → Phone**: Enable, SMS provider = `Twilio Verify`,
  Account SID / Auth Token / Verify Service SID 입력 → Save
  - Twilio 무료 체험 계정은 **미리 인증한 번호로만** 문자가 갑니다. 심사위원 번호로 보내려면 유료 전환이 필요합니다.
- 비용을 줄이려면: 국내 문자 업체(예: 솔라피·NHN Cloud)를 Supabase **Send SMS Hook**으로 연결 (Edge Function 필요, 별도 작업)
- 문자 업체를 아직 안 붙인다면 `js/config.js`에서 `phone: false`로 두세요. 휴대폰 칸은 데모 인증(000000)으로 동작합니다.

## 5. 반영

`js/config.js` 수정 후 GitHub 저장소에 올리면 1~2분 뒤 사이트에 반영됩니다.

---

### 동작 방식 요약
- 로그인 성공 → Supabase 계정 ID로 앱 회원이 만들어지고 프로필 작성 화면으로 이동
- 프로필은 Supabase `profiles` 테이블에 저장 → 다른 기기에서 로그인해도 프로필이 이어짐 (본인만 조회 가능, RLS)
- 카카오·구글 가입자는 휴대폰 번호가 없어서 프로필 1단계에서 연락처를 입력받음
- 신청·매칭·결제 같은 데모 데이터는 지금처럼 각 브라우저에 저장 (해커톤 범위)
- 데모 계정 로그인은 `showDemoLogin: true`인 동안 계속 보입니다 (심사용)

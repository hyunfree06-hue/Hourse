# CanvasAI

개인 디자이너를 위한 AI 디자인 캔버스 SaaS입니다. Figma처럼 익숙한 편집 레이아웃에서 도형·텍스트·이미지를 다루고, 캔버스에 AI 영역을 드래그한 뒤 OpenAI 또는 FLUX로 이미지를 생성·교체할 수 있습니다.

> 팀 워크스페이스, 초대, 공동 편집, 실시간 커서, Realtime 동기화, 댓글/멘션, 역할 권한, 공유 링크 공동 수정은 **의도적으로 제외**했습니다. 프로젝트는 생성한 사용자만 접근합니다.

## 주요 기능

- 대형 캔버스 편집 (Fabric.js)
- AI 영역 드래그 생성 / 영역 교체 / 선택 참조
- OpenAI · Black Forest Labs FLUX Provider 추상화
- 프로젝트 자동 저장 + `updated_at` 낙관적 잠금
- Google OAuth 전용 로그인
- 가입 시 무료 크레딧 (서버 트리거)
- Lemon Squeezy 구독 · 크레딧 팩
- PNG / JPG / SVG 내보내기
- Supabase Auth · Postgres · Storage (private + signed URL)

## 기술 스택

Next.js App Router · React · TypeScript · Tailwind CSS · shadcn/ui 스타일 컴포넌트 · Fabric.js · Supabase (`@supabase/ssr`) · Zustand · Zod · OpenAI SDK · Lemon Squeezy SDK · Sharp · Vitest · Playwright

### Fabric.js를 선택한 이유

tldraw는 화이트보드/협업 시나리오에 강점이 있지만, 본 제품은 **개인 전용 디자인 캔버스**와 커스텀 AI 영역 오버레이·내보내기 제어가 핵심입니다. Fabric.js는 객체 단위 편집, `excludeFromExport`, JSON 직렬화 커스텀 속성, 이미지 clipPath 배치 등을 세밀하게 제어하기 쉬워 선택했습니다.

## 로컬 실행

```bash
cp .env.example .env.local
npm install
npm run dev
```

http://localhost:3000

API 키가 없어도 랜딩·대시보드·캔버스 편집 UI는 동작합니다. AI/결제는 키가 있을 때만 활성화됩니다.

## 환경변수

`.env.example`을 참고하세요. 서버 비밀값에는 `NEXT_PUBLIC_`을 붙이지 마세요.

필수(앱 기본 동작):

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (서버 크레딧·웹훅·스토리지)

기능별:

- OpenAI: `OPENAI_API_KEY`, `OPENAI_IMAGE_MODEL`
- FLUX: `BFL_API_KEY`, `BFL_API_BASE_URL`, `BFL_MODEL`
- Lemon Squeezy: `LEMONSQUEEZY_*` 및 Variant ID들

## Supabase 설정

1. Supabase 프로젝트를 생성합니다.
2. Project Settings → API에서 Project URL과 Publishable(anon) key, Service role key를 복사합니다.
3. SQL Editor에서 `supabase/migrations/0001_initial.sql`을 실행합니다.
4. 필요 시 `supabase/seed.sql`의 Variant placeholder를 실제 ID로 교체하거나, 앱 env의 Variant ID만 사용합니다.
5. Storage에 `user-assets`, `generated-assets`, `project-thumbnails` 버킷이 생성되었는지 확인합니다. (마이그레이션에 포함)
6. 각 버킷이 **private**인지, Storage RLS가 `auth.uid()` 경로 규칙을 따르는지 확인합니다.

## Google OAuth

1. [Google Cloud Console](https://console.cloud.google.com/)에서 OAuth 클라이언트(웹)를 생성합니다.
2. Authorized redirect URI에 Supabase 콜백을 등록합니다.

```text
https://<project-ref>.supabase.co/auth/v1/callback
```

3. Supabase Dashboard → Authentication → Providers → Google에 Client ID/Secret을 등록합니다.
4. Supabase Authentication → URL Configuration:
   - Site URL: `http://localhost:3000` (로컬) / 배포 도메인
   - Redirect URLs:
     - `http://localhost:3000/auth/callback`
     - `https://your-domain.com/auth/callback`
5. OAuth 동의 화면에서 앱 이름·지원 이메일을 설정합니다.
6. Google 로그인 버튼은 별도 폼 없이 `signInWithOAuth({ provider: "google", options: { redirectTo: ..., queryParams: { prompt: "select_account" } } })`를 호출합니다.

앱 콜백 예:

```text
https://your-domain.com/auth/callback
```

## OpenAI / BFL

1. OpenAI API 키를 발급해 `OPENAI_API_KEY`에 넣습니다. 기본 모델은 `gpt-image-2`입니다.
2. Black Forest Labs API 키를 `BFL_API_KEY`에 넣습니다. 기본 모델은 `flux-2-pro`입니다.
3. 키가 없는 Provider는 UI에서 disabled 처리되며, 자동으로 다른 Provider로 전환하지 않습니다.

## Lemon Squeezy (Live · USD)

기본값은 **실결제(Live)** 이며 통화는 **USD**입니다. `LEMONSQUEEZY_TEST_MODE`는 `"true"`일 때만 테스트 모드입니다.

### Live 상품 등록

#### CanvasAI Creator
- Product: `CanvasAI Creator`
- Variant: `Creator Monthly`
- Pricing model: Standard pricing
- Payment type: Subscription
- Price: `$19.00 USD`
- Billing interval: Monthly
- Free trial: None
- Setup fee: None
- Credits: 100 per successful billing period
- Env: `LEMONSQUEEZY_VARIANT_CREATOR_MONTHLY`

#### CanvasAI Pro
- Product: `CanvasAI Pro`
- Variant: `Pro Monthly`
- Pricing model: Standard pricing
- Payment type: Subscription
- Price: `$49.00 USD`
- Billing interval: Monthly
- Free trial: None
- Setup fee: None
- Credits: 300 per successful billing period
- Env: `LEMONSQUEEZY_VARIANT_PRO_MONTHLY`

#### CanvasAI Credit Pack
- Product: `CanvasAI Credit Pack`
- Variant: `50 Credits`
- Pricing model: Standard pricing
- Payment type: Single payment
- Price: `$9.99 USD`
- Billing interval: None
- Credits: 50 per successful order
- Env: `LEMONSQUEEZY_VARIANT_CREDIT_PACK`

### 설정 단계

1. Store를 활성화하고 위 세 상품을 **Live Mode · USD**로 생성합니다.
2. 발급된 Live Variant ID를 각각 해당 환경변수에 넣습니다.
3. Live Mode Webhook URL을 등록합니다.

```text
https://your-domain.com/api/webhooks/lemonsqueezy
```

4. Live Webhook Signing secret을 `LEMONSQUEEZY_WEBHOOK_SECRET`에 넣습니다.
5. `LEMONSQUEEZY_TEST_MODE=false` 인지 확인합니다.
6. Supabase에 `0001_initial.sql` 적용 후 **`0002_billing_currency_usd.sql`만** 추가 실행합니다. (0001을 다시 실행하지 마세요.)
7. Checkout 성공 후 `/billing?checkout=success`에서 크레딧 반영을 확인합니다.

### 실결제 전환 체크리스트

- [ ] Lemon Squeezy 스토어 활성화
- [ ] Live Mode API Key → `LEMONSQUEEZY_API_KEY`
- [ ] USD Live 상품 3개 생성 (위 명세)
- [ ] Live Variant ID 3개 등록
- [ ] Live Mode Webhook + Secret
- [ ] `LEMONSQUEEZY_TEST_MODE=false`
- [ ] Live Store ID → `LEMONSQUEEZY_STORE_ID`
- [ ] `0002_billing_currency_usd.sql` 적용
- [ ] production에서 Checkout `test_mode=false`
- [ ] non-USD / test_mode webhook이 크레딧을 지급하지 않음

> 운영에서 `LEMONSQUEEZY_TEST_MODE=true`이면 Checkout이 거부됩니다.  
> Test Variant와 Live Variant를 혼용하지 마세요.


## 스크립트

```bash
npm run dev
npm run lint
npm run typecheck
npm run test
npm run test:e2e
npm run build
```

## Vercel 배포

1. 저장소를 Vercel에 연결합니다.
2. 환경변수를 Production/Preview에 등록합니다.
3. 배포 후 Supabase Site URL / Redirect URL을 배포 도메인으로 업데이트합니다.
4. Google OAuth Authorized origins/redirect를 업데이트합니다.
5. Lemon Squeezy Webhook URL을 배포 도메인으로 업데이트합니다.

## 폴더 구조

```text
src/
  app/                 # App Router 페이지·API
  components/          # UI, 랜딩, 에디터, 결제
  config/              # site, billing, credits, editor
  lib/                 # ai, auth, billing, canvas, supabase, storage
  stores/              # Zustand
supabase/migrations/   # SQL + RLS + Storage
tests/unit|e2e
```

## 라이선스

Private / 프로젝트 소유자 정책에 따릅니다.

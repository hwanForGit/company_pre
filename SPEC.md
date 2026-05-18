# 중소기업인재키움프리미엄 신청 페이지 — 개발 기획서

> 이 문서는 Claude Code 에이전트가 구현을 그대로 진행할 수 있도록 작성된 상세 기획서입니다.
> 원본 요구사항: [prd.txt](prd.txt) · 참고 페이지: https://www.inflearn.com/tag-curation/skill/small-business-subsidy

---

## 0. TL;DR (작업 요약)

- **결과물**: 단일 HTML 파일 1개 (`index.html`) — 내부에 CSS/JS 인라인 포함
- **배포 방식**: TinyMCE 에디터에 코드를 그대로 붙여넣기 → 인플런 페이지에 임베드 (✅ `<script>` 허용 확정)
- **콘텐츠**: 원본 인플런 페이지의 텍스트만 발췌하여 옮기고 **디자인은 인플런 톤으로 재작성** (§3.5)
- **핵심 기능**: 신청 모달(샘플 다운로드 + 파일 업로드 + 신청자 정보 입력) → **슬랙 알림만 전송 (이메일 없음)**
- **백엔드 없음**: 모든 외부 통신은 Slack API를 클라이언트에서 직접 호출
- **확정된 값**: Slack Webhook URL ✅ · 호스팅 방식(절대 URL) ✅
- **대기 중**: Slack Bot Token (파일 업로드용) · sample.xlsx 절대 URL · 양식 파일 크기 정책

> 📌 **PRD 대비 변경사항 (운영자 결정)**:
> - ❌ **이메일 알림 기능 전체 제거** — 담당자 메일 4명 발송 / 신청자 확인 메일 모두 삭제
> - ✅ **슬랙 알림만 사용** — 담당자 이메일 리스트는 알림 내용 텍스트에서 참조용으로만 유지
> - 신청자는 모달의 완료 메시지로만 접수 확인 (별도 확인 메일 없음)

---

## 1. 기술 스택 및 제약사항

### 1.1 절대 제약
| 항목 | 내용 |
|------|------|
| 언어 | **HTML + Vanilla JavaScript + CSS만 사용** |
| 빌드 도구 | 사용 금지 (Webpack, Vite, npm 등 ❌) |
| 프레임워크 | 사용 금지 (React, Vue 등 ❌) |
| 외부 라이브러리 | CDN으로만 로드 (가능하면 zero-dependency) |
| 산출물 | 단일 파일 권장 (CSS/JS 인라인). 분리한다면 명확하게 합치는 방법 안내 |
| 임베드 방식 | TinyMCE에 코드 붙여넣기 — `<script>`, `<style>`, `<form>`이 그대로 동작해야 함 |

### 1.2 TinyMCE 호환성 주의사항
- ✅ **`<script>` 태그 허용 확정** — 운영자 확인 완료
- TinyMCE는 일부 태그/속성을 제거할 수 있음 → **모든 스타일은 가능하면 클래스 기반**으로, 인라인 `style`도 백업으로 적용
- 외부 CSS는 `<style>` 블록 내 인라인으로 포함
- 페이지 전역 CSS와 충돌을 막기 위해 **모든 셀렉터에 고유 prefix** 사용 (예: `.skp-` for Small business Kium Premium)
- 붙여넣기 후 자동 정리(autoformat) 때문에 빈 줄/들여쓰기가 변형될 수 있으므로 `<pre>` 또는 minify된 단일 줄 형태도 준비해두면 유리

### 1.3 사용 외부 서비스
| 용도 | 서비스 | 상태 | 비고 |
|------|--------|------|------|
| 알림 메시지 | **Slack Incoming Webhook** | ✅ 확정 | URL은 git 추적에서 제외된 `secrets.local.md`에 보관 |
| 파일 업로드 | **Slack Web API (`files.uploadV2`)** | ✅ 확정 | Bot Token + 채널 ID 발급 완료, 실제 값은 `secrets.local.md` |

> ⚠️ **Slack Webhook URL 및 Bot Token 노출 관련**: 두 값 모두 최종 산출물(공개 페이지) 코드에 포함됩니다. 악성 사용자가 이를 도용해 임의 메시지·파일을 보낼 수 있으므로:
> - 알림 전용 채널을 별도로 두고 다른 민감 정보가 흐르지 않도록 격리
> - Bot Token의 스코프는 **최소 필요(`files:write`, `chat:write`)**만 부여
> - 스팸/도용 발생 시 즉시 폐기/재발급 가능하도록 운영 절차 마련
> - 채널명·웹훅명에 토큰성 정보(고객 데이터 등) 포함 금지

---

## 2. 파일/리소스 구조

```
company_pre/
├── prd.txt                    # 원본 요구사항
├── SPEC.md                    # 이 문서
├── sample.xlsx                # 신청자 다운로드용 양식 (기존)
├── index.html                 # ✨ 최종 산출물 (CSS/JS 인라인)
└── assets/                    # (선택) 이미지/아이콘 분리 시
    └── ...
```

### 2.1 sample.xlsx 호스팅 전략
**확정: A안 — 절대 URL 하드코딩**

운영자가 sample.xlsx를 인플런 CDN/스토리지(또는 그에 준하는 외부 호스팅)에 업로드한 뒤 절대 URL을 발급받아 `window.SKP_CONFIG.SAMPLE_XLSX_URL`에 넣는다.

- URL은 **HTTPS 필수** (HTTPS 페이지에서 HTTP 자원 다운로드 차단됨)
- 다운로드 시 파일명이 보존되도록 `Content-Disposition: attachment; filename="..."` 헤더 권장
- 양식 변경 시 같은 URL을 유지(또는 캐시 무효화 쿼리스트링 사용)해서 코드 재배포 없이 교체 가능하도록

⏳ **운영자에게 받아야 할 값**: 최종 sample.xlsx 절대 URL

---

## 3. 페이지 구성

원본 페이지(`https://www.inflearn.com/tag-curation/skill/small-business-subsidy`)의 모든 섹션을 그대로 포함하되 아래 변경사항 적용:

### 3.1 콘텐츠 마이그레이션 방침
**확정**: 원본 페이지의 **텍스트 콘텐츠만 옮기고 디자인은 새로 작성**한다.

- 원본 HTML/CSS를 그대로 복제하지 않음 — 인플런 페이지 마크업/클래스에 의존하면 TinyMCE 임베드 시 깨질 가능성이 높고, 인플런 디자인 시스템 자산에 직접 의존하게 됨
- **인플런의 디자인 톤은 그대로 유지** — 색상·타이포·여백·컴포넌트 스타일은 인플런 페이지를 보고 재현 (자세한 가이드: **§3.4 디자인 톤 가이드**)
- 텍스트는 원본에서 발췌하여 그대로 옮기되, 필요 시 문법/문장 가다듬기 OK

### 3.2 유지되는 섹션 (콘텐츠 기준)
- 헤더/타이틀 영역
- 프로그램 소개
- 지원 내용 / 혜택
- 신청 자격
- 자주 묻는 질문
- 담당자 문의 연락처 ✅ **유지**

### 3.3 제거되는 섹션
- ❌ **구글폼으로 간편 신청** 영역 전체 제거

### 3.4 추가/변경되는 요소
- ✅ **[지금 신청하기]** CTA 버튼 (페이지 상단 + 하단 1~2곳, 클릭 시 모달 오픈)

### 3.5 디자인 톤 가이드 — 인플런 스타일 재현

원본 페이지(`https://www.inflearn.com/tag-curation/skill/small-business-subsidy`)를 직접 확인하여 아래 항목을 그대로 따른다. 임의 디자인 도입 금지.

#### 컬러 팔레트 (인플런 디자인 시스템 기준 — 실제 페이지에서 검사 후 미세 조정)
| 토큰 | 값 | 용도 |
|------|-----|------|
| `--skp-color-primary` | `#1dc078` (인플런 그린) | 주요 CTA, 강조 |
| `--skp-color-primary-hover` | `#15a767` | 호버/포커스 상태 |
| `--skp-color-text-primary` | `#212529` | 본문 텍스트 |
| `--skp-color-text-secondary` | `#495057` | 부가 텍스트 |
| `--skp-color-text-muted` | `#868e96` | 캡션, 보조 안내 |
| `--skp-color-border` | `#e9ecef` | 카드/구분선 |
| `--skp-color-bg` | `#ffffff` | 카드 배경 |
| `--skp-color-bg-soft` | `#f8f9fa` | 섹션 배경 |
| `--skp-color-warning-bg` | `#fff8e1` | 중요 안내 박스 배경 |
| `--skp-color-warning-text` | `#7a5b00` | 중요 안내 텍스트 |

> 정확한 값은 인플런 페이지를 브라우저 DevTools로 검사한 결과 우선. 위 표는 시작점.

#### 타이포그래피
- **폰트 패밀리**: `Pretendard, -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif`
  - Pretendard CDN: `https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css`
  - 인플런과 동일/유사한 산세리프 톤을 빠르게 재현
- **스케일**:
  - H1 (히어로 타이틀): `40px` / `font-weight: 700` / `line-height: 1.3`
  - H2 (섹션 타이틀): `28px` / `700` / `1.4`
  - H3 (서브 타이틀): `20px` / `600` / `1.4`
  - 본문: `16px` / `400` / `1.7`
  - 캡션: `14px` / `400` / `1.5`
- **자간**: `letter-spacing: -0.01em` (한글 가독성)

#### 레이아웃
- **최대 너비**: 본문 컨테이너 `max-width: 960px`, 중앙 정렬, 좌우 패딩 `24px` (모바일 `16px`)
- **섹션 간 여백**: 데스크탑 `80px`, 모바일 `48px`
- **카드/박스**: `border-radius: 12px`, `border: 1px solid var(--skp-color-border)`, `padding: 24px`

#### 버튼 (인플런 톤)
- **Primary CTA** (지금 신청하기):
  - 배경 `var(--skp-color-primary)`, 흰색 텍스트, `font-weight: 600`
  - `border-radius: 8px`, padding `14px 28px`, font-size `16px`
  - hover: 배경 `var(--skp-color-primary-hover)`, `transform: translateY(-1px)`, `transition: 0.15s ease`
- **Secondary** (양식 다운로드 등):
  - 배경 `var(--skp-color-bg-soft)`, 텍스트 `var(--skp-color-text-primary)`
  - 같은 radius/padding, border `1px solid var(--skp-color-border)`
- **Disabled**:
  - 배경 `#dee2e6`, 텍스트 `#adb5bd`, `cursor: not-allowed`, 그림자/transform 제거

#### 모달
- **배경 dim**: `rgba(0, 0, 0, 0.5)`, `backdrop-filter: blur(4px)`
- **모달 본체**: 흰 배경, `max-width: 560px`, `border-radius: 16px`, `padding: 32px`
- **그림자**: `0 20px 60px rgba(0, 0, 0, 0.15)`
- **모바일**: 화면 너비 `≤480px`에서는 화면 전체 활용 (bottom sheet 풍 또는 `border-radius: 0` 풀스크린)

#### 폼 필드
- input/select: `height: 48px`, `border: 1px solid var(--skp-color-border)`, `border-radius: 8px`, padding `0 16px`
- focus: `border-color: var(--skp-color-primary)`, `box-shadow: 0 0 0 3px rgba(29, 192, 120, 0.15)`
- 에러 상태: `border-color: #fa5252`, 도움말 텍스트 빨강
- 라벨: `font-size: 14px`, `font-weight: 500`, `margin-bottom: 8px`, 필수 표시 `*` 빨강

#### 반응형 브레이크포인트
- 모바일: `≤480px`
- 태블릿: `481px ~ 768px`
- 데스크탑: `≥769px`

> 🎨 **인플런 톤 재현 체크포인트**: 작업 후 인플런 원본 페이지와 우리 페이지를 나란히 띄워놓고 "이질감이 없는가"를 운영자가 직접 확인. 어색하면 컬러/여백/폰트 위주로 미세 조정.

---

## 4. 신청 모달 상세 명세

### 4.1 트리거
- `.skp-apply-btn` 클래스가 붙은 모든 버튼 클릭 시 모달 오픈
- 모달은 body 최하단에 1개만 존재, `display:none ↔ flex` 토글
- 배경 dim 클릭 / 우측 상단 X / ESC 키로 닫기

### 4.2 모달 레이아웃 (위에서 아래로)

```
┌────────────────────────────────────────────────┐
│  ✕                                              │
│                                                 │
│  [중요 안내]                                    │
│  본 프로그램은 우선지원대상기업 소속 근로자를    │
│  대상으로 '기업 단위'로만 신청 가능합니다.       │
│                                                 │
│  ▸ 우선지원 대상 기업 확인 방법                  │
│    · 전화 문의                                  │
│      - 고용노동부 고객센터: 국번없이 1350        │
│      - 근로복지공단: 1588-0075                  │
│    · 온라인 확인: [우선지원 대상 기업 신청하기]  │
│      (https://www.gov.kr/mw/AA020InfoCappView   │
│       .do?HighCtgCD=A05007&CappBizCD=...)       │
│                                                 │
│  ─────────────────────────────────────────      │
│                                                 │
│  STEP 1. 신청 양식 다운로드                      │
│  [📥 sample.xlsx 다운로드]                       │
│                                                 │
│  STEP 2. 작성한 양식 업로드 *                    │
│  [파일 선택] selected-filename.xlsx              │
│                                                 │
│  STEP 3. 신청자 정보 입력                        │
│  회사명 *      [____________________________]   │
│  신청자 이름 * [____________________________]   │
│  이메일 *      [____________________________]   │
│                                                 │
│  [   신청하기  ] ← 모든 필드 충족 시 활성화      │
└────────────────────────────────────────────────┘
```

### 4.3 입력 필드 정의

| 필드 | 타입 | 필수 | 검증 |
|------|------|------|------|
| 양식 파일 업로드 | `<input type="file" accept=".xlsx,.xls">` | ✅ | 파일 선택 여부, 확장자, 크기 (≤ 10MB 권장) |
| 회사명 | text | ✅ | 1자 이상, trim |
| 신청자 이름 | text | ✅ | 1자 이상, trim |
| 이메일 | email | ✅ | RFC 5322 단순 정규식 검증 |

### 4.4 버튼 활성화 로직
- 4개 항목(파일 + 텍스트 3개) **모두 유효**할 때만 `[신청하기]` 버튼 `disabled` 해제
- `input`, `change` 이벤트마다 재검증 (debounce 불필요)

### 4.5 제출 흐름
```
사용자 [신청하기] 클릭
  ↓
버튼 disabled + 텍스트 "전송 중..." 로 변경 (중복 클릭 방지)
  ↓
순차 실행 (파일 업로드 → 메시지에서 파일 참조):
  1) Slack files.uploadV2 → 업로드된 파일을 지정 채널에 업로드
     - 응답에서 file permalink/URL 획득
  2) Slack Incoming Webhook → 신청자 정보 + 파일 링크를 포함한 메시지 POST
  ↓
모두 성공:
  → 모달 내용을 완료 화면으로 교체
    "완료되었습니다. 담당자의 연락을 기다려 주세요."
  → 5초 후 자동 닫힘 또는 확인 버튼 제공

하나라도 실패:
  → "전송에 실패했습니다. 잠시 후 다시 시도해 주세요." 토스트
  → 버튼 다시 활성화
  → 콘솔에 에러 로깅 (운영자 확인용)
```

> 💡 **순차 실행 이유**: 파일 업로드 응답에서 받은 permalink를 메시지 본문에 포함시키면 슬랙에서 한 알림 안에 메타데이터 + 파일을 함께 보여줄 수 있다. 만약 파일 업로드 실패 시에도 메시지는 보내려면 Promise 핸들링에서 분기 처리할 것 (§6.1 코드 예시 참고).

---

## 5. 알림 프로세스 상세 (슬랙 전용)

> ℹ️ 이메일 알림 기능은 운영자 결정에 따라 **제거**되었습니다. 모든 신청 알림은 슬랙 채널 1곳으로 통합됩니다.

### 5.1 슬랙 메시지 포맷 (Block Kit 권장)
신청자가 업로드한 파일은 §5.2 절차로 먼저 슬랙에 업로드되어 permalink를 얻은 뒤, 아래 메시지에 링크로 포함됩니다.

**메시지 본문 예시 (Block Kit)**:
```json
{
  "text": "📨 중소기업인재키움프리미엄 신규 신청 — {{회사명}}",
  "blocks": [
    {
      "type": "section",
      "text": { "type": "mrkdwn", "text": "<@U056J4GK86M> <@U03AWSR2BD0> <@U0ADQHJSYNA>\n📨 *중소기업인재키움프리미엄 신규 신청*" }
    },
    {
      "type": "section",
      "fields": [
        { "type": "mrkdwn", "text": "*회사명*\n{{회사명}}" },
        { "type": "mrkdwn", "text": "*신청자*\n{{이름}}" },
        { "type": "mrkdwn", "text": "*이메일*\n{{email}}" },
        { "type": "mrkdwn", "text": "*접수일시*\n{{YYYY-MM-DD HH:mm}} (KST)" }
      ]
    },
    {
      "type": "section",
      "text": { "type": "mrkdwn", "text": "*첨부 파일*\n<{{file_permalink}}|{{원본 파일명}}> ({{크기}})" }
    },
    {
      "type": "context",
      "elements": [
        { "type": "mrkdwn", "text": "담당자: ariel@inflab.com · shhwang@inflab.com · hj.kim@inflab.com" }
      ]
    }
  ]
}
```

> 💡 **멘션 위치**: 첫 번째 section block의 맨 위에 멘션을 두는 이유 — Slack의 알림 규칙상 멘션이 메시지 상단에 있어야 모바일 푸시·배지가 강하게 발동.

> Block Kit이 부담스러우면 단순 markdown text로도 가능:
> ```
> <@U056J4GK86M> <@U03AWSR2BD0> <@U0ADQHJSYNA>
> 📨 *중소기업인재키움프리미엄 신규 신청*
> • 회사명: {{회사명}}
> • 신청자: {{이름}}
> • 이메일: {{email}}
> • 접수: {{YYYY-MM-DD HH:mm}}
> • 파일: <{{file_permalink}}|{{원본 파일명}}>
> ```

### 5.2 파일 업로드 흐름
Slack Incoming Webhook은 파일 전송이 불가하므로, **Slack Web API `files.uploadV2`**를 별도로 호출한다. 흐름:

1. `files.getUploadURLExternal` 호출 → 업로드용 임시 URL과 file_id 발급
2. 발급된 URL에 신청자가 업로드한 파일을 PUT (multipart)
3. `files.completeUploadExternal` 호출 → 채널에 게시 + permalink 획득
4. 위 permalink를 §5.1 메시지의 `{{file_permalink}}`에 주입하여 Webhook으로 전송

자세한 코드는 §6.1 참고.

### 5.3 담당자 통보 방식
이메일 발송이 없어졌으므로, 담당자 3명에게 신청 사실을 전달하는 수단은 슬랙 채널 알림 + 멘션이다.

| 이메일 | Slack Member ID | 멘션 |
|--------|-----------------|------|
| ariel@inflab.com | U056J4GK86M | `<@U056J4GK86M>` |
| shhwang@inflab.com | U03AWSR2BD0 | `<@U03AWSR2BD0>` |
| hj.kim@inflab.com | U0ADQHJSYNA | `<@U0ADQHJSYNA>` |

- 메시지 첫 줄에 3명 멘션을 모두 포함 → 모바일 푸시·배지 강하게 발동
- 채널 알림이 "멘션만"이어도 안정적으로 도달
- `leez0602@inflab.com`은 담당자 리스트 및 멘션 대상에서 제외됨 (2026-05-18 운영자 결정)

> 🔑 **운영자에게 요청**: 알림 채널에 위 3명이 모두 참여했는지 확인. 신규 인원 추가/교체 시 멤버 ID와 함께 알림.

---

## 6. 외부 서비스 통합 가이드

### 6.1 Slack 통합 (메시지 + 파일)

이 프로젝트는 슬랙 알림만 사용한다. 두 가지 Slack 인터페이스를 조합해서 사용:

| 인터페이스 | 용도 | 인증 |
|-----------|------|------|
| **Incoming Webhook** | 알림 메시지 전송 (Block Kit / text) | 발급된 webhook URL (이미 보유) |
| **Web API `files.uploadV2`** | 신청서 파일 업로드 | Bot Token (`xoxb-...`) 신규 발급 필요 |

#### 운영자 셋업 절차 (Slack App + Bot Token, 약 10분)

**Step 1 — Slack App 생성**
1. https://api.slack.com/apps → "Create New App" → "From scratch"
2. App Name: `중소기업인재키움프리미엄 알림봇` (자유)
3. Workspace 선택 → Create

**Step 2 — Bot Token Scopes 추가**
1. 좌측 메뉴 → **OAuth & Permissions**
2. "Scopes" 섹션 → **Bot Token Scopes**에 다음 추가:
   - `files:write` — 파일 업로드용 (필수)
   - `chat:write` — 메시지 전송용 (선택, Incoming Webhook을 그대로 쓰면 불필요)

**Step 3 — Install to Workspace**
1. 같은 페이지 상단 "Install to Workspace" 클릭
2. 권한 승인
3. 발급된 **Bot User OAuth Token** (`xoxb-...`로 시작) 복사

**Step 4 — 알림 채널에 봇 초대**
1. 알림용 슬랙 채널로 이동
2. `/invite @중소기업인재키움프리미엄알림봇` 실행 (봇이 채널 멤버여야 파일 업로드 가능)

**Step 5 — 채널 ID 확인**
1. 채널 우클릭 → "View channel details" → 하단에 Channel ID (`C0XXXXXXXX`) 확인
2. 또는 채널 URL의 마지막 토큰

**Step 6 — 개발자에게 전달할 값**
| 항목 | 예시 | 비고 |
|------|------|------|
| Bot Token | `xoxb-...` | OAuth & Permissions 페이지 |
| 채널 ID | `C0XXXXXXXX` | 파일 업로드 대상 채널 |
| Webhook URL | (이미 보유) | `https://hooks.slack.com/services/.../...` |

#### CORS 주의
Slack Web API(`slack.com/api/*`)는 **브라우저에서의 직접 호출에 대해 CORS를 허용**한다 (2020년 이후). `Content-Type` 헤더로 `application/x-www-form-urlencoded` 또는 `multipart/form-data`를 쓰면 preflight 없이 통과.

Incoming Webhook(`hooks.slack.com/*`)은 `Content-Type` 헤더를 일부러 추가하지 않아야 CORS preflight를 우회한다 (브라우저가 simple request로 처리).

#### 코드 통합 예시

```javascript
// 1) 파일 업로드 — files.getUploadURLExternal
async function uploadFileToSlack(file) {
  // (a) 업로드용 임시 URL 발급
  const initRes = await fetch('https://slack.com/api/files.getUploadURLExternal', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Bearer ${SKP_CONFIG.SLACK_BOT_TOKEN}`
    },
    body: new URLSearchParams({
      filename: file.name,
      length: String(file.size)
    })
  }).then(r => r.json());

  if (!initRes.ok) throw new Error('Slack init failed: ' + initRes.error);

  // (b) 발급된 URL로 파일 PUT
  await fetch(initRes.upload_url, { method: 'POST', body: file });

  // (c) 업로드 완료 처리 + 채널 게시
  const completeRes = await fetch('https://slack.com/api/files.completeUploadExternal', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Authorization': `Bearer ${SKP_CONFIG.SLACK_BOT_TOKEN}`
    },
    body: JSON.stringify({
      files: [{ id: initRes.file_id, title: file.name }],
      channel_id: SKP_CONFIG.SLACK_CHANNEL_ID
    })
  }).then(r => r.json());

  if (!completeRes.ok) throw new Error('Slack complete failed: ' + completeRes.error);

  return completeRes.files[0].permalink;   // 메시지에 넣을 링크
}

// 2) 메시지 전송 — Incoming Webhook
async function postSlackMessage(blocks) {
  await fetch(SKP_CONFIG.SLACK_WEBHOOK_URL, {
    method: 'POST',
    // 주의: Content-Type 헤더 추가 안 함 (CORS preflight 회피)
    body: JSON.stringify({ blocks })
  });
}

// 3) 통합 흐름
async function submitApplication(form, file) {
  const permalink = await uploadFileToSlack(file);
  const blocks = buildSlackBlocks(form, file, permalink);
  await postSlackMessage(blocks);
}
```

#### 파일 크기 한계
- Slack 일반 워크스페이스의 파일 업로드 한도: **개별 파일 1GB**, 워크스페이스 총 용량은 플랜에 따라 다름 (Free: 5GB)
- 신청서 .xlsx는 일반적으로 수 백 KB ~ 수 MB 수준이므로 충분
- 클라이언트 UX 차원에서 **10MB 상한**을 두는 것을 권장 (잘못된 파일 업로드 방지)

#### 운영 주의사항 (보안)
- ⚠️ **Bot Token이 코드에 노출됨**: 위 코드 그대로 배포하면 누구나 토큰을 추출해 워크스페이스에 메시지/파일 전송 가능
  - **완화**: 봇 스코프를 `files:write` 하나로 최소화 → 도용돼도 피해 범위가 "임의 파일 업로드"로 제한
  - **완화**: 알림 채널을 다른 채널과 격리 → 도용 시 해당 채널만 영향
  - **완화**: 도용 의심 시 https://api.slack.com/apps 에서 즉시 토큰 revoke + 재발급
- 더 강한 보안이 필요하면 서버리스 프록시(예: Cloudflare Worker) 도입 검토 — 그러나 현 "HTML/JS만" 제약과 충돌

#### 폴백 시나리오
- `files.uploadV2`가 실패해도 메시지(Webhook)는 보낼 수 있도록 try/catch 분리
- 파일 업로드 실패 시 메시지에 `⚠️ 파일 업로드 실패 — 신청자에게 직접 문의 필요` 표시

---

## 7. 구현 단계 (Claude Code 작업 순서)

각 단계 완료 시 사용자 확인 받은 뒤 다음으로 진행 권장.

### Phase 1 — 골격 및 정적 콘텐츠 (반나절)
- [ ] `index.html` 생성, 기본 페이지 메타 및 prefix(`skp-`) 정한 CSS 인라인 구조 세팅
- [ ] 원본 페이지(`inflearn.com/tag-curation/skill/small-business-subsidy`) 콘텐츠 복제
  - 인플런 페이지에서 텍스트/이미지 자산 추출 방법은 사용자와 상의 (스크린샷 또는 직접 접근)
- [ ] 구글폼 섹션 제거 확인
- [ ] 담당자 문의 연락처 섹션 유지 확인
- [ ] `[지금 신청하기]` CTA 버튼 배치 (상단/하단)

### Phase 2 — 신청 모달 UI (1일)
- [ ] 모달 DOM 구조 작성 (페이지 하단에 hidden으로 배치)
- [ ] 안내 영역 (우선지원 대상 기업 안내, 전화번호, 정부 링크) 완성
- [ ] 양식 다운로드 버튼 (`SAMPLE_XLSX_URL` placeholder로 우선 연결, 실제 URL은 Phase 4에서 교체)
- [ ] 파일 업로드 input + 선택 파일명 표시
- [ ] 신청자 정보 입력 폼
- [ ] 실시간 검증 → 버튼 활성/비활성 토글
- [ ] 모달 열기/닫기 (배경 dim, X, ESC)

### Phase 3 — Slack 연동 (반나절~1일)
- [ ] Slack `files.uploadV2` 3단계 호출 구현 (`getUploadURLExternal` → PUT → `completeUploadExternal`)
- [ ] Block Kit 메시지 빌더 함수 (`buildSlackBlocks`) 구현
- [ ] Incoming Webhook POST 함수 구현
- [ ] 통합 제출 함수: 파일 업로드 → permalink 획득 → 메시지 전송
- [ ] 에러 핸들링: 파일 업로드 실패 시에도 메시지는 전송 (폴백)
- [ ] 성공/실패 UI 분기 처리

### Phase 4 — 마감/QA (반나절)
- [ ] **sample.xlsx 실제 호스팅 URL 교체** (운영자가 업로드 후 전달한 URL을 `SAMPLE_XLSX_URL`에 반영)
- [ ] 반응형 (모바일/태블릿/데스크탑) 점검
- [ ] TinyMCE에 실제 붙여넣고 동작 확인
- [ ] 슬랙 메시지/파일 실제 수신 확인 (테스트 채널에서 1회 전송)
- [ ] 대용량 파일(10MB 근접)/잘못된 확장자/한글 파일명 등 엣지 케이스
- [ ] CORS 동작 확인 (실제 인플런 도메인에 임베드 후 호출 성공 여부)
- [ ] 접근성 기본 (label 연결, 키보드 포커스, ESC 처리)
- [ ] 콘솔 에러/경고 0건 확인

---

## 8. 코드 스타일 가이드

- **CSS 클래스 prefix**: `skp-` (small-business Kium Premium)
- **JS 네임스페이스**: 즉시실행함수 `(function(){ ... })()` 또는 단일 객체 `window.SKP = {...}` 로 전역 오염 방지
- **변수**: `const`/`let`만 사용, `var` 금지
- **fetch**: `async/await` 사용
- **주석**: 비공개 영업 정보(이메일 주소, webhook URL)는 코드 상단에 `<!-- CONFIG -->` 섹션으로 모아 운영자가 수정하기 쉽게

### 8.1 권장 설정 블록 위치 (코드 최상단)
```html
<!-- ============================================
  CONFIG — 운영자 수정 영역
  발급/변경 시 아래 값만 갱신하면 동작합니다.
============================================ -->
<script>
window.SKP_CONFIG = {
  // Slack Incoming Webhook (메시지) — ✅ 발급 완료, 실제 값은 secrets.local.md 참고
  SLACK_WEBHOOK_URL: "<REPLACE_WITH_WEBHOOK_URL>",

  // Slack Bot Token (파일 업로드) — ✅ 발급 완료, 실제 값은 secrets.local.md 참고
  SLACK_BOT_TOKEN: "<REPLACE_WITH_BOT_TOKEN>",

  // 파일 업로드 대상 채널 ID — ✅ 발급 완료, 실제 값은 secrets.local.md 참고
  SLACK_CHANNEL_ID: "<REPLACE_WITH_CHANNEL_ID>",

  // 담당자 이메일 (메시지 본문 표시용, 발송용 아님) — ✅ 확정 (3명)
  ADMIN_EMAILS: [
    "ariel@inflab.com",
    "shhwang@inflab.com",
    "hj.kim@inflab.com"
  ],

  // 담당자 Slack Member ID (메시지 첫 줄 멘션용) — ✅ 확정
  SLACK_MENTION_USER_IDS: [
    "U056J4GK86M",  // ariel@inflab.com
    "U03AWSR2BD0",  // shhwang@inflab.com
    "U0ADQHJSYNA"   // hj.kim@inflab.com
  ],

  // 양식 파일 호스팅 URL — ⏳ 운영자 업로드 후 입력
  SAMPLE_XLSX_URL: ""
};
</script>
```

### 8.2 시크릿 관리 정책

이 저장소는 **GitHub Public 저장소 + Secret Scanning Push Protection 활성화** 상태이므로, 실제 시크릿(웹훅 URL, Bot Token 등)을 SPEC.md/index.html 등 git 추적 파일에 직접 적으면 push가 차단된다.

#### 규칙
1. **git 추적 파일에는 placeholder만 작성** — 예: `"<REPLACE_WITH_WEBHOOK_URL>"`, `"xoxb-***"`
2. **실제 값은 `secrets.local.md`에 보관** — 이 파일은 `.gitignore`로 추적 제외
3. 최종 배포할 `index.html`에 실제 값을 박을 때는 **로컬에서만 치환**해서 TinyMCE에 붙여넣기 (저장소에는 placeholder 버전을 커밋)
4. 시크릿이 실수로 commit된 경우:
   - push 전이라면 `git commit --amend` 또는 `git reset --soft HEAD~1`로 수정
   - push 후라면 **즉시 해당 시크릿을 revoke + 재발급** (history rewrite로는 완전히 못 지움)

#### `secrets.local.md` 예시 포맷
```markdown
# 로컬 시크릿 (Git 추적 제외)

## Slack
- Webhook URL: https://hooks.slack.com/services/.../.../...
- Bot Token: xoxb-...
- 채널 ID: C0XXXXXXXX

## sample.xlsx
- 호스팅 URL: https://.../sample.xlsx
```

#### `.gitignore` 필수 항목
```
secrets.local.md
*.local.md
.env*
```

---

## 9. 리스크 및 미결정 사항

| # | 항목 | 영향 | 상태 | 결정/조치 |
|---|------|------|------|---------|
| R1 | TinyMCE의 `<script>` 허용 여부 | High | ✅ 해결 | 운영자 확인 완료 — 허용됨 |
| R2 | sample.xlsx 호스팅 URL 미정 | High | ⏳ 진행중 | A안(절대 URL 하드코딩) 확정, 운영자 업로드 후 URL 전달 대기 |
| R3 | Slack Bot Token 노출 | Medium/High | ⚠️ 수용 | 코드에 토큰이 노출됨 → 스코프 최소화(`files:write`)·채널 격리·도용 시 즉시 revoke 절차 마련 (§6.1) |
| R4 | Slack Webhook URL 공개 노출 | Low/Medium | ✅ 수용 | 알림 전용 채널 격리 전제로 진행. 스팸 시 재발급 절차 마련 |
| R5 | Slack App 생성 + Bot Token 발급 | High | ⏳ 진행중 | 운영자 발급 작업 진행 — §6.1 가이드 참고 |
| R6 | 인플런 페이지 텍스트 발췌 라이선스 | Low | ✅ 수용 | 자체 페이지에 게재, 디자인은 재작성 |
| R7 | 신청자 확인 메일 부재 (PRD 변경) | Medium | ✅ 수용 | 운영자 결정으로 이메일 알림 전체 제거. 신청자는 모달 완료 메시지로만 확인 |
| R8 | 디자인 톤 재현도 | Medium | ⏳ | §3.5 가이드 따라 작업 후 운영자 시각 검수 |
| R9 | CORS — Slack API 직접 호출 | Low | ⏳ | Slack Web API는 브라우저 호출 허용. 실제 임베드 환경에서 검증 필요 |

---

## 10. Claude Code 작업 시 컨벤션

이 프로젝트에서 Claude Code가 코드를 작성할 때 따를 규칙:

1. **단일 파일 우선**: 별도 요청이 없으면 모든 코드를 `index.html` 한 파일에 인라인으로 작성
2. **외부 의존성 최소화**: Pretendard 폰트 CDN 외 추가 라이브러리 사용 금지 (Slack 통합은 fetch만으로 구현)
3. **민감 정보 분리**: Bot Token/Webhook URL/채널 ID는 §8.1 CONFIG 블록에만 위치
4. **테스트 가능성**: 외부 서비스 호출 함수는 단위로 분리해 콘솔에서 직접 호출 가능하게 (`window.SKP.uploadFileToSlack(...)`, `window.SKP.postSlackMessage(...)`)
5. **에러 핸들링**: 모든 fetch/외부 호출은 try/catch 필수. 파일 업로드 실패 시에도 메시지는 시도하는 폴백 흐름
6. **콘솔 출력**: 운영자 디버깅용 `console.info('[SKP]', ...)` 사용, prod에서도 유지
7. **i18n 불필요**: 한국어 텍스트 그대로 하드코딩 OK

---

## 11. 작업 시작 전 확정 필요한 정보 ✅

운영자 답변 반영 후 현재 상태:

- [x] ~~Slack Incoming Webhook URL~~ → ✅ 발급 완료 (실제 URL은 `secrets.local.md` 참고, git 추적 제외)
- [x] ~~TinyMCE에 `<script>` 태그 허용 여부~~ → ✅ 허용 확정
- [x] ~~sample.xlsx 호스팅 방식~~ → ✅ A안(절대 URL) 확정
- [x] ~~원본 인플런 페이지 콘텐츠 이전 방식~~ → ✅ 텍스트만 옮기고 디자인 재작성
- [x] ~~디자인 톤 기준~~ → ✅ 인플런 디자인 톤 그대로 재현 (§3.5)
- [x] ~~알림 방식~~ → ✅ **슬랙만 사용 (이메일 전체 제거)**
- [x] ~~Slack Bot Token~~ → ✅ 발급 완료 (실제 값은 `secrets.local.md`)
- [x] ~~Slack 알림 채널 ID~~ → ✅ 발급 완료 (실제 값은 `secrets.local.md`)
- [x] ~~sample.xlsx 절대 URL~~ → ✅ 발급 완료 (실제 값은 `secrets.local.md`, CloudFront 호스팅, HTTPS)
- [x] ~~담당자 Slack member ID~~ → ✅ 확정 (3명, leez0602 제외) — §5.3 표 참고

---

## 12. 참고 링크

- 원본 페이지: https://www.inflearn.com/tag-curation/skill/small-business-subsidy
- 우선지원 대상 기업 신청: https://www.gov.kr/mw/AA020InfoCappView.do?HighCtgCD=A05007&CappBizCD=14900000031&tp_seq=
- Slack Apps 관리: https://api.slack.com/apps
- Slack Incoming Webhook: https://api.slack.com/messaging/webhooks
- Slack `files.uploadV2` 가이드: https://api.slack.com/methods/files.getUploadURLExternal
- Slack Block Kit Builder: https://app.slack.com/block-kit-builder

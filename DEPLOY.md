# 배포 가이드 — 중소기업인재키움프리미엄 신청 페이지

> 이 문서는 운영자가 `index.html`을 인플런 페이지(TinyMCE)에 실제 배포할 때 따라야 할 절차입니다.
> 개발 사양은 [SPEC.md](SPEC.md), 로컬 시크릿은 [secrets.local.md](secrets.local.md), Google Apps Script 셋업은 [APPS_SCRIPT_SETUP.md](APPS_SCRIPT_SETUP.md)를 참조하세요.

## 📌 사전 작업 — Google Apps Script 배포

브라우저 CORS 정책으로 인해 Slack API 직접 호출이 차단되어, Google Apps Script를 프록시로 사용합니다. 파일은 운영자 Google Drive에 저장됩니다.
`index.html`을 TinyMCE에 붙여넣기 전 반드시 [APPS_SCRIPT_SETUP.md](APPS_SCRIPT_SETUP.md) 절차로 Apps Script를 먼저 배포하세요. 배포 완료 후 발급된 Web App URL을 `index.html`의 `SKP_APPS_SCRIPT_URL`에 박아야 동작합니다.

---

## 🚀 배포 절차 한눈에

```
[1] secrets.local.md에서 시크릿 2개 확인 (Webhook URL, Bot Token)
        ↓
[2] index.html을 index.deploy.html로 복사 (.gitignore됨)
        ↓
[3] 사본에서 placeholder 2개를 실제 값으로 치환
        ↓
[4] 사본을 브라우저로 열어 동작 검증 (체크리스트 §3 참고)
        ↓
[5] 사본 내용을 클립보드에 복사 → TinyMCE 코드 뷰에 붙여넣기
        ↓
[6] TinyMCE 미리보기/실제 페이지에서 동작 재검증
        ↓
[7] secrets.local.md 변경 시 §6 운영 절차 따름
```

---

## 1. 시크릿 확인

Slack Webhook URL과 Drive 폴더 ID는 **Apps Script의 Script Properties에만 존재**합니다. 브라우저 측에서 치환할 값은 **Apps Script Web App URL 하나뿐**입니다.

| 변수 | 형태 | 위치 |
|------|------|------|
| `SKP_APPS_SCRIPT_URL` | `https://script.google.com/macros/s/AKfy.../exec` | `index.html`에서 치환 필요 (이 문서 §2) |
| `SLACK_WEBHOOK_URL` | `https://hooks.slack.com/...` | Apps Script Script Properties (APPS_SCRIPT_SETUP.md에서 처리 완료) |
| `DRIVE_FOLDER_ID` | Drive 폴더 ID | Apps Script Script Properties (APPS_SCRIPT_SETUP.md에서 처리 완료) |

> 나머지(`SAMPLE_XLSX_URL`, `ADMIN_EMAILS`, `SLACK_MENTION_USER_IDS`)는 이미 `index.html` 코드에 직접 들어가 있어 별도 치환이 필요 없습니다.

---

## 2. 배포용 사본 만들기 (PowerShell)

저장소 루트(`C:\Users\HSH\dev\company_pre`)에서 PowerShell:

```powershell
# 사본 생성 — index.deploy.html은 .gitignore되어 있어 commit되지 않습니다.
Copy-Item index.html index.deploy.html -Force

# Apps Script URL 치환 (값은 secrets.local.md / Apps Script 배포 대화상자에서 확인)
$appsScriptUrl = "https://script.google.com/macros/s/AKfy.../exec"

(Get-Content index.deploy.html -Raw -Encoding UTF8) `
  -replace '<REPLACE_WITH_APPS_SCRIPT_URL>', $appsScriptUrl `
  | Set-Content index.deploy.html -Encoding UTF8

# 치환 확인 (실제 치환 대상만 정확히 검색)
Select-String '<REPLACE_WITH_APPS_SCRIPT_URL>' index.deploy.html
# → 출력이 없으면 OK.
#
# 참고: 단순히 '<REPLACE_WITH_'로 검색하면 코드 안의 검사 함수
#       (isPlaceholder)도 매칭되니 위 정확한 패턴을 사용하세요.
```

> ⚠️ `index.deploy.html`은 Worker URL이 박힌 상태이므로 commit하지 않습니다. `.gitignore`로 차단되어 있어요.

---

## 3. 배포 전 검증 체크리스트

`index.deploy.html`을 브라우저에서 열어 다음을 점검합니다 (소요 약 10분).

### 3.1 기본 UI/콘텐츠
- [ ] 페이지 상단 히어로 영역에 타이틀과 "지금 신청하기" CTA 표시
- [ ] 통계 카드 4개 (90% / 500만 원 / 6시간 / 0원)
- [ ] 지원 내용 카드 6개
- [ ] 담당자 문의 섹션 (진보경 매니저, ariel@inflab.com)
- [ ] 페이지 하단 최종 CTA 버튼
- [ ] 콘솔에 `[SKP] 초기화 완료 — 신청 버튼 3개 바인딩, Slack 설정: ✅` 표시

### 3.2 모달 동작
- [ ] "지금 신청하기" 클릭 시 모달 열림 (3곳 CTA 모두)
- [ ] 모달 첫 진입 시 회사명 입력란에 포커스
- [ ] 우측 상단 X · 배경 dim 클릭 · ESC 키 — 셋 다 모달 닫힘
- [ ] Tab 키로 순환 시 모달 밖으로 빠져나가지 않음 (focus trap)
- [ ] 모달 닫힌 후 원래 클릭했던 버튼으로 포커스 복귀

### 3.3 다운로드
- [ ] STEP 1 다운로드 버튼 클릭 → 인플런 CDN에서 .xlsx 다운로드 시작
- [ ] 다운로드된 파일이 정상적으로 Excel에서 열림

### 3.4 입력 검증
- [ ] 파일 없이 신청 → `[신청하기]` 비활성
- [ ] `.txt` 파일 업로드 → 빨강 에러 메시지
- [ ] 이메일에 잘못된 형식 입력 → 빨강 에러
- [ ] 모든 항목 정상 입력 → `[신청하기]` 활성화

### 3.5 실제 슬랙 전송
- [ ] 테스트 신청 (회사명 `TEST`, 이름 `테스트`, 이메일 `test@example.com`, 작은 .xlsx 파일)
- [ ] 슬랙 알림 채널에 다음이 도착:
  - 첫 줄에 담당자 3명 멘션 (`@ariel @shhwang @hj.kim`)
  - 헤더 `📨 중소기업인재키움프리미엄 신규 신청`
  - 회사명·신청자·이메일·접수일시 4-필드
  - 첨부 파일(파일명·크기)이 클릭 가능한 링크로 표시
  - 푸터에 담당자 3명 이메일
- [ ] 멘션받은 3명에게 모바일 푸시 알림 도착
- [ ] 첨부 파일이 슬랙에서 미리보기/다운로드 가능

### 3.6 반응형
- [ ] 데스크탑 (`≥769px`) — 컨테이너 max 960px, 통계 카드 4열
- [ ] 태블릿 (`481~768px`) — 통계 카드 2열
- [ ] 모바일 (`≤480px`) — 모달이 풀스크린, 통계 카드 2열

### 3.7 콘솔
- [ ] DevTools 콘솔에 에러(빨강) 또는 경고(노랑) 0건
  - `[SKP] ...` 정보(파랑) 로그는 무시 — 디버깅용으로 의도된 출력

> 위 항목 중 하나라도 실패하면 SPEC.md §9 리스크 표를 확인하고 코드 수정 → 사본 다시 생성.

---

## 4. TinyMCE에 붙여넣기

1. `index.deploy.html`을 텍스트 에디터(VS Code/메모장)에서 열기
2. 전체 내용 선택(`Ctrl+A`) → 복사(`Ctrl+C`)
3. 인플런 어드민의 TinyMCE 에디터로 이동
4. 에디터 툴바에서 **"소스코드 보기"** 또는 **`<>` 아이콘** 클릭 (HTML 모드 전환)
5. 기존 콘텐츠가 있다면 **모두 지우고** 클립보드 내용 붙여넣기(`Ctrl+V`)
6. **"확인" / "OK"** 클릭으로 HTML 모드 종료
7. 미리보기로 페이지 확인

### TinyMCE에서 깨질 수 있는 부분 — 체크
- [ ] `<script>` 블록이 보존되었는지 (저장 후 다시 코드 모드 열어서 확인)
- [ ] `<style>` 블록의 CSS가 보존되었는지
- [ ] `class` 속성(`skp-*`)이 유지되었는지
- [ ] 한글 텍스트 인코딩 깨짐 없는지

> 만약 `<script>`가 제거된다면 TinyMCE의 `valid_elements` 설정에서 script가 허용 목록에 없는 것. 어드민에 문의.

---

## 5. 배포 후 운영 확인

배포 직후 다음을 24시간 동안 모니터링:

- [ ] 첫 24시간 내 실제 신청자가 발생했는지 → 슬랙 메시지 도착 확인
- [ ] 신청자가 알림 채널 외 다른 곳(이메일/전화)으로 컴플레인하지 않는지
- [ ] 슬랙 메시지 포맷이 의도대로 표시되는지 (모바일 푸시 표시 포함)
- [ ] Google Analytics 등 추적 도구가 있다면 모달 열기 이벤트가 정상 기록되는지 (선택)

---

## 6. 운영 절차

### 6.1 시크릿 갱신 (Webhook/Bot Token 교체)
1. Slack 워크스페이스에서 새 값 발급 (기존 값은 revoke)
2. `secrets.local.md` 업데이트
3. §2 절차로 새 `index.deploy.html` 생성
4. TinyMCE에 다시 붙여넣기 (§4)

### 6.2 담당자 멤버 ID 변경
- `index.html`의 `SLACK_MENTION_USER_IDS` 직접 수정 → commit → §2~4 재배포
- 동시에 `ADMIN_EMAILS`도 정합성 유지

### 6.3 sample.xlsx 양식 변경
- 동일 URL 유지가 가능하면 인플런 CDN에 같은 경로로 덮어쓰기 → 재배포 불필요
- URL이 변경되면 `index.html`의 `SAMPLE_XLSX_URL` 업데이트 → commit → §2~4 재배포

### 6.4 시크릿 누출 의심 시
1. 즉시 Slack 워크스페이스에서 해당 Webhook/Token revoke
2. 새 값 발급
3. `secrets.local.md` 업데이트
4. §2~4 재배포
5. 누출 경로 추적 (어떤 파일에 노출됐는지 — git history도 확인)

### 6.5 신청 양식 백업
- 슬랙에 업로드된 파일은 워크스페이스 플랜에 따라 자동 삭제될 수 있음
- 중요 신청은 담당자가 별도 클라우드/메일로 백업 권장

---

## 7. 트러블슈팅

| 증상 | 원인 가능성 | 해결 |
|------|------------|------|
| 신청 후 슬랙에 메시지 안 옴 | Webhook URL placeholder 미치환 | 콘솔에 `Slack 설정: ⏳ placeholder` 표시 — §2 다시 |
| 메시지는 오는데 파일 첨부 안 됨 | Bot이 채널 멤버 아님 / 토큰 만료 | 채널에서 `/invite @봇이름` / 토큰 revoke 후 재발급 |
| 파일 업로드 실패 메시지 표시 | Bot Token 권한 부족 | OAuth & Permissions에서 `files:write` 스코프 확인 |
| 다운로드 버튼이 alert만 띄움 | `SAMPLE_XLSX_URL` placeholder | `index.html`에 직접 박혀있어야 함 — 코드 확인 |
| CORS 에러 | (드물지만) 인플런 도메인이 외부 호스트 차단 | 인플런 어드민에 CSP 정책 문의 |
| 모달이 인플런 메인 페이지 스타일과 충돌 | TinyMCE가 `skp-` prefix 보존 실패 | TinyMCE 저장 후 `class` 속성이 유지됐는지 확인 |
| 한글 입력값이 깨져 표시 | UTF-8 인코딩 문제 | 사본 저장 시 `-Encoding UTF8` 명시 |

---

## 8. 관련 문서

- [SPEC.md](SPEC.md) — 개발 사양·디자인 가이드
- [secrets.local.md](secrets.local.md) — 시크릿 보관 (git 추적 제외)
- [prd.txt](prd.txt) — 원본 요구사항

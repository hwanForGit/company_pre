# Google Apps Script 셋업 가이드

> [apps-script.gs](apps-script.gs)를 Google Apps Script Web App으로 배포해서 Slack 프록시 + Drive 파일 저장소로 사용하는 절차입니다.
> 한 번 셋업하면 그 후로는 손댈 일이 거의 없습니다.

---

## 사전 준비물

- [secrets.local.md](secrets.local.md)에 있는 값:
  - `SLACK_WEBHOOK_URL` (`https://hooks.slack.com/services/...`)
- 운영자 본인의 Google 계정 (예: `ariel@inflab.com`)
  - 신청서가 이 계정의 Drive에 저장됩니다

---

## Step 1. Drive에 신청서 보관 폴더 만들기 (1분)

1. https://drive.google.com 접속 (운영자 Google 계정으로 로그인)
2. 좌측 상단 **"+ 새로 만들기"** → **"새 폴더"**
3. 폴더 이름 입력 (예: `중소기업인재키움프리미엄 신청서`)
4. **폴더를 더블클릭으로 열기** (이게 중요!)
5. 주소창의 URL을 확인:
   ```
   https://drive.google.com/drive/folders/1ABCdef123XYZ_PolDerIdHere
                                          ─────────┬────────────
                                          ←── 이게 폴더 ID
   ```
6. 폴더 ID(`1ABCdef123...` 부분)를 **메모해 두기** — Step 4에서 사용

> 폴더에 공유 설정은 안 해도 됩니다. Apps Script가 운영자 권한으로 동작하므로 폴더는 비공개 유지 가능.

---

## Step 2. Apps Script 프로젝트 생성 (1분)

1. https://script.google.com 접속 (같은 Google 계정)
2. 우측 상단 **"새 프로젝트"** (New project) 클릭
3. 상단의 "제목 없는 프로젝트" 클릭해서 이름 변경 → `SKP 신청 프록시` (자유)

---

## Step 3. 코드 붙여넣기 (1분)

1. 좌측 에디터에 기본 `function myFunction() { ... }` 코드가 보임
2. **전부 삭제** (Ctrl+A → Delete)
3. 저장소의 [apps-script.gs](apps-script.gs) 파일 내용을 복사해서 붙여넣기
4. 상단 **💾 저장** 아이콘 클릭 (또는 Ctrl+S)

---

## Step 4. Script Properties 설정 (시크릿 보관) (2분)

코드 안에 시크릿을 박지 않고 별도로 보관합니다.

1. 좌측 사이드바 **⚙️ 프로젝트 설정** (Project Settings) 클릭
2. 페이지 하단 **"스크립트 속성"** (Script properties) 섹션
3. **"스크립트 속성 추가"** 클릭
4. 다음 2개를 추가:

| Property | Value |
|----------|-------|
| `SLACK_WEBHOOK_URL` | `https://hooks.slack.com/services/...` (secrets.local.md에서 복사) |
| `DRIVE_FOLDER_ID` | Step 1에서 메모한 폴더 ID |

5. **"스크립트 속성 저장"** 클릭

---

## Step 5. 웹 앱으로 배포 (3분)

1. 우측 상단 **"배포"** (Deploy) → **"새 배포"** (New deployment)
2. 왼쪽 ⚙️ 아이콘 → **"웹 앱"** (Web app) 선택
3. 설정:
   - **설명**: `SKP 신청 프록시 v1` (자유)
   - **실행 사용자**: **나** (`ariel@inflab.com` 등 운영자 본인)
   - **액세스 권한**: **모든 사용자** (Anyone) — ⚠️ 익명 호출 허용해야 신청자가 접근 가능
4. **"배포"** 클릭

### 🔑 권한 승인 (첫 배포 시 1회)

1. **"액세스 권한 검토"** 버튼 → Google 계정 선택
2. "Google에서 확인하지 않은 앱" 경고 화면이 뜸 (정상)
3. **"고급"** 클릭 → **"SKP 신청 프록시(안전하지 않음)(으)로 이동"** 클릭
4. 권한 확인 화면:
   - Google Drive의 파일 보기/관리 ✓
   - 외부 서비스에 연결 ✓
5. **"허용"** 클릭

### 배포 완료 → 웹 앱 URL 확인

```
배포 완료
배포 ID: AKfycbz...

웹 앱 URL: https://script.google.com/macros/s/AKfycbz.../exec
           ─────────────────────────┬──────────────────────────
                                    ←── 이게 Web App URL
```

URL을 **복사**해 두세요.

---

## Step 6. 동작 확인 (2분)

### 6-1) 브라우저로 GET 호출 (헬스체크)

웹 앱 URL을 그냥 브라우저 주소창에 붙여넣고 엔터.

응답:
```json
{ "ok": true, "service": "SKP application proxy", "method": "POST only" }
```

이게 보이면 Web App이 정상 동작 중입니다.

### 6-2) PowerShell로 POST 호출 (실제 슬랙 전송 — 주의!)

이 명령은 실제 Slack 채널에 테스트 메시지 1건과 Drive에 작은 파일 1개를 만듭니다.

```powershell
$url = "https://script.google.com/macros/s/AKfycbz.../exec"  # ← Step 5의 URL

$payload = @{
  formData = @{
    company = "테스트회사"
    name = "테스트"
    email = "test@example.com"
    submittedAt = "2026-05-18 18:00"
  }
  file = @{
    name = "test.txt"
    size = 4
    mimeType = "text/plain"
    base64 = "VEVTVA=="  # "TEST"의 base64
  }
  mentionIds = @()                    # 테스트 시 멘션 빼서 알림 안 가게
  adminEmails = @("ariel@inflab.com")
} | ConvertTo-Json -Compress

curl.exe -L -X POST $url `
  -H "Content-Type: text/plain;charset=utf-8" `
  --data $payload
```

응답 예:
```json
{"success":true,"fileUploaded":true,"uploadError":null,"driveUrl":"https://drive.google.com/uc?export=download&id=..."}
```

→ Slack 채널을 확인하면 메시지 + Drive 링크가 도착했을 것입니다. 링크 클릭 시 즉시 다운로드 시작.

---

## Step 7. Web App URL을 개발자(저)에게 전달

Step 5의 웹 앱 URL을 알려주세요:
```
https://script.google.com/macros/s/AKfycbz.../exec
```

받는 즉시 `index.html`의 `SKP_APPS_SCRIPT_URL`을 실제 값으로 박고 커밋합니다.

---

## 운영 시 알아두면 좋은 것

### 실행 로그 확인
- Apps Script 에디터 좌측 사이드바 → **"실행"** (Executions)
- 최근 호출 내역, 성공/실패, 실행 시간 확인 가능
- `console.error`로 찍은 에러도 여기에 표시됨

### 시크릿(Property) 변경
- 좌측 사이드바 → **프로젝트 설정** → 스크립트 속성에서 수정
- 즉시 반영됨 (재배포 불필요)

### 코드 업데이트
- 저장소의 [apps-script.gs](apps-script.gs) 수정
- Apps Script 에디터에 다시 붙여넣기 → 저장
- **"배포" → "배포 관리"** → 기존 배포 옆 ✏️ → **"새 버전"** → 배포
- ⚠️ "새 배포"를 하면 URL이 바뀌므로, 반드시 **기존 배포의 새 버전**으로 발행

### Drive 폴더 정리
- 신청서 파일이 시간순으로 쌓임 (`YYYYMMDD-HHMMSS_회사명_원본파일명` 형식)
- 무료 Google Drive 15GB 한도까지 사용 가능
- 오래된 파일은 운영자가 수동으로 정리 (또는 Apps Script 트리거로 자동화 가능 — 필요 시 안내)

### 비용
- Apps Script: 무료, 일 6분 실행 시간 (개인 계정 기준) — 우리 용도에 매우 여유
- Drive 저장 공간: 무료 15GB (Workspace는 더 많음)

### 보안
- Slack Webhook URL이 Script Properties에만 존재 → 코드/git에는 노출 안 됨 ✅
- Drive 파일은 "링크 있는 누구나 보기" 권한 — Slack 채널 보안에 의존
- Apps Script URL을 추측·도용해도 임의 메시지 전송 가능 (rate-limit은 Google이 자동 적용)
- 의심스러운 abuse 발생 시: Webhook revoke + 새 배포로 URL 갱신

---

## 트러블슈팅

### "액세스가 거부됨: DriveApp." 오류

Web App이 Drive 권한을 못 받은 상태. 다음 절차로 해결:

1. Apps Script 에디터 좌측 **📄 편집기** 이동
2. 상단 함수 드롭다운에서 **`authorize`** 선택
3. **▶ 실행** 클릭
4. 권한 승인 다이얼로그:
   - "Google에서 확인하지 않은 앱" → **고급** 클릭
   - **"(프로젝트 이름)(안전하지 않음)(으)로 이동"** 클릭
   - Drive 파일 보기/관리 권한 → **허용**
5. 실행 로그에 다음이 보여야 OK:
   ```
   ✅ Drive 폴더 접근 OK
   ✅ 파일 쓰기 OK
   🎉 모든 권한 확인 완료
   ```
6. **"배포" → "배포 관리"** → 해당 배포 우측 ✏️ 클릭 → **"버전"** 드롭다운에서 **"새 버전"** 선택 → **"배포"**
   - URL은 그대로 유지됨 (수정 배포)
   - 새 배포가 아니라 **버전 업데이트**여야 합니다

> 한 번 권한 승인되면 그 후 Web App 호출도 같은 권한으로 동작합니다.

### "DRIVE_FOLDER_ID not configured" 오류
Script Properties에 `DRIVE_FOLDER_ID`가 없거나 오타. 프로젝트 설정 → 스크립트 속성 재확인.

### Web App URL이 200 OK인데 Slack에 아무것도 안 옴
1. `SLACK_WEBHOOK_URL` Script Property가 잘못 입력됐을 가능성 → Apps Script 실행 로그에서 webhook 응답 확인
2. Slack 워크스페이스에서 webhook이 revoke됐을 가능성 → 새로 발급

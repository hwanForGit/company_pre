/**
 * Google Apps Script — 중소기업인재키움프리미엄 신청 프록시
 *
 * 역할:
 *   브라우저(인플런 페이지)에서 직접 Slack API를 호출할 수 없는 CORS 제약을 우회.
 *   브라우저 → Apps Script (1회 호출) → Drive 파일 저장 → Slack Webhook 메시지.
 *
 * 운영자가 Apps Script 에디터의 Script Properties에 설정해야 할 값:
 *   SLACK_WEBHOOK_URL    https://hooks.slack.com/services/...
 *   DRIVE_FOLDER_ID      신청서를 저장할 Drive 폴더 ID (URL에서 추출)
 *
 * 배포: Apps Script 에디터 → "배포" → "새 배포" → 유형 "웹 앱"
 *   - 실행 사용자: 본인 (소유자 권한으로 Drive 접근)
 *   - 액세스: 모든 사용자 (로그인 없이 익명 호출 가능)
 *
 * 브라우저가 보내는 요청 형식:
 *   POST <web-app-url>
 *   Content-Type: text/plain;charset=utf-8   (preflight 회피용)
 *   {
 *     "formData":   { "company": "...", "name": "...", "email": "...", "submittedAt": "YYYY-MM-DD HH:mm" },
 *     "file":       { "name": "...", "size": 12345, "mimeType": "application/...", "base64": "..." },
 *     "mentionIds": ["U056J4GK86M", ...],
 *     "adminEmails":["ariel@inflab.com", ...]
 *   }
 *
 * 응답:
 *   { "success": true, "fileUploaded": true|false, "uploadError": null|"...", "driveUrl": "..." }
 *   { "success": false, "error": "..." }
 */

// ============================================================
// 진입점
// ============================================================

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ success: false, error: 'No POST body' });
    }

    var data;
    try {
      data = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return jsonResponse({ success: false, error: 'Invalid JSON: ' + parseErr.message });
    }

    var formData = data.formData;
    var file = data.file;
    var mentionIds = data.mentionIds || [];
    var adminEmails = data.adminEmails || [];

    // 입력 검증 — 파일은 선택사항(없어도 신청 접수 + Slack 알림 진행)
    if (!formData || !formData.company || !formData.name || !formData.email) {
      return jsonResponse({ success: false, error: 'Invalid form data' });
    }
    var hasFile = !!(file && file.name && file.base64);

    // Script Properties 확인
    var props = PropertiesService.getScriptProperties();
    var slackWebhookUrl = props.getProperty('SLACK_WEBHOOK_URL');
    var driveFolderId = props.getProperty('DRIVE_FOLDER_ID');
    if (!slackWebhookUrl) {
      return jsonResponse({ success: false, error: 'SLACK_WEBHOOK_URL not configured in Script Properties' });
    }

    // 1) (파일이 있을 때만) Drive에 파일 저장 — 실패해도 메시지는 진행
    var driveUrl = null;
    var driveViewUrl = null;
    var uploadError = null;
    if (hasFile) {
      if (!driveFolderId) {
        uploadError = 'DRIVE_FOLDER_ID not configured';
        console.error(uploadError);
      } else {
        try {
          var result = saveFileToDrive(file, formData, driveFolderId);
          driveUrl = result.directDownloadUrl;
          driveViewUrl = result.viewUrl;
        } catch (err) {
          uploadError = (err && err.message) || String(err);
          console.error('Drive upload failed: ' + uploadError);
        }
      }
    }

    // 2) Block Kit 메시지 빌드
    var blocks = buildBlocks({
      formData: formData,
      hasFile: hasFile,
      fileName: hasFile ? file.name : '',
      fileSize: hasFile ? (file.size || 0) : 0,
      driveUrl: driveUrl,
      driveViewUrl: driveViewUrl,
      uploadError: uploadError,
      mentionIds: mentionIds,
      adminEmails: adminEmails
    });

    // 3) Slack Webhook으로 메시지 전송
    var fallbackText = '📨 중소기업인재키움프리미엄 신규 신청 — ' +
                       formData.company + ' / ' + formData.name;

    var slackRes = UrlFetchApp.fetch(slackWebhookUrl, {
      method: 'post',
      contentType: 'application/json; charset=utf-8',
      payload: JSON.stringify({ text: fallbackText, blocks: blocks }),
      muteHttpExceptions: true
    });

    var code = slackRes.getResponseCode();
    if (code < 200 || code >= 300) {
      var errTxt = slackRes.getContentText();
      console.error('Slack webhook failed: HTTP ' + code + ' — ' + errTxt);
      return jsonResponse({
        success: false,
        error: 'webhook: HTTP ' + code + ' — ' + errTxt,
        fileUploaded: !!driveUrl,
        uploadError: uploadError
      });
    }

    return jsonResponse({
      success: true,
      fileUploaded: !!driveUrl,
      uploadError: uploadError,
      driveUrl: driveUrl
    });
  } catch (err) {
    console.error('doPost error: ' + ((err && err.stack) || err));
    return jsonResponse({
      success: false,
      error: (err && err.message) || String(err)
    });
  }
}

function doGet(e) {
  // 단순 헬스체크용 (운영자가 Web App URL을 브라우저로 직접 열어볼 때)
  return jsonResponse({ ok: true, service: 'SKP application proxy', method: 'POST only' });
}

/**
 * 🔧 권한 승인 헬퍼 — Apps Script 에디터에서 직접 실행
 *
 * "액세스가 거부됨: DriveApp." 오류 해결용:
 * 1) Apps Script 에디터 상단 함수 드롭다운에서 `authorize` 선택
 * 2) ▶ "실행" 클릭
 * 3) 권한 승인 다이얼로그가 뜨면 운영자 계정으로 승인
 *    - "Google에서 확인하지 않은 앱" 경고 → 고급 → 이동 → 허용
 * 4) 실행 로그에 "✅ Drive 폴더 접근 OK" 가 보이면 완료
 * 5) "배포 → 배포 관리 → ✏️ → 버전 = 새 버전 → 배포" 로 재배포
 *
 * 한 번 승인하면 그 후 Web App 호출도 같은 권한으로 동작합니다.
 */
function authorize() {
  var props = PropertiesService.getScriptProperties();
  var folderId = props.getProperty('DRIVE_FOLDER_ID');
  var webhook = props.getProperty('SLACK_WEBHOOK_URL');

  console.log('--- Script Properties 점검 ---');
  console.log('DRIVE_FOLDER_ID:', folderId ? '✅ 설정됨 (' + folderId.slice(0, 6) + '...)' : '❌ 누락');
  console.log('SLACK_WEBHOOK_URL:', webhook ? '✅ 설정됨' : '❌ 누락');

  if (!folderId) {
    throw new Error('DRIVE_FOLDER_ID가 Script Properties에 없습니다. 프로젝트 설정에서 추가하세요.');
  }

  console.log('--- Drive 폴더 접근 시도 ---');
  // Drive 권한을 명시적으로 호출 → 첫 실행 시 권한 승인 다이얼로그 트리거됨
  var folder = DriveApp.getFolderById(folderId);
  console.log('✅ Drive 폴더 접근 OK');
  console.log('  폴더 이름:', folder.getName());
  console.log('  폴더 ID:', folder.getId());
  console.log('  현재 파일 개수:', folder.getFiles().hasNext() ? '1개 이상' : '비어있음');

  console.log('--- 작은 테스트 파일 쓰기 시도 ---');
  var testBlob = Utilities.newBlob('authorize test ' + new Date().toISOString(), 'text/plain', '_skp_authorize_test.txt');
  var testFile = folder.createFile(testBlob);
  console.log('✅ 파일 쓰기 OK — ' + testFile.getName());
  console.log('  테스트 파일은 자동 삭제됩니다.');
  testFile.setTrashed(true);

  console.log('');
  console.log('🎉 모든 권한 확인 완료. 이제 "배포 → 배포 관리"에서 새 버전으로 재배포하세요.');
}

// ============================================================
// 헬퍼 함수
// ============================================================

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function saveFileToDrive(file, formData, folderId) {
  var bytes = Utilities.base64Decode(file.base64);
  var mimeType = file.mimeType || 'application/octet-stream';

  // 파일명 prefix로 회사명/날짜 추가 (정렬·식별 용이)
  var ts = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyyMMdd-HHmmss');
  var prefix = ts + '_' + sanitizeFilename(formData.company) + '_';
  var finalFilename = prefix + file.name;

  var blob = Utilities.newBlob(bytes, mimeType, finalFilename);
  var folder = DriveApp.getFolderById(folderId);
  var driveFile = folder.createFile(blob);

  // 공유 권한 설정 시도 — Workspace 정책에 따라 실패할 수 있음.
  // 폴더 자체에 담당자 3명 권한이 사전 설정되어 있으면 파일이 상속받으므로
  // 이 호출이 실패해도 담당자들은 정상 접근 가능. 따라서 try-catch로 무시.
  try {
    driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (err1) {
    console.warn('setSharing ANYONE_WITH_LINK failed (will fall back): ' + err1.message);
    // 회사 도메인 내부 공유 시도
    try {
      driveFile.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW);
      console.log('setSharing DOMAIN_WITH_LINK succeeded');
    } catch (err2) {
      console.warn('setSharing DOMAIN_WITH_LINK also failed: ' + err2.message);
      console.warn('→ 폴더 사전 공유 권한에 의존합니다 (담당자가 폴더에 권한 있어야 다운로드 가능)');
    }
  }

  var fileId = driveFile.getId();

  return {
    // 직접 다운로드 URL — Slack에서 클릭 시 즉시 다운로드 시작
    directDownloadUrl: 'https://drive.google.com/uc?export=download&id=' + fileId,
    // 미리보기 URL — Drive에서 열어보기용 (보조)
    viewUrl: driveFile.getUrl(),
    fileId: fileId
  };
}

function sanitizeFilename(s) {
  // Drive 파일명에 쓸 수 없거나 가독성을 해치는 문자 제거
  return String(s || 'unknown').replace(/[\\/:*?"<>|]/g, '_').slice(0, 50);
}

function slackEscape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function buildBlocks(opts) {
  var formData = opts.formData;
  var fileName = opts.fileName;
  var fileSize = opts.fileSize;
  var driveUrl = opts.driveUrl;
  var driveViewUrl = opts.driveViewUrl;
  var uploadError = opts.uploadError;
  var mentionIds = opts.mentionIds || [];
  var adminEmails = opts.adminEmails || [];

  var mentions = mentionIds.map(function (id) { return '<@' + id + '>'; }).join(' ');
  var headerText = (mentions ? mentions + '\n' : '') +
                   '📨 *중소기업인재키움프리미엄 신규 신청*';

  var safeFileName = slackEscape(fileName);

  var fileLine = null;
  if (opts.hasFile && driveUrl) {
    fileLine =
      '*첨부 파일*\n' +
      '<' + driveUrl + '|' + safeFileName + '> (' + formatFileSize(fileSize) + ') — 클릭 시 즉시 다운로드\n' +
      '<' + driveViewUrl + '|Drive에서 열기>';
  } else if (opts.hasFile && uploadError) {
    fileLine =
      '*첨부 파일*\n⚠️ 파일 업로드 실패 — 신청자에게 직접 문의 필요\n' +
      '`' + safeFileName + '` (' + formatFileSize(fileSize) + ')\n' +
      '오류: ' + slackEscape(uploadError);
  } else if (opts.hasFile) {
    fileLine =
      '*첨부 파일*\n`' + safeFileName + '` (' + formatFileSize(fileSize) + ')';
  }

  var blocks = [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: headerText }
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: '*회사명*\n' + slackEscape(formData.company) },
        { type: 'mrkdwn', text: '*신청자*\n' + slackEscape(formData.name) },
        { type: 'mrkdwn', text: '*이메일*\n' + slackEscape(formData.email) },
        { type: 'mrkdwn', text: '*접수일시*\n' + formData.submittedAt + ' (KST)' }
      ]
    }
  ];

  // 파일이 첨부된 경우에만 첨부 파일 섹션 추가
  if (fileLine) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: fileLine }
    });
  }

  blocks.push({
    type: 'context',
    elements: [
      { type: 'mrkdwn', text: '담당자: ' + adminEmails.join(' · ') }
    ]
  });

  return blocks;
}

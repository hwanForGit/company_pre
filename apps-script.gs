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
          var result = saveFileToDrive(file, formData, driveFolderId, adminEmails);
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

    // 4) 리드 관리 시트에 행 추가 (실패해도 신청 자체는 성공 처리)
    var leadLogged = false, leadError = null;
    try {
      appendLeadRow_(formData);
      leadLogged = true;
    } catch (e) {
      leadError = (e && e.message) || String(e);
      console.error('Lead sheet append failed: ' + leadError);
    }

    return jsonResponse({
      success: true,
      fileUploaded: !!driveUrl,
      uploadError: uploadError,
      driveUrl: driveUrl,
      leadLogged: leadLogged,
      leadError: leadError
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

// 담당자 기본 이메일 — Drive 파일 공유 폴백 / 과거 파일 일괄 공유용
var DEFAULT_ADMIN_EMAILS = ['ariel@inflab.com', 'shhwang@inflab.com', 'hj.kim@inflab.com'];

function saveFileToDrive(file, formData, folderId, adminEmails) {
  var bytes = Utilities.base64Decode(file.base64);
  var mimeType = file.mimeType || 'application/octet-stream';

  // 파일명 prefix로 회사명/날짜 추가 (정렬·식별 용이)
  var ts = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyyMMdd-HHmmss');
  var prefix = ts + '_' + sanitizeFilename(formData.company) + '_';
  var finalFilename = prefix + file.name;

  var blob = Utilities.newBlob(bytes, mimeType, finalFilename);
  var folder = DriveApp.getFolderById(folderId);
  var driveFile = folder.createFile(blob);

  // 1) 담당자(adminEmails)를 파일 뷰어로 직접 추가
  //    외부/링크 공유가 조직 정책으로 막혀 있어도 담당자는 항상 열기/다운로드 가능 (403 방지)
  var viewers = (adminEmails && adminEmails.length) ? adminEmails : DEFAULT_ADMIN_EMAILS;
  if (viewers && viewers.length) {
    try {
      driveFile.addViewers(viewers);
    } catch (e0) {
      console.warn('addViewers 실패: ' + ((e0 && e0.message) || e0));
    }
  }

  // 2) 링크 공유도 시도 — 정책 허용 시 링크가 있는 누구나 접근 (정책상 실패해도 1)이 보완)
  try {
    driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (err1) {
    try {
      driveFile.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (err2) {
      console.warn('링크 공유 실패 — 담당자 뷰어 권한에 의존: ' + ((err2 && err2.message) || err2));
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
  if (opts.hasFile && (driveViewUrl || driveUrl)) {
    var openUrl = driveViewUrl || driveUrl;
    fileLine =
      '*첨부 파일*\n' +
      '<' + openUrl + '|' + safeFileName + '> (' + formatFileSize(fileSize) + ') — 클릭하여 열기 · 다운로드' +
      (driveUrl ? ('\n<' + driveUrl + '|직접 다운로드>') : '');
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
        { type: 'mrkdwn', text: '*연락처*\n' + slackEscape(formData.phone || '-') },
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

// ============================================================
// 리드 관리 시트 (Google Sheets)
//   컬럼: 날짜 | 기업명 | 이름 | 메일 | 연락처 | 추후 응대 | 특이사항
//   매칭: 날짜←접수일시, 기업명←company, 이름←name, 메일←email, 연락처←phone
// ============================================================

var LEAD_HEADERS = ['날짜', '기업명', '이름', '메일', '연락처', '추후 응대', '특이사항'];
var LEAD_SHEET_NAME = '중소기업인재키움프리미엄 리드 관리';

// 시트를 가져오거나(없으면) 신청서 보관 Drive 폴더 안에 생성. ID는 Script Properties에 저장.
function getLeadSheet_() {
  var props = PropertiesService.getScriptProperties();
  var ssId = props.getProperty('LEAD_SPREADSHEET_ID');
  var ss = null;
  if (ssId) {
    try { ss = SpreadsheetApp.openById(ssId); } catch (e) { ss = null; }
  }
  if (!ss) {
    ss = SpreadsheetApp.create(LEAD_SHEET_NAME);
    props.setProperty('LEAD_SPREADSHEET_ID', ss.getId());
    var folderId = props.getProperty('DRIVE_FOLDER_ID');
    if (folderId) {
      try {
        var file = DriveApp.getFileById(ss.getId());
        DriveApp.getFolderById(folderId).addFile(file);
        DriveApp.getRootFolder().removeFile(file);
      } catch (e) { console.warn('시트 폴더 이동 실패(루트에 생성됨): ' + e); }
    }
  }
  var sheet = ss.getSheets()[0];
  ensureLeadHeader_(sheet);
  return sheet;
}

function ensureLeadHeader_(sheet) {
  var width = LEAD_HEADERS.length;
  var firstRow = sheet.getRange(1, 1, 1, width).getValues()[0];
  if (firstRow[0] === '날짜') return; // 이미 헤더 존재
  if (sheet.getLastRow() !== 0) sheet.insertRowBefore(1);
  sheet.getRange(1, 1, 1, width).setValues([LEAD_HEADERS]).setFontWeight('bold');
  sheet.setFrozenRows(1);
}

function appendLeadRow_(formData) {
  var sheet = getLeadSheet_();
  var dateStr = String(formData.submittedAt || '').split(' ')[0];
  sheet.appendRow([
    dateStr,
    formData.company || '',
    formData.name || '',
    formData.email || '',
    formData.phone || '',
    '',  // 추후 응대
    ''   // 특이사항
  ]);
}

// 🔧 시트 즉시 생성/확인 — 에디터 함수 드롭다운에서 실행하면 URL을 로그에 출력
function setupLeadSheet() {
  var sheet = getLeadSheet_();
  var url = sheet.getParent().getUrl();
  console.log('✅ 리드 관리 시트 준비 완료');
  console.log('URL: ' + url);
  return url;
}

// ============================================================
// 기존 Drive 파일 → 신청자 정보 백필 (1회 수동 실행)
//   에디터 함수 드롭다운에서 backfillLeadsFromDrive 선택 후 ▶ 실행
//   - '신청정보' 텍스트 파일: 회사/이름/메일/날짜 전체 복원
//   - 그 외(xlsx 등): 파일명 prefix에서 날짜·회사만 복원
//   - 테스트(TEST/테스트/diag/무시/__) 항목은 제외
//   - 회사+이름+메일 기준 중복은 건너뜀
// ============================================================
function backfillLeadsFromDrive() {
  var props = PropertiesService.getScriptProperties();
  var folderId = props.getProperty('DRIVE_FOLDER_ID');
  if (!folderId) throw new Error('DRIVE_FOLDER_ID가 Script Properties에 없습니다.');

  var sheet = getLeadSheet_();
  var existing = {};
  var last = sheet.getLastRow();
  if (last >= 2) {
    var rows = sheet.getRange(2, 1, last - 1, LEAD_HEADERS.length).getValues();
    rows.forEach(function (r) { existing[leadKey_(r[1], r[2], r[3])] = true; });
  }

  var TEST_RE = /(test|테스트|diag|무시|__)/i;
  var folder = DriveApp.getFolderById(folderId);
  var files = folder.getFiles();
  var collected = [];
  while (files.hasNext()) {
    var f = files.next();
    var nm = f.getName();
    if (nm.indexOf('리드 관리') !== -1) continue;
    if (nm.indexOf('_skp_authorize_test') !== -1) continue;
    var info = parseApplicantFromFile_(f);
    if (!info) continue;
    if (TEST_RE.test(info.company || '') || TEST_RE.test(info.name || '')) continue;
    collected.push(info);
  }
  collected.sort(function (a, b) { return String(a.date || '').localeCompare(String(b.date || '')); });

  var added = 0, dup = 0;
  collected.forEach(function (info) {
    var key = leadKey_(info.company, info.name, info.email);
    if (existing[key]) { dup++; return; }
    sheet.appendRow([info.date || '', info.company || '', info.name || '', info.email || '', info.phone || '', '', '']);
    existing[key] = true;
    added++;
  });
  console.log('✅ 백필 완료 — 추가 ' + added + '건, 중복 스킵 ' + dup + '건');
  console.log('시트: ' + sheet.getParent().getUrl());
  return { added: added, dup: dup };
}

function leadKey_(company, name, email) {
  return [String(company || '').trim(), String(name || '').trim(), String(email || '').trim()].join('|').toLowerCase();
}

function parseApplicantFromFile_(file) {
  var name = file.getName();
  var info = { date: '', company: '', name: '', email: '', phone: '' };

  // 파일명 prefix: yyyyMMdd-HHmmss_회사_원본명
  var m = /^(\d{4})(\d{2})(\d{2})-\d{6}_([^_]*)_/.exec(name);
  if (m) { info.date = m[1] + '-' + m[2] + '-' + m[3]; info.company = m[4]; }

  // 신청정보 텍스트 파일이면 내용에서 상세 파싱
  try {
    var mime = file.getMimeType();
    if (name.indexOf('신청정보') !== -1 || mime === 'text/plain') {
      var text = file.getBlob().getDataAsString('UTF-8');
      var c = /회사명\s*[:：]\s*(.+)/.exec(text);            if (c) info.company = c[1].trim();
      var n = /신청자\s*[:：]\s*(.+)/.exec(text);            if (n) info.name = n[1].trim();
      var e = /이메일\s*[:：]\s*(.+)/.exec(text);            if (e) info.email = e[1].trim();
      var p = /(?:연락처|전화)\s*[:：]\s*(.+)/.exec(text);   if (p) info.phone = p[1].trim();
      var d = /접수일시\s*[:：]\s*(\d{4}-\d{2}-\d{2})/.exec(text); if (d) info.date = d[1];
    }
  } catch (err) { /* 파싱 실패 무시 */ }

  if (!info.company && !info.name && !info.email) return null;
  return info;
}

// 🔧 과거 업로드 파일까지 담당자 뷰어로 일괄 추가 (403 소급 해결) — 에디터에서 1회 실행
function shareAllFilesWithAdmins() {
  var props = PropertiesService.getScriptProperties();
  var folderId = props.getProperty('DRIVE_FOLDER_ID');
  if (!folderId) throw new Error('DRIVE_FOLDER_ID가 Script Properties에 없습니다.');
  var folder = DriveApp.getFolderById(folderId);
  var files = folder.getFiles();
  var n = 0, fail = 0;
  while (files.hasNext()) {
    var f = files.next();
    try { f.addViewers(DEFAULT_ADMIN_EMAILS); n++; }
    catch (e) { fail++; console.warn(f.getName() + ' 공유 실패: ' + ((e && e.message) || e)); }
  }
  console.log('✅ 과거 파일 담당자 공유 완료 — 성공 ' + n + '건, 실패 ' + fail + '건');
  return { shared: n, failed: fail };
}

/**
 * Pickle Jar — 구글 시트를 피클(AI 비서)과 앱 사이의 작업함으로 쓴다.
 *
 * 앱은 이 스크립트를 "웹 앱"으로 배포한 주소에 연결 키를 붙여 부른다.
 *   GET  ?action=list&key=...&limit=30&beforeId=123   최신 작업부터
 *   POST {"action":"create","key":"...","task":"...","category":"task"}   (Content-Type: text/plain)
 * Apps Script 웹 앱은 HTTP 상태 코드를 바꿀 수 없어서, 실패는 {"ok":false,"error":"..."} 로 돌려준다.
 */

var SHEET_NAME = 'Tasks'
var HEADERS = ['Id', 'Task', 'Status', 'Category', 'Reply', 'Result', 'CreatedAt', 'UpdatedAt']
var STATUSES = ['pending', 'running', 'done', 'failed']
var CATEGORIES = ['task', 'briefing', 'idea', 'quick_action']
var MAX_LIMIT = 100
var MAX_TASK_LENGTH = 5000
// 비서나 사람이 한국어로 적어도 알아듣는다.
var STATUS_ALIASES = {
  대기: 'pending',
  대기중: 'pending',
  '대기 중': 'pending',
  진행: 'running',
  진행중: 'running',
  '진행 중': 'running',
  작업중: 'running',
  '작업 중': 'running',
  완료: 'done',
  끝: 'done',
  실패: 'failed',
  오류: 'failed',
  in_progress: 'running',
  completed: 'done',
  error: 'failed',
}
// 앱 주소. 직접 호스팅했다면 바꾼다.
var APP_URL = 'https://techinpark.github.io/pickle-jar/'

// ── 메뉴 ──────────────────────────────────────────────

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🥒 Pickle Jar')
    .addItem('1. 시트 준비하기', 'setup')
    .addItem('2. 휴대폰 연결하기', 'showConnect')
    .addSeparator()
    .addItem('연결 키 새로 만들기', 'rotateKey')
    .addToUi()
}

/** 시트·머리글·드롭다운·연결 키를 만든다. 여러 번 눌러도 안전하다. */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet()
  var sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME)
  var first = sheet.getRange(1, 1, 1, HEADERS.length)
  if (sheet.getLastRow() === 0 || first.getValues()[0].join('') === '') {
    first.setValues([HEADERS]).setFontWeight('bold')
  }
  sheet.setFrozenRows(1)
  var rows = sheet.getMaxRows() - 1
  sheet
    .getRange(2, col_('Status'), rows, 1)
    .setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true).setAllowInvalid(true).build())
  sheet
    .getRange(2, col_('Category'), rows, 1)
    .setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(CATEGORIES, true).setAllowInvalid(true).build())
  sheet.setColumnWidth(col_('Task'), 320)
  sheet.setColumnWidth(col_('Reply'), 320)
  sheet.setColumnWidth(col_('Result'), 320)
  key_()
  SpreadsheetApp.getUi().alert(
    '시트 준비 완료',
    '이제 오른쪽 위 [배포] → [새 배포] → 유형 "웹 앱"으로 배포하세요.\n' +
      '· 실행 사용자: 나\n· 액세스 권한: 모든 사용자\n\n배포가 끝나면 메뉴의 "2. 휴대폰 연결하기"를 누르세요.',
    SpreadsheetApp.getUi().ButtonSet.OK,
  )
}

/** 앱 연결 링크와 QR 코드를 보여 준다. 키는 링크의 # 뒤에 있어서 앱 서버로 보내지지 않는다. */
function showConnect() {
  var url = ScriptApp.getService().getUrl()
  if (!url) {
    SpreadsheetApp.getUi().alert('아직 웹 앱으로 배포하지 않았어요. [배포] → [새 배포] → "웹 앱"으로 먼저 배포해 주세요.')
    return
  }
  var link = APP_URL + '#connect?u=' + encodeURIComponent(url) + '&k=' + encodeURIComponent(key_())
  var t = HtmlService.createTemplate(
    '<div style="font-family:system-ui,sans-serif;text-align:center">' +
      '<p>휴대폰 카메라로 QR 코드를 찍으면 바로 연결돼요.</p>' +
      '<div id="qr" style="display:inline-block;padding:8px;background:#fff"></div>' +
      '<p style="font-size:12px;color:#666">QR 이 안 되면 아래 링크를 휴대폰으로 보내 여세요.<br>이 링크는 비밀번호와 같아요. 다른 사람에게 보내지 마세요.</p>' +
      '<textarea readonly style="width:100%;height:72px;font-size:11px" onclick="this.select()"><?= link ?></textarea>' +
      '<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>' +
      '<script>new QRCode(document.getElementById("qr"),{text:<?!= JSON.stringify(link) ?>,width:220,height:220})</script>' +
      '</div>',
  )
  t.link = link
  SpreadsheetApp.getUi().showModalDialog(t.evaluate().setWidth(360).setHeight(440), '휴대폰 연결하기')
}

function rotateKey() {
  PropertiesService.getScriptProperties().setProperty('KEY', newKey_())
  SpreadsheetApp.getUi().alert('새 연결 키를 만들었어요. 예전 링크로 연결한 기기는 끊겨요. "2. 휴대폰 연결하기"로 다시 연결하세요.')
}

/** 사람이 시트에서 Status·Reply·Result 를 고치면 UpdatedAt 을 남긴다(스크립트·API 로 고친 건 잡히지 않음). */
function onEdit(e) {
  var sheet = e.range.getSheet()
  if (sheet.getName() !== SHEET_NAME || e.range.getRow() < 2) return
  var c = e.range.getColumn()
  if (c === col_('Status') || c === col_('Reply') || c === col_('Result')) {
    sheet.getRange(e.range.getRow(), col_('UpdatedAt'), e.range.getNumRows(), 1).setValue(new Date())
  }
}

// ── 웹 앱 ────────────────────────────────────────────

function doGet(e) {
  return handle_(e.parameter || {})
}

function doPost(e) {
  var body = {}
  try {
    body = JSON.parse((e.postData && e.postData.contents) || '{}')
  } catch (err) {
    return json_({ ok: false, error: 'bad_request' })
  }
  return handle_(body)
}

function handle_(p) {
  try {
    if (!safeEqual_(String(p.key || ''), key_())) return json_({ ok: false, error: 'unauthorized' })
    if (p.action === 'list') return json_(list_(p))
    if (p.action === 'create') return json_(create_(p))
    if (p.action === 'ping') return json_({ ok: true })
    return json_({ ok: false, error: 'unknown_action' })
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) })
  }
}

function list_(p) {
  var limit = Math.min(Math.max(parseInt(p.limit, 10) || 30, 1), MAX_LIMIT)
  var before = p.beforeId !== undefined && p.beforeId !== '' ? Number(p.beforeId) : Infinity
  var rows = readAll_()
  var older = rows.filter(function (r) {
    return r.Id < before
  })
  older.sort(function (a, b) {
    return b.Id - a.Id
  })
  return { ok: true, list: older.slice(0, limit), total: rows.length, hasMore: older.length > limit }
}

function create_(p) {
  var task = String(p.task || '').trim()
  if (!task) return { ok: false, error: 'empty_task' }
  if (task.length > MAX_TASK_LENGTH) return { ok: false, error: 'too_long' }
  var category = CATEGORIES.indexOf(p.category) >= 0 ? p.category : 'task'
  var lock = LockService.getScriptLock()
  lock.waitLock(10000)
  try {
    var sheet = sheet_()
    var id = maxId_(sheet) + 1
    var now = new Date()
    var row = {}
    row.Id = id
    // 수식으로 해석되지 않게 막는다(=, +, -, @ 로 시작하는 글).
    row.Task = /^[=+\-@]/.test(task) ? "'" + task : task
    row.Status = 'pending'
    row.Category = category
    row.CreatedAt = now
    sheet.appendRow(
      headers_(sheet).map(function (h) {
        return row[h] !== undefined ? row[h] : ''
      }),
    )
    return { ok: true, Id: id }
  } finally {
    lock.releaseLock()
  }
}

// ── 시트 읽기 ─────────────────────────────────────────

/** 모든 행을 객체로 읽는다. 비서가 Id 없이 행을 추가했으면 Id 를 채워 준다. */
function readAll_() {
  var sheet = sheet_()
  var last = sheet.getLastRow()
  if (last < 2) return []
  var heads = headers_(sheet)
  var values = sheet.getRange(2, 1, last - 1, heads.length).getValues()
  var idCol = heads.indexOf('Id')
  var next = 0
  values.forEach(function (v) {
    next = Math.max(next, Number(v[idCol]) || 0)
  })
  var out = []
  values.forEach(function (v, i) {
    var r = {}
    heads.forEach(function (h, j) {
      r[h] = v[j]
    })
    if (String(r.Task || '').trim() === '') return
    if (!(Number(r.Id) > 0)) {
      next += 1
      r.Id = next
      sheet.getRange(i + 2, idCol + 1).setValue(next)
    }
    out.push({
      Id: Number(r.Id),
      Task: String(r.Task),
      Status: status_(r.Status),
      Category: CATEGORIES.indexOf(r.Category) >= 0 ? r.Category : 'task',
      Reply: String(r.Reply || ''),
      Result: String(r.Result || ''),
      CreatedAt: date_(r.CreatedAt),
      UpdatedAt: date_(r.UpdatedAt),
    })
  })
  return out
}

function status_(v) {
  var s = String(v || '')
    .trim()
    .toLowerCase()
  if (STATUSES.indexOf(s) >= 0) return s
  return STATUS_ALIASES[s] || 'pending'
}

function date_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') return v.toISOString()
  if (!v) return null
  var d = new Date(String(v).replace(' ', 'T'))
  return isNaN(d.getTime()) ? null : d.toISOString()
}

function sheet_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME)
  if (!sheet) throw new Error('no_sheet')
  return sheet
}

function headers_(sheet) {
  return sheet
    .getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0]
    .map(function (h) {
      return String(h).trim()
    })
}

function col_(name) {
  return HEADERS.indexOf(name) + 1
}

function maxId_(sheet) {
  var last = sheet.getLastRow()
  if (last < 2) return 0
  var idCol = headers_(sheet).indexOf('Id') + 1
  return sheet
    .getRange(2, idCol, last - 1, 1)
    .getValues()
    .reduce(function (m, v) {
      return Math.max(m, Number(v[0]) || 0)
    }, 0)
}

// ── 연결 키 ──────────────────────────────────────────

function key_() {
  var props = PropertiesService.getScriptProperties()
  var k = props.getProperty('KEY')
  if (!k) {
    k = newKey_()
    props.setProperty('KEY', k)
  }
  return k
}

function newKey_() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '')
}

function safeEqual_(a, b) {
  if (a.length !== b.length) return false
  var diff = 0
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON)
}

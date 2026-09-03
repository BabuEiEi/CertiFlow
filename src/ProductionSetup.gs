/**
 * One-time production provisioning script. Delete this file after running
 * setupProductionEnvironment() and bootstrapProductionAdmin() successfully.
 */
function setupProductionEnvironment() {
  const props = PropertiesService.getScriptProperties();

  // Guard: this function creates a BRAND NEW empty database and repoints the script
  // at it. Running it a second time silently orphans the live data (the old file is
  // still in Drive, but nothing reads it any more), so refuse unless the pointer is
  // genuinely unset. Use repairDatabaseSchema() for schema updates instead.
  const existingDbId = props.getProperty(Config.KEYS.DATABASE_SPREADSHEET_ID);
  if (existingDbId) {
    throw new Error(
      `ระบบมีฐานข้อมูลอยู่แล้ว (DATABASE_SPREADSHEET_ID = ${existingDbId}) ` +
      'setupProductionEnvironment() ใช้สำหรับติดตั้งครั้งแรกเท่านั้น ' +
      'ถ้าต้องการเพิ่มคอลัมน์ใหม่ให้รัน repairDatabaseSchema() แทน'
    );
  }

  // 1. Database spreadsheet
  const ss = SpreadsheetApp.create('CertiFlow Database');
  const defaultSheet = ss.getSheets()[0];
  props.setProperty(Config.KEYS.DATABASE_SPREADSHEET_ID, ss.getId());
  const initResult = SheetService.initializeDatabase();
  ss.deleteSheet(defaultSheet);

  // 2. Temp folder for on-demand PDF/JPEG export cleanup
  const tempFolder = DriveApp.createFolder('CertiFlow Temp Exports');
  props.setProperty(Config.KEYS.TEMP_FOLDER_ID, tempFolder.getId());

  // 3. Use the existing certificate template's current folder as-is
  //    (no file is moved; TEMPLATE_FOLDER_ID is set to wherever it already lives).
  const templateId = '10DalWz23xiwDr0bLQSwSfk6i0AkvnH_NwZO56NOaDZQ';
  const templateFile = DriveApp.getFileById(templateId);
  const parents = templateFile.getParents();
  if (!parents.hasNext()) {
    throw new Error('Template file has no parent folder (it is in a Shared Drive root or similar). Move it into a regular folder first.');
  }
  const templateFolder = parents.next();
  props.setProperty(Config.KEYS.TEMPLATE_FOLDER_ID, templateFolder.getId());

  const templateCheck = TemplateService.validateTemplate(templateId);

  return {
    databaseSpreadsheetUrl: ss.getUrl(),
    tempFolderUrl: tempFolder.getUrl(),
    templateFolderUrl: templateFolder.getUrl(),
    templateId: templateId,
    templateValidation: templateCheck,
    initResult: initResult
  };
}

/**
 * Safe to re-run on an existing database: adds any schema column introduced by a
 * release (e.g. trainingType) to the right of the current data, without creating a
 * new spreadsheet, moving cells, or touching existing rows.
 * Run this once from the Apps Script editor after deploying a release that adds columns.
 * @return {Object} Which sheets existed and which were created
 */
function repairDatabaseSchema() {
  return SheetService.initializeDatabase();
}

/**
 * Recovery step 1 of 2 — list every "CertiFlow Database" spreadsheet in Drive with
 * its row counts, so the one holding the real data can be told apart from an empty
 * one accidentally created by setupProductionEnvironment().
 * Read the result in the Execution log; the entry with real row counts is the one to keep.
 * @return {Array<Object>}
 */
function findCertiFlowDatabases() {
  const currentId = PropertiesService.getScriptProperties().getProperty(Config.KEYS.DATABASE_SPREADSHEET_ID);
  const files = DriveApp.getFilesByName('CertiFlow Database');
  const found = [];

  while (files.hasNext()) {
    const file = files.next();
    const entry = {
      spreadsheetId: file.getId(),
      url: file.getUrl(),
      createdAt: file.getDateCreated().toISOString(),
      lastUpdated: file.getLastUpdated().toISOString(),
      isCurrentlyUsed: file.getId() === currentId,
      rowCounts: {}
    };
    try {
      const ss = SpreadsheetApp.openById(file.getId());
      [Config.SHEETS.ACTIVITIES, Config.SHEETS.PARTICIPANTS, Config.SHEETS.CERTIFICATES, Config.SHEETS.USERS]
        .forEach(name => {
          const sheet = ss.getSheetByName(name);
          entry.rowCounts[name] = sheet ? Math.max(0, sheet.getLastRow() - 1) : 'ไม่มีชีตนี้';
        });
    } catch (e) {
      entry.rowCounts = `เปิดไฟล์ไม่ได้: ${e.message}`;
    }
    found.push(entry);
  }

  Logger.log(JSON.stringify({ currentId, found }, null, 2));
  return found;
}

/**
 * Recovery step 2 of 2 — point the script back at an existing database spreadsheet.
 * EDIT the id below (copy it from findCertiFlowDatabases()) before running.
 * Verifies the target really is a CertiFlow database before switching.
 * @return {Object}
 */
function useDatabaseSpreadsheetNow() {
  const spreadsheetId = 'CHANGE_ME';

  if (spreadsheetId === 'CHANGE_ME') {
    throw new Error('ใส่ spreadsheetId ของฐานข้อมูลที่ต้องการใช้ในฟังก์ชันนี้ก่อนกด Run');
  }
  const ss = SpreadsheetApp.openById(spreadsheetId);
  const missing = Object.keys(Config.HEADERS).filter(name => !ss.getSheetByName(name));
  if (missing.length) {
    throw new Error(`ไฟล์นี้ไม่ใช่ฐานข้อมูล CertiFlow ที่สมบูรณ์ (ขาดชีต: ${missing.join(', ')})`);
  }

  PropertiesService.getScriptProperties().setProperty(Config.KEYS.DATABASE_SPREADSHEET_ID, spreadsheetId);
  const result = { databaseSpreadsheetId: spreadsheetId, url: ss.getUrl(), schemaRepair: SheetService.initializeDatabase() };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

/**
 * EDIT the userId/password/name below directly in this editor before running,
 * then run once. Do not paste real production credentials into chat.
 */
function bootstrapProductionAdmin() {
  const userId = 'CHANGE_ME';
  const password = 'CHANGE_ME_8_TO_128_CHARS';
  const name = 'CHANGE_ME';

  if (userId === 'CHANGE_ME' || password.indexOf('CHANGE_ME') === 0) {
    throw new Error('Edit userId/password/name in this function before running.');
  }
  return AuthService.bootstrapAdmin(userId, password, name);
}

/** Run after `clasp deploy`, with the exec URL copy-pasted from the deployment output. */
function saveProductionWebAppUrl(url) {
  PropertiesService.getScriptProperties().setProperty(Config.KEYS.WEB_APP_URL, url);
  return { saved: url };
}

/** No Run-with-parameters UI in the editor, so hardcode the known production deployment URL. */
function saveProdWebAppUrlNow() {
  const url = 'https://script.google.com/macros/s/AKfycbwlo9LMzEIzq_Aqre6FpvUP0kjNM-WSBIgIjCav6lCQRjadxFmg7hENXo2T4yYlsSOV/exec';
  return saveProductionWebAppUrl(url);
}

function checkProductionTemplate() {
  const templateId = '10DalWz23xiwDr0bLQSwSfk6i0AkvnH_NwZO56NOaDZQ';
  const result = TemplateService.validateTemplate(templateId);
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

/**
 * One-time repair: an earlier version of the Activities form used a native date
 * picker that fed Google Sheets an ISO-looking string (e.g. "2026-09-01").
 * Sheets auto-detected that as a real date and silently converted the cell to
 * a Date type, which then breaks google.script.run's RPC serialization when
 * getActivities() returns it. This finds any startDate/endDate/issueDate cell
 * that is a genuine Date object, rewrites it as a Thai-formatted plain-text
 * string, and forces the cell's number format to text so it can't happen again.
 */
function repairActivityDateCells() {
  const THAI_MONTHS_ = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  const toThaiDate = (d) => `${d.getDate()} ${THAI_MONTHS_[d.getMonth()]} ${d.getFullYear() + 543}`;

  const sheet = SheetService.getSheet(Config.SHEETS.ACTIVITIES);
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2) return { repairedCells: 0, rows: [] };

  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim());
  const dateCols = ['startDate', 'endDate', 'issueDate']
    .map(key => headers.indexOf(key) + 1)
    .filter(col => col > 0);

  const data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  let repairedCells = 0;
  const rows = [];

  dateCols.forEach(col => {
    for (let i = 0; i < data.length; i++) {
      const value = data[i][col - 1];
      if (Object.prototype.toString.call(value) === '[object Date]') {
        const rowNum = i + 2;
        const thaiText = toThaiDate(value);
        const cell = sheet.getRange(rowNum, col);
        cell.setNumberFormat('@').setValue(thaiText);
        repairedCells++;
        rows.push({ row: rowNum, column: headers[col - 1], before: value.toISOString(), after: thaiText });
      }
    }
  });

  Logger.log(JSON.stringify({ repairedCells, rows }, null, 2));
  return { repairedCells, rows };
}

function getProductionEnvInfo() {
  const props = PropertiesService.getScriptProperties();
  const dbId = props.getProperty(Config.KEYS.DATABASE_SPREADSHEET_ID);
  const templateFolderId = props.getProperty(Config.KEYS.TEMPLATE_FOLDER_ID);
  const tempFolderId = props.getProperty(Config.KEYS.TEMP_FOLDER_ID);
  const info = {
    databaseSpreadsheetUrl: dbId ? SpreadsheetApp.openById(dbId).getUrl() : '',
    templateFolderUrl: templateFolderId ? DriveApp.getFolderById(templateFolderId).getUrl() : '',
    tempFolderUrl: tempFolderId ? DriveApp.getFolderById(tempFolderId).getUrl() : '',
    webAppUrl: props.getProperty(Config.KEYS.WEB_APP_URL) || ''
  };
  Logger.log(JSON.stringify(info, null, 2));
  return info;
}

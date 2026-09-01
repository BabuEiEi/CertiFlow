/**
 * One-time provisioning script for the Phase 4 Google Workspace test copy.
 * Not part of the production app; safe to delete after testing is done.
 */
function setupTestEnvironment() {
  const props = PropertiesService.getScriptProperties();

  // 1. Database spreadsheet
  const ss = SpreadsheetApp.create('CertiFlow TEST Database');
  const defaultSheet = ss.getSheets()[0];
  props.setProperty(Config.KEYS.DATABASE_SPREADSHEET_ID, ss.getId());
  const initResult = SheetService.initializeDatabase();
  ss.deleteSheet(defaultSheet);

  // 2. Drive folders for templates & temp exports
  const rootFolder = DriveApp.createFolder('CertiFlow TEST Files');
  const templateFolder = rootFolder.createFolder('Templates');
  const tempFolder = rootFolder.createFolder('Temp');
  props.setProperty(Config.KEYS.TEMPLATE_FOLDER_ID, templateFolder.getId());
  props.setProperty(Config.KEYS.TEMP_FOLDER_ID, tempFolder.getId());

  // 3. Template Google Slides with required placeholders
  const presentation = SlidesApp.create('CertiFlow TEST Template');
  const slide = presentation.getSlides()[0];
  const nameBox = slide.insertTextBox('{{name}}', 100, 150, 400, 50);
  const certNoBox = slide.insertTextBox('{{certNo}}', 100, 250, 400, 50);
  presentation.saveAndClose();
  const templateFile = DriveApp.getFileById(presentation.getId());
  templateFile.moveTo(templateFolder);

  // 4. System settings
  props.setProperty(Config.KEYS.SYSTEM_NAME, 'CertiFlow TEST');
  props.setProperty(Config.KEYS.ORGANIZATION, 'QA Organization');
  props.setProperty(Config.KEYS.DEFAULT_TIMEZONE, 'Asia/Bangkok');

  // 5. Bootstrap admin account (ADMIN/StrongTestPass123!)
  const admin = AuthService.bootstrapAdmin('admin', 'StrongTestPass123!', 'QA Admin');

  return {
    databaseSpreadsheetUrl: ss.getUrl(),
    databaseSpreadsheetId: ss.getId(),
    templateFolderUrl: templateFolder.getUrl(),
    tempFolderUrl: tempFolder.getUrl(),
    templatePresentationId: presentation.getId(),
    templatePresentationUrl: presentation.getUrl(),
    initResult: initResult,
    admin: admin
  };
}

/** Run after deploying the web app to persist its URL for QR/verification links. */
function setWebAppUrl(url) {
  PropertiesService.getScriptProperties().setProperty(Config.KEYS.WEB_APP_URL, url);
  return { saved: url };
}

/** Convenience wrapper: no Run-with-parameters UI in the editor, so hardcode the known test deployment URL. */
function saveTestWebAppUrl() {
  const url = 'https://script.google.com/macros/s/AKfycbxYol57zhYwBIc_65Nt-KlXaStlywsQa8S-EKCttApOe1Rja-q4m4AmfM4QIT1U5fOV/exec';
  return setWebAppUrl(url);
}

/** Reads back what setupTestEnvironment() provisioned, for copy-pasting into chat. */
function getTestEnvInfo() {
  const props = PropertiesService.getScriptProperties();
  const dbId = props.getProperty(Config.KEYS.DATABASE_SPREADSHEET_ID);
  const templateFolderId = props.getProperty(Config.KEYS.TEMPLATE_FOLDER_ID);
  const tempFolderId = props.getProperty(Config.KEYS.TEMP_FOLDER_ID);
  const templateFolder = templateFolderId ? DriveApp.getFolderById(templateFolderId) : null;
  let templatePresentationId = '';
  let templatePresentationUrl = '';
  if (templateFolder) {
    const files = templateFolder.getFilesByType(MimeType.GOOGLE_SLIDES);
    if (files.hasNext()) {
      const f = files.next();
      templatePresentationId = f.getId();
      templatePresentationUrl = f.getUrl();
    }
  }
  const info = {
    databaseSpreadsheetUrl: dbId ? SpreadsheetApp.openById(dbId).getUrl() : '',
    databaseSpreadsheetId: dbId || '',
    templateFolderUrl: templateFolder ? templateFolder.getUrl() : '',
    tempFolderUrl: tempFolderId ? DriveApp.getFolderById(tempFolderId).getUrl() : '',
    templatePresentationId: templatePresentationId,
    templatePresentationUrl: templatePresentationUrl,
    webAppUrl: props.getProperty(Config.KEYS.WEB_APP_URL) || ''
  };
  Logger.log(JSON.stringify(info, null, 2));
  return info;
}

/**
 * Full end-to-end lifecycle test: import -> assign number -> issue ->
 * search -> download -> revoke -> reissue -> verify.
 * Runs server-side as an authenticated ADMIN (no web session needed) and
 * logs a step-by-step report. Throws on the first failed assertion.
 */
function runLifecycleTest() {
  const steps = [];
  const record = (name, ok, detail) => {
    steps.push({ step: name, ok, detail });
    if (!ok) {
      Logger.log(JSON.stringify(steps, null, 2));
      throw new Error(`Lifecycle step FAILED: ${name} — ${JSON.stringify(detail)}`);
    }
  };

  // Simulate an authenticated ADMIN session (server-side run has no web request/token).
  AuthService._requestContext = {
    userId: 'admin', email: 'admin', role: Config.ROLES.ADMIN,
    status: Config.USER_STATUS.ACTIVE, name: 'QA Admin', isPublicUser: false
  };

  const templateFolderId = Config.get(Config.KEYS.TEMPLATE_FOLDER_ID);
  const templateFiles = DriveApp.getFolderById(templateFolderId).getFilesByType(MimeType.GOOGLE_SLIDES);
  if (!templateFiles.hasNext()) throw new Error('Template not found; run setupTestEnvironment() first.');
  const templateId = templateFiles.next().getId();

  // 1. Create activity
  const activity = ActivityService.saveActivity({
    activityName: 'อบรม QA Lifecycle Test',
    organizer: 'ฝ่าย QA',
    issueAgency: 'CertiFlow',
    issueDate: '2569',
    startNumber: 1,
    endNumber: 100,
    digitLength: 4,
    templateId: templateId,
    status: Config.ACTIVITY_STATUS.ACTIVE
  });
  record('createActivity', !!activity.activityId, { activityId: activity.activityId });

  // 2. Import participants
  const importRows = [
    { prefixName: 'นาย', firstName: 'ทดสอบ', lastName: 'หนึ่ง', school: 'ร.ร.QA', participantStatus: 'ผ่านการอบรม' },
    { prefixName: 'นางสาว', firstName: 'ทดสอบ', lastName: 'สอง', school: 'ร.ร.QA', participantStatus: 'ผ่านการอบรม' }
  ];
  const importResult = ParticipantService.commitImport(activity.activityId, importRows, false);
  record('importParticipants', importResult.importedCount === 2, importResult);

  // Duplicate re-import should be rejected without allowOverride
  const dupResult = ParticipantService.commitImport(activity.activityId, importRows, false);
  record('duplicateImportRejected', dupResult.importedCount === 0, dupResult);

  const certs = CertificateService.getCertificates(activity.activityId);
  record('certificatesDrafted', certs.length === 2, { count: certs.length });

  // 3. Assign / issue numbers for both certificates
  const issued = certs.map(c => CertificateService.issueCertificate(c.certificateId));
  const allIssued = issued.every(c => c.certificateStatus === Config.CERT_STATUS.ISSUED && c.certificateNo);
  record('issueCertificates', allIssued, issued.map(c => ({ id: c.certificateId, no: c.certificateNo })));

  // Collision/duplicate number check across the batch
  const numbers = issued.map(c => c.certificateNo);
  const uniqueNumbers = new Set(numbers);
  record('noNumberCollision', uniqueNumbers.size === numbers.length, numbers);

  // 4. Search (public-style call, ISSUED only)
  const searchRes = SearchService.search(activity.activityId, 'ทดสอบ', 1, 10);
  record('searchFindsIssued', searchRes.total === 2, searchRes);

  // 5. Download (export blob generation)
  const targetCertId = issued[0].certificateId;
  const exportResult = ExportService.generateExportBlob(targetCertId, 'pdf');
  record('downloadPdf', !!exportResult.base64 && exportResult.mimeType === 'application/pdf', {
    filename: exportResult.filename, mimeType: exportResult.mimeType
  });

  // 6. Revoke
  const revoked = CertificateService.revokeCertificate(targetCertId, 'QA test revoke');
  record('revokeCertificate', revoked.certificateStatus === Config.CERT_STATUS.REVOKED, revoked);

  // Revoked cert must disappear from public search
  const searchAfterRevoke = SearchService.search(activity.activityId, 'ทดสอบ', 1, 10);
  record('revokedHiddenFromSearch', searchAfterRevoke.total === 1, searchAfterRevoke);

  // 7. Verify (public verify page logic)
  const verifyRevoked = SearchService.verify(targetCertId);
  record('verifyShowsRevoked', verifyRevoked.found === true && verifyRevoked.valid === false, verifyRevoked);

  const verifyIssued = SearchService.verify(issued[1].certificateId);
  record('verifyShowsValid', verifyIssued.valid === true, verifyIssued);

  // 8. Reissue the revoked certificate and confirm it can be issued again with a fresh number
  const reissued = CertificateService.reissueCertificate(targetCertId, 'QA test reissue');
  record('reissueReturnsToDraft', reissued.certificateStatus === Config.CERT_STATUS.DRAFT && !reissued.certificateNo, reissued);

  const reIssuedFinal = CertificateService.issueCertificate(targetCertId);
  record('reissueGetsNewNumber', reIssuedFinal.certificateNo && reIssuedFinal.certificateNo !== numbers[0], {
    oldNo: numbers[0], newNo: reIssuedFinal.certificateNo
  });

  AuthService._requestContext = null;
  Logger.log(JSON.stringify(steps, null, 2));
  return { allPassed: true, steps };
}

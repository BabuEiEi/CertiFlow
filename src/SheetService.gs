/**
 * Google Sheets Database Repository & Batch Service
 */
const SheetService = {
  /**
   * Get main database spreadsheet instance
   * @return {Spreadsheet}
   */
  getSpreadsheet() {
    const spreadsheetId = Config.get(Config.KEYS.DATABASE_SPREADSHEET_ID);
    if (!spreadsheetId) {
      throw new Error('DATABASE_SPREADSHEET_ID is not configured in Script Properties.');
    }
    return SpreadsheetApp.openById(spreadsheetId);
  },

  /**
   * Get specific sheet by name
   * @param {string} sheetName
   * @return {Sheet}
   */
  getSheet(sheetName) {
    const ss = this.getSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      throw new Error(`Sheet '${sheetName}' not found in database.`);
    }
    return sheet;
  },

  /**
   * Initialize database sheets and headers without overwriting existing data.
   * Creates missing sheets, adds header rows, and freezes the top row.
   * @return {Object} Status report of initialization
   */
  initializeDatabase() {
    const ss = this.getSpreadsheet();
    const createdSheets = [];
    const existingSheets = [];

    const sheetNames = Object.keys(Config.HEADERS);

    sheetNames.forEach((sheetName) => {
      const headers = Config.HEADERS[sheetName];
      let sheet = ss.getSheetByName(sheetName);

      if (!sheet) {
        sheet = ss.insertSheet(sheetName);
        sheet.appendRow(headers);
        sheet.setFrozenRows(1);
        createdSheets.push(sheetName);
      } else {
        existingSheets.push(sheetName);
        // Ensure header row is set if sheet is completely empty
        if (sheet.getLastRow() === 0) {
          sheet.appendRow(headers);
          sheet.setFrozenRows(1);
        } else {
          // Add newly introduced schema columns without moving or deleting data.
          const lastColumn = Math.max(sheet.getLastColumn(), 1);
          const existingHeaders = sheet.getRange(1, 1, 1, lastColumn)
            .getValues()[0]
            .map(header => String(header).trim());
          const missingHeaders = headers.filter(header => !existingHeaders.includes(header));
          if (missingHeaders.length > 0) {
            sheet.getRange(1, lastColumn + 1, 1, missingHeaders.length).setValues([missingHeaders]);
          }
        }
      }
    });

    return {
      success: true,
      createdSheets: createdSheets,
      existingSheets: existingSheets
    };
  },

  /**
   * Read all rows from a sheet mapped as objects by header name
   * @param {string} sheetName
   * @return {Array<Object>}
   */
  readRows(sheetName) {
    const sheet = this.getSheet(sheetName);
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();

    if (lastRow < 2 || lastCol < 1) {
      return [];
    }

    const data = sheet.getRange(1, 1, lastRow, lastCol).getValues();
    const headers = data[0].map(h => String(h).trim());
    const rows = [];

    for (let i = 1; i < data.length; i++) {
      const isBlankRow = data[i].every(value => value === '' || value === null);
      if (isBlankRow) continue;
      const rowObj = { _rowIndex: i + 1 };
      headers.forEach((header, colIndex) => {
        rowObj[header] = data[i][colIndex];
      });
      rows.push(rowObj);
    }

    return rows;
  },

  /**
   * Append multiple rows in a single batch operation
   * @param {string} sheetName
   * @param {Array<Array<*>>} rowsData Matrix of values matching header columns
   */
  appendRowsBatch(sheetName, rowsData) {
    if (!rowsData || rowsData.length === 0) return null;
    const sheet = this.getSheet(sheetName);
    const lastRow = sheet.getLastRow();
    const numRows = rowsData.length;
    const numCols = rowsData[0].length;

    sheet.getRange(lastRow + 1, 1, numRows, numCols).setValues(rowsData);
    return { startRow: lastRow + 1, rowCount: numRows, columnCount: numCols };
  },

  /**
   * Delete a precisely identified contiguous range. Intended only for rolling
   * back a batch append while the caller still holds ScriptLock.
   */
  deleteRows(sheetName, startRow, rowCount) {
    if (!rowCount || rowCount < 1) return;
    if (!startRow || startRow < 2) {
      throw new Error('Refusing to delete a header or an unresolved row range.');
    }
    this.getSheet(sheetName).deleteRows(startRow, rowCount);
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SheetService;
}

/**
 * =====================================================================
 * Google Apps Script for IRA Assistant (WHO Initial Risk Assessment)
 * =====================================================================
 * 
 * คุณสมบัติ:
 * 1. บันทึกและเซฟทับประวัติการประเมินความเสี่ยง (Audit Trail)
 * 2. รองรับช่อง "ประเด็น / คำถามที่ต้องการประเมินความเสี่ยง" (Risk_Question) พร้อม Auto-Migration ไม่กระทบข้อมูลเก่า
 * 3. รองรับการลบ Event โดยต้องยืนยันตัวตนด้วย Username & Password
 * 4. สร้างแท็บ "Auth_Users" อัตโนมัติสำหรับเก็บ User/Password (เริ่มต้น user: admin, pass: admin)
 *    และผู้ดูแลระบบสามารถเพิ่มผู้ใช้งานคนอื่น ๆ ในแท็บ Auth_Users ได้โดยตรง
 * 
 * วิธีการติดตั้ง / อัปเดตโค้ด:
 * 1. เปิด Google Sheet ที่ใช้เก็บข้อมูล
 * 2. ไปที่เมนู "Extensions" (ส่วนขยาย) -> "Apps Script"
 * 3. ลบโค้ดเดิมทั้งหมด แล้ววางโค้ดชุดนี้ลงไป
 * 4. กดบันทึก (Ctrl + S)
 * 5. กดปุ่ม "Deploy" (การทำให้ใช้งานได้) -> "Manage deployments" (จัดการการทำให้ใช้งานได้)
 *    หรือ "New deployment"
 * 6. เลือก Version ใหม่ และกด Deploy
 * =====================================================================
 */

/**
 * ดึงหรือสร้างชีตสำหรับจัดเก็บประวัติการประเมิน (Audit_Trail)
 */
function getMainAssessmentSheet(ss) {
  var allSheets = ss.getSheets();
  
  // 1. ตรวจสอบว่ามีชีตชื่อ Audit_Trail ที่มีข้อมูลประวัติอยู่แล้วหรือไม่
  var namedSheet = ss.getSheetByName("Audit_Trail");
  if (namedSheet && namedSheet.getLastRow() > 1) {
    return namedSheet;
  }
  
  // 2. ถ้า Audit_Trail ไม่มีข้อมูล หรือไม่มี ให้ค้นหาชีตอื่นที่มีข้อมูลอยู่แล้ว (เช่น Sheet1, แผ่นงาน1)
  for (var i = 0; i < allSheets.length; i++) {
    var s = allSheets[i];
    if (s.getName() !== "Auth_Users" && s.getLastRow() > 1) {
      return s;
    }
  }

  // 3. ถ้ายังไม่มีชีตใดมีข้อมูลเลย ให้ใช้ Audit_Trail หากมี หรือชีตแรกที่ไม่ใช่ Auth_Users
  var targetSheet = namedSheet;
  if (!targetSheet) {
    for (var j = 0; j < allSheets.length; j++) {
      if (allSheets[j].getName() !== "Auth_Users") {
        targetSheet = allSheets[j];
        break;
      }
    }
  }

  // 4. ถ้าไม่มีชีตใดเลย ให้สร้าง Audit_Trail ขึ้นมาใหม่
  if (!targetSheet) {
    targetSheet = ss.insertSheet("Audit_Trail");
  }

  // สร้าง Header อัตโนมัติหากยังไม่มีข้อมูล (19 คอลัมน์มาตรฐาน)
  if (targetSheet.getLastRow() === 0) {
    var headers = [
      "Assessment_ID",
      "Timestamp",
      "Assessment_Date",
      "Event_Name",
      "Location",
      "Assessor_Name",
      "Clinical_Details",
      "Risk_Question",
      "D1_HighThreat",
      "D2_Exposure",
      "D3_Severity",
      "D4_Spread",
      "D5_Capacity",
      "Risk_Level_TH",
      "Risk_Level_EN",
      "Recommended_Actions",
      "User_Notes",
      "AI_Narrative_Summary",
      "Raw_Payload"
    ];
    targetSheet.appendRow(headers);

    var headerRange = targetSheet.getRange(1, 1, 1, headers.length);
    headerRange.setBackground("#e11d48"); // กรมควบคุมโรค DDC Rose
    headerRange.setFontColor("#ffffff");
    headerRange.setFontWeight("bold");
  } else {
    // สำหรับชีตเดิม: ตรวจสอบและเพิ่มคอลัมน์ Metadata ที่จำเป็นอัตโนมัติ โดยข้อมูลเก่าไม่สูญหาย
    ensureMetadataColumns(targetSheet);
  }

  return targetSheet;
}

/**
 * ตรวจสอบและเพิ่มคอลัมน์ Metadata ที่สำคัญ (Assessment_Date, Clinical_Details, Risk_Question)
 * หากชีตเดิมยังไม่มีคอลัมน์เหล่านี้ ระบบจะต่อท้ายคอลัมน์ให้อัตโนมัติ ป้องกันข้อมูลเดิมขยับหรือเสียหาย
 */
function ensureMetadataColumns(sheet) {
  try {
    var lastCol = sheet.getLastColumn();
    if (lastCol < 1) return;
    var headerRow = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var colTitles = headerRow.map(function (h) { return String(h || "").trim(); });

    var neededCols = ["Assessment_Date", "Clinical_Details", "Risk_Question"];
    for (var i = 0; i < neededCols.length; i++) {
      var colName = neededCols[i];
      if (colTitles.indexOf(colName) === -1) {
        sheet.insertColumnAfter(sheet.getLastColumn());
        var newColIdx = sheet.getLastColumn();
        var cell = sheet.getRange(1, newColIdx);
        cell.setValue(colName);
        cell.setBackground("#e11d48");
        cell.setFontColor("#ffffff");
        cell.setFontWeight("bold");
        colTitles.push(colName);
      }
    }
  } catch (err) {
    Logger.log("ensureMetadataColumns note: " + err);
  }
}

/**
 * ดึงหรือสร้างชีตสำหรับจัดการสิทธิ์ผู้ใช้งาน (Auth_Users)
 * ค่าเริ่มต้น: user: admin / pass: admin
 */
function getOrCreateUserSheet(ss) {
  var userSheet = ss.getSheetByName("Auth_Users");
  if (!userSheet) {
    userSheet = ss.insertSheet("Auth_Users");
    var headers = ["Username", "Password", "Role", "Note", "CreatedAt"];
    userSheet.appendRow(headers);

    var hRange = userSheet.getRange(1, 1, 1, headers.length);
    hRange.setBackground("#334155"); // Slate Dark Header
    hRange.setFontColor("#ffffff");
    hRange.setFontWeight("bold");

    // บัญชีเริ่มต้น: user: admin, pass: admin (สามารถแก้ไขหรือเพิ่มผู้ใช้ได้ในแท็บนี้)
    userSheet.appendRow([
      "admin",
      "admin",
      "Administrator",
      "ผู้ดูแลระบบเริ่มต้น (สามารถเปลี่ยนรหัสผ่าน หรือเพิ่มรายชื่อผู้ใช้ที่อนุญาตให้ลบข้อมูลได้ในแถวถัดไป)",
      new Date().toLocaleString("th-TH")
    ]);
  }
  return userSheet;
}

/**
 * ตรวจสอบความถูกต้องของ Username และ Password จากแท็บ Auth_Users
 */
function verifyCredentials(ss, inputUser, inputPass) {
  if (!inputUser || !inputPass) return false;
  var userSheet = getOrCreateUserSheet(ss);
  var lastRow = userSheet.getLastRow();
  if (lastRow <= 1) return false;

  var data = userSheet.getRange(2, 1, lastRow - 1, 2).getValues();
  var u = String(inputUser).trim().toLowerCase();
  var p = String(inputPass).trim();

  for (var i = 0; i < data.length; i++) {
    var rowUser = String(data[i][0]).trim().toLowerCase();
    var rowPass = String(data[i][1]).trim();
    if (rowUser && rowUser === u && rowPass === p) {
      return true;
    }
  }
  return false;
}

/**
 * ลบแถวเหตุการณ์ตาม ID หรือ Event Name
 */
function deleteEventRow(sheet, targetId, targetEvent) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return false;

  var idValues = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  var eventValues = sheet.getRange(2, 3, lastRow - 1, 1).getValues();

  var tId = targetId ? String(targetId).trim().toLowerCase() : "";
  var tEvent = targetEvent ? String(targetEvent).trim().toLowerCase() : "";

  for (var i = 0; i < idValues.length; i++) {
    var currentId = String(idValues[i][0]).trim().toLowerCase();
    var currentEvent = String(eventValues[i][0]).trim().toLowerCase();

    if (tId && currentId === tId) {
      sheet.deleteRow(i + 2);
      return true;
    }
    if (tEvent && tEvent !== "เหตุการณ์ทั่วไป" && currentEvent === tEvent) {
      sheet.deleteRow(i + 2);
      return true;
    }
  }
  return false;
}

/**
 * คำนวณรหัสถัดไปจาก Google Sheet โดยตรง (Central Auto-Increment)
 * ตรวจสอบแถวทั้งหมดใน Sheet เพื่อหารหัสสูงสุดของปีนั้น ป้องกันรหัสซ้ำข้ามเครื่อง 100%
 */
function getNextAssessmentIdFromSheet(sheet, year) {
  var lastRow = sheet.getLastRow();
  var maxSeq = 0;
  var y = parseInt(year, 10);
  if (isNaN(y)) y = new Date().getFullYear();
  var ceYear = y > 2400 ? (y - 543) : y;
  var beYear = ceYear + 543;
  var regex = new RegExp("^IRA\\s*-\\s*(\\d+)\\s*-\\s*(" + ceYear + "|" + beYear + ")$", "i");
  if (lastRow > 1) {
    var idValues = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < idValues.length; i++) {
      var val = String(idValues[i][0]).trim();
      var match = val.match(regex);
      if (match) {
        var num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxSeq) {
          maxSeq = num;
        }
      }
    }
  }
  var nextSeq = maxSeq + 1;
  var padSeq = nextSeq < 1000 ? ("000" + nextSeq).slice(-3) : String(nextSeq);
  return "IRA-" + padSeq + "-" + ceYear;
}

/**
 * รองรับคำขอผ่าน POST Method
 */
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    // ป้องกันการบันทึกพร้อมกันจากหลายเครื่องในเสี้ยววินาทีเดียวกัน (Concurrency Protection)
    lock.waitLock(10000);

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    getOrCreateUserSheet(ss); // ตรวจสอบแท็บผู้ใช้
    var sheet = getMainAssessmentSheet(ss);

    var rawContent = "";
    if (e && e.postData && e.postData.contents) {
      rawContent = e.postData.contents;
    } else if (e && e.parameter && Object.keys(e.parameter).length > 0) {
      rawContent = JSON.stringify(e.parameter);
    }

    var data = {};
    if (rawContent) {
      try {
        data = JSON.parse(rawContent);
      } catch (parseErr) {
        data = e.parameter || {};
      }
    } else if (e && e.parameter) {
      data = e.parameter;
    }

    // -------------------------------------------------------------
    // กรณีที่ 1: การลบ Event (Action: delete)
    // -------------------------------------------------------------
    if (data.action === "delete") {
      var isAuth = verifyCredentials(ss, data.username, data.password);
      if (!isAuth) {
        return ContentService
          .createTextOutput(JSON.stringify({
            "status": "error",
            "message": "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง (Invalid username or password)"
          }))
          .setMimeType(ContentService.MimeType.JSON);
      }

      var isDeleted = deleteEventRow(sheet, data.id, data.eventName);
      return ContentService
        .createTextOutput(JSON.stringify({
          "status": "success",
          "message": isDeleted ? "ลบข้อมูลเหตุการณ์ #" + data.id + " ใน Google Sheet สำเร็จแล้ว" : "ไม่พบข้อมูลในชีตหรือถูกลบไปแล้ว",
          "id": data.id,
          "deletedInSheet": isDeleted
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // -------------------------------------------------------------
    // กรณีที่ 2: บันทึกข้อมูล หรือ บันทึกทับเหตุการณ์เดิม (Save / Overwrite)
    // -------------------------------------------------------------
    var lastRow = sheet.getLastRow();
    var existingRowIndex = -1;
    var targetId = data.id ? String(data.id).trim().toLowerCase() : "";
    var targetEvent = data.eventName ? String(data.eventName).trim().toLowerCase() : "";

    // ป้องกันการเซฟทับข้ามเครื่องเมื่อบันทึกพร้อมกัน (Multi-User Concurrency Protection)
    // 1. data.isOverwrite === true หรือ data.intendedAction === "overwrite": ผู้ใช้กด "ดู/แก้ไข" เพื่อแก้ไขเคสเดิม
    // 2. data.isOverwrite === false หรือ data.intendedAction === "create": เคสใหม่ ห้ามเซฟทับแถวอื่นเด็ดขาด!
    var allowOverwrite = (data.isOverwrite === true || data.intendedAction === "overwrite");
    var isExplicitNew = (data.isOverwrite === false || data.intendedAction === "create");

    if (!isExplicitNew && lastRow > 1) {
      var idValues = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      var eventValues = sheet.getRange(2, 3, lastRow - 1, 1).getValues();

      for (var i = 0; i < idValues.length; i++) {
        var currentId = String(idValues[i][0]).trim().toLowerCase();
        var currentEvent = String(eventValues[i][0]).trim().toLowerCase();

        // 1. ผู้ใช้ตั้งใจแก้ไขเคสเดิม (allowOverwrite = true) และ Assessment ID ตรงกัน
        if (allowOverwrite && targetId && currentId === targetId) {
          existingRowIndex = i + 2;
          break;
        }

        // 2. ผู้ใช้ตั้งใจแก้ไขเคสเดิม และชื่อเหตุการณ์ตรงกันเป๊ะ (ไม่ใช่เหตุการณ์ทั่วไป)
        if (allowOverwrite && targetEvent && targetEvent !== "เหตุการณ์ทั่วไป" && currentEvent === targetEvent) {
          existingRowIndex = i + 2;
          break;
        }

        // 3. ป้องกันกรณีลูกค้าระบบเก่าที่ไม่ส่ง flag: จะยอมให้เซฟทับได้เฉพาะกรณีทั้ง ID และชื่อเหตุการณ์ตรงกันทั้งคู่เท่านั้น
        if (!isExplicitNew && !allowOverwrite && targetId && currentId === targetId && targetEvent && currentEvent === targetEvent) {
          existingRowIndex = i + 2;
          break;
        }
      }
    }

    // กำหนดปีสำหรับการออกรหัส
    var assessYear = new Date().getFullYear();
    if (data.assessmentDate) {
      var dObj = new Date(data.assessmentDate);
      if (!isNaN(dObj.getFullYear())) assessYear = dObj.getFullYear();
    }

    var finalId = data.id ? String(data.id).trim() : "";
    var idReassigned = false;

    if (existingRowIndex > 1) {
      // บันทึกทับแถวเดิม -> ยึด ID ของแถวเดิม
      var curRowId = sheet.getRange(existingRowIndex, 1).getValue();
      if (curRowId) finalId = String(curRowId).trim();
    } else {
      // เพิ่มแถวใหม่ -> ตรวจสอบว่า ID ที่ส่งมา ซ้ำกับเคสอื่นในชีตหรือไม่ (เช่น ต่างเครื่องสร้าง 001 พร้อมกัน)
      var idAlreadyUsed = false;
      if (finalId && lastRow > 1) {
        var allIds = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
        for (var k = 0; k < allIds.length; k++) {
          if (String(allIds[k][0]).trim().toLowerCase() === finalId.toLowerCase()) {
            idAlreadyUsed = true;
            break;
          }
        }
      }

      // หาก ID ชนกับที่มีอยู่แล้วในชีต ให้ชีตออกรหัสลำดับถัดไปให้อัตโนมัติ ป้องกันการซ้ำกัน 100%
      if (!finalId || idAlreadyUsed) {
        finalId = getNextAssessmentIdFromSheet(sheet, assessYear);
        idReassigned = idAlreadyUsed;
      }
    }

    // สร้าง RowData โดยจับคู่กับ Header ที่มีอยู่จริงใน Sheet (Dynamic Header Mapping ป้องกันตำแหน่งคอลัมน์เพี้ยน)
    var lastCol = Math.max(sheet.getLastColumn(), 1);
    var headerRow = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    
    var valMap = {
      "Assessment_ID": finalId,
      "Timestamp": data.timestamp || new Date().toLocaleString("th-TH"),
      "Assessment_Date": data.assessmentDate || "",
      "Event_Name": data.eventName || "",
      "Location": data.location || "",
      "Assessor_Name": data.assessorName || "",
      "Clinical_Details": data.clinicalDetails || "",
      "Risk_Question": data.riskQuestion || "",
      "D1_HighThreat": data.d1_highThreat || "",
      "D2_Exposure": data.d2_exposure || "",
      "D3_Severity": data.d3_severity || "",
      "D4_Spread": data.d4_spread || "",
      "D5_Capacity": data.d5_capacity || "",
      "Risk_Level_TH": data.riskLevel || "",
      "Risk_Level_EN": data.riskLevelEn || "",
      "Recommended_Actions": data.actions || "",
      "User_Notes": data.userNotes || "",
      "AI_Narrative_Summary": data.aiSummary || "",
      "Raw_Payload": data.rawPayload || ""
    };

    var rowData = [];
    for (var h = 0; h < headerRow.length; h++) {
      var hName = String(headerRow[h] || "").trim();
      rowData.push(valMap.hasOwnProperty(hName) ? valMap[hName] : "");
    }

    if (rowData.length === 0) {
      rowData = [
        finalId,
        data.timestamp || new Date().toLocaleString("th-TH"),
        data.eventName || "",
        data.location || "",
        data.assessorName || "",
        data.riskQuestion || "",
        data.d1_highThreat || "",
        data.d2_exposure || "",
        data.d3_severity || "",
        data.d4_spread || "",
        data.d5_capacity || "",
        data.riskLevel || "",
        data.riskLevelEn || "",
        data.actions || "",
        data.userNotes || "",
        data.aiSummary || "",
        data.rawPayload || ""
      ];
    }

    if (existingRowIndex > 1) {
      // บันทึกทับแถวเดิม
      sheet.getRange(existingRowIndex, 1, 1, rowData.length).setValues([rowData]);
      return ContentService
        .createTextOutput(JSON.stringify({
          "status": "success",
          "action": "overwritten",
          "row": existingRowIndex,
          "id": finalId,
          "message": "Event updated and overwritten successfully on row " + existingRowIndex
        }))
        .setMimeType(ContentService.MimeType.JSON);
    } else {
      // เพิ่มแถวใหม่
      sheet.appendRow(rowData);
      return ContentService
        .createTextOutput(JSON.stringify({
          "status": "success",
          "action": "created",
          "row": sheet.getLastRow(),
          "id": finalId,
          "wasReassigned": idReassigned,
          "message": idReassigned ? "รหัสซ้ำกับเครื่องอื่น จึงออกรหัสใหม่ให้อัตโนมัติเป็น " + finalId : "New event record appended successfully"
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }

  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ "status": "error", "message": error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

/**
 * รองรับคำขอผ่าน GET Method
 * 1. action=delete : ลบข้อมูล
 * 2. action=getEvents : ดึงประวัติทั้งหมดจาก Google Sheet ลงมาซิงก์ที่เว็บ
 * 3. action=getNextId : ขอรหัสถัดไปจาก Google Sheet โดยตรง
 */
function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    getOrCreateUserSheet(ss);

    var params = e.parameter || {};

    // ตรวจสอบการลบผ่าน GET: ?action=delete&id=IRA-xxx&user=admin&pass=admin
    if (params.action === "delete") {
      var isAuth = verifyCredentials(ss, params.user, params.pass);
      if (!isAuth) {
        return ContentService
          .createTextOutput(JSON.stringify({
            "status": "error",
            "message": "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง (Invalid username or password)"
          }))
          .setMimeType(ContentService.MimeType.JSON);
      }

      var sheet = getMainAssessmentSheet(ss);
      var isDeleted = deleteEventRow(sheet, params.id, params.eventName);
      return ContentService
        .createTextOutput(JSON.stringify({
          "status": "success",
          "message": isDeleted ? "ลบข้อมูลเหตุการณ์ #" + params.id + " ใน Google Sheet สำเร็จแล้ว" : "ไม่พบข้อมูลในชีตหรือถูกลบไปแล้ว",
          "id": params.id,
          "deletedInSheet": isDeleted
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // ดึงประวัติทั้งหมดจาก Sheet: ?action=getEvents
    if (params.action === "getEvents") {
      var sheet = getMainAssessmentSheet(ss);
      var lastRow = sheet.getLastRow();
      var records = [];
      if (lastRow > 1) {
        var numCols = Math.min(Math.max(sheet.getLastColumn(), 1), 25);
        var headerRow = sheet.getRange(1, 1, 1, numCols).getValues()[0];
        var colMap = {};
        for (var c = 0; c < headerRow.length; c++) {
          var colTitle = String(headerRow[c] || "").trim();
          if (colTitle) colMap[colTitle] = c;
        }

        var values = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();
        for (var i = 0; i < values.length; i++) {
          var r = values[i];
          var getVal = function(colName, fallbackIdx) {
            if (colMap.hasOwnProperty(colName) && colMap[colName] < r.length) {
              var cellVal = r[colMap[colName]];
              return (cellVal !== undefined && cellVal !== null) ? String(cellVal) : "";
            }
            if (fallbackIdx !== undefined && fallbackIdx < r.length) {
              var fbVal = r[fallbackIdx];
              return (fbVal !== undefined && fbVal !== null) ? String(fbVal) : "";
            }
            return "";
          };

          var rowId = getVal("Assessment_ID", 0).trim();
          var rowEvent = getVal("Event_Name", 2).trim();
          var rawPayloadStr = getVal("Raw_Payload", colMap.hasOwnProperty("Raw_Payload") ? colMap["Raw_Payload"] : (r.length - 1));
          var riskQuestionVal = getVal("Risk_Question");
          var clinicalDetailsVal = getVal("Clinical_Details");
          var assessmentDateVal = getVal("Assessment_Date");

          // หากคอลัมน์ใดว่าง (กรณีเคสเดิมก่อนอัปเดต) ให้ดึงจาก rawPayload
          if (rawPayloadStr) {
            try {
              var parsedRaw = JSON.parse(rawPayloadStr);
              if (parsedRaw) {
                if (!riskQuestionVal && parsedRaw.riskQuestion) riskQuestionVal = String(parsedRaw.riskQuestion);
                if (!clinicalDetailsVal && parsedRaw.clinicalDetails) clinicalDetailsVal = String(parsedRaw.clinicalDetails);
                if (!clinicalDetailsVal && parsedRaw.metadata && parsedRaw.metadata.clinicalDetails) clinicalDetailsVal = String(parsedRaw.metadata.clinicalDetails);
                if (!assessmentDateVal && parsedRaw.assessmentDate) assessmentDateVal = String(parsedRaw.assessmentDate);
                if (!assessmentDateVal && parsedRaw.metadata && parsedRaw.metadata.assessmentDate) assessmentDateVal = String(parsedRaw.metadata.assessmentDate);
              }
            } catch (rawErr) {}
          }

          if (rowId || rowEvent) {
            records.push({
              id: rowId || ("IRA-" + (i + 1 < 1000 ? ("000" + (i + 1)).slice(-3) : String(i + 1)) + "-" + new Date().getFullYear()),
              timestamp: getVal("Timestamp", 1),
              assessmentDate: assessmentDateVal,
              eventName: rowEvent || "เหตุการณ์ประเมิน",
              location: getVal("Location", 3),
              assessorName: getVal("Assessor_Name", 4),
              clinicalDetails: clinicalDetailsVal,
              riskQuestion: riskQuestionVal,
              d1_highThreat: getVal("D1_HighThreat", 6),
              d2_exposure: getVal("D2_Exposure", 7),
              d3_severity: getVal("D3_Severity", 8),
              d4_spread: getVal("D4_Spread", 9),
              d5_capacity: getVal("D5_Capacity", 10),
              riskLevel: getVal("Risk_Level_TH", 11),
              riskLevelEn: getVal("Risk_Level_EN", 12),
              actions: getVal("Recommended_Actions", 13),
              userNotes: getVal("User_Notes", 14),
              aiSummary: getVal("AI_Narrative_Summary", 15),
              rawPayload: rawPayloadStr,
              syncedToSheet: true
            });
          }
        }
      }
      var currentYear = new Date().getFullYear();
      var ceYear = currentYear > 2400 ? (currentYear - 543) : currentYear;
      var sheetNextId = getNextAssessmentIdFromSheet(sheet, ceYear);

      return ContentService
        .createTextOutput(JSON.stringify({
          "status": "success",
          "count": records.length,
          "sheetName": sheet.getName(),
          "events": records,
          "nextId": sheetNextId
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // ขอรหัสถัดไปจาก Sheet โดยตรง: ?action=getNextId&year=2026
    if (params.action === "getNextId") {
      var sheet = getMainAssessmentSheet(ss);
      var reqYear = params.year ? parseInt(params.year, 10) : new Date().getFullYear();
      if (isNaN(reqYear)) reqYear = new Date().getFullYear();
      var reqCeYear = reqYear > 2400 ? (reqYear - 543) : reqYear;
      var nextId = getNextAssessmentIdFromSheet(sheet, reqCeYear);
      return ContentService
        .createTextOutput(JSON.stringify({
          "status": "success",
          "year": reqCeYear,
          "nextId": nextId
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // ทดสอบการเชื่อมต่อปกติ
    return ContentService
      .createTextOutput(JSON.stringify({
        "status": "success",
        "message": "IRA Assistant Webhook is Active and Ready!",
        "hasUserSheet": true
      }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ "status": "error", "message": error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

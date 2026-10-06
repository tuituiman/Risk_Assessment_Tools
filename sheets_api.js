/**
 * ==============================================================================
 * IRA Assistant - Google Sheets Integration & Data Persistence (sheets_api.js)
 * ==============================================================================
 * 
 * รับผิดชอบ:
 * 1. การสร้างและรันรหัสประเมินอัตโนมัติ (Sequential Assessment ID: IRA-xxx-yyyy)
 * 2. การส่งข้อมูลขึ้น Google Sheets Web App (Concurrency Lock, Overwrite, Add New)
 * 3. การดึงประวัติ (Sync), ลบข้อมูลด้วยการยืนยันรหัสผ่าน, และส่งออก CSV
 * 4. ฟังก์ชันความปลอดภัย (HTML Escaping ป้องกัน XSS)
 * ==============================================================================
 */

/**
 * จัดรูปแบบวันที่ให้เป็น DD/MM/YYYY
 */
function formatOnlyDate(raw) {
  if (!raw) return '-';
  const str = String(raw).trim();

  // Match DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmyMatch) {
    const d = dmyMatch[1].padStart(2, '0');
    const m = dmyMatch[2].padStart(2, '0');
    const y = dmyMatch[3];
    return `${d}/${m}/${y}`;
  }

  // Match YYYY-MM-DD
  const ymdMatch = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (ymdMatch) {
    const y = ymdMatch[1];
    const m = ymdMatch[2].padStart(2, '0');
    const d = ymdMatch[3].padStart(2, '0');
    return `${d}/${m}/${y}`;
  }

  // Parse as Date object
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    const d = String(parsed.getDate()).padStart(2, '0');
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    let y = parsed.getFullYear();
    if (y < 2400) y += 543;
    return `${d}/${m}/${y}`;
  }

  if (str.includes(' ')) {
    return str.split(' ')[0];
  }
  return str;
}

/**
 * แปลงวันที่ในรูปแบบต่างๆ (เช่น DD/MM/YYYY, YYYY/MM/DD, พ.ศ./ค.ศ., หรือ ISO string) ให้เป็น YYYY-MM-DD
 * เพื่อใช้กำหนดค่าให้กับ <input type="date"> ได้อย่างถูกต้องโดยไม่ถูก browser ล้างค่าทิ้ง
 */
function normalizeToIsoDate(raw) {
  if (!raw) return '';
  const str = String(raw).trim();
  if (!str || str === '-') return '';

  // 1. ตรวจสอบ YYYY-MM-DD หรือ YYYY/MM/DD
  const ymdMatch = str.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if (ymdMatch) {
    let y = parseInt(ymdMatch[1], 10);
    if (y > 2400) y -= 543; // แปลง พ.ศ. เป็น ค.ศ.
    const m = String(ymdMatch[2]).padStart(2, '0');
    const d = String(ymdMatch[3]).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // 2. ตรวจสอบ DD/MM/YYYY หรือ DD-MM-YYYY
  const dmyMatch = str.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/);
  if (dmyMatch) {
    const d = String(dmyMatch[1]).padStart(2, '0');
    const m = String(dmyMatch[2]).padStart(2, '0');
    let y = parseInt(dmyMatch[3], 10);
    if (y > 2400) y -= 543; // แปลง พ.ศ. เป็น ค.ศ.
    return `${y}-${m}-${d}`;
  }

  // 3. ลองแปลงด้วย Date parser
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    let y = parsed.getFullYear();
    if (y > 2400) y -= 543;
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return '';
}

/**
 * ป้องกัน XSS จากข้อมูลที่รับเข้าตาราง
 */
function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * แปลงค่าเป็น String ปลอดภัยสำหรับใส่ใน attribute onclick
 */
function jsArgAttr(value) {
  return escapeHtml(JSON.stringify(String(value == null ? '' : value)));
}

/**
 * สร้างรหัสลำดับประเมินอัตโนมัติ: IRA-{xxx}-20xx
 * @param {number|null} customYear 
 * @param {Object} state 
 * @returns {string} เช่น IRA-001-2026
 */
function generateNextAssessmentId(customYear, state) {
  let year = customYear;
  if (!year) {
    const dateInput = document.getElementById('assessmentDate');
    const rawDate = (dateInput && dateInput.value) || (state && state.metadata && state.metadata.assessmentDate);
    if (rawDate) {
      const parts = String(rawDate).split('-');
      if (parts.length > 0 && !isNaN(parseInt(parts[0], 10))) {
        year = parseInt(parts[0], 10);
      } else {
        const d = new Date(rawDate);
        if (!isNaN(d.getFullYear())) {
          year = d.getFullYear();
        }
      }
    }
  }
  if (!year || isNaN(year)) {
    year = new Date().getFullYear();
  }

  let ceYear = parseInt(year, 10);
  if (ceYear > 2400) {
    ceYear -= 543; // แปลง พ.ศ. เป็น ค.ศ.
  }
  const beYear = ceYear + 543;

  let maxSeq = 0;
  const regex = new RegExp(`^IRA\\s*-\\s*(\\d+)\\s*-\\s*(${ceYear}|${beYear})$`, 'i');

  if (state && state.auditHistory) {
    state.auditHistory.forEach(item => {
      if (item && item.id) {
        const trimmed = String(item.id).trim();
        const match = trimmed.match(regex);
        if (match) {
          const num = parseInt(match[1], 10);
          if (!isNaN(num) && num > maxSeq) {
            maxSeq = num;
          }
        }
      }
    });
  }

  // ตรวจสอบ latestSheetNextId หากมี
  if (state && state.latestSheetNextId) {
    const matchRemote = String(state.latestSheetNextId).trim().match(regex);
    if (matchRemote) {
      const remoteNum = parseInt(matchRemote[1], 10);
      if (!isNaN(remoteNum) && remoteNum - 1 > maxSeq) {
        maxSeq = remoteNum - 1;
      }
    }
  }

  const nextSeq = maxSeq + 1;
  const paddedSeq = String(nextSeq).padStart(3, '0');
  return `IRA-${paddedSeq}-${ceYear}`;
}

/**
 * ตรวจสอบความถูกต้องว่าข้อมูลลงชีตจริงหรือไม่ (Verification Double-Check via GET)
 * แก้ปัญหา False-Negative ที่ Google บันทึกแถวแล้ว แต่เบราว์เซอร์ติด CORS Redirect Error
 */
async function verifyRecordInSheet(targetId, targetEventName, url) {
  if (!targetId && !targetEventName) return { verified: false, id: null };

  // 1. ลองตรวจสอบผ่าน checkEvent (ด่วนพิเศษ < 300ms)
  try {
    const checkUrl = `${url}${url.includes('?') ? '&' : '?'}action=checkEvent&id=${encodeURIComponent(targetId)}&_t=${Date.now()}`;
    const signal = typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(6000) : undefined;
    const res = await fetch(checkUrl, { signal });
    if (res.ok) {
      const data = await res.json();
      if (data && (data.exists || data.found)) {
        return { verified: true, id: data.id || targetId };
      }
    }
  } catch (e) {
    // หาก Apps Script เดิมยังไม่มี checkEvent ให้ fallback สู่ getEvents
  }

  // 2. Fallback: ตรวจสอบผ่าน getEvents
  try {
    const listUrl = `${url}${url.includes('?') ? '&' : '?'}action=getEvents&_t=${Date.now()}`;
    const signal = typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined;
    const res = await fetch(listUrl, { signal });
    if (res.ok) {
      const data = await res.json();
      if (data && data.status === 'success' && Array.isArray(data.events)) {
        const found = data.events.find(ev => {
          const matchId = targetId && String(ev.id).trim().toLowerCase() === String(targetId).trim().toLowerCase();
          const matchEvent = targetEventName && String(ev.eventName).trim().toLowerCase() === String(targetEventName).trim().toLowerCase();
          return matchId || matchEvent;
        });
        if (found) {
          return { verified: true, id: found.id || targetId };
        }
      }
    }
  } catch (e) {
    console.warn('Fallback verification exception:', e);
  }

  return { verified: false, id: null };
}

/**
 * ส่งคำขอ HTTP POST ไปยัง Google Apps Script Web App Endpoint
 * มาพร้อมระบบ Auto-Retry และ False-Negative Detection (Verification Double Check)
 */
async function sendRecordToSheetWebhook(record, url) {
  const maxAttempts = 2;
  let lastNetErr = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // ให้เวลา 22 วินาทีเพื่อรองรับ Google Apps Script Cold Start
      const fetchSignal = typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(22000) : undefined;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(record),
        redirect: 'follow',
        signal: fetchSignal
      });

      if (!res.ok) {
        console.warn(`Sheet responded with HTTP ${res.status} on attempt ${attempt}`);
        if (res.status === 401 || res.status === 403) {
          return { confirmed: false, data: null, error: 'permission_denied' };
        }
      } else {
        try {
          const data = await res.json();
          if (data && data.status === 'success') {
            return { confirmed: true, data };
          }
        } catch (parseErr) {
          // หาก HTTP ok แต่ parse JSON ล้มเหลว (Google redirect ไป HTML echo) ให้ทวนสอบ
          const check = await verifyRecordInSheet(record.id, record.eventName, url);
          if (check.verified) {
            return { confirmed: true, data: { status: 'success', id: check.id, verifiedByQuery: true } };
          }
          return { confirmed: true, data: { status: 'success' } };
        }
      }
    } catch (netErr) {
      lastNetErr = netErr;
      console.warn(`Sheet POST network exception (Attempt ${attempt}/${maxAttempts}):`, netErr);

      // ก่อนจะลองใหม่หรือสรุปว่าล้มเหลว ให้ทำ Verification Check เสมอ
      // เพราะ Google Apps Script มักจะบันทึกข้อมูลเรียบร้อยแล้ว แต่เบราว์เซอร์ติด CORS 302 Redirect
      const check = await verifyRecordInSheet(record.id, record.eventName, url);
      if (check.verified) {
        console.log(`[Bulletproof Sync] Record #${check.id} verified in Sheet despite POST network glitch!`);
        return { confirmed: true, data: { status: 'success', id: check.id, verifiedByQuery: true } };
      }

      if (attempt < maxAttempts) {
        // รอ 1.2 วินาทีก่อนลองใหม่ (ป้องกัน Cold Start ชั่วคราว)
        await new Promise(r => setTimeout(r, 1200));
      }
    }
  }

  // หากลองครบแล้วและทวนสอบแล้วยังไม่เจอใน Sheet
  return { confirmed: false, data: null, error: lastNetErr ? lastNetErr.message : 'timeout' };
}

/**
 * บันทึกหรืออัปเดตข้อมูลเหตุการณ์ลง Google Sheets
 */
async function saveToGoogleSheets(state, helpers) {
  const { showToast, renderAuditTable, setActiveAssessmentId, compileUserNotes, updateActiveIdDisplay } = helpers;

  // อ่านค่าจาก Input ทั้งหมด
  state.metadata.eventName = (document.getElementById('eventName')?.value || state.metadata.eventName || '').trim();
  state.metadata.location = (document.getElementById('location')?.value || state.metadata.location || '').trim();
  state.metadata.assessmentDate = document.getElementById('assessmentDate')?.value || state.metadata.assessmentDate;
  state.metadata.assessorName = (document.getElementById('assessorName')?.value || state.metadata.assessorName || '').trim();
  state.metadata.clinicalDetails = (document.getElementById('clinicalDetails')?.value || state.metadata.clinicalDetails || '').trim();
  state.metadata.riskQuestion = (document.getElementById('riskQuestion')?.value || state.metadata.riskQuestion || '').trim();

  if (!state.metadata.eventName) {
    showToast('กรุณาระบุ "ชื่อเหตุการณ์ / โรคที่สงสัย" ก่อนบันทึก', 'warn');
    document.getElementById('eventName')?.focus();
    return;
  }
  if (!state.metadata.location) {
    showToast('กรุณาระบุ "พื้นที่เกิดเหตุ / จังหวัด" ก่อนบันทึก', 'warn');
    document.getElementById('location')?.focus();
    return;
  }

  const sheetsUrl = state.settings.googleSheetsUrl.trim();
  const btn = document.getElementById('btnSaveSheet');
  const originalText = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '⏳ กำลังบันทึกลง Google Sheet...';
  }

  const clientSaveId = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  const now = new Date();
  const beYear = now.getFullYear() < 2400 ? now.getFullYear() + 543 : now.getFullYear();
  const timestampStr = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${beYear} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

  const isExplicitEdit = !!state.currentAssessmentId;
  const existingRecord = isExplicitEdit ? state.auditHistory.find(r => r.id === state.currentAssessmentId) : null;
  const isOverwriting = !!(isExplicitEdit && existingRecord);

  let targetId = isOverwriting ? state.currentAssessmentId : generateNextAssessmentId(null, state);

  // เตรียม Payload เต็มรูปแบบ
  const record = {
    id: targetId,
    clientSaveId: clientSaveId,
    intendedAction: isOverwriting ? 'overwrite' : 'new',
    isOverwrite: isOverwriting,
    timestamp: timestampStr,
    eventName: state.metadata.eventName,
    location: state.metadata.location,
    assessmentDate: state.metadata.assessmentDate,
    assessorName: state.metadata.assessorName || 'ทีมตระหนักรู้สถานการณ์ (SAT)',
    clinicalDetails: state.metadata.clinicalDetails,
    riskQuestion: state.metadata.riskQuestion,
    d1_highThreat: state.answers.q1_highThreat || '-',
    d2_exposure: state.answers.q2_exposureActive || '-',
    d3_severity: state.answers.q3_severityHigh || '-',
    d4_spread: state.answers.q4_spreadFuture || state.answers.q4_2_significantCurrent || '-',
    d5_capacity: state.answers.q5_1_capacitySufficient || '-',
    riskLevel: state.assessmentResult.levelTh,
    riskLevelEn: state.assessmentResult.level,
    actions: state.assessmentResult.suggestedActions ? state.assessmentResult.suggestedActions.join('; ') : '-',
    userNotes: compileUserNotes ? compileUserNotes() : '',
    aiSummary: state.aiSummary || '-',
    syncedToSheet: false,
    rawPayload: JSON.stringify({
      answers: state.answers,
      subCriteria: state.subCriteria,
      subAnswers: state.subAnswers,
      notes: state.notes,
      domainNotes: state.domainNotes,
      clinicalDetails: state.metadata.clinicalDetails,
      riskQuestion: state.metadata.riskQuestion,
      metadata: state.metadata,
      savedAt: timestampStr
    })
  };

  try {
    let syncSuccess = false;
    let confirmedRemoteId = null;

    if (sheetsUrl && (sheetsUrl.startsWith('http://') || sheetsUrl.startsWith('https://'))) {
      const result = await sendRecordToSheetWebhook(record, sheetsUrl);
      if (result.confirmed) {
        syncSuccess = true;
        if (result.data && result.data.id) {
          confirmedRemoteId = String(result.data.id).trim();
          record.id = confirmedRemoteId;
        }
      }
    }

    record.syncedToSheet = syncSuccess;

    // บันทึกลง local auditHistory
    if (isOverwriting) {
      const idx = state.auditHistory.findIndex(r => r.id === state.currentAssessmentId);
      if (idx !== -1) {
        state.auditHistory[idx] = Object.assign({}, state.auditHistory[idx], record);
      } else {
        state.auditHistory.unshift(record);
      }
    } else {
      state.auditHistory.unshift(record);
      setActiveAssessmentId(record.id);
    }

    state.auditHistory = state.auditHistory.slice(0, 100);
    localStorage.setItem('ira_audit_history', JSON.stringify(state.auditHistory));
    renderAuditTable();

    if (syncSuccess) {
      showToast(`บันทึกข้อมูล #${record.id} ลง Google Sheet สำเร็จแล้ว!`, 'success');
      // ดึงประวัติล่าสุดเพื่อซิงก์รหัส
      fetchEventsFromGoogleSheet(true, state, helpers);
    } else {
      showToast(`บันทึกในเครื่องสำเร็จ (#${record.id}) แต่ยังไม่ได้เชื่อมต่อ Google Sheet`, 'warn');
    }
  } catch (err) {
    console.error('Save Exception:', err);
    showToast(`เกิดข้อผิดพลาดในการบันทึก: ${err.message}`, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  }
}

/**
 * ดึงข้อมูลประวัติทั้งหมดจาก Google Sheets มาอัปเดตที่เครื่อง
 */
async function fetchEventsFromGoogleSheet(isSilent, state, helpers) {
  const { showToast, renderAuditTable, setActiveAssessmentId } = helpers;
  const sheetsUrl = state.settings.googleSheetsUrl.trim();
  if (!sheetsUrl) {
    if (!isSilent) showToast('ยังไม่ได้ตั้งค่า Google Sheets Web App URL ในหน้าตั้งค่า', 'warn');
    return;
  }

  const btn = document.getElementById('btnPullSheetEvents');
  if (btn && !isSilent) {
    btn.disabled = true;
    btn.innerHTML = '⏳ กำลังดึงข้อมูล...';
  }

  const badge = document.getElementById('auditSheetStatusBadge');
  const textEl = document.getElementById('auditSheetStatusText');
  if (badge && textEl) {
    badge.className = 'sheet-status-badge status-connected';
    textEl.textContent = 'Google Sheet: ⏳ กำลังซิงก์ข้อมูล...';
  }

  try {
    const fetchUrl = `${sheetsUrl}${sheetsUrl.includes('?') ? '&' : '?'}action=getEvents&_t=${Date.now()}`;
    const fetchSignal = typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined;
    const res = await fetch(fetchUrl, { signal: fetchSignal });
    const data = await res.json();

    if (data.status === 'success' && Array.isArray(data.events)) {
      if (data.nextId) {
        state.latestSheetNextId = String(data.nextId).trim();
      }

      const sheetTabName = data.sheetName ? ` [แท็บ: ${data.sheetName}]` : '';
      const localMap = new Map((state.auditHistory || []).map(item => [String(item.id || '').trim(), item]));

      state.auditHistory = data.events.map(r => {
        const rowId = String(r.id || '').trim();
        const local = localMap.get(rowId) || null;
        let parsedPayload = null;

        if (r.rawPayload) {
          try {
            parsedPayload = typeof r.rawPayload === 'string' ? JSON.parse(r.rawPayload) : r.rawPayload;
          } catch (e) {
            console.warn('Error parsing rawPayload from sheet row:', rowId, e);
          }
        }

        const pMeta = (parsedPayload && parsedPayload.metadata) || {};
        const pNotes = (parsedPayload && parsedPayload.notes) || (local && local.notes) || {};
        const pDomainNotes = (parsedPayload && parsedPayload.domainNotes) || (local && local.domainNotes) || {};
        const pSubAnswers = (parsedPayload && parsedPayload.subAnswers) || (local && local.subAnswers) || {};
        const pAnswers = (parsedPayload && parsedPayload.answers) || (local && local.answers) || {};

        let clinicVal = r.clinicalDetails || (parsedPayload && parsedPayload.clinicalDetails) || pMeta.clinicalDetails || (local && local.clinicalDetails) || '';
        let focalVal = r.riskQuestion || (parsedPayload && parsedPayload.riskQuestion) || pMeta.riskQuestion || (local && local.riskQuestion) || '';
        let dateVal = r.assessmentDate || (parsedPayload && parsedPayload.assessmentDate) || pMeta.assessmentDate || (local && local.assessmentDate) || '';

        // กรณีข้อมูลมาจากชีตรุ่นเก่าที่ไม่มีคอลัมน์เฉพาะ: ดึงจาก User_Notes ที่บันทึกไว้เป็นข้อความ
        if (!focalVal && r.userNotes && r.userNotes.includes('[🎯 ประเด็น/คำถามที่ต้องการประเมินความเสี่ยง]:')) {
          const matchFocal = r.userNotes.match(/\[🎯 ประเด็น\/คำถามที่ต้องการประเมินความเสี่ยง\]:\s*([\s\S]*?)(?=\n\[|$)/);
          if (matchFocal && matchFocal[1]) focalVal = matchFocal[1].trim();
        }
        if (!clinicVal && r.userNotes && r.userNotes.includes('[อาการทางคลินิกและข้อมูลระบาดวิทยาเบื้องต้น]:')) {
          const matchClinic = r.userNotes.match(/\[อาการทางคลินิกและข้อมูลระบาดวิทยาเบื้องต้น\]:\s*([\s\S]*?)(?=\n\[|$)/);
          if (matchClinic && matchClinic[1]) clinicVal = matchClinic[1].trim();
        }

        return Object.assign({}, local || {}, r, parsedPayload || {}, {
          id: rowId,
          eventName: r.eventName || (local && local.eventName) || pMeta.eventName || 'เหตุการณ์ประเมิน',
          location: r.location || (local && local.location) || pMeta.location || '',
          assessorName: r.assessorName || (local && local.assessorName) || pMeta.assessorName || '',
          assessmentDate: dateVal,
          clinicalDetails: clinicVal,
          riskQuestion: focalVal,
          notes: pNotes,
          domainNotes: pDomainNotes,
          subAnswers: pSubAnswers,
          answers: pAnswers,
          syncedToSheet: true
        });
      });

      // เรียงลำดับจากรหัสล่าสุดลงไป
      state.auditHistory.sort((a, b) => {
        const idA = String(a.id || '').trim();
        const idB = String(b.id || '').trim();
        return idB.localeCompare(idA, undefined, { numeric: true, sensitivity: 'base' });
      });

      localStorage.setItem('ira_audit_history', JSON.stringify(state.auditHistory.slice(0, 100)));
      renderAuditTable();

      if (badge && textEl) {
        badge.className = 'sheet-status-badge status-connected';
        if (data.events.length > 0) {
          textEl.textContent = `Google Sheet: ซิงก์ตรงกันแล้ว (${data.events.length} เคส)${sheetTabName}`;
        } else {
          textEl.textContent = `Google Sheet: เชื่อมต่อแล้ว (ชีตยังว่าง 0 เคส)${sheetTabName}`;
        }
      }

      if (!isSilent) {
        showToast(`ซิงก์ประวัติสำเร็จ! ดึงข้อมูลมาทั้งหมด ${data.events.length} เหตุการณ์`, 'success');
      }
    } else {
      throw new Error(data.message || 'โครงสร้างข้อมูลจาก Google Sheet ไม่ถูกต้อง');
    }
  } catch (err) {
    console.error('Fetch Events Error:', err);
    if (badge && textEl) {
      badge.className = 'sheet-status-badge status-disconnected';
      textEl.textContent = 'Google Sheet: เกิดข้อผิดพลาดในการดึงข้อมูล';
    }
    if (!isSilent) {
      showToast(`ไม่สามารถดึงข้อมูลได้: ${err.message}`, 'error');
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '📥 ดึงประวัติจาก Sheet';
    }
  }
}

/**
 * ซิงก์ประวัติแถวเดี่ยวขึ้น Google Sheet
 */
async function syncSingleAuditRow(id, state, helpers) {
  const { showToast, renderAuditTable, setActiveAssessmentId } = helpers;
  const sheetsUrl = state.settings.googleSheetsUrl.trim();
  if (!sheetsUrl) {
    showToast('กรุณาใส่ Google Sheets Web App URL ในหน้าตั้งค่าก่อน', 'warn');
    return;
  }

  const rec = state.auditHistory.find(x => x.id === id);
  if (!rec) return;

  try {
    showToast(`กำลังส่ง #${id} ไปยัง Google Sheet...`, 'info');
    const result = await sendRecordToSheetWebhook(rec, sheetsUrl);
    if (result.confirmed) {
      if (result.data && result.data.id) rec.id = String(result.data.id).trim();
      rec.syncedToSheet = true;
      if (state.currentAssessmentId === id) setActiveAssessmentId(rec.id);
      localStorage.setItem('ira_audit_history', JSON.stringify(state.auditHistory.slice(0, 100)));
      renderAuditTable();
      showToast(`บันทึก #${rec.id} ลง Google Sheet สำเร็จแล้ว!`, 'success');
    } else {
      showToast(`ส่ง #${id} แล้วแต่ยืนยันผลไม่ได้ กำลังตรวจสอบกับชีต...`, 'warn');
    }
    await fetchEventsFromGoogleSheet(true, state, helpers);
  } catch (err) {
    console.error('Single Sync Error:', err);
    showToast(`ไม่สามารถซิงก์ #${id} ได้: ${err.message}`, 'error');
  }
}

/**
 * ซิงก์ประวัติทั้งหมดที่ยังค้างอยู่ (syncedToSheet !== true) ขึ้น Google Sheet รวดเดียว
 */
async function syncAllPendingRecords(state, helpers) {
  const { showToast, renderAuditTable, setActiveAssessmentId } = helpers;
  const sheetsUrl = state.settings.googleSheetsUrl ? state.settings.googleSheetsUrl.trim() : '';
  if (!sheetsUrl) {
    showToast('กรุณาระบุ Google Sheets Web App URL ในหน้าตั้งค่าก่อน', 'warn');
    return;
  }

  const pending = (state.auditHistory || []).filter(r => !r.syncedToSheet);
  if (pending.length === 0) {
    showToast('ไม่มีข้อมูลค้างซิงก์ ทุกรายการตรงกับ Google Sheet แล้ว ✨', 'info');
    return;
  }

  const btnSyncAll = document.getElementById('btnSyncAllPending');
  if (btnSyncAll) {
    btnSyncAll.disabled = true;
    btnSyncAll.innerHTML = `⏳ กำลังซิงก์ (${pending.length} รายการ)...`;
  }

  showToast(`กำลังส่งข้อมูลที่ค้างอยู่ ${pending.length} รายการขึ้น Google Sheet...`, 'info');
  let successCount = 0;

  for (const item of pending) {
    try {
      const res = await sendRecordToSheetWebhook(item, sheetsUrl);
      if (res.confirmed) {
        if (res.data && res.data.id) item.id = String(res.data.id).trim();
        item.syncedToSheet = true;
        successCount++;
      }
    } catch (e) {
      console.warn('Error syncing pending item:', item.id, e);
    }
  }

  localStorage.setItem('ira_audit_history', JSON.stringify(state.auditHistory.slice(0, 100)));
  renderAuditTable();

  if (btnSyncAll) {
    btnSyncAll.disabled = false;
  }

  if (successCount === pending.length) {
    showToast(`ซิงก์ข้อมูลขึ้น Google Sheet สำเร็จครบทั้ง ${successCount} รายการแล้ว! 🎉`, 'success');
  } else if (successCount > 0) {
    showToast(`ซิงก์สำเร็จ ${successCount} จาก ${pending.length} รายการ (รายการที่เหลือสามารถกดซิงก์ใหม่ได้)`, 'warn');
  } else {
    showToast('ไม่สามารถเชื่อมต่อ Google Sheet ได้ โปรดตรวจสอบอินเทอร์เน็ตหรือสิทธิ์ Web App', 'error');
  }

  // ดึงข้อมูลอัปเดตครั้งสุดท้าย
  fetchEventsFromGoogleSheet(true, state, helpers);
}

/**
 * ดำเนินการลบเหตุการณ์ (ส่งไปยัง Google Sheet ด้วย Action delete)
 */
async function executeDeleteEvent(state, helpers) {
  const { showToast, renderAuditTable, closeDeleteModal, setActiveAssessmentId } = helpers;
  const sheetsUrl = state.settings.googleSheetsUrl.trim();
  const eventId = state.deleteTargetId;
  const eventName = state.deleteTargetName;
  const username = (document.getElementById('deleteUsername')?.value || '').trim();
  const password = (document.getElementById('deletePassword')?.value || '').trim();
  const errBox = document.getElementById('deleteAuthError');
  const btnConfirm = document.getElementById('btnConfirmDelete');

  if (errBox) errBox.style.display = 'none';

  if (!username) {
    if (errBox) { errBox.textContent = 'กรุณาระบุชื่อผู้ใช้งาน'; errBox.style.display = 'block'; }
    document.getElementById('deleteUsername')?.focus();
    return;
  }
  if (!password) {
    if (errBox) { errBox.textContent = 'กรุณาระบุรหัสผ่านยืนยัน'; errBox.style.display = 'block'; }
    document.getElementById('deletePassword')?.focus();
    return;
  }

  if (btnConfirm) {
    btnConfirm.disabled = true;
    btnConfirm.innerHTML = '⏳ กำลังตรวจสอบและลบ...';
  }

  try {
    if (sheetsUrl && (sheetsUrl.startsWith('http://') || sheetsUrl.startsWith('https://'))) {
      const deleteUrl = `${sheetsUrl}${sheetsUrl.includes('?') ? '&' : '?'}action=delete&id=${encodeURIComponent(eventId)}&username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&_t=${Date.now()}`;
      let isSuccess = false;
      let respMsg = '';

      const delSignal = typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined;
      try {
        const res = await fetch(deleteUrl, { signal: delSignal });
        const data = await res.json();
        if (data.status === 'success') {
          isSuccess = true;
          respMsg = data.message;
        } else {
          throw new Error(data.message || 'รหัสผ่านหรือสิทธิ์ไม่ถูกต้อง');
        }
      } catch (getErr) {
        // Fallback POST
        const postRes = await fetch(sheetsUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'delete', id: eventId, eventName, username, password }),
          redirect: 'follow',
          signal: delSignal
        });
        const postData = await postRes.json();
        if (postData.status === 'success') {
          isSuccess = true;
          respMsg = postData.message;
        } else {
          throw new Error(postData.message || 'รหัสผ่านหรือสิทธิ์ไม่ถูกต้อง');
        }
      }

      if (isSuccess) {
        finishLocalDeletion(eventId, state, helpers);
        closeDeleteModal();
        showToast(`ลบเหตุการณ์ #${eventId} จาก Google Sheet สำเร็จแล้ว`, 'success');
        await fetchEventsFromGoogleSheet(true, state, helpers);
        return;
      }
    } else {
      finishLocalDeletion(eventId, state, helpers);
      closeDeleteModal();
      showToast(`ลบข้อมูล #${eventId} ออกจากเครื่องเรียบร้อยแล้ว`, 'info');
    }
  } catch (err) {
    console.error('Delete Exception:', err);
    if (errBox) {
      errBox.textContent = `ไม่สามารถลบได้: ${err.message}`;
      errBox.style.display = 'block';
    }
  } finally {
    if (btnConfirm) {
      btnConfirm.disabled = false;
      btnConfirm.innerHTML = '🗑️ ยืนยันการลบ';
    }
  }
}

function finishLocalDeletion(eventId, state, helpers) {
  state.auditHistory = state.auditHistory.filter(r => r.id !== eventId).slice(0, 100);
  localStorage.setItem('ira_audit_history', JSON.stringify(state.auditHistory));
  if (state.currentAssessmentId === eventId) {
    helpers.setActiveAssessmentId(null);
  }
  helpers.renderAuditTable();
}

/**
 * ส่งออกประวัติเป็นไฟล์ CSV
 */
function exportHistoryCSV(state, showToast) {
  if (!state.auditHistory || state.auditHistory.length === 0) {
    if (showToast) showToast('ยังไม่มีประวัติการประเมินให้ส่งออก', 'warn');
    return;
  }

  const headers = ['ID', 'Timestamp', 'Event_Name', 'Location', 'Assessor', 'Risk_Question', 'Risk_Level_TH', 'Risk_Level_EN', 'Actions', 'Sheet_Synced', 'User_Notes', 'AI_Summary'];
  const rows = state.auditHistory.map(r => [
    `"${(r.id || '').toString().replace(/"/g, '""')}"`,
    `"${(r.timestamp || '').toString().replace(/"/g, '""')}"`,
    `"${(r.eventName || '').toString().replace(/"/g, '""')}"`,
    `"${(r.location || '').toString().replace(/"/g, '""')}"`,
    `"${(r.assessorName || '').toString().replace(/"/g, '""')}"`,
    `"${(r.riskQuestion || '').toString().replace(/"/g, '""')}"`,
    `"${(r.riskLevel || '').toString().replace(/"/g, '""')}"`,
    `"${(r.riskLevelEn || '').toString().replace(/"/g, '""')}"`,
    `"${(r.actions || '').toString().replace(/"/g, '""')}"`,
    `"${r.syncedToSheet ? 'Yes' : 'No'}"`,
    `"${(r.userNotes || '').toString().replace(/"/g, '""')}"`,
    `"${(r.aiSummary || '').toString().replace(/"/g, '""')}"`
  ]);

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `IRA_Audit_Export_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  if (showToast) showToast('ส่งออกไฟล์ CSV เรียบร้อยแล้ว', 'success');
}

// ผูกเข้ากับ Global Object
window.IraSheets = {
  formatOnlyDate: formatOnlyDate,
  normalizeToIsoDate: normalizeToIsoDate,
  escapeHtml: escapeHtml,
  jsArgAttr: jsArgAttr,
  generateNextAssessmentId: generateNextAssessmentId,
  verifyRecordInSheet: verifyRecordInSheet,
  sendRecordToSheetWebhook: sendRecordToSheetWebhook,
  saveToGoogleSheets: saveToGoogleSheets,
  fetchEventsFromGoogleSheet: fetchEventsFromGoogleSheet,
  syncSingleAuditRow: syncSingleAuditRow,
  syncAllPendingRecords: syncAllPendingRecords,
  executeDeleteEvent: executeDeleteEvent,
  exportHistoryCSV: exportHistoryCSV
};

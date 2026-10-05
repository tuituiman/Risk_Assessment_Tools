/**
 * ==============================================================================
 * IRA Assistant - Main Application & UI Orchestrator (app.js)
 * ==============================================================================
 * 
 * โมดูลหลักที่ประสานการทำงานระหว่าง:
 * - prompts.js: เทมเพลตคำสั่ง Typhoon AI
 * - algorithm.js: เอนจินคำนวณและ Decision Flow ของ WHO IRA
 * - sheets_api.js: การเชื่อมต่อ Google Sheets และ Audit Trail
 * ==============================================================================
 */

// Application State
const state = {
  currentAssessmentId: null, // Track currently active assessment ID (null = new case)
  latestSheetNextId: null,   // Authoritative next ID fetched from Google Sheet
  metadata: {
    eventName: '',
    location: '',
    assessmentDate: new Date().toISOString().split('T')[0],
    assessorName: '',
    clinicalDetails: '',
    riskQuestion: '' // 🎯 ประเด็น / คำถามที่ต้องการประเมินความเสี่ยง (Focal Issue)
  },
  // คำถามหลัก 5 มิติ (เริ่มต้นเป็น null เพื่อให้แสดงเฉพาะข้อ 1 และรอผู้ใช้ประเมิน)
  answers: {
    q1_highThreat: null,
    q2_exposureActive: null,
    q3_severityHigh: null,
    q4_spreadFuture: null,
    q4_2_significantCurrent: null,
    q5_1_capacitySufficient: null,
    q5_2_systemOverwhelmed: null
  },
  // ข้อย่อย Segmented Radio (ใช่ / ไม่ใช่)
  subAnswers: {
    sub_d1_1: null, sub_d1_2: null, sub_d1_3: null, sub_d1_4: null,
    sub_d2_a: null, sub_d2_b: null, sub_d2_c: null,
    sub_d3_a: null, sub_d3_b: null, sub_d3_c: null,
    sub_d4_a: null, sub_d4_b: null, sub_d4_c: null,
    sub_d5_a: null, sub_d5_b: null, sub_d5_c: null, sub_d5_d: null
  },
  // ข้อย่อย Checkbox เกณฑ์ประกอบ
  subCriteria: {
    d1_vhf: false, d1_respiratory: false, d1_neuro: false, d1_other: false,
    d2_close_contact: false, d2_healthcare: false, d2_animal: false, d2_lab: false,
    d3_icu: false, d3_cfr_high: false, d3_vulnerable: false, d3_organ_failure: false,
    d4_r0_high: false, d4_travel: false, d4_dense_pop: false, d4_superspread: false,
    d5_ppe: false, d5_isolation: false, d5_medicines: false, d5_guidelines: false
  },
  domainNotes: {
    d1: '', d2: '', d3: '', d4: '', d4_2: '', d5: '', d5_2: ''
  },
  notes: {}, // บันทึกย่อยของแต่ละเกณฑ์ (note_d1_1, note_d1_2, ...)
  // ผลการประเมินความเสี่ยง (เริ่มต้นเป็น Incomplete เพื่อไม่ให้ขึ้น Very High ก่อนตอบ)
  assessmentResult: {
    level: 'Incomplete',
    levelTh: 'อยู่ระหว่างการประเมิน',
    colorClass: 'risk-incomplete',
    suggestedActions: [
      'โปรดตอบคำถามตามลำดับการตัดสินใจ (Decision Flow) ด้านซ้ายให้ครบถ้วนเพื่อแสดงมาตรการที่แนะนำ'
    ],
    rationaleBreakdown: {},
    isComplete: false
  },
  aiSummary: '',
  isAiGenerating: false,
  settings: {
    typhoonApiKey: localStorage.getItem('ira_typhoon_api_key') || '',
    typhoonModel: localStorage.getItem('ira_typhoon_model') || (window.IraPrompts?.config?.defaultModel || 'typhoon-v2.5-30b-a3b-instruct'),
    googleSheetsUrl: localStorage.getItem('ira_google_sheets_url') || ''
  },
  auditHistory: JSON.parse(localStorage.getItem('ira_audit_history') || '[]'),
  deleteTargetId: null,
  deleteTargetName: ''
};

// Bundle helpers object to pass to external modules
function getAppHelpers() {
  return {
    showToast: showToast,
    renderAuditTable: renderAuditTable,
    setActiveAssessmentId: setActiveAssessmentId,
    compileUserNotes: compileUserNotes,
    updateActiveIdDisplay: updateActiveIdDisplay,
    closeDeleteModal: closeDeleteModal
  };
}

/**
 * Toast Notification Popup Helper
 */
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'fadeOutToast 0.3s ease forwards';
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
  }, 3800);
}

/**
 * กำหนดรหัส ID ที่กำลังทำงานอยู่
 */
function setActiveAssessmentId(id, isSyncing = false) {
  state.currentAssessmentId = id ? String(id).trim() : null;
  updateActiveIdDisplay(state.currentAssessmentId, isSyncing);
}

/**
 * อัปเดตแถบแสดงรหัสประเมิน (Active Assessment ID Tag)
 */
function updateActiveIdDisplay(explicitId, isSyncing = false) {
  const textEl = document.getElementById('activeEventIdText');
  const labelEl = document.getElementById('eventModeLabel');
  const noteEl = document.getElementById('eventSubNote');
  const btnReset = document.getElementById('btnResetToNewCase');
  const tagEl = document.getElementById('eventEditStatusTag');

  if (!textEl) return;

  if (explicitId) {
    textEl.textContent = explicitId;
    if (labelEl) labelEl.textContent = '✏️ กำลังแก้ไขเคส: ';
    if (noteEl) noteEl.textContent = '(บันทึกทับ ID เดิม)';
    if (btnReset) btnReset.style.display = 'inline-block';
    if (tagEl) {
      tagEl.style.background = 'rgba(234, 88, 12, 0.12)';
      tagEl.style.borderColor = 'rgba(234, 88, 12, 0.4)';
      tagEl.style.color = '#c2410c';
    }
  } else {
    let nextId = isSyncing ? 'กำลังซิงก์...' : window.IraSheets.generateNextAssessmentId(null, state);
    textEl.textContent = nextId;
    if (labelEl) labelEl.textContent = '🏷️ รหัสถัดไป: ';
    if (noteEl) noteEl.textContent = '(สร้างใหม่อัตโนมัติ)';
    if (btnReset) btnReset.style.display = 'none';
    if (tagEl) {
      tagEl.style.background = 'rgba(225, 29, 72, 0.08)';
      tagEl.style.borderColor = 'rgba(225, 29, 72, 0.25)';
      tagEl.style.color = 'var(--primary)';
    }
  }
}

/**
 * อัปเดตสถานะการเชื่อมต่อ Google Sheets ในหน้าเว็บ
 */
function updateGoogleSheetsStatusUI() {
  const url = state.settings.googleSheetsUrl.trim();
  const badge = document.getElementById('auditSheetStatusBadge');
  const textEl = document.getElementById('auditSheetStatusText');
  const banner = document.getElementById('sheetConnectBanner');

  const isConnected = !!url && (url.startsWith('http://') || url.startsWith('https://'));

  if (badge && textEl) {
    if (isConnected) {
      badge.className = 'sheet-status-badge status-connected';
      textEl.textContent = 'Google Sheet: เชื่อมต่อแล้ว (พร้อมซิงก์)';
    } else {
      badge.className = 'sheet-status-badge status-disconnected';
      textEl.textContent = 'Google Sheet: ยังไม่ได้เชื่อมต่อ';
    }
  }

  if (banner) {
    banner.style.display = isConnected ? 'none' : 'flex';
  }
}

/**
 * รวบรวมบันทึกข้อความและข้อย่อยทั้งหมดเพื่อส่งให้ AI และบันทึก
 * มีระบบกรองข้อขัดแย้ง (Conflict Resolution) เพื่อให้สอดคล้องกับการตัดสินใจข้อหลักของผู้ประเมิน 100%
 */
function compileUserNotes() {
  const notesList = [];
  const ans = state.answers;

  // 1. ประเด็นที่ต้องการประเมินความเสี่ยง (Risk Question / Focal Issue)
  if (state.metadata.riskQuestion && state.metadata.riskQuestion.trim()) {
    notesList.push(`[🎯 ประเด็น/คำถามที่ต้องการประเมินความเสี่ยง]:\n${state.metadata.riskQuestion.trim()}`);
  }

  // 2. ข้อยุติของข้อหลักทั้ง 5 มิติ (User Decision / Source of Truth)
  const d1Verdict = ans.q1_highThreat === 'yes' ? 'ใช่ - เป็นเชื้อหรือภัยคุกคามระดับสูงที่กำหนด' : (ans.q1_highThreat === 'no' ? 'ไม่ใช่/ไม่แน่ชัด - ไม่จัดเป็นเชื้อคุกคามระดับสูงเบื้องต้น' : 'ยังไม่ระบุ');
  const d2Verdict = ans.q2_exposureActive === 'yes' ? 'ใช่ - ประชาชนยังมีแนวโน้มการสัมผัสต่อเนื่อง' : (ans.q2_exposureActive === 'no' ? 'ไม่ใช่ - ยุติการสัมผัสแล้วหรือไม่มีแนวโน้มสัมผัสต่อเนื่อง' : 'ยังไม่ระบุ');
  const d3Verdict = ans.q3_severityHigh === 'yes' ? 'ใช่ - มีความรุนแรงทางคลินิกสูง (CFR/วิกฤต/ICU)' : (ans.q3_severityHigh === 'no' ? 'ไม่ใช่ - ความรุนแรงทางคลินิกปานกลางถึงต่ำ' : 'ยังไม่ระบุ');
  const d4Verdict = ans.q4_spreadFuture === 'yes' ? 'ใช่ - มีแนวโน้มการแพร่ระบาดขยายวงกว้างสูง' : (ans.q4_spreadFuture === 'no' ? 'ไม่ใช่ - แนวโน้มการแพร่กระจายต่ำ/อยู่ในขอบเขตจำกัด' : 'ยังไม่ระบุ');
  const d5Verdict = ans.q5_1_capacitySufficient === 'yes' ? 'ใช่ - ศักยภาพและทรัพยากรในพื้นที่เพียงพอ' : (ans.q5_1_capacitySufficient === 'no' ? 'ไม่ใช่ - ศักยภาพยังไม่เพียงพอต่อการควบคุม' : 'ยังไม่ระบุ');
  const d52Verdict = ans.q5_2_systemOverwhelmed === 'yes' ? 'ใช่ - ระบบบริการสุขภาพมีแนวโน้มล่ม (Overwhelmed)' : (ans.q5_2_systemOverwhelmed === 'no' ? 'ไม่ใช่ - ระบบบริการสุขภาพยังคงรองรับได้' : 'ยังไม่ระบุ');

  const mainSummaryLines = [
    `[ข้อสรุปการประเมินข้อหลักทั้ง 5 ข้อ (ยึดตามข้อหลักที่ผู้ประเมินตัดสินใจเป็นข้อยุติสูงสุด)]:`,
    `- ข้อ 1 (ภัยคุกคามระดับสูง): ${d1Verdict}`
  ];

  if (ans.q1_highThreat !== 'yes') {
    mainSummaryLines.push(`- ข้อ 2 (การสัมผัส): ${d2Verdict}`);
    if (ans.q2_exposureActive === 'yes') {
      mainSummaryLines.push(`- ข้อ 3 (ความรุนแรงทางคลินิก): ${d3Verdict}`);
      mainSummaryLines.push(`- ข้อ 4.1 (การแพร่กระจาย): ${d4Verdict}`);
    } else if (ans.q2_exposureActive === 'no') {
      const q42Verdict = ans.q4_2_significantCurrent === 'yes' ? 'มีผู้ได้รับผลกระทบเป็นจำนวนมาก' : (ans.q4_2_significantCurrent === 'no' ? 'ไม่มีผู้ได้รับผลกระทบจำนวนมาก' : 'ยังไม่ระบุ');
      mainSummaryLines.push(`- ข้อ 4.2 (ผลกระทบปัจจุบัน): ${q42Verdict}`);
    }
  }

  mainSummaryLines.push(`- ข้อ 5.1 (ศักยภาพระบบ): ${d5Verdict}`);
  if (ans.q1_highThreat !== 'yes' && ans.q3_severityHigh === 'yes' && ans.q4_spreadFuture === 'yes') {
    mainSummaryLines.push(`- ข้อ 5.2 (ระบบสุขภาพล่ม): ${d52Verdict}`);
  }

  notesList.push(mainSummaryLines.join('\n'));

  // 3. ข้อย่อยและบันทึกย่อยในแต่ละโมดูล (Sub-criteria & Notes - กรองข้อขัดแย้งกับข้อหลัก)
  const subItems = [
    { id: 'sub_d1_1', noteId: 'note_d1_1', domain: 'd1', label: '1.1 โรคติดต่ออันตราย 13 โรค' },
    { id: 'sub_d1_2', noteId: 'note_d1_2', domain: 'd1', label: '1.2 ไวรัสโคโรนาสายพันธุ์ใหม่ (SARS/MERS)' },
    { id: 'sub_d1_3', noteId: 'note_d1_3', domain: 'd1', label: '1.3 ไข้หวัดใหญ่สายพันธุ์ใหม่' },
    { id: 'sub_d1_4', noteId: 'note_d1_4', domain: 'd1', label: '1.4 โปลิโอธรรมชาติ/RVF/แอนแทรกซ์' },
    { id: 'sub_d2_a', noteId: 'note_d2_a', domain: 'd2', label: '2A ต้นตอโรคยังคงมีอยู่ในพื้นที่' },
    { id: 'sub_d2_b', noteId: 'note_d2_b', domain: 'd2', label: '2B ประชาชนยังสัมผัสต่อเนื่อง' },
    { id: 'sub_d2_c', noteId: 'note_d2_c', domain: 'd2', label: '2C ประชากรยังไม่มีภูมิคุ้มกัน' },
    { id: 'sub_d3_a', noteId: 'note_d3_a', domain: 'd3', label: '3A อัตราป่วยตาย (CFR) ปานกลางถึงสูง' },
    { id: 'sub_d3_b', noteId: 'note_d3_b', domain: 'd3', label: '3B สัดส่วนผู้ป่วยวิกฤต/ICU สูง' },
    { id: 'sub_d3_c', noteId: 'note_d3_c', domain: 'd3', label: '3C อัตราป่วย/ตายสูงกว่าอดีต' },
    { id: 'sub_d4_a', noteId: 'note_d4_a', domain: 'd4', label: '4.1A เชื้อติดต่อสูง/รวมกลุ่มเดินทาง' },
    { id: 'sub_d4_b', noteId: 'note_d4_b', domain: 'd4', label: '4.1B อัตราป่วย Attack rate พุ่งเร็ว' },
    { id: 'sub_d4_c', noteId: 'note_d4_c', domain: 'd4', label: '4.1C รายงานผู้ป่วยมากในเวลาสั้น' },
    { id: 'sub_d5_a', noteId: 'note_d5_a', domain: 'd5', label: '5.1A มาตรการสาธารณสุขพร้อม' },
    { id: 'sub_d5_b', noteId: 'note_d5_b', domain: 'd5', label: '5.1B ระบบเตียง/ยา/บุคลากรเพียงพอ' },
    { id: 'sub_d5_c', noteId: 'note_d5_c', domain: 'd5', label: '5.1C สื่อสารความเสี่ยงมีประสิทธิผล' },
    { id: 'sub_d5_d', noteId: 'note_d5_d', domain: 'd5_d', label: '5.1D ความเปราะบาง/อุปสรรคสำคัญ' }
  ];

  const validSubNotes = [];
  subItems.forEach(item => {
    const val = state.subAnswers[item.id];
    const noteEl = document.getElementById(item.noteId);
    const noteText = (noteEl ? noteEl.value.trim() : (state.notes[item.noteId] || '')).trim();

    // กฎการตรวจสอบข้อขัดแย้ง (Conflict Checks against User Override):
    let isConflicting = false;

    // Conflict 1: หากข้อหลัก 1 สรุปว่า 'no' แต่ข้อย่อยระบุว่าใช่ (val === 'yes') -> ขัดแย้งกับการตัดสินใจข้อหลัก
    if (item.domain === 'd1' && ans.q1_highThreat === 'no' && val === 'yes') {
      isConflicting = true;
    }
    // Conflict 2: หากข้อหลัก 2 สรุปว่า 'no' (ไม่มีการสัมผัสแล้ว) แต่ข้อย่อยระบุว่าใช่ (val === 'yes') -> ขัดแย้ง
    if (item.domain === 'd2' && ans.q2_exposureActive === 'no' && val === 'yes') {
      isConflicting = true;
    }
    // Conflict 3: หากข้อหลัก 3 สรุปว่า 'no' (ไม่รุนแรง) แต่ข้อย่อยระบุว่าใช่ (val === 'yes') -> ขัดแย้ง
    if (item.domain === 'd3' && ans.q3_severityHigh === 'no' && val === 'yes') {
      isConflicting = true;
    }
    // Conflict 4: หากข้อหลัก 4.1 สรุปว่า 'no' (ไม่แพร่กระจายกว้าง) แต่ข้อย่อยระบุว่าใช่ (val === 'yes') -> ขัดแย้ง
    if (item.domain === 'd4' && ans.q4_spreadFuture === 'no' && val === 'yes') {
      isConflicting = true;
    }
    // Conflict 5: หากข้อหลัก 5.1 สรุปว่า 'yes' (ศักยภาพพอ) และ 5.2 เป็น 'no' (ไม่ล่ม) แต่อุปสรรค 5.1D เป็น 'yes' -> ขัดแย้ง
    if (item.domain === 'd5_d' && ans.q5_1_capacitySufficient === 'yes' && ans.q5_2_systemOverwhelmed === 'no' && val === 'yes') {
      isConflicting = true;
    }

    // หากขัดแย้งกับการตัดสินใจข้อหลักของผู้ประเมิน ให้ตัดทิ้ง ไม่นำมาสรุปให้ AI สับสน
    if (isConflicting) return;

    if (val === 'yes' || noteText) {
      const statusTh = val === 'yes' ? 'ใช่ (Yes)' : (val === 'no' ? 'ไม่ใช่ (No)' : 'ยังไม่ระบุ');
      validSubNotes.push(`- ${item.label}: สถานะ=${statusTh}${noteText ? ` [บันทึก: ${noteText}]` : ''}`);
    }
  });

  if (validSubNotes.length > 0) {
    notesList.push(`[ข้อมูลสนับสนุนและบันทึกข้อย่อยที่สอดคล้องกับข้อหลัก]:\n` + validSubNotes.join('\n'));
  }

  // 4. บันทึกย่อตามรายมิติ (General Notes)
  const generalNotes = [
    { id: 'note_q1_general', key: 'd1', label: 'บันทึกภาพรวมข้อ 1 (ภัยคุกคาม)' },
    { id: 'note_q2_general', key: 'd2', label: 'บันทึกภาพรวมข้อ 2 (การสัมผัส)' },
    { id: 'note_q3_general', key: 'd3', label: 'บันทึกภาพรวมข้อ 3 (ความรุนแรง)' },
    { id: 'note_q4_general', key: 'd4', label: 'บันทึกภาพรวมข้อ 4.1 (การแพร่กระจาย)' },
    { id: 'note_q4_2_general', key: 'd4_2', label: 'บันทึกภาพรวมข้อ 4.2 (ผู้ได้รับผลกระทบ)' },
    { id: 'note_q5_2_general', key: 'd5_2', label: 'บันทึกภาพรวมข้อ 5.2 (ระบบสุขภาพล่ม)' },
    { id: 'note_q5_general', key: 'd5', label: 'บันทึกภาพรวมข้อ 5.1 (ศักยภาพระบบ)' }
  ];

  const validGeneral = [];
  generalNotes.forEach(f => {
    const el = document.getElementById(f.id);
    const val = (el ? el.value.trim() : (state.domainNotes[f.key] || '')).trim();
    if (val) {
      validGeneral.push(`- ${f.label}: ${val}`);
    }
  });

  if (validGeneral.length > 0) {
    notesList.push(`[บันทึกประกอบเพิ่มเติมจากผู้ประเมิน]:\n` + validGeneral.join('\n'));
  }

  return notesList.join('\n\n');
}

/**
 * เรียกใช้ Typhoon AI สรุปรายงานสถานการณ์
 */
async function generateAiSummary() {
  // ตรวจสอบความครบถ้วนของการประเมินก่อน
  if (!state.assessmentResult.isComplete) {
    showToast('กรุณาตอบคำถามการประเมินความเสี่ยงให้ครบถ้วนตาม Decision Tree ก่อนเรียก AI', 'warn');
    return;
  }

  const apiKey = state.settings.typhoonApiKey.trim();
  const summaryBox = document.getElementById('aiNarrativeBox');
  const spinner = document.getElementById('aiSpinner');
  const btn = document.getElementById('btnGenerateAi');

  if (state.isAiGenerating) return;

  state.isAiGenerating = true;
  if (btn) btn.disabled = true;
  if (spinner) spinner.style.display = 'flex';
  if (summaryBox) summaryBox.style.opacity = '0.5';

  const userNotesCompiled = compileUserNotes();
  const systemPrompt = window.IraPrompts.getSystemPrompt();
  const userPrompt = window.IraPrompts.buildUserPrompt(state.metadata, state.answers, state.assessmentResult, userNotesCompiled);

  try {
    if (!apiKey) {
      // โหมดจำลองเมื่อยังไม่มี API Key
      await new Promise(resolve => setTimeout(resolve, 1200));
      const simulatedText = window.IraPrompts.generateSimulatedSummary(
        state.metadata, state.answers, state.assessmentResult, userNotesCompiled
      );
      state.aiSummary = simulatedText;
      if (summaryBox) summaryBox.textContent = simulatedText;
      showToast('สร้างรายงานจำลองสำเร็จ (ใส่ Typhoon API Key ในหน้าตั้งค่าเพื่อใช้โมเดลจริง)', 'warn');
    } else {
      let modelToUse = state.settings.typhoonModel || window.IraPrompts.config.defaultModel;
      const fetchSignal = typeof AbortSignal !== 'undefined' && AbortSignal.timeout
        ? AbortSignal.timeout(window.IraPrompts.config.timeoutMs || 45000)
        : undefined;

      let response = await fetch('https://api.opentyphoon.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: modelToUse,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: window.IraPrompts.config.temperature || 0.2,
          max_tokens: window.IraPrompts.config.maxTokens || 1400
        }),
        signal: fetchSignal
      });

      if (!response.ok) {
        let errMessage = `${response.status} ${response.statusText}`;
        try {
          const errJson = await response.json();
          if (errJson && errJson.error) {
            errMessage = typeof errJson.error === 'string' ? errJson.error : (errJson.error.message || JSON.stringify(errJson.error));
          }
        } catch (e) { }
        throw new Error(errMessage);
      }

      const data = await response.json();
      const content = data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : '';
      if (!content) {
        throw new Error('ไม่พบข้อความตอบกลับจาก Typhoon API');
      }

      state.aiSummary = content;
      if (summaryBox) summaryBox.textContent = content;
      showToast('Typhoon AI เรียบเรียงบทสรุปสำเร็จแล้ว!', 'success');
    }
  } catch (err) {
    console.error('Typhoon API Exception:', err);
    if (summaryBox) summaryBox.textContent = `เกิดข้อผิดพลาดในการเรียกใช้ Typhoon AI: ${err.message}\nโปรดตรวจสอบ API Key หรือการเชื่อมต่ออินเทอร์เน็ต`;
    showToast(`เกิดข้อผิดพลาด Typhoon AI: ${err.message}`, 'error');
  } finally {
    state.isAiGenerating = false;
    if (btn) btn.disabled = false;
    if (spinner) spinner.style.display = 'none';
    if (summaryBox) summaryBox.style.opacity = '1';
  }
}

/**
 * คัดลอกข้อความบทสรุป AI
 */
function copyAiSummary() {
  const summaryBox = document.getElementById('aiNarrativeBox');
  if (!summaryBox) return;
  const text = summaryBox.innerText || summaryBox.textContent;
  if (!text || text.includes('กดปุ่ม "สร้างรายงานสรุปด้วย Typhoon AI" ด้านล่าง')) {
    showToast('ยังไม่มีข้อความบทสรุปให้คัดลอก', 'warn');
    return;
  }
  navigator.clipboard.writeText(text).then(() => {
    showToast('คัดลอกบทสรุปเรียบร้อยแล้ว!', 'success');
  }).catch(() => {
    showToast('ไม่สามารถคัดลอกได้ โปรดคัดลอกด้วยตนเอง', 'warn');
  });
}

/**
 * เรนเดอร์ตาราง Audit Trail
 */
function renderAuditTable() {
  const tbody = document.getElementById('auditTableBody');
  if (!tbody) return;

  if (state.auditHistory.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-dim); padding: 18px;">ยังไม่มีประวัติการประเมิน (กดบันทึกหลังจากประเมินเสร็จเพื่อสร้างประวัติ)</td></tr>`;
    return;
  }

  tbody.innerHTML = state.auditHistory.slice(0, 30).map(rec => {
    let colorBadge = 'status-unk';
    if (rec.riskLevelEn === 'Very Low' || rec.riskLevelEn === 'Low') colorBadge = 'status-no';
    if (rec.riskLevelEn === 'High' || rec.riskLevelEn === 'Very High') colorBadge = 'status-yes';

    const idArg = window.IraSheets.jsArgAttr(rec.id);
    const sheetStatusHtml = rec.syncedToSheet
      ? `<span class="badge-synced">✅ ซิงก์แล้ว</span>`
      : `<span class="badge-pending">⏳ ยังไม่ซิงก์</span> <button class="btn btn-outline btn-sm btn-quick-sync" onclick="window.IraSheets.syncSingleAuditRow(${idArg}, state, getAppHelpers())">💾 ซิงก์</button>`;

    const locHtml = rec.location ? `<div class="audit-event-loc">📍 ${window.IraSheets.escapeHtml(rec.location)}</div>` : '';
    const focalHtml = rec.riskQuestion ? `<div style="font-size: 0.74rem; color: #881337; margin-top: 2px;">🎯 ${window.IraSheets.escapeHtml(rec.riskQuestion)}</div>` : '';
    const displayDate = window.IraSheets.escapeHtml(window.IraSheets.formatOnlyDate(rec.timestamp || rec.assessmentDate));

    return `
      <tr>
        <td class="col-audit-id"><span class="audit-id-badge">${window.IraSheets.escapeHtml(rec.id)}</span></td>
        <td class="col-audit-time">${displayDate}</td>
        <td class="col-audit-event">
          <div class="audit-event-name">${window.IraSheets.escapeHtml(rec.eventName || '-')}</div>
          ${locHtml}
          ${focalHtml}
        </td>
        <td class="col-audit-risk"><span class="audit-risk-badge ${colorBadge}">${window.IraSheets.escapeHtml(rec.riskLevel)}</span></td>
        <td class="col-audit-user"><div class="audit-assessor">${window.IraSheets.escapeHtml(rec.assessorName || '-')}</div></td>
        <td class="col-audit-sheet">${sheetStatusHtml}</td>
        <td class="col-audit-actions">
          <div class="audit-btn-group">
            <button class="btn btn-outline btn-sm" onclick="viewAuditDetail(${idArg})" title="ดูรายละเอียดหรือโหลดมาแก้ไข">👁️ ดู / แก้ไข</button>
            <button class="btn btn-outline-danger btn-sm" onclick="promptDeleteEvent(${idArg})" title="ลบข้อมูลเหตุการณ์นี้ (ต้องยืนยันรหัสผ่าน)">🗑️ ลบ</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * ดูรายละเอียดประวัติและถามเพื่อโหลดขึ้นมาแก้ไข
 */
window.viewAuditDetail = function (id) {
  const item = state.auditHistory.find(x => x.id === id);
  if (!item) return;

  const dateStr = item.assessmentDate || (item.timestamp ? window.IraSheets.formatOnlyDate(item.timestamp) : '-');
  const focalStr = item.riskQuestion ? `ประเด็นที่ประเมิน: ${item.riskQuestion}\n` : '';
  const clinicSnippet = item.clinicalDetails
    ? (item.clinicalDetails.length > 70 ? item.clinicalDetails.slice(0, 70) + '...' : item.clinicalDetails)
    : '-';

  const shouldLoad = confirm(
    `[ประวัติการประเมิน #${item.id}]\n` +
    `เหตุการณ์: ${item.eventName}\n` +
    `พื้นที่: ${item.location}\n` +
    `วันที่ประเมิน: ${dateStr}\n` +
    `ผู้ประเมิน: ${item.assessorName}\n` +
    focalStr +
    `ข้อมูลทางคลินิก: ${clinicSnippet}\n` +
    `ระดับความเสี่ยง: ${item.riskLevel} (${item.riskLevelEn} Risk)\n` +
    `สถานะ Google Sheet: ${item.syncedToSheet ? '✅ ซิงก์แล้ว' : '⏳ ยังไม่ซิงก์'}\n\n` +
    `มาตรการที่แนะนำ:\n${item.actions}\n\n` +
    `บทสรุป AI:\n${item.aiSummary}\n\n` +
    `=========================================\n` +
    `👉 ต้องการโหลดเคสนี้ขึ้นมาแก้ไขเพื่อ "บันทึกทับ (Overwrite)" หรือไม่?\n` +
    `- กด ตกลง (OK): เพื่อดึงข้อมูลเดิมทั้งหมดขึ้นมาแก้ไข\n` +
    `- กด ยกเลิก (Cancel): ปิดหน้าต่างนี้`
  );

  if (shouldLoad) {
    loadAuditRecordToForm(id);
  }
};

/**
 * ล้างข้อมูลใน Form และ State ทั้งหมดให้สะอาดหมดจด 100%
 * ป้องกันปัญหา Memory Leak หรือการค้างค่าของเคสเก่าเมื่อดึงเคสสลับไปมา
 */
window.resetFormStateAndUI = function () {
  // 1. ล้าง State คำตอบหลักและข้อย่อย
  state.answers = {
    q1_highThreat: null,
    q2_exposureActive: null,
    q3_severityHigh: null,
    q4_spreadFuture: null,
    q4_2_significantCurrent: null,
    q5_1_capacitySufficient: null,
    q5_2_systemOverwhelmed: null
  };
  state.subAnswers = {};
  state.subCriteria = {
    q1: { autoChoice: null, userOverridden: false },
    q2: { autoChoice: null, userOverridden: false },
    q3: { autoChoice: null, userOverridden: false },
    q4: { autoChoice: null, userOverridden: false },
    q5_1: { autoChoice: null, userOverridden: false }
  };
  state.notes = {};
  state.domainNotes = { d1: '', d2: '', d3: '', d4: '', d4_2: '', d5: '', d5_2: '' };
  state.aiSummary = '';

  // 2. ล้าง UI Radio ข้อหลัก
  document.querySelectorAll('.opt-card input[type="radio"]').forEach(inp => {
    inp.checked = false;
  });
  document.querySelectorAll('.opt-card').forEach(card => {
    card.classList.remove('selected', 'danger-selected');
  });

  // 3. ล้าง UI ข้อย่อย (Sub-criteria Choices)
  document.querySelectorAll('.sub-choice-group input[type="radio"]').forEach(inp => {
    inp.checked = false;
  });
  document.querySelectorAll('.sub-choice-label').forEach(lbl => {
    lbl.classList.remove('active-yes', 'active-no');
  });

  // 4. ล้างกล่องข้อความบันทึกย่อยทั้งหมด (Sub-criterion input notes)
  document.querySelectorAll('.sub-criterion-input').forEach(textarea => {
    textarea.value = '';
  });

  // 5. ล้างกล่องบันทึกรายมิติทั้งหมด
  ['note_q1_general', 'note_q2_general', 'note_q3_general', 'note_q4_general', 'note_q4_2_general', 'note_q5_general', 'note_q5_2_general'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  // 6. ล้างกล่องสรุป AI
  const aiBox = document.getElementById('aiNarrativeBox');
  if (aiBox) {
    aiBox.textContent = 'กดปุ่ม "วิเคราะห์และสังเคราะห์ผลด้วย AI" ด้านล่าง เพื่อให้ AI สรุปรายงานสถานการณ์และข้อเสนอแนะเชิงระบาดวิทยาอย่างละเอียด...';
  }

  // 7. ล้างป้ายสถานะคำนวณอัตโนมัติ / Override
  ['q1', 'q2', 'q3', 'q4', 'q5_1'].forEach(dim => {
    const tag = document.getElementById(`auto_calc_tag_${dim}`);
    if (tag) {
      tag.style.display = 'none';
      tag.textContent = '';
    }
  });
};

/**
 * โหลดข้อมูลจากประวัติกลับเข้าฟอร์ม (Full State Restoration)
 */
window.loadAuditRecordToForm = function (id) {
  const item = state.auditHistory.find(x => x.id === id);
  if (!item) return;

  // Clone item เพื่อป้องกันการแก้ reference โดยตรง
  const record = Object.assign({}, item);

  if (record.rawPayload && typeof record.rawPayload === 'string') {
    try {
      const parsed = JSON.parse(record.rawPayload);
      Object.assign(record, parsed);
    } catch (e) {
      console.warn('Failed to parse rawPayload for item:', id, e);
    }
  }

  // ล้างค่าเก่าทั้งหมดในฟอร์มและ State ให้เกลี้ยงก่อน เพื่อไม่ให้มีค่าค้างจากเคสก่อนหน้า
  window.resetFormStateAndUI();

  setActiveAssessmentId(record.id);

  // 1. ฟื้นฟูฟิลด์ Metadata
  state.metadata.eventName = record.eventName || '';
  state.metadata.location = record.location || '';
  state.metadata.assessmentDate = record.assessmentDate || (record.timestamp ? window.IraSheets.formatOnlyDate(record.timestamp) : new Date().toISOString().split('T')[0]);
  state.metadata.assessorName = record.assessorName || '';
  state.metadata.clinicalDetails = record.clinicalDetails || '';
  state.metadata.riskQuestion = record.riskQuestion || '';

  const eventNameInput = document.getElementById('eventName');
  const locationInput = document.getElementById('location');
  const dateInput = document.getElementById('assessmentDate');
  const assessorInput = document.getElementById('assessorName');
  const clinicalInput = document.getElementById('clinicalDetails');
  const riskQuestionInput = document.getElementById('riskQuestion');

  if (eventNameInput) eventNameInput.value = state.metadata.eventName;
  if (locationInput) locationInput.value = state.metadata.location;
  if (dateInput) dateInput.value = state.metadata.assessmentDate;
  if (assessorInput) assessorInput.value = state.metadata.assessorName;
  if (clinicalInput) clinicalInput.value = state.metadata.clinicalDetails;
  if (riskQuestionInput) riskQuestionInput.value = state.metadata.riskQuestion;

  // 2. ฟื้นฟูคำตอบข้อหลัก 5 ข้อ
  if (record.answers && typeof record.answers === 'object') {
    Object.assign(state.answers, record.answers);
  } else {
    state.answers.q1_highThreat = record.d1_highThreat && record.d1_highThreat !== '-' ? record.d1_highThreat : null;
    state.answers.q2_exposureActive = record.d2_exposure && record.d2_exposure !== '-' ? record.d2_exposure : null;
    state.answers.q3_severityHigh = record.d3_severity && record.d3_severity !== '-' ? record.d3_severity : null;
    state.answers.q4_spreadFuture = record.d4_spread && record.d4_spread !== '-' ? record.d4_spread : null;
    state.answers.q5_1_capacitySufficient = record.d5_capacity && record.d5_capacity !== '-' ? record.d5_capacity : null;
  }

  // ซิงก์ค่าเข้า UI Radio Buttons
  const radioMappings = [
    { group: 'q1_highThreat', val: state.answers.q1_highThreat },
    { group: 'q2_exposure', val: state.answers.q2_exposureActive },
    { group: 'q3_severity', val: state.answers.q3_severityHigh },
    { group: 'q4_spread', val: state.answers.q4_spreadFuture },
    { group: 'q4_2_significant', val: state.answers.q4_2_significantCurrent },
    { group: 'q5_1_capacity', val: state.answers.q5_1_capacitySufficient },
    { group: 'q5_2_overwhelmed', val: state.answers.q5_2_systemOverwhelmed }
  ];

  radioMappings.forEach(({ group, val }) => {
    document.querySelectorAll(`input[name="${group}"]`).forEach(inp => {
      inp.checked = (val && inp.value === val);
      const card = inp.closest('.opt-card');
      if (card) {
        card.classList.toggle('selected', !!(val && inp.value === val));
        if (group === 'q1_highThreat') {
          card.classList.toggle('danger-selected', val === 'yes' && inp.value === 'yes');
        }
      }
    });
  });

  // 3. ฟื้นฟูข้อย่อย (Sub-criteria)
  if (record.subAnswers && typeof record.subAnswers === 'object') {
    Object.assign(state.subAnswers, record.subAnswers);
    Object.keys(state.subAnswers).forEach(key => {
      const val = state.subAnswers[key];
      if (val) window.setSubChoiceVal(key, val);
    });
  }

  // ฟื้นฟูบันทึกข้อย่อย (Sub-criterion input notes)
  if (record.notes && typeof record.notes === 'object') {
    Object.assign(state.notes, record.notes);
    Object.keys(state.notes).forEach(k => {
      const el = document.getElementById(k);
      if (el) el.value = state.notes[k] || '';
    });
  }

  // 4. ฟื้นฟูบันทึกรายมิติ
  if (record.domainNotes && typeof record.domainNotes === 'object') {
    Object.assign(state.domainNotes, record.domainNotes);
    const domainNoteInputs = [
      { id: 'note_q1_general', key: 'd1' },
      { id: 'note_q2_general', key: 'd2' },
      { id: 'note_q3_general', key: 'd3' },
      { id: 'note_q4_general', key: 'd4' },
      { id: 'note_q4_2_general', key: 'd4_2' },
      { id: 'note_q5_general', key: 'd5' },
      { id: 'note_q5_2_general', key: 'd5_2' }
    ];
    domainNoteInputs.forEach(({ id, key }) => {
      const el = document.getElementById(id);
      if (el) el.value = state.domainNotes[key] || '';
    });
  }

  // ฟื้นฟูสถานะ Override ของข้อย่อย หากบันทึกไว้ใน payload
  if (record.subCriteria && typeof record.subCriteria === 'object') {
    Object.assign(state.subCriteria, record.subCriteria);
  }

  // 5. ฟื้นฟูบทสรุป AI
  state.aiSummary = record.aiSummary && record.aiSummary !== '-' ? record.aiSummary : '';
  const aiBox = document.getElementById('aiNarrativeBox');
  if (aiBox) {
    aiBox.textContent = state.aiSummary || 'กดปุ่ม "วิเคราะห์และสังเคราะห์ผลด้วย AI" ด้านล่าง เพื่อให้ AI สรุปรายงานสถานการณ์และข้อเสนอแนะเชิงระบาดวิทยาอย่างละเอียด...';
  }

  // 6. คำนวณความเสี่ยงและอัปเดต Flow ใหม่
  window.IraEngine.evaluateRiskAlgorithm(state);

  // เลื่อนกลับขึ้นบนสุดอย่างราบรื่น
  window.scrollTo({ top: 0, behavior: 'smooth' });
  showToast(`โหลดข้อมูลเคส #${record.id} (${record.eventName}) ขึ้นมาแก้ไขเรียบร้อยแล้ว`, 'success');
};

/**
 * แสดง Modal ยืนยันการลบเหตุการณ์
 */
window.promptDeleteEvent = function (id) {
  const item = state.auditHistory.find(x => x.id === id);
  state.deleteTargetId = id;
  state.deleteTargetName = item ? item.eventName : id;

  const idEl = document.getElementById('deleteEventId');
  const nameEl = document.getElementById('deleteEventName');
  const userInp = document.getElementById('deleteUsername');
  const passInp = document.getElementById('deletePassword');
  const errBox = document.getElementById('deleteAuthError');
  const modal = document.getElementById('deleteConfirmModal');

  if (idEl) idEl.textContent = id;
  if (nameEl) nameEl.textContent = state.deleteTargetName;
  if (userInp) userInp.value = '';
  if (passInp) passInp.value = '';
  if (errBox) errBox.style.display = 'none';

  if (modal) modal.classList.add('open');
};

function closeDeleteModal() {
  const modal = document.getElementById('deleteConfirmModal');
  if (modal) modal.classList.remove('open');
  state.deleteTargetId = null;
  state.deleteTargetName = '';
}

/**
 * สลับการแสดงผล Drawer ข้อย่อย (Sub-criteria Drawer)
 */
window.toggleSubDrawer = function (drawerId, btnEl) {
  const el = document.getElementById(drawerId);
  if (!el) return;

  if (!btnEl && window.event && window.event.currentTarget) {
    btnEl = window.event.currentTarget;
  }
  if (!btnEl) {
    btnEl = document.querySelector(`[onclick*="${drawerId}"]`);
  }

  const isHidden = window.getComputedStyle(el).display === 'none' || el.style.display === 'none' || !el.classList.contains('open');

  if (isHidden) {
    el.style.display = 'flex';
    el.classList.add('open');
  } else {
    el.style.display = 'none';
    el.classList.remove('open');
  }

  if (btnEl) {
    const textSpan = btnEl.querySelector('.drawer-btn-label');
    const chevronSpan = btnEl.querySelector('.drawer-chevron');
    if (isHidden) {
      btnEl.classList.add('active');
      if (chevronSpan) chevronSpan.textContent = '▲';
      if (textSpan && textSpan.getAttribute('data-collapse-text')) {
        textSpan.textContent = textSpan.getAttribute('data-collapse-text');
      }
    } else {
      btnEl.classList.remove('active');
      if (chevronSpan) chevronSpan.textContent = '▼';
      if (textSpan && textSpan.getAttribute('data-expand-text')) {
        textSpan.textContent = textSpan.getAttribute('data-expand-text');
      }
    }
  }
};

/**
 * กำหนดค่าและอัปเดตสถานะของข้อย่อย Segmented Choice
 */
window.setSubChoiceVal = function (subId, val) {
  state.subAnswers[subId] = val;
  const radio = document.querySelector(`input[name="${subId}"][value="${val}"]`);
  if (radio) {
    radio.checked = true;
    const container = radio.closest('.sub-choice-group');
    if (container) {
      container.querySelectorAll('.sub-choice-label').forEach(lbl => {
        lbl.classList.remove('active-yes', 'active-no');
      });
      const chosenLabel = radio.closest('.sub-choice-label');
      if (chosenLabel) {
        chosenLabel.classList.add(val === 'yes' ? 'active-yes' : 'active-no');
      }
    }
  }
};

/**
 * ตั้งค่า Option Cards (ตัวเลือกคำตอบหลัก)
 */
function setupOptionCards() {
  // ล้างการเลือกเริ่มต้น (ให้แน่ใจว่าไม่มีข้อใดถูก check อัตโนมัติเมื่อเปิดใหม่)
  document.querySelectorAll('.opt-card input[type="radio"]').forEach(inp => {
    inp.checked = false;
  });
  document.querySelectorAll('.opt-card').forEach(card => {
    card.classList.remove('selected', 'danger-selected');
  });
  document.querySelectorAll('.sub-choice-group input[type="radio"]').forEach(inp => {
    inp.checked = false;
  });
  document.querySelectorAll('.sub-choice-label').forEach(lbl => {
    lbl.classList.remove('active-yes', 'active-no');
  });

  document.querySelectorAll('.opt-card').forEach(card => {
    card.addEventListener('click', (e) => {
      const input = card.querySelector('input[type="radio"]');
      if (!input) return;

      const groupName = input.name;
      const val = input.value;

      document.querySelectorAll(`input[name="${groupName}"]`).forEach(inp => {
        inp.closest('.opt-card')?.classList.remove('selected', 'danger-selected');
      });

      input.checked = true;
      card.classList.add('selected');
      if (groupName === 'q1_highThreat' && val === 'yes') {
        card.classList.add('danger-selected');
      }

      if (groupName === 'q1_highThreat') state.answers.q1_highThreat = val;
      else if (groupName === 'q2_exposure') state.answers.q2_exposureActive = val;
      else if (groupName === 'q3_severity') state.answers.q3_severityHigh = val;
      else if (groupName === 'q4_spread') state.answers.q4_spreadFuture = val;
      else if (groupName === 'q4_2_significant') state.answers.q4_2_significantCurrent = val;
      else if (groupName === 'q5_1_capacity') state.answers.q5_1_capacitySufficient = val;
      else if (groupName === 'q5_2_overwhelmed') state.answers.q5_2_systemOverwhelmed = val;

      window.IraEngine.evaluateRiskAlgorithm(state);
    });
  });

  // ข้อย่อย Segmented Radio (ใช่ / ไม่ใช่)
  document.querySelectorAll('.sub-choice-group input[type="radio"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const radioName = radio.name;
      const val = radio.value;
      const container = radio.closest('.sub-choice-group');
      const domain = container?.dataset?.domain;

      container?.querySelectorAll('.sub-choice-label').forEach(lbl => {
        lbl.classList.remove('active-yes', 'active-no');
      });
      const chosenLabel = radio.closest('.sub-choice-label');
      if (chosenLabel) chosenLabel.classList.add(val === 'yes' ? 'active-yes' : 'active-no');

      state.subAnswers[radioName] = val;
      if (domain) window.IraEngine.calculateDomainFromSubAnswers(domain, state);
    });
  });

  // ผูกการพิมพ์ฟิลด์ Metadata
  ['eventName', 'location', 'assessmentDate', 'assessorName', 'clinicalDetails', 'riskQuestion'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', (e) => {
        state.metadata[id] = e.target.value.trim();
        if (id === 'assessmentDate' && !state.currentAssessmentId) {
          updateActiveIdDisplay();
        }
        if (id === 'riskQuestion') {
          window.IraEngine.updateRiskDisplay(state);
        }
      });
    }
  });

  // ผูกบันทึกข้อความรายมิติ
  const domainNoteMap = [
    { id: 'note_q1_general', key: 'd1' },
    { id: 'note_q2_general', key: 'd2' },
    { id: 'note_q3_general', key: 'd3' },
    { id: 'note_q4_general', key: 'd4' },
    { id: 'note_q4_2_general', key: 'd4_2' },
    { id: 'note_q5_general', key: 'd5' },
    { id: 'note_q5_2_general', key: 'd5_2' }
  ];
  domainNoteMap.forEach(({ id, key }) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', (e) => {
        state.domainNotes[key] = e.target.value.trim();
      });
    }
  });
}

/**
 * ควบคุม Drawer ข้อย่อย (Sub-criteria) และ Input บันทึกย่อย
 */
function setupSubCriteriaDrawers() {
  // บันทึกข้อความลงใน state.notes เมื่อมีการพิมพ์ใน .sub-criterion-input
  document.querySelectorAll('.sub-criterion-input').forEach(inp => {
    inp.addEventListener('input', (e) => {
      state.notes[e.target.id] = e.target.value;
    });
  });
}

/**
 * ควบคุม Modal ตั้งค่าการเชื่อมต่อ (Settings Modal)
 */
function setupSettingsModal() {
  const modal = document.getElementById('settingsModal');
  const btnOpen = document.getElementById('btnOpenSettings');
  const btnClose = document.getElementById('btnCloseSettings');
  const btnSave = document.getElementById('btnSaveSettings');

  const inputApiKey = document.getElementById('settingTyphoonApiKey');
  const selectModel = document.getElementById('settingTyphoonModel');
  const inputSheetsUrl = document.getElementById('settingGoogleSheetsUrl');

  function openSettings() {
    if (inputApiKey) inputApiKey.value = state.settings.typhoonApiKey;
    if (selectModel) selectModel.value = state.settings.typhoonModel;
    if (inputSheetsUrl) inputSheetsUrl.value = state.settings.googleSheetsUrl;
    if (modal) modal.classList.add('open');
  }

  function closeSettings() {
    if (modal) modal.classList.remove('open');
  }

  if (btnOpen) btnOpen.addEventListener('click', openSettings);
  if (btnClose) btnClose.addEventListener('click', closeSettings);

  if (btnSave) {
    btnSave.addEventListener('click', () => {
      const newApiKey = (inputApiKey ? inputApiKey.value : '').trim();
      const newModel = (selectModel ? selectModel.value : '').trim() || (window.IraPrompts?.config?.defaultModel || 'typhoon-v2.5-30b-a3b-instruct');
      const newSheetsUrl = (inputSheetsUrl ? inputSheetsUrl.value : '').trim();

      state.settings.typhoonApiKey = newApiKey;
      state.settings.typhoonModel = newModel;
      state.settings.googleSheetsUrl = newSheetsUrl;

      localStorage.setItem('ira_typhoon_api_key', newApiKey);
      localStorage.setItem('ira_typhoon_model', newModel);
      localStorage.setItem('ira_google_sheets_url', newSheetsUrl);

      closeSettings();
      updateGoogleSheetsStatusUI();
      showToast('บันทึกการตั้งค่าเรียบร้อยแล้ว!', 'success');

      if (newSheetsUrl) {
        window.IraSheets.fetchEventsFromGoogleSheet(false, state, getAppHelpers());
      }
    });
  }
}

/**
 * ควบคุมแท็บ Responsive และแถบลอยบนมือถือ
 */
function setupMobileTabs() {
  const btnTabForm = document.getElementById('btnMobileTabForm');
  const btnTabResult = document.getElementById('btnMobileTabResult');
  const wizardCol = document.getElementById('wizardCol');
  const sidebarCol = document.getElementById('sidebarCol');
  const floatingBar = document.getElementById('mobileFloatingBar');
  const btnGoToResult = document.getElementById('btnMobileGoToResult');
  const btnBackToForm = document.getElementById('btnMobileBackToForm');

  function isMobileView() {
    return window.innerWidth <= 1024;
  }

  function switchTab(target) {
    if (!isMobileView()) {
      if (wizardCol) wizardCol.classList.remove('mobile-pane-hidden');
      if (sidebarCol) sidebarCol.classList.remove('mobile-pane-hidden');
      if (floatingBar) floatingBar.style.display = 'none';
      return;
    }

    if (target === 'result') {
      if (btnTabResult) btnTabResult.classList.add('active');
      if (btnTabForm) btnTabForm.classList.remove('active');
      if (wizardCol) wizardCol.classList.add('mobile-pane-hidden');
      if (sidebarCol) sidebarCol.classList.remove('mobile-pane-hidden');
      if (floatingBar) floatingBar.style.display = 'none';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      if (btnTabForm) btnTabForm.classList.add('active');
      if (btnTabResult) btnTabResult.classList.remove('active');
      if (wizardCol) wizardCol.classList.remove('mobile-pane-hidden');
      if (sidebarCol) sidebarCol.classList.add('mobile-pane-hidden');
      if (floatingBar) floatingBar.style.display = 'flex';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  if (btnTabForm) btnTabForm.addEventListener('click', () => switchTab('form'));
  if (btnTabResult) btnTabResult.addEventListener('click', () => switchTab('result'));
  if (btnGoToResult) btnGoToResult.addEventListener('click', () => switchTab('result'));
  if (btnBackToForm) btnBackToForm.addEventListener('click', () => switchTab('form'));

  if (isMobileView()) {
    switchTab('form');
  }

  window.addEventListener('resize', () => {
    if (!isMobileView()) {
      if (wizardCol) wizardCol.classList.remove('mobile-pane-hidden');
      if (sidebarCol) sidebarCol.classList.remove('mobile-pane-hidden');
      if (floatingBar) floatingBar.style.display = 'none';
    } else {
      const isResultActive = btnTabResult && btnTabResult.classList.contains('active');
      switchTab(isResultActive ? 'result' : 'form');
    }
  });
}

/**
 * โหลดตัวอย่างเคสกรณีศึกษาโรคระบาดอู่ฮั่น
 */
function loadPresetWuhanOutbreak() {
  setActiveAssessmentId(null);
  window.resetFormStateAndUI();

  state.metadata.eventName = 'การระบาดของโรคปอดอักเสบจากเชื้อไวรัสโคโรนาสายพันธุ์ใหม่ (Novel Coronavirus)';
  state.metadata.location = 'เมืองอู่ฮั่น มณฑลหูเป่ย์ (เชื่อมโยงตลาดค้าส่งอาหารทะเลและสัตว์ป่าฮวาหนาน)';
  state.metadata.assessmentDate = '2020-01-05';
  state.metadata.assessorName = 'ทีมสอบสวนโรคทางระบาดวิทยาภาคสนาม (FETP)';
  state.metadata.clinicalDetails = 'ผู้ป่วยเริ่มจาก 27 ราย เพิ่มเป็น 44 รายใน 1 สัปดาห์ มีอาการปอดอักเสบรุนแรงใน ICU 7 ราย (16%) ยังไม่มีรายงานผู้เสียชีวิต มีไข้ ไอ แน่นหน้าอก และเอกซเรย์พบฝ้าขาวที่ปอดทั้งสองข้าง (Bilateral Infiltrates)';
  state.metadata.riskQuestion = 'ประเมินความเสี่ยงต่อการแพร่กระจายของเชื้อไวรัสโคโรนาสายพันธุ์ใหม่ในชุมชนเมืองอู่ฮั่น และความเสี่ยงต่อการระบาดข้ามเมือง/ข้ามประเทศ';

  const eventNameInp = document.getElementById('eventName');
  const locationInp = document.getElementById('location');
  const dateInp = document.getElementById('assessmentDate');
  const assessorInp = document.getElementById('assessorName');
  const clinicInp = document.getElementById('clinicalDetails');
  const riskQuestionInp = document.getElementById('riskQuestion');

  if (eventNameInp) eventNameInp.value = state.metadata.eventName;
  if (locationInp) locationInp.value = state.metadata.location;
  if (dateInp) dateInp.value = state.metadata.assessmentDate;
  if (assessorInp) assessorInp.value = state.metadata.assessorName;
  if (clinicInp) clinicInp.value = state.metadata.clinicalDetails;
  if (riskQuestionInp) riskQuestionInp.value = state.metadata.riskQuestion;

  // ตอบคำถามตามเคสอู่ฮั่น (Novel Respiratory Virus = High Threat -> Priority Rule)
  state.answers.q1_highThreat = 'yes';
  state.answers.q2_exposureActive = 'yes';
  state.answers.q3_severityHigh = 'yes';
  state.answers.q4_spreadFuture = 'yes';
  state.answers.q5_1_capacitySufficient = 'no';
  state.answers.q5_2_systemOverwhelmed = 'yes';

  // ซิงก์ Radio ข้อหลัก
  window.IraEngine.setMainQuestionRadio('q1_highThreat', 'yes', state);
  window.IraEngine.setMainQuestionRadio('q5_1_capacity', 'no', state);

  // ตั้งค่าข้อย่อยสำหรับเคสอู่ฮั่น
  window.setSubChoiceVal('sub_d1_1', 'no');
  window.setSubChoiceVal('sub_d1_2', 'yes'); // Novel coronavirus
  window.setSubChoiceVal('sub_d1_3', 'no');
  window.setSubChoiceVal('sub_d1_4', 'no');
  window.setSubChoiceVal('sub_d2_a', 'yes');
  window.setSubChoiceVal('sub_d2_b', 'yes');
  window.setSubChoiceVal('sub_d2_c', 'yes');
  window.setSubChoiceVal('sub_d3_a', 'no');
  window.setSubChoiceVal('sub_d3_b', 'yes');
  window.setSubChoiceVal('sub_d3_c', 'yes');
  window.setSubChoiceVal('sub_d4_a', 'yes');
  window.setSubChoiceVal('sub_d4_b', 'yes');
  window.setSubChoiceVal('sub_d4_c', 'yes');
  window.setSubChoiceVal('sub_d5_a', 'no');
  window.setSubChoiceVal('sub_d5_b', 'no');
  window.setSubChoiceVal('sub_d5_c', 'no');
  window.setSubChoiceVal('sub_d5_d', 'yes');

  const noteD1_2 = document.getElementById('note_d1_2');
  if (noteD1_2) {
    noteD1_2.value = 'ตรวจพบเชื้อไวรัสโคโรนาสายพันธุ์ใหม่ (Novel Coronavirus 2019-nCoV)';
    state.notes['note_d1_2'] = noteD1_2.value;
  }
  const noteD5_d = document.getElementById('note_d5_d');
  if (noteD5_d) {
    noteD5_d.value = 'ขาดแคลนชุดตรวจ RT-PCR และเตียง ICU ในระยะเริ่มแรกของการระบาด';
    state.notes['note_d5_d'] = noteD5_d.value;
  }

  // คำนวณความเสี่ยงและอัปเดตผลลัพธ์
  window.IraEngine.evaluateRiskAlgorithm(state);

  window.scrollTo({ top: 0, behavior: 'smooth' });
  showToast('โหลดข้อมูลกรณีศึกษาตัวอย่าง "การระบาดโรคปอดอักเสบอู่ฮั่น" เรียบร้อยแล้ว', 'success');
}

// ==============================================================================
// Initialise application on DOM ready
// ==============================================================================
document.addEventListener('DOMContentLoaded', () => {
  setupOptionCards();
  setupSubCriteriaDrawers();
  setupSettingsModal();
  setupMobileTabs();

  // ประเมินเริ่มต้น (สถานะ Incomplete จะทำงาน แสดงเฉพาะข้อ 1)
  window.IraEngine.evaluateRiskAlgorithm(state);

  renderAuditTable();
  updateGoogleSheetsStatusUI();

  // ตั้งค่าวันที่ปัจจุบัน
  const dateInput = document.getElementById('assessmentDate');
  if (dateInput && !dateInput.value) {
    dateInput.value = state.metadata.assessmentDate;
  }

  // ตั้งค่า ID ถัดไป
  const hasSheet = !!state.settings.googleSheetsUrl;
  setActiveAssessmentId(null, hasSheet);

  // ผูกเหตุการณ์ปุ่มต่างๆ
  const btnGenAi = document.getElementById('btnGenerateAi');
  const btnSaveSheet = document.getElementById('btnSaveSheet');
  const btnCopyAi = document.getElementById('btnCopyAi');
  const btnExportCsv = document.getElementById('btnExportCsv');
  const btnPresetWuhan = document.getElementById('btnPresetWuhan');
  const btnReset = document.getElementById('btnResetForm');
  const btnPullSheet = document.getElementById('btnPullSheetEvents');
  const btnConnectSheetAudit = document.getElementById('btnConnectSheetFromAudit');
  const btnQuickConnectSheet = document.getElementById('btnQuickConnectSheet');
  const btnResetToNewCase = document.getElementById('btnResetToNewCase');

  const btnCloseDel = document.getElementById('btnCloseDeleteModal');
  const btnCancelDel = document.getElementById('btnCancelDelete');
  const btnConfirmDel = document.getElementById('btnConfirmDelete');
  const deletePassInp = document.getElementById('deletePassword');

  if (btnGenAi) btnGenAi.addEventListener('click', generateAiSummary);
  if (btnSaveSheet) btnSaveSheet.addEventListener('click', () => window.IraSheets.saveToGoogleSheets(state, getAppHelpers()));
  if (btnCopyAi) btnCopyAi.addEventListener('click', copyAiSummary);
  if (btnExportCsv) btnExportCsv.addEventListener('click', () => window.IraSheets.exportHistoryCSV(state, showToast));
  if (btnPresetWuhan) btnPresetWuhan.addEventListener('click', loadPresetWuhanOutbreak);
  if (btnPullSheet) btnPullSheet.addEventListener('click', () => window.IraSheets.fetchEventsFromGoogleSheet(false, state, getAppHelpers()));
  if (btnConnectSheetAudit) btnConnectSheetAudit.addEventListener('click', () => document.getElementById('btnOpenSettings')?.click());
  if (btnQuickConnectSheet) btnQuickConnectSheet.addEventListener('click', () => document.getElementById('btnOpenSettings')?.click());

  if (btnResetToNewCase) {
    btnResetToNewCase.addEventListener('click', () => {
      window.resetFormStateAndUI();
      ['eventName', 'location', 'clinicalDetails', 'riskQuestion'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
        state.metadata[id] = '';
      });
      state.metadata.assessmentDate = new Date().toISOString().split('T')[0];
      const dateInp = document.getElementById('assessmentDate');
      if (dateInp) dateInp.value = state.metadata.assessmentDate;

      setActiveAssessmentId(null);
      window.IraEngine.evaluateRiskAlgorithm(state);
      const nextId = window.IraSheets.generateNextAssessmentId(null, state);
      showToast(`ล้างหน้าจอและเปิดเซสชันสำหรับบันทึกเคสใหม่แล้ว (รหัสถัดไป: ${nextId})`, 'info');
    });
  }

  if (btnReset) {
    btnReset.addEventListener('click', () => {
      if (confirm('คุณต้องการล้างข้อมูลเพื่อเริ่มประเมินเหตุการณ์ใหม่หรือไม่?')) {
        location.reload();
      }
    });
  }

  if (btnCloseDel) btnCloseDel.addEventListener('click', closeDeleteModal);
  if (btnCancelDel) btnCancelDel.addEventListener('click', closeDeleteModal);
  if (btnConfirmDel) btnConfirmDel.addEventListener('click', () => window.IraSheets.executeDeleteEvent(state, getAppHelpers()));
  if (deletePassInp) {
    deletePassInp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') window.IraSheets.executeDeleteEvent(state, getAppHelpers());
    });
  }

  // หากเชื่อมต่อ Google Sheets URL ไว้ ให้ดึงข้อมูลประวัติทันที
  if (state.settings.googleSheetsUrl) {
    window.IraSheets.fetchEventsFromGoogleSheet(true, state, getAppHelpers());
  }
});

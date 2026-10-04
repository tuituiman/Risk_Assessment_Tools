/**
 * IRA Assistant - WHO Acute Event Initial Risk Assessment Engine
 * Based on WHO IRA Guidelines (Slides 25-40)
 */

// Application State
const state = {
  currentAssessmentId: null, // Track currently active assessment ID to prevent duplicate IDs on update
  latestSheetNextId: null,   // Authoritative next ID fetched from Google Sheet
  metadata: {
    eventName: '',
    location: '',
    assessmentDate: new Date().toISOString().split('T')[0],
    assessorName: '',
    clinicalDetails: ''
  },
  answers: {
    // Question 1: High Threat Hazard
    q1_highThreat: 'no', // 'yes', 'no', 'unk'

    // Question 2: Exposure
    q2_exposureActive: 'yes', // 'yes', 'no', 'unk'

    // Question 3: Severity
    q3_severityHigh: 'yes', // 'yes', 'no', 'unk'

    // Question 4: Spread
    q4_spreadFuture: 'yes', // 'yes', 'no', 'unk' (4.1)
    q4_2_significantCurrent: 'no', // 'yes', 'no' (4.2 when exposure = no)

    // Question 5: Capacity & System Overwhelm
    q5_1_capacitySufficient: 'no', // 'yes', 'no', 'unk'
    q5_2_systemOverwhelmed: 'yes'  // 'yes', 'no'
  },
  subAnswers: {
    // Domain 1 Sub-criteria
    sub_d1_1: 'no',
    sub_d1_2: 'no',
    sub_d1_3: 'no',
    sub_d1_4: 'no',

    // Domain 2 Sub-criteria (A, B, C)
    sub_d2_a: 'yes',
    sub_d2_b: 'yes',
    sub_d2_c: 'yes',

    // Domain 3 Sub-criteria (A, B, C)
    sub_d3_a: 'no',
    sub_d3_b: 'yes',
    sub_d3_c: 'no',

    // Domain 4.1 Sub-criteria (A, B, C)
    sub_d4_a: 'yes',
    sub_d4_b: 'yes',
    sub_d4_c: 'no',

    // Domain 5.1 Sub-criteria (A, B, C, D)
    sub_d5_a: 'no',
    sub_d5_b: 'no',
    sub_d5_c: 'no',
    sub_d5_d: 'yes'
  },
  notes: {},
  assessmentResult: {
    level: 'Moderate',
    levelTh: 'ปานกลาง',
    colorClass: 'risk-moderate',
    suggestedActions: [],
    rationaleBreakdown: {}
  },
  aiSummary: '',
  isAiGenerating: false,
  settings: {
    typhoonApiKey: (localStorage.getItem('ira_typhoon_api_key') || '').trim(),
    typhoonModel: (function () {
      const saved = (localStorage.getItem('ira_typhoon_model') || '').trim();
      if (!saved || saved === 'typhoon-v1.5x-70b-instruct') {
        return 'typhoon-v2.5-30b-a3b-instruct';
      }
      return saved;
    })(),
    googleSheetsUrl: (localStorage.getItem('ira_sheets_url') || '').trim()
  },
  auditHistory: JSON.parse(localStorage.getItem('ira_audit_history') || '[]')
};

// Recommended Actions Map according to WHO IRA slides 26 & 28
const RISK_ACTIONS = {
  'Very Low': {
    th: 'ต่ำมาก',
    class: 'risk-very-low',
    actions: [
      'ทำตามภาวะปกติ (Business as usual)',
      'ยุติการติดตามสัญญาณเหตุการณ์นี้ (Signal/event discarded)',
      'ไม่จำเป็นต้องติดตามเพิ่มเติมเป็นกรณีพิเศษ'
    ]
  },
  'Low': {
    th: 'ต่ำ',
    class: 'risk-low',
    actions: [
      'ติดตามและเฝ้าระวังสถานการณ์ตามระบบปกติ (Routine surveillance)',
      'หากจำเป็น ส่งข้อมูลประสานงานต่อให้จังหวัด/เขตใกล้เคียง หรือหน่วยงานที่เกี่ยวข้อง'
    ]
  },
  'Moderate': {
    th: 'ปานกลาง',
    class: 'risk-moderate',
    actions: [
      'แจ้งผู้บริหารระดับที่สูงกว่าปกติ 1 ระดับ (Inform management 1 level higher)',
      'พิจารณาส่งทีมเฝ้าระวังสอบสวนเคลื่อนที่เร็ว (RRT) ลงพื้นที่เกิดเหตุ',
      'ให้การสนับสนุนพื้นที่ เช่น วางระบบเฝ้าระวังเพิ่มเติม, การตรวจยืนยันทางห้องปฏิบัติการ (Lab), และสำรองเวชภัณฑ์'
    ]
  },
  'High': {
    th: 'สูง',
    class: 'risk-high',
    actions: [
      'แจ้งผู้บริหารระดับสั่งการ/บัญชาการทันที',
      'ส่งทีม RRT ระดับเขตหรือส่วนกลางเข้าสนับสนุนการควบคุมโรคในพื้นที่ทันที',
      'พิจารณาเปิดศูนย์ปฏิบัติการภาวะฉุกเฉิน (EOC) ในระดับจังหวัดหรือเขตสุขภาพ'
    ]
  },
  'Very High': {
    th: 'สูงมาก',
    class: 'risk-very-high',
    actions: [
      'แจ้งผู้บริหารระดับสูงสุดทันที (Inform top level of management)',
      'เปิดศูนย์ปฏิบัติการภาวะฉุกเฉิน (EOC) ในระดับชาติ (National Level EOC)',
      'ยกระดับมาตรการควบคุมขั้นสูงสุด และพิจารณาร้องขอความช่วยเหลือจากองค์กรระหว่างประเทศ (International Assistance)'
    ]
  }
};

/**
 * Toggle visibility of sub-criteria drawer
 */
window.toggleSubDrawer = function (drawerId, btnEl) {
  const el = document.getElementById(drawerId);
  if (!el) return;
  const isHidden = window.getComputedStyle(el).display === 'none' || el.style.display === 'none';

  if (isHidden) {
    el.style.display = 'flex';
    el.classList.add('open');
  } else {
    el.style.display = 'none';
    el.classList.remove('open');
  }

  // Identify triggering button if not explicitly passed
  if (!btnEl && window.event && window.event.currentTarget) {
    btnEl = window.event.currentTarget;
  }
  if (!btnEl) {
    btnEl = document.querySelector(`[onclick*="${drawerId}"]`);
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
 * Generate Sequential Assessment ID: IRA-{xxx}-20xx
 * xxx is 3-digit sequence starting from 001 upwards (001, 002, 003...)
 * 20xx is assessment year (e.g. 2026)
 * Automatically normalizes Thai Buddhist Era (2569 -> 2026) and trims whitespace
 */
function generateNextAssessmentId(customYear) {
  let year = customYear;
  if (!year) {
    const dateInput = document.getElementById('assessmentDate');
    const rawDate = (dateInput && dateInput.value) || state.metadata.assessmentDate;
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
    ceYear -= 543; // Convert Thai Buddhist Era (2569) to CE (2026)
  }
  const beYear = ceYear + 543;

  let maxSeq = 0;
  // Case-insensitive, tolerant of spaces around hyphens, handles both CE & BE years
  const regex = new RegExp(`^IRA\\s*-\\s*(\\d+)\\s*-\\s*(${ceYear}|${beYear})$`, 'i');

  (state.auditHistory || []).forEach(item => {
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

  // Check remote nextId if available
  if (state.latestSheetNextId) {
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
 * Update Dynamic Flow & Visibility of Cards
 * Shows/hides question cards along the decision path according to WHO IRA guidelines
 * Rule: Any skipped questions must be completely hidden (.hidden)
 */
function updateDynamicFlow() {
  const { answers } = state;

  const cardQ1 = document.getElementById('card_q1');
  const cardQ2 = document.getElementById('card_q2');
  const cardQ3 = document.getElementById('card_q3');
  const cardQ4_1 = document.getElementById('card_q4_1');
  const cardQ4_2 = document.getElementById('card_q4_2');
  const cardQ5_1 = document.getElementById('card_q5_1');
  const cardQ5_2 = document.getElementById('card_q5_2');

  const bannerQ1Skip = document.getElementById('banner_q1_skip');
  const bannerQ2Skip = document.getElementById('banner_q2_skip');
  const bannerQ4_2VeryLow = document.getElementById('banner_q4_2_verylow');

  const tag1 = document.getElementById('flowTag_q1');
  const tag2 = document.getElementById('flowTag_q2');
  const tag3 = document.getElementById('flowTag_q3');
  const tag4 = document.getElementById('flowTag_q4');
  const tag5 = document.getElementById('flowTag_q5');

  // Reset visual tags
  [tag1, tag2, tag3, tag4, tag5].forEach(t => {
    if (t) t.className = 'flow-step-tag';
  });

  if (tag1) tag1.classList.add('active');

  // Branch 1: High Threat Hazard is YES -> Skip Q2, Q3, Q4, and 5.2, jump directly to Q5.1 (Capacity)
  if (answers.q1_highThreat === 'yes') {
    if (bannerQ1Skip) bannerQ1Skip.style.display = 'flex';

    // Hide skipped cards completely (including 5.2)
    if (cardQ2) cardQ2.classList.add('hidden');
    if (cardQ3) cardQ3.classList.add('hidden');
    if (cardQ4_1) cardQ4_1.classList.add('hidden');
    if (cardQ4_2) cardQ4_2.classList.add('hidden');
    if (cardQ5_2) cardQ5_2.classList.add('hidden');

    // Show Capacity 5.1 only
    if (cardQ5_1) cardQ5_1.classList.remove('hidden');

    if (tag2) tag2.classList.add('skipped');
    if (tag3) tag3.classList.add('skipped');
    if (tag4) tag4.classList.add('skipped');
    if (tag5) tag5.classList.add('active', 'current');
    return;
  }

  // Branch 2: High Threat is NO -> Proceed to Exposure (Q2)
  if (bannerQ1Skip) bannerQ1Skip.style.display = 'none';
  if (cardQ2) cardQ2.classList.remove('hidden');
  if (tag2) tag2.classList.add('active');

  // Check Q2 (Exposure Active)
  if (answers.q2_exposureActive === 'no') {
    if (bannerQ2Skip) bannerQ2Skip.style.display = 'flex';

    // Skip Q3 and Q4.1 -> Hide them completely
    if (cardQ3) cardQ3.classList.add('hidden');
    if (cardQ4_1) cardQ4_1.classList.add('hidden');
    if (cardQ4_2) cardQ4_2.classList.remove('hidden');
    if (cardQ5_2) cardQ5_2.classList.add('hidden');

    if (tag3) tag3.classList.add('skipped');
    if (tag4) {
      tag4.textContent = '4.2 ขนาดผลกระทบ';
      tag4.classList.add('active');
    }

    if (answers.q4_2_significantCurrent === 'yes') {
      if (cardQ5_1) cardQ5_1.classList.remove('hidden');
      if (bannerQ4_2VeryLow) bannerQ4_2VeryLow.style.display = 'none';
      if (tag5) tag5.classList.add('active', 'current');
    } else {
      // Very Low Risk immediately -> Hide Q5.1 and Q5.2 completely
      if (cardQ5_1) cardQ5_1.classList.add('hidden');
      if (bannerQ4_2VeryLow) bannerQ4_2VeryLow.style.display = 'flex';
      if (tag5) tag5.classList.add('skipped');
    }
    return;
  }

  // Exposure is YES -> Proceed to Severity (Q3) and Future Spread (Q4.1)
  if (bannerQ2Skip) bannerQ2Skip.style.display = 'none';
  if (cardQ3) cardQ3.classList.remove('hidden');
  if (cardQ4_1) cardQ4_1.classList.remove('hidden');
  if (cardQ4_2) cardQ4_2.classList.add('hidden');
  if (cardQ5_1) cardQ5_1.classList.remove('hidden');

  if (tag3) tag3.classList.add('active');
  if (tag4) {
    tag4.textContent = '4.1 การแพร่ระบาด';
    tag4.classList.add('active');
  }

  // System Overwhelmed (Q5.2) appears when Severity is High AND Spread is High
  const severityHigh = answers.q3_severityHigh !== 'no';
  const spreadHigh = answers.q4_spreadFuture !== 'no';

  if (severityHigh && spreadHigh) {
    if (cardQ5_2) cardQ5_2.classList.remove('hidden');
  } else {
    // If not both severe and high spread, hide 5.2
    if (cardQ5_2) cardQ5_2.classList.add('hidden');
  }

  if (tag5) tag5.classList.add('active', 'current');
}

/**
 * Core Algorithm: WHO Initial Risk Assessment (Slides 25-40)
 */
function evaluateRiskAlgorithm() {
  const { answers } = state;
  let level = 'Moderate';
  let rationale = {};

  // Step 1: High Threat Hazard (Tier 4)
  if (answers.q1_highThreat === 'yes') {
    rationale.step1 = 'พบเชื้อ/ภัยคุกคามระดับสูง (High Threat Hazard)';

    // Jump straight to Domain 5.1 (Capacity) without doing 5.2 (Tier 4)
    if (answers.q5_1_capacitySufficient === 'yes') {
      level = 'High';
      rationale.step5 = 'ศักยภาพการควบคุมในพื้นที่เพียงพอ -> เสี่ยงสูง (High)';
    } else {
      level = 'Very High';
      rationale.step5 = 'ศักยภาพการควบคุมไม่เพียงพอ/ไม่แน่ชัด -> เสี่ยงสูงมาก (Very High)';
    }
  } else {
    rationale.step1 = 'ไม่ใช่เชื้อ/ภัยคุกคามระดับสูงที่กำหนดไว้เบื้องต้น';

    // Step 2: Exposure
    if (answers.q2_exposureActive === 'no') {
      rationale.step2 = 'ไม่มีการสัมผัสต่อเนื่องแล้ว';

      // Check 4.2 (WHO 4.1): significant number currently affected?
      if (answers.q4_2_significantCurrent === 'yes') {
        rationale.step4 = 'มีผู้ได้รับผลกระทบเป็นจำนวนมากในปัจจุบัน (Tier 1)';
        if (answers.q5_1_capacitySufficient === 'yes') {
          level = 'Very Low';
          rationale.step5 = 'มีศักยภาพการควบคุมเพียงพอ -> เสี่ยงต่ำมาก (Very Low)';
        } else {
          level = 'Low';
          rationale.step5 = 'ศักยภาพไม่เพียงพอ/ไม่แน่ชัด -> เสี่ยงต่ำ (Low)';
        }
      } else {
        rationale.step4 = 'ไม่มีผู้ได้รับผลกระทบจำนวนมาก (สิ้นสุดการติดตาม)';
        level = 'Very Low';
      }
    } else {
      // Exposure is 'yes' or 'unk'
      rationale.step2 = 'ประชาชนยังคงมีการสัมผัสหรือมีโอกาสสัมผัสต่อเนื่อง';

      // Step 3: Severity
      if (answers.q3_severityHigh === 'no') {
        rationale.step3 = 'ความรุนแรงทางคลินิกต่ำ ไม่ถึงระดับปานกลาง-สูง';

        // Check 4.1 (WHO 4.2 Spread)
        if (answers.q4_spreadFuture === 'yes' || answers.q4_spreadFuture === 'unk') {
          rationale.step4 = 'คาดว่าจะมีการแพร่ระบาดเพิ่มมากหรือขยายพื้นที่ (Tier 2)';
          if (answers.q5_1_capacitySufficient === 'yes') {
            level = 'Low';
            rationale.step5 = 'มีศักยภาพเพียงพอ -> เสี่ยงต่ำ (Low)';
          } else {
            level = 'Moderate';
            rationale.step5 = 'ศักยภาพไม่เพียงพอ/ไม่แน่ชัด -> เสี่ยงปานกลาง (Moderate)';
          }
        } else {
          // Spread is 'no' (Tier 1)
          rationale.step4 = 'ไม่คาดว่าจะมีการแพร่ระบาดขยายวงกว้าง (Tier 1)';
          if (answers.q5_1_capacitySufficient === 'yes') {
            level = 'Very Low';
            rationale.step5 = 'มีศักยภาพเพียงพอ -> เสี่ยงต่ำมาก (Very Low)';
          } else {
            level = 'Low';
            rationale.step5 = 'ศักยภาพไม่เพียงพอ/ไม่แน่ชัด -> เสี่ยงต่ำ (Low)';
          }
        }
      } else {
        // Severity is 'yes' or 'unk'
        rationale.step3 = 'ความรุนแรงของโรคอยู่ในระดับปานกลางถึงสูง (CFR/อาการวิกฤต)';

        // Check 4.1 (WHO 4.2 Spread)
        if (answers.q4_spreadFuture === 'yes' || answers.q4_spreadFuture === 'unk') {
          rationale.step4 = 'คาดว่าจะมีการแพร่กระจายสูง/จำนวนป่วยพุ่งขึ้น';

          // Check 5.2 System Overwhelmed
          if (answers.q5_2_systemOverwhelmed === 'yes') {
            rationale.step5_2 = 'ระบบบริการสุขภาพมีแนวโน้มจะล่ม (Overwhelmed - Tier 4)';
            if (answers.q5_1_capacitySufficient === 'yes') {
              level = 'High';
              rationale.step5 = 'ระบบสุขภาพล่มแต่มีศักยภาพรองรับบางส่วน -> เสี่ยงสูง (High)';
            } else {
              level = 'Very High';
              rationale.step5 = 'ระบบสุขภาพล่มและศักยภาพไม่เพียงพอ -> เสี่ยงสูงมาก (Very High)';
            }
          } else {
            rationale.step5_2 = 'ระบบบริการสุขภาพยังไม่ถึงขั้นล่ม (Tier 3)';
            if (answers.q5_1_capacitySufficient === 'yes') {
              level = 'Moderate';
              rationale.step5 = 'ระบบยังไม่ล่มและมีศักยภาพเพียงพอ -> เสี่ยงปานกลาง (Moderate)';
            } else {
              level = 'High';
              rationale.step5 = 'ระบบยังไม่ล่มแต่ศักยภาพไม่เพียงพอ -> เสี่ยงสูง (High)';
            }
          }
        } else {
          // Spread is 'no' (Severity Yes, Spread No -> Tier 2)
          rationale.step4 = 'ไม่คาดว่าเชื้อจะแพร่ระบาดขยายวงกว้าง (Tier 2)';
          if (answers.q5_1_capacitySufficient === 'yes') {
            level = 'Low';
            rationale.step5 = 'มีศักยภาพเพียงพอ -> เสี่ยงต่ำ (Low)';
          } else {
            level = 'Moderate';
            rationale.step5 = 'ศักยภาพไม่เพียงพอ/ไม่แน่ชัด -> เสี่ยงปานกลาง (Moderate)';
          }
        }
      }
    }
  }

  // Update State Result
  const conf = RISK_ACTIONS[level];
  state.assessmentResult = {
    level: level,
    levelTh: conf.th,
    colorClass: conf.class,
    suggestedActions: conf.actions,
    rationaleBreakdown: rationale
  };

  updateDynamicFlow();
  renderResultCard();
}

/**
 * Render Live Result Card
 */
function renderResultCard() {
  const { assessmentResult, answers } = state;
  const card = document.getElementById('riskResultCard');
  const badgeBox = document.getElementById('riskBadgeBox');
  const levelEl = document.getElementById('riskLevelText');
  const levelEnEl = document.getElementById('riskLevelEn');
  const actionsListEl = document.getElementById('suggestedActionsList');

  if (!card) return;

  // Reset classes
  card.className = `glass-card risk-result-card ${assessmentResult.colorClass}`;
  badgeBox.className = `risk-badge-box ${assessmentResult.colorClass}`;

  levelEl.textContent = `ระดับความเสี่ยง: ${assessmentResult.levelTh}`;
  levelEnEl.textContent = `${assessmentResult.level.toUpperCase()} RISK`;

  // Render Explicit Verdict Summary & Decision Drivers
  const verdictSummaryEl = document.getElementById('riskVerdictSummary');
  const verdictDescEl = document.getElementById('riskVerdictDesc');
  const verdictDriversEl = document.getElementById('riskVerdictDrivers');

  if (verdictSummaryEl && verdictDescEl) {
    verdictSummaryEl.className = `risk-verdict-summary ${assessmentResult.colorClass}`;

    let descText = '';
    const lvl = assessmentResult.level;
    if (lvl === 'Very High') {
      descText = `เหตุการณ์นี้ถูกประเมินว่ามี <strong>ความเสี่ยงระดับสูงมาก (Very High Risk)</strong> เนื่องจากเป็นสถานการณ์ฉุกเฉินที่มีความรุนแรงสูงหรือมีแนวโน้มแพร่ระบาดขยายวงกว้าง โดยที่ทรัพยากรและศักยภาพของระบบสาธารณสุขในพื้นที่ไม่เพียงพอต่อการควบคุม จำเป็นต้องเปิด EOC และยกระดับมาตรการระดับชาติทันที`;
    } else if (lvl === 'High') {
      descText = `เหตุการณ์นี้ถูกประเมินว่ามี <strong>ความเสี่ยงระดับสูง (High Risk)</strong> เนื่องจากมีความรุนแรงทางคลินิกหรือการสัมผัสแพร่กระจายอย่างต่อเนื่อง แม้ระบบยังพอประคับประคองได้ แต่จำเป็นต้องเตรียมการรองรับอย่างเข้มงวด`;
    } else if (lvl === 'Moderate') {
      descText = `เหตุการณ์นี้ถูกประเมินว่ามี <strong>ความเสี่ยงระดับปานกลาง (Moderate Risk)</strong> เนื่องจากความรุนแรงหรือการแพร่กระจายยังอยู่ในขอบเขตที่ศักยภาพและระบบบริการสาธารณสุขปกติสามารถควบคุมและจัดการได้`;
    } else if (lvl === 'Low') {
      descText = `เหตุการณ์นี้ถูกประเมินว่ามี <strong>ความเสี่ยงระดับต่ำ (Low Risk)</strong> ความรุนแรงต่ำ หรือสิ้นสุดการสัมผัสแล้วโดยมีผู้ได้รับผลกระทบในวงจำกัด สามารถบริหารจัดการด้วยมาตรการเฝ้าระวังและดูแลรักษาตามมาตรฐาน`;
    } else {
      descText = `เหตุการณ์นี้ถูกประเมินว่ามี <strong>ความเสี่ยงระดับต่ำมาก (Very Low Risk)</strong> สิ้นสุดการสัมผัสแล้วและไม่มีผู้ได้รับผลกระทบเป็นจำนวนมาก ให้ติดตามเฝ้าระวังทางระบาดวิทยาตามวงรอบปกติ`;
    }
    verdictDescEl.innerHTML = descText;

    if (verdictDriversEl) {
      const r = assessmentResult.rationaleBreakdown;
      const driverItems = [];
      if (r.step1) driverItems.push(`<span>• <strong>ข้อ 1 ภัยคุกคาม:</strong> ${r.step1}</span>`);
      if (r.step2) driverItems.push(`<span>• <strong>ข้อ 2 การสัมผัส:</strong> ${r.step2}</span>`);
      if (r.step3) driverItems.push(`<span>• <strong>ข้อ 3 ความรุนแรง:</strong> ${r.step3}</span>`);
      if (r.step4) driverItems.push(`<span>• <strong>ข้อ 4 การแพร่กระจาย:</strong> ${r.step4}</span>`);
      if (r.step5_1) driverItems.push(`<span>• <strong>ข้อ 5.1 ศักยภาพระบบ:</strong> ${r.step5_1}</span>`);
      if (r.step5_2) driverItems.push(`<span>• <strong>ข้อ 5.2 ความเสี่ยงระบบล่ม:</strong> ${r.step5_2}</span>`);

      verdictDriversEl.innerHTML = driverItems.map(item => `<div class="verdict-driver-item">${item}</div>`).join('');
    }
  }

  // Actions
  actionsListEl.innerHTML = assessmentResult.suggestedActions
    .map(act => `<li>${act}</li>`)
    .join('');

  // Update Domain Status Pills
  updateDomainPill('pill-d1', answers.q1_highThreat);
  updateDomainPill('pill-d2', answers.q1_highThreat === 'yes' ? 'skip' : answers.q2_exposureActive);
  updateDomainPill('pill-d3', answers.q1_highThreat === 'yes' || answers.q2_exposureActive === 'no' ? 'skip' : answers.q3_severityHigh);
  updateDomainPill('pill-d4', answers.q1_highThreat === 'yes' ? 'skip' : (answers.q2_exposureActive === 'no' ? answers.q4_2_significantCurrent : answers.q4_spreadFuture));
  updateDomainPill('pill-d5', answers.q1_highThreat === 'yes' ? answers.q5_1_capacitySufficient : (answers.q2_exposureActive === 'no' && answers.q4_2_significantCurrent === 'no' ? 'skip' : answers.q5_1_capacitySufficient));

  // Update mobile badges
  const mobBadge = document.getElementById('mobileRiskBadge');
  if (mobBadge) {
    mobBadge.textContent = assessmentResult.levelTh;
  }
  const mobFloatText = document.getElementById('mobileFloatingText');
  if (mobFloatText) {
    mobFloatText.textContent = `ความเสี่ยง: ${assessmentResult.levelTh}`;
  }
}

function updateDomainPill(elId, val) {
  const el = document.getElementById(elId);
  if (!el) return;

  if (val === 'yes') {
    el.className = 'domain-pill-status status-yes';
    el.textContent = 'ใช่ (Yes)';
  } else if (val === 'no') {
    el.className = 'domain-pill-status status-no';
    el.textContent = 'ไม่ใช่ (No)';
  } else if (val === 'unk') {
    el.className = 'domain-pill-status status-unk';
    el.textContent = 'ไม่แน่ชัด (Unk)';
  } else if (val === 'skip') {
    el.className = 'domain-pill-status status-skip';
    el.textContent = 'ข้าม (Skip)';
  } else {
    el.className = 'domain-pill-status';
    el.textContent = '-';
  }
}

/**
 * Handle Option Card Selection & Input Bindings
 */
function setupOptionCards() {
  // Main Domain Options (Cards)
  document.querySelectorAll('.opt-card').forEach(card => {
    card.addEventListener('click', () => {
      const input = card.querySelector('input');
      if (!input) return;

      const groupName = input.name;
      const val = input.value;

      // Unselect siblings
      document.querySelectorAll(`input[name="${groupName}"]`).forEach(inp => {
        inp.closest('.opt-card')?.classList.remove('selected', 'danger-selected');
      });

      input.checked = true;
      card.classList.add('selected');

      // Update state
      if (groupName === 'q1_highThreat') {
        state.answers.q1_highThreat = val;
      } else if (groupName === 'q2_exposure') {
        state.answers.q2_exposureActive = val;
      } else if (groupName === 'q3_severity') {
        state.answers.q3_severityHigh = val;
      } else if (groupName === 'q4_spread') {
        state.answers.q4_spreadFuture = val;
      } else if (groupName === 'q4_2_significant') {
        state.answers.q4_2_significantCurrent = val;
      } else if (groupName === 'q5_1_capacity') {
        state.answers.q5_1_capacitySufficient = val;
      } else if (groupName === 'q5_2_overwhelmed') {
        state.answers.q5_2_systemOverwhelmed = val;
      }

      evaluateRiskAlgorithm();
    });
  });

  // Setup Sub-Criteria Segmented Choice Buttons (ใช่ / ไม่ใช่)
  document.querySelectorAll('.sub-choice-group input[type="radio"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const radioName = radio.name; // e.g. sub_d1_1
      const val = radio.value; // 'yes' or 'no'
      const container = radio.closest('.sub-choice-group');
      const domain = container.dataset.domain;

      // Update UI classes on label
      container.querySelectorAll('.sub-choice-label').forEach(lbl => {
        lbl.classList.remove('active-yes', 'active-no');
      });
      const chosenLabel = radio.closest('.sub-choice-label');
      if (chosenLabel) {
        chosenLabel.classList.add(val === 'yes' ? 'active-yes' : 'active-no');
      }

      state.subAnswers[radioName] = val;

      // Auto-calculate parent domain
      calculateDomainFromSubAnswers(domain);
    });
  });

  // Bind Metadata Inputs
  ['eventName', 'location', 'assessmentDate', 'assessorName', 'clinicalDetails'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', (e) => {
        state.metadata[id] = e.target.value;
        if (id === 'assessmentDate' && !state.currentAssessmentId) {
          setActiveAssessmentId(null);
        }
      });
    }
  });

  // Collect notes on input change
  document.querySelectorAll('.domain-notes-textarea, .sub-criterion-input').forEach(inp => {
    inp.addEventListener('input', (e) => {
      state.notes[e.target.id] = e.target.value;
    });
  });
}

/**
 * Calculate parent domain main answer automatically from sub-criteria (WHO IRA logic)
 */
function calculateDomainFromSubAnswers(domain) {
  const sa = state.subAnswers;

  if (domain === 'q1') {
    // Slide 30: If ANY sub-hazard is Yes -> Q1 is Yes; if ALL are No -> Q1 is No
    const anyYes = ['sub_d1_1', 'sub_d1_2', 'sub_d1_3', 'sub_d1_4'].some(k => sa[k] === 'yes');
    setMainRadioVal('q1_highThreat', anyYes ? 'yes' : 'no');
  } else if (domain === 'q2') {
    // Slide 32: All 3 components (source, pathway, susceptibility) required for continuous exposure
    const allYes = sa['sub_d2_a'] === 'yes' && sa['sub_d2_b'] === 'yes' && sa['sub_d2_c'] === 'yes';
    setMainRadioVal('q2_exposure', allYes ? 'yes' : 'no');
  } else if (domain === 'q3') {
    // Slide 34: Any of A, B, C is Yes -> Q3 is Yes; else No
    const anyYes = ['sub_d3_a', 'sub_d3_b', 'sub_d3_c'].some(k => sa[k] === 'yes');
    setMainRadioVal('q3_severity', anyYes ? 'yes' : 'no');
  } else if (domain === 'q4') {
    // Slide 36: Any of A, B, C is Yes -> Q4.1 is Yes; else No
    const anyYes = ['sub_d4_a', 'sub_d4_b', 'sub_d4_c'].some(k => sa[k] === 'yes');
    setMainRadioVal('q4_spread', anyYes ? 'yes' : 'no');
  } else if (domain === 'q5_1') {
    // Slide 39: Capacities A, B, C must be Yes AND Obstacle D must be No
    const capacitiesMet = sa['sub_d5_a'] === 'yes' && sa['sub_d5_b'] === 'yes' && sa['sub_d5_c'] === 'yes';
    const noObstacle = sa['sub_d5_d'] === 'no';
    const capacitySufficient = capacitiesMet && noObstacle;
    setMainRadioVal('q5_1_capacity', capacitySufficient ? 'yes' : 'no');

    // If Obstacle D is Yes (critical shortage/ICU overwhelmed), suggest/set Q5.2 = Yes
    if (sa['sub_d5_d'] === 'yes') {
      setMainRadioVal('q5_2_overwhelmed', 'yes');
    }
  }

  evaluateRiskAlgorithm();
}

/**
 * Programmatically set main radio value and update its card highlight
 */
function setMainRadioVal(groupName, val) {
  if (groupName === 'q1_highThreat') state.answers.q1_highThreat = val;
  else if (groupName === 'q2_exposure') state.answers.q2_exposureActive = val;
  else if (groupName === 'q3_severity') state.answers.q3_severityHigh = val;
  else if (groupName === 'q4_spread') state.answers.q4_spreadFuture = val;
  else if (groupName === 'q4_2_significant') state.answers.q4_2_significantCurrent = val;
  else if (groupName === 'q5_1_capacity') state.answers.q5_1_capacitySufficient = val;
  else if (groupName === 'q5_2_overwhelmed') state.answers.q5_2_systemOverwhelmed = val;

  const radio = document.querySelector(`input[name="${groupName}"][value="${val}"]`);
  if (radio) {
    radio.checked = true;
    document.querySelectorAll(`input[name="${groupName}"]`).forEach(inp => {
      inp.closest('.opt-card')?.classList.remove('selected', 'danger-selected');
    });
    radio.closest('.opt-card')?.classList.add('selected');
  }
}

/**
 * Set sub-criteria choice button value programmatically
 */
function setSubChoiceVal(subId, val) {
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
}

/**
 * Track Active Assessment ID (Prevent opening duplicate IDs when editing the same event)
 * Displays either the active existing ID or preview of next sequential ID (IRA-{xxx}-20xx)
 */
function setActiveAssessmentId(id, isSyncing = false, isOffline = false) {
  state.currentAssessmentId = id || null;
  const tag = document.getElementById('eventEditStatusTag');
  const textEl = document.getElementById('activeEventIdText');
  const modeLabel = document.getElementById('eventModeLabel');
  const subNote = document.getElementById('eventSubNote');
  const btnReset = document.getElementById('btnResetToNewCase');

  if (tag && textEl) {
    tag.style.display = 'inline-flex';
    if (id) {
      textEl.textContent = id;
      if (modeLabel) modeLabel.textContent = '📁 เรื่องเดิม: ';
      if (subNote) subNote.textContent = '(บันทึกทับ ID เดิม)';
      if (btnReset) btnReset.style.display = 'inline-block';
    } else {
      if (isSyncing) {
        textEl.textContent = '⏳ กำลังเช็คชีต...';
        if (modeLabel) modeLabel.textContent = '🏷️ รหัสถัดไป: ';
        if (subNote) subNote.textContent = '(กำลังตรวจเช็คกับ Google Sheet)';
        if (btnReset) btnReset.style.display = 'none';
      } else {
        const nextId = generateNextAssessmentId();
        textEl.textContent = nextId;
        if (modeLabel) modeLabel.textContent = '🏷️ รหัสถัดไป: ';
        const hasSheet = !!state.settings.googleSheetsUrl;
        if (subNote) {
          if (isOffline) {
            subNote.textContent = '(โหมดออฟไลน์: ใช้ข้อมูลในเครื่อง)';
          } else if (hasSheet) {
            subNote.textContent = '(ซิงก์ตรงกับ Google Sheet)';
          } else {
            subNote.textContent = '(สร้างใหม่อัตโนมัติ - ยังไม่ต่อ Sheet)';
          }
        }
        if (btnReset) btnReset.style.display = 'none';
      }
    }
  }
}

/**
 * Gather All Filled User Notes and Sub-Criteria States for Typhoon AI & Sheets
 * Conflict Resolution Logic:
 * If the user did not assess sub-criteria, or if the user manually adjusted the main domain choices,
 * prioritize the main domain decision as authoritative.
 * Any sub-criteria points that contradict the main domain evaluation will be filtered out.
 */
function compileUserNotes() {
  const notesList = [];
  const ans = state.answers;

  // 1. Explicit Domain Summaries (Source of Truth - ข้อหลัก)
  const d1Verdict = ans.q1_highThreat === 'yes' ? 'ใช่ - เป็นเชื้อหรือภัยคุกคามระดับสูงที่กำหนด' : 'ไม่ใช่/ไม่แน่ชัด - ไม่จัดเป็นเชื้อคุกคามระดับสูงเบื้องต้น';
  const d2Verdict = ans.q2_exposureActive === 'yes' ? 'ใช่ - ประชาชนยังมีแนวโน้มการสัมผัสต่อเนื่อง' : 'ไม่ใช่ - ยุติการสัมผัสแล้วหรือไม่มีแนวโน้มสัมผัสต่อเนื่อง';
  const d3Verdict = ans.q3_severityHigh === 'yes' ? 'ใช่ - มีความรุนแรงทางคลินิกสูง (CFR/วิกฤต/ICU)' : 'ไม่ใช่ - ความรุนแรงทางคลินิกปานกลางถึงต่ำ';
  const d4Verdict = ans.q4_spreadFuture === 'yes' ? 'ใช่ - มีแนวโน้มการแพร่ระบาดขยายวงกว้างสูง' : 'ไม่ใช่ - แนวโน้มการแพร่กระจายต่ำ/อยู่ในขอบเขตจำกัด';
  const d5Verdict = ans.q5_1_capacitySufficient === 'yes' ? 'ใช่ - ศักยภาพและทรัพยากรในพื้นที่เพียงพอ' : 'ไม่ใช่ - ศักยภาพยังไม่เพียงพอต่อการควบคุม';
  const d52Verdict = ans.q5_2_systemOverwhelmed === 'yes' ? 'ใช่ - ระบบบริการสุขภาพมีแนวโน้มล่ม (Overwhelmed)' : 'ไม่ใช่ - ระบบบริการสุขภาพยังคงรองรับได้';

  notesList.push(`[ข้อสรุปการประเมินข้อหลักทั้ง 5 ข้อ (ยึดตามข้อหลักเป็นข้อยุติสูงสุด)]:`);
  notesList.push(`- ข้อ 1 (ภัยคุกคามระดับสูง): ${d1Verdict}`);
  if (ans.q1_highThreat !== 'yes') {
    notesList.push(`- ข้อ 2 (การสัมผัส): ${d2Verdict}`);
    if (ans.q2_exposureActive === 'yes') {
      notesList.push(`- ข้อ 3 (ความรุนแรงทางคลินิก): ${d3Verdict}`);
      notesList.push(`- ข้อ 4.1 (การแพร่กระจาย): ${d4Verdict}`);
    } else {
      const q42Verdict = ans.q4_2_significantCurrent === 'yes' ? 'มีผู้ได้รับผลกระทบเป็นจำนวนมาก' : 'ไม่มีผู้ได้รับผลกระทบจำนวนมาก';
      notesList.push(`- ข้อ 4.2 (ผลกระทบปัจจุบัน): ${q42Verdict}`);
    }
  }
  notesList.push(`- ข้อ 5.1 (ศักยภาพระบบ): ${d5Verdict}`);
  if (ans.q1_highThreat !== 'yes' && ans.q3_severityHigh === 'yes' && ans.q4_spreadFuture === 'yes') {
    notesList.push(`- ข้อ 5.2 (ระบบสุขภาพล่ม): ${d52Verdict}`);
  }

  // 2. Filter Sub-Criteria based on Main Domain Choices (Remove Contradictions)
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
    const val = state.subAnswers[item.id] || 'no';
    const noteEl = document.getElementById(item.noteId);
    const noteText = noteEl ? noteEl.value.trim() : '';

    // Check conflict against main domain choices
    let isConflicting = false;

    // Conflict Check 1: If main Domain 1 is 'no', sub-criteria asserting it is a high-threat pathogen (val === 'yes') contradicts main choice!
    if (item.domain === 'd1' && ans.q1_highThreat !== 'yes' && val === 'yes') {
      isConflicting = true;
    }

    // Conflict Check 2: If main Domain 2 is 'no' (no exposure), sub-criteria asserting ongoing exposure (val === 'yes') contradicts main choice!
    if (item.domain === 'd2' && ans.q2_exposureActive === 'no' && val === 'yes') {
      isConflicting = true;
    }

    // Conflict Check 3: If main Domain 3 is 'no' (not severe), sub-criteria asserting severe ICU/CFR (val === 'yes') contradicts main choice!
    if (item.domain === 'd3' && ans.q3_severityHigh === 'no' && val === 'yes') {
      isConflicting = true;
    }

    // Conflict Check 4: If main Domain 4.1 is 'no' (spread not high), sub-criteria asserting explosive spread (val === 'yes') contradicts main choice!
    if (item.domain === 'd4' && ans.q4_spreadFuture === 'no' && val === 'yes') {
      isConflicting = true;
    }

    // Conflict Check 5: If main Domain 5.1 is 'yes' (sufficient capacity) and 5.2 is 'no' (not overwhelmed), obstacle 5.1D = 'yes' contradicts main choice!
    if (item.domain === 'd5_d' && ans.q5_1_capacitySufficient === 'yes' && ans.q5_2_systemOverwhelmed === 'no' && val === 'yes') {
      isConflicting = true;
    }

    // If conflicting with the main domain choice, EXCLUDE it from the summary!
    if (isConflicting) return;

    if (val === 'yes' || noteText) {
      const statusTh = val === 'yes' ? 'ใช่ (Yes)' : 'ไม่ใช่ (No)';
      validSubNotes.push(`- ${item.label}: สถานะ=${statusTh}${noteText ? ` [บันทึก: ${noteText}]` : ''}`);
    }
  });

  if (validSubNotes.length > 0) {
    notesList.push(`\n[ข้อมูลสนับสนุนและบันทึกข้อย่อยที่สอดคล้องกับข้อหลัก]:`);
    notesList.push(...validSubNotes);
  }

  // 3. General domain notes (if present)
  const generalNotes = [
    { id: 'note_q1_general', label: 'บันทึกภาพรวมข้อ 1 (ภัยคุกคาม)' },
    { id: 'note_q2_general', label: 'บันทึกภาพรวมข้อ 2 (การสัมผัส)' },
    { id: 'note_q3_general', label: 'บันทึกภาพรวมข้อ 3 (ความรุนแรง)' },
    { id: 'note_q4_general', label: 'บันทึกภาพรวมข้อ 4.1 (การแพร่กระจาย)' },
    { id: 'note_q4_2_general', label: 'บันทึกภาพรวมข้อ 4.2 (ผู้ได้รับผลกระทบ)' },
    { id: 'note_q5_2_general', label: 'บันทึกภาพรวมข้อ 5.2 (ระบบสุขภาพล่ม)' },
    { id: 'note_q5_general', label: 'บันทึกภาพรวมข้อ 5.1 (ศักยภาพระบบ)' }
  ];

  const validGeneral = [];
  generalNotes.forEach(f => {
    const el = document.getElementById(f.id);
    if (el && el.value.trim()) {
      validGeneral.push(`- ${f.label}: ${el.value.trim()}`);
    }
  });

  if (validGeneral.length > 0) {
    notesList.push(`\n[บันทึกประกอบเพิ่มเติมจากผู้ประเมิน]:`);
    notesList.push(...validGeneral);
  }

  return notesList.join('\n');
}

/**
 * Typhoon AI Integration
 * Generates an official executive narrative summary based on IRA results + user notes
 */
async function generateAiSummary() {
  const apiKey = state.settings.typhoonApiKey.trim();
  const summaryBox = document.getElementById('aiNarrativeBox');
  const spinner = document.getElementById('aiSpinner');
  const btn = document.getElementById('btnGenerateAi');

  if (state.isAiGenerating) return;

  state.isAiGenerating = true;
  btn.disabled = true;
  spinner.style.display = 'flex';
  summaryBox.style.opacity = '0.5';

  const metadata = state.metadata;
  const result = state.assessmentResult;
  const answers = state.answers;

  const eventName = metadata.eventName || 'เหตุการณ์เฝ้าระวังทางสาธารณสุข';
  const location = metadata.location || 'พื้นที่เกิดเหตุ';
  const details = metadata.clinicalDetails || 'มีรายงานผู้ป่วยอาการเข้าข่ายนิยามเฝ้าระวัง';
  const userNotesCompiled = compileUserNotes() || '- ไม่มีการระบุบันทึกเพิ่มเติม';

  // Construct structured prompt with conflict resolution directives
  const systemPrompt = `คุณเป็นผู้เชี่ยวชาญด้านระบาดวิทยาภาคสนาม และการบริหารจัดการภาวะฉุกเฉินทางสาธารณสุขของกระทรวงสาธารณสุข 
ให้จัดทำ "รายงานบรรยายสรุปผลการประเมินความเสี่ยงเบื้องต้น (Initial Risk Assessment Report)" ภาษาไทยที่เป็นทางการ น่าเชื่อถือ และสละสลวย 
โดยอ้างอิงหลักการ WHO Initial Risk Assessment อย่างเคร่งครัดตามโครงสร้าง 3 ย่อหน้า:
1. สรุปเหตุการณ์ จำนวนผู้ป่วย อาการ สภาพพื้นที่ และข้อสังเกตจากการสอบสวนโรค
2. การวิเคราะห์ระดับความเสี่ยง โดยนำข้อมูลของผู้ประเมินในแต่ละมิติ (การสัมผัส, ความรุนแรง/CFR, การแพร่กระจาย และศักยภาพระบบสุขภาพ) มาวิเคราะห์สนับสนุน ผนวกกับองค์ความรู้พื้นฐานเรื่องโรคหรือภัยสุขภาพนั้นๆ
3. ข้อเสนอแนะเชิงบริหารจัดการ มาตรการควบคุมโรค และการพิจารณาเปิดศูนย์ปฏิบัติการภาวะฉุกเฉิน (EOC) ตามระดับความเสี่ยงที่ประเมินได้

*** กฎสำคัญที่สุดด้านการจัดการความขัดแย้งของข้อมูล (Strict Conflict Resolution Rule) ***:
- ให้ยึดถือผลการตัดสินใจและคำอธิบายของ "ข้อหลักทั้ง 5 ข้อ (5 Domains)" เป็นข้อเท็จจริงสูงสุดเสมอ
- หากตรวจพบว่ามีบันทึกย่อยหรือข้อย่อยใดที่ขัดแย้งกับการตัดสินใจของข้อหลัก (เช่น ข้อหลักสรุปว่าไม่มีการสัมผัสแล้ว หรือความรุนแรงต่ำ หรือไม่ใช่ภัยคุกคามสูง แต่มีข้อมูลย่อยที่ระบุตรงกันข้าม) ให้ AI "ตัดข้อมูลข้อย่อยที่ขัดแย้งนั้นออกจากการสรุปโดยสิ้นเชิง" ห้ามนำมาอ้างอิงหรือกล่าวถึงในรายงานเด็ดขาด เพื่อให้บทสรุปสอดคล้องกับข้อวินิจฉัยหลัก 100%
- หากผู้ประเมินไม่ได้ประเมินข้อย่อย ให้ใช้คำอธิบายของข้อหลักและข้อมูลทางคลินิกทั่วไปเป็นเกณฑ์ในการวิเคราะห์

โดยทั้งหมดให้เขียนไม่เกิน 200 คำ ใช้คำศัพท์เชิงวิชาการ ไม่ใช่ภาษาพูด และให้แสดงเป็นแนวโน้ม หรือความน่าจะเป็น หากไม่มั่นใจ ห้ามฟันธงเด็ดขาด`;

  const userPrompt = `กรุณาเขียนรายงานสรุปการประเมินความเสี่ยงสำหรับเหตุการณ์นี้:
[ข้อมูลพื้นฐานเหตุการณ์]
- ชื่อเหตุการณ์: ${eventName}
- พื้นที่เกิดเหตุ: ${location}
- วันที่ประเมิน: ${metadata.assessmentDate}
- ข้อมูลทางคลินิก/สถานการณ์: ${details}

[ผลการประเมินตามอัลกอริทึม WHO IRA - ข้อหลักที่เป็นข้อยุติ]
- ข้อ 1 ภัยคุกคามระดับสูง (High Threat): ${answers.q1_highThreat}
- ข้อ 2 มีการสัมผัสต่อเนื่อง (Exposure): ${answers.q2_exposureActive}
- ข้อ 3 ความรุนแรงทางคลินิก (Severity): ${answers.q3_severityHigh}
- ข้อ 4.1 การแพร่ระบาดในอนาคต (Spread Potential): ${answers.q4_spreadFuture}
- ข้อ 5.1 ศักยภาพการควบคุมในพื้นที่ (Capacity): ${answers.q5_1_capacitySufficient}
- ข้อ 5.2 ความเสี่ยงระบบสุขภาพล่ม (Overwhelmed): ${answers.q5_2_systemOverwhelmed}
- ผลลัพธ์ระดับความเสี่ยงที่คำนวณได้: ระดับ "${result.levelTh}" (${result.level} Risk)
- มาตรการที่ระบบแนะนำ: ${result.suggestedActions.join(', ')}

[บันทึกข้อมูลประกอบการประเมินและหลักฐานเชิงประจักษ์ (กรองข้อขัดแย้งแล้ว)]:
${userNotesCompiled}`;

  try {
    if (!apiKey) {
      // Realistic simulation mode when API key is not yet configured
      await new Promise(resolve => setTimeout(resolve, 1400));
      const simulatedText = `รายงานผลการประเมินความเสี่ยงเบื้องต้น (Initial Risk Assessment)
เหตุการณ์: ${eventName} ณ ${location}
วันที่ประเมิน: ${metadata.assessmentDate}

1. สรุปสถานการณ์:
จากข้อมูลการเฝ้าระวังเหตุการณ์ "${eventName}" ในพื้นที่ ${location} พบรายงานผู้ป่วยที่มีอาการเข้าข่ายตามนิยาม โดยมีลักษณะ ${details} จากการตรวจสอบหลักฐานเบื้องต้นพบข้อเท็จจริงสำคัญ ได้แก่ ${userNotesCompiled.replace(/\n/g, '; ')} ซึ่งสะท้อนถึงการแพร่กระจายที่กำลังก่อตัวขึ้นในกลุ่มประชากรเสี่ยง

2. การวิเคราะห์ระดับความเสี่ยง:
ผลการประเมินตามกรอบแนวทาง Initial Risk Assessment (IRA) ขององค์การอนามัยโลก (WHO) และกรมควบคุมโรค สรุปว่าเหตุการณ์นี้จัดอยู่ในระดับความเสี่ยง "${result.levelTh}" (${result.level} Risk) โดยมีปัจจัยสนับสนุนสำคัญจากการประเมินมิติต่างๆ ทั้งด้านการสัมผัสเชื้อที่ยังคงมีอยู่ ความรุนแรงทางคลินิกที่มีนัยสำคัญ ตลอดจนภาระงานต่อระบบสาธารณสุขและทรัพยากรทางการแพทย์ในพื้นที่

3. ข้อเสนอแนะเชิงนโยบายและมาตรการควบคุม:
ขอแนะนำให้หน่วยงานที่เกี่ยวข้องดำเนินการยกระดับมาตรการรองรับทันที ได้แก่: ${result.suggestedActions.join('; ')} พร้อมทั้งเร่งสนับสนุนทรัพยากรทางการแพทย์ สำรองเตียงและเวชภัณฑ์ และจัดระบบการสื่อสารความเสี่ยง (Risk Communication) อย่างมีเอกภาพ`;

      state.aiSummary = simulatedText;
      summaryBox.textContent = simulatedText;
      showToast('สร้างรายงานจำลองสำเร็จ (ใส่ Typhoon API Key ในหน้าตั้งค่าเพื่อใช้โมเดลจริง)', 'warn');
    } else {
      let modelToUse = state.settings.typhoonModel || 'typhoon-v2.5-30b-a3b-instruct';
      if (modelToUse === 'typhoon-v1.5x-70b-instruct') {
        modelToUse = 'typhoon-v2.5-30b-a3b-instruct';
      }

      // Real API Call to Typhoon AI
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
          temperature: 0.2,
          max_tokens: 1400
        })
      });

      if (!response.ok) {
        let errMessage = `${response.status} ${response.statusText}`;
        try {
          const errJson = await response.json();
          if (errJson && errJson.error) {
            errMessage = typeof errJson.error === 'string' ? errJson.error : (errJson.error.message || JSON.stringify(errJson.error));
          }
        } catch (e) {
          try {
            errMessage = await response.text();
          } catch (e2) { }
        }

        // If 400 occurred with a non-default model, try auto-retrying once with flagship model
        if (response.status === 400 && modelToUse !== 'typhoon-v2.5-30b-a3b-instruct') {
          console.warn(`400 error with model ${modelToUse}. Retrying with typhoon-v2.5-30b-a3b-instruct...`);
          response = await fetch('https://api.opentyphoon.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
              model: 'typhoon-v2.5-30b-a3b-instruct',
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
              ],
              temperature: 0.2,
              max_tokens: 1400
            })
          });

          if (!response.ok) {
            let retryErr = `${response.status} ${response.statusText}`;
            try {
              const retryJson = await response.json();
              if (retryJson && retryJson.error) {
                retryErr = typeof retryJson.error === 'string' ? retryJson.error : (retryJson.error.message || JSON.stringify(retryJson.error));
              }
            } catch (e) { }
            throw new Error(`Typhoon API error: ${retryErr}`);
          }
        } else {
          throw new Error(`Typhoon API error: ${errMessage}`);
        }
      }

      const data = await response.json();
      const content = data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : '';
      if (!content) {
        throw new Error('ไม่พบเนื้อหาข้อความตอบกลับจาก Typhoon API');
      }
      state.aiSummary = content;
      summaryBox.textContent = content;
      showToast('Typhoon AI เรียบเรียงบทสรุปสำเร็จแล้ว!', 'success');
    }
  } catch (err) {
    console.error('Typhoon API Exception:', err);
    summaryBox.textContent = `เกิดข้อผิดพลาดในการเรียกใช้ Typhoon AI: ${err.message}\nโปรดตรวจสอบ API Key หรือการเชื่อมต่ออินเทอร์เน็ต`;
    showToast('เกิดข้อผิดพลาดในการเชื่อมต่อ Typhoon API', 'error');
  } finally {
    state.isAiGenerating = false;
    btn.disabled = false;
    spinner.style.display = 'none';
    summaryBox.style.opacity = '1';
  }
}

/**
 * Send a single record payload to Google Sheets Web App endpoint
 */
async function sendRecordToSheetWebhook(record, url) {
  // ใช้ CORS ปกติ (text/plain = simple request ไม่มี preflight) เพื่ออ่านผลตอบกลับจากชีตได้จริง
  // ห้าม fallback ไปส่งซ้ำแบบ no-cors เพราะคำขอแรกอาจถูกบันทึกไปแล้ว -> จะเกิดแถวซ้ำ
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(record),
      redirect: 'follow'
    });
  } catch (netErr) {
    // อาจเป็นเน็ตหลุด หรือเบราว์เซอร์บล็อกการอ่านผล (ชีตอาจบันทึกไปแล้ว) -> ถือว่า "ยืนยันไม่ได้"
    console.warn('Sheet POST could not be confirmed:', netErr);
    return { confirmed: false, data: null };
  }

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (parseErr) {
    throw new Error('ชีตตอบกลับไม่ใช่ JSON (ตรวจสอบว่า Deploy Web App เป็น "ทุกคน (Anyone)" และใช้ URL /exec ล่าสุด)');
  }
  if (!data || data.status !== 'success') {
    throw new Error((data && data.message) || 'Google Sheet แจ้งข้อผิดพลาด');
  }
  return { confirmed: true, data: data };
}

/**
 * Google Sheets Audit Trail Integration
 * Rule 2: Overwrite existing event if same event / ID is being saved (Save ทับ ไม่เปิด ID ใหม่)
 */
async function saveToGoogleSheets() {
  const btn = document.getElementById('btnSaveSheet');
  const sheetsUrl = state.settings.googleSheetsUrl.trim();
  const compiledNotes = compileUserNotes();

  // Always synchronize state.metadata from current input fields to ensure zero missing data
  state.metadata.eventName = (document.getElementById('eventName')?.value || state.metadata.eventName || '').trim();
  state.metadata.location = (document.getElementById('location')?.value || state.metadata.location || '').trim();
  state.metadata.assessmentDate = (document.getElementById('assessmentDate')?.value || state.metadata.assessmentDate || new Date().toISOString().split('T')[0]).trim();
  state.metadata.assessorName = (document.getElementById('assessorName')?.value || state.metadata.assessorName || '').trim();
  state.metadata.clinicalDetails = (document.getElementById('clinicalDetails')?.value || state.metadata.clinicalDetails || '').trim();

  // Synchronize all domain notes & sub-criteria notes from inputs
  const currentNotes = {};
  document.querySelectorAll('.domain-notes-textarea, .sub-criterion-input').forEach(inp => {
    if (inp.id && inp.value && inp.value.trim()) {
      currentNotes[inp.id] = inp.value.trim();
    }
  });
  state.notes = Object.assign({}, state.notes, currentNotes);

  const curEventName = (state.metadata.eventName || '').trim();
  const curLocation = (state.metadata.location || '').trim();

  // Determine target ID and whether this is an existing event
  let targetId = state.currentAssessmentId;
  let existingIndex = -1;

  if (targetId) {
    existingIndex = state.auditHistory.findIndex(r => r.id === targetId);
  }

  // Only treat as existing event if explicitly loaded via view/edit (targetId active)
  const isExistingEvent = Boolean(targetId && existingIndex !== -1);
  if (!targetId) {
    targetId = generateNextAssessmentId();
  }
  setActiveAssessmentId(targetId);

  const answersSnapshot = JSON.parse(JSON.stringify(state.answers));
  const subAnswersSnapshot = JSON.parse(JSON.stringify(state.subAnswers));
  const notesSnapshot = Object.assign({}, state.notes);
  // รหัสเฉพาะของการกดบันทึกครั้งนี้ ใช้ค้นหาแถวของเราในชีตกรณีอ่านผลตอบกลับไม่ได้
  const clientSaveId = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  const rawPayload = JSON.stringify({
    clientSaveId: clientSaveId,
    assessmentDate: state.metadata.assessmentDate,
    clinicalDetails: state.metadata.clinicalDetails,
    answers: answersSnapshot,
    subAnswers: subAnswersSnapshot,
    notes: notesSnapshot,
    isOverwrite: isExistingEvent,
    intendedAction: isExistingEvent ? 'overwrite' : 'create'
  });

  let record;
  if (isExistingEvent) {
    // Overwrite existing record in-place (save ทับ ไม่เปิด ID ใหม่)
    record = state.auditHistory[existingIndex];
    record.timestamp = new Date().toLocaleString('th-TH') + ' (ปรับปรุง)';
    record.eventName = curEventName || 'เหตุการณ์ทั่วไป';
    record.location = curLocation || 'ไม่ระบุ';
    record.assessmentDate = state.metadata.assessmentDate;
    record.clinicalDetails = state.metadata.clinicalDetails;
    record.assessorName = state.metadata.assessorName || 'ผู้ประเมิน';
    record.d1_highThreat = state.answers.q1_highThreat || 'No';
    record.d2_exposure = state.answers.q2_exposureActive || 'No';
    record.d3_severity = state.answers.q3_severityHigh || 'No';
    record.d4_spread = state.answers.q4_spreadFuture || state.answers.q4_2_significantCurrent || 'No';
    record.d5_capacity = state.answers.q5_1_capacitySufficient || 'Unk';
    record.riskLevel = state.assessmentResult.levelTh;
    record.riskLevelEn = state.assessmentResult.level;
    record.actions = state.assessmentResult.suggestedActions.join(' | ');
    record.userNotes = compiledNotes || 'ไม่มีบันทึกเพิ่มเติม';
    record.aiSummary = state.aiSummary || 'ยังไม่มีการสร้างบทสรุป AI';
    record.answers = answersSnapshot;
    record.subAnswers = subAnswersSnapshot;
    record.notes = notesSnapshot;
    record.rawPayload = rawPayload;
    record.clientSaveId = clientSaveId;
    record.isOverwrite = true;
    record.intendedAction = 'overwrite';
    record.syncedToSheet = false;
  } else {
    // Brand new event (ห้ามเซฟทับเคสอื่นเด็ดขาด)
    record = {
      id: targetId,
      timestamp: new Date().toLocaleString('th-TH'),
      eventName: curEventName || 'เหตุการณ์ทั่วไป',
      location: curLocation || 'ไม่ระบุ',
      assessmentDate: state.metadata.assessmentDate,
      clinicalDetails: state.metadata.clinicalDetails,
      assessorName: state.metadata.assessorName || 'ผู้ประเมิน',
      d1_highThreat: state.answers.q1_highThreat || 'No',
      d2_exposure: state.answers.q2_exposureActive || 'No',
      d3_severity: state.answers.q3_severityHigh || 'No',
      d4_spread: state.answers.q4_spreadFuture || state.answers.q4_2_significantCurrent || 'No',
      d5_capacity: state.answers.q5_1_capacitySufficient || 'Unk',
      riskLevel: state.assessmentResult.levelTh,
      riskLevelEn: state.assessmentResult.level,
      actions: state.assessmentResult.suggestedActions.join(' | '),
      userNotes: compiledNotes || 'ไม่มีบันทึกเพิ่มเติม',
      aiSummary: state.aiSummary || 'ยังไม่มีการสร้างบทสรุป AI',
      answers: answersSnapshot,
      subAnswers: subAnswersSnapshot,
      notes: notesSnapshot,
      rawPayload: rawPayload,
      clientSaveId: clientSaveId,
      isOverwrite: false,
      intendedAction: 'create',
      syncedToSheet: false
    };
    state.auditHistory.unshift(record);
  }

  // Save to local storage
  localStorage.setItem('ira_audit_history', JSON.stringify(state.auditHistory.slice(0, 100)));

  if (!sheetsUrl) {
    renderAuditTable();
    if (isExistingEvent) {
      showToast(`บันทึกทับข้อมูลเรื่องเดิม (${targetId}) ในเครื่องเรียบร้อย (เชื่อมต่อ Google Sheet เพื่อซิงก์)`, 'info');
    } else {
      showToast(`บันทึกเหตุการณ์ใหม่ (${targetId}) ในเครื่องเรียบร้อย (เชื่อมต่อ Google Sheet เพื่อซิงก์)`, 'info');
    }
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = isExistingEvent ? '⏳ กำลังบันทึกทับลงชีต...' : '⏳ กำลังบันทึกลงชีต...';
  }

  try {
    const result = await sendRecordToSheetWebhook(record, sheetsUrl);

    if (result.confirmed) {
      // ยึดรหัสที่ชีตใช้จริงเสมอ (ชีตอาจออกรหัสใหม่ให้ถ้า ID ชนกับเครื่องอื่น)
      const sheetId = result.data && result.data.id ? String(result.data.id).trim() : '';
      if (sheetId && sheetId !== record.id) {
        const oldId = record.id;
        record.id = sheetId;
        setActiveAssessmentId(sheetId);
        showToast(`รหัส ${oldId} ถูกเครื่องอื่นใช้ไปแล้ว ระบบออกรหัสใหม่ให้เป็น ${sheetId}`, 'warn');
      }
      record.syncedToSheet = true;
      localStorage.setItem('ira_audit_history', JSON.stringify(state.auditHistory.slice(0, 100)));
      if (isExistingEvent) {
        showToast(`บันทึกทับข้อมูลเรื่องเดิม (${record.id}) ลง Google Sheets เรียบร้อยแล้ว`, 'success');
      } else {
        showToast(`บันทึกข้อมูลเหตุการณ์ใหม่ (${record.id}) ลง Google Sheets เรียบร้อยแล้ว!`, 'success');
      }
      await fetchEventsFromGoogleSheet(true);
    } else {
      // อ่านผลไม่ได้ -> ดึงชีตมาตรวจ แล้วหาแถวของเราด้วย clientSaveId
      showToast('ส่งข้อมูลแล้วแต่ยังยืนยันผลไม่ได้ กำลังตรวจสอบกับ Google Sheet...', 'warn');
      await fetchEventsFromGoogleSheet(true);
      const mine = state.auditHistory.find(r => r.clientSaveId === clientSaveId);
      if (mine) {
        setActiveAssessmentId(mine.id);
        showToast(`ยืนยันแล้ว: บันทึกเป็น ${mine.id} ใน Google Sheet`, 'success');
      } else {
        // ไม่พบในชีต -> ปลดรหัสออก เพื่อไม่ให้การบันทึกครั้งหน้าไปทับเคสของคนอื่น
        if (!isExistingEvent) setActiveAssessmentId(null);
        showToast('ไม่พบข้อมูลนี้ใน Google Sheet กรุณากดบันทึกอีกครั้ง', 'error');
      }
    }
  } catch (err) {
    console.error('Google Sheets Sync Error:', err);
    showToast(`บันทึกลง Google Sheets ไม่สำเร็จ: ${err.message} (ข้อมูลยังอยู่ในเครื่อง)`, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '💾 บันทึกลง Google Sheet';
    }
    renderAuditTable();
  }
}

/**
 * Sync all unsynced records to Google Sheets
 */
async function syncAllAuditToGoogleSheets() {
  const sheetsUrl = state.settings.googleSheetsUrl.trim();
  if (!sheetsUrl) {
    promptGoogleSheetsConnect();
    return;
  }

  if (state.auditHistory.length === 0) {
    showToast('ยังไม่มีรายการประวัติที่ต้องซิงก์', 'warn');
    return;
  }

  // ส่งเฉพาะรายการที่ยังไม่ซิงก์ (ถ้าส่งเคสใหม่ที่ซิงก์แล้วซ้ำ ชีตจะสร้างแถวซ้ำเพิ่ม)
  const pending = state.auditHistory.filter(r => !r.syncedToSheet);
  if (pending.length === 0) {
    showToast('ทุกรายการซิงก์กับ Google Sheet แล้ว', 'info');
    return;
  }

  const btn = document.getElementById('btnSyncAllToSheet');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ กำลังซิงก์ทั้งหมด...';
  }

  let successCount = 0;
  let failCount = 0;
  for (const rec of pending) {
    try {
      const result = await sendRecordToSheetWebhook(rec, sheetsUrl);
      if (result.confirmed) {
        if (result.data && result.data.id) rec.id = String(result.data.id).trim();
        rec.syncedToSheet = true;
        successCount++;
      } else {
        failCount++;
      }
    } catch (e) {
      failCount++;
      console.warn('Failed syncing record:', rec.id, e);
    }
  }

  localStorage.setItem('ira_audit_history', JSON.stringify(state.auditHistory.slice(0, 100)));
  renderAuditTable();

  if (btn) {
    btn.disabled = false;
    btn.innerHTML = '🔄 ซิงก์ขึ้น Sheet';
  }

  showToast(`ซิงก์สำเร็จ ${successCount} รายการ${failCount ? ` / ยืนยันไม่ได้ ${failCount} รายการ` : ''} กำลังตรวจสอบสถานะชีต...`, failCount ? 'warn' : 'success');
  // Re-fetch to confirm authoritative state from Google Sheet
  await fetchEventsFromGoogleSheet(true);
}

/**
 * Pull all assessment history from Google Sheet into local client state
 * Ensures multiple computers working together always have identical history and next Assessment ID
 */
async function fetchEventsFromGoogleSheet(isSilent = false) {
  const sheetsUrl = state.settings.googleSheetsUrl.trim();
  if (!sheetsUrl) {
    if (!isSilent) promptGoogleSheetsConnect();
    setActiveAssessmentId(null, false, false);
    return;
  }

  const btn = document.getElementById('btnPullSheetEvents');
  if (btn && !isSilent) {
    btn.disabled = true;
    btn.textContent = '⏳ กำลังดึงข้อมูล...';
  }

  // Visual indicator in active assessment ID badge if not editing a specific case
  if (!state.currentAssessmentId) {
    setActiveAssessmentId(null, true);
  }

  const badge = document.getElementById('auditSheetStatusBadge');
  const textEl = document.getElementById('auditSheetStatusText');
  if (badge && textEl) {
    badge.className = 'sheet-status-badge status-connected';
    textEl.textContent = 'Google Sheet: ⏳ กำลังซิงก์ข้อมูล...';
  }

  try {
    const fetchUrl = `${sheetsUrl}${sheetsUrl.includes('?') ? '&' : '?'}action=getEvents&_t=${Date.now()}`;
    const res = await fetch(fetchUrl);
    const data = await res.json();

    if (data.status === 'success' && Array.isArray(data.events)) {
      if (data.nextId) {
        state.latestSheetNextId = String(data.nextId).trim();
      }

      const sheetTabName = data.sheetName ? ` [แท็บ: ${data.sheetName}]` : '';

      // เมื่อเชื่อมต่อ Google Sheet ให้ยึดข้อมูลในชีตเป็นหลัก (Single Source of Truth)
      // ผสานรายละเอียดคำตอบและข้อมูลทางคลินิกที่มีในเครื่องเข้ากับข้อมูลที่ดึงมาจากชีต
      const localMap = new Map((state.auditHistory || []).map(item => [String(item.id || '').trim(), item]));
      state.auditHistory = data.events.map(r => {
        const rowId = String(r.id || '').trim();
        const candidate = localMap.get(rowId);
        // ผสานข้อมูลในเครื่องเฉพาะเมื่อเป็นเคสเดียวกันจริง (ชื่อเหตุการณ์ตรงกัน) ป้องกันข้อมูลปนกับเคสคนอื่นที่ ID ซ้ำ
        const sameCase = candidate &&
          String(candidate.eventName || '').trim().toLowerCase() === String(r.eventName || '').trim().toLowerCase();
        const local = sameCase ? candidate : null;
        let parsedPayload = null;
        if (r.rawPayload) {
          try {
            parsedPayload = typeof r.rawPayload === 'string' ? JSON.parse(r.rawPayload) : r.rawPayload;
          } catch (e) {
            console.warn('Error parsing rawPayload from sheet row:', rowId, e);
          }
        }
        return Object.assign({}, local || {}, r, parsedPayload || {}, {
          id: rowId,
          syncedToSheet: true
        });
      });

      // Sort by sequence descending (newest ID first)
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

      // Refresh next ID preview with confirmed Sheet sync
      if (!state.currentAssessmentId) {
        setActiveAssessmentId(null, false, false);
      }

      if (!isSilent) {
        if (data.events.length > 0) {
          showToast(`ซิงก์ข้อมูลจาก Google Sheet สำเร็จ (พบทั้งหมด ${data.events.length} เคส${sheetTabName})`, 'success');
        } else {
          showToast(`ใน Google Sheet ยังไม่มีข้อมูล (0 เคส${sheetTabName}) — เคลียร์ตารางประวัติให้ว่างตรงตามชีตแล้ว`, 'info');
        }
      }
    } else {
      throw new Error((data && data.message) || 'ไม่ได้รับข้อมูลที่ถูกต้องจากชีต');
    }
  } catch (err) {
    console.warn('Failed to fetch events from Google Sheet:', err);
    if (badge && textEl) {
      badge.className = 'sheet-status-badge status-disconnected';
      textEl.textContent = 'Google Sheet: ขัดข้อง (ใช้ข้อมูลออฟไลน์)';
    }
    if (!state.currentAssessmentId) {
      setActiveAssessmentId(null, false, true);
    }
    if (!isSilent) {
      showToast(`ไม่สามารถดึงข้อมูลจาก Google Sheet ได้: ${err.message}`, 'error');
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '📥 ดึงประวัติจาก Sheet';
    }
  }
}

/**
 * Sync a single record to Google Sheets
 */
window.syncSingleAuditRow = async function (id) {
  const sheetsUrl = state.settings.googleSheetsUrl.trim();
  if (!sheetsUrl) {
    promptGoogleSheetsConnect();
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
    // ดึงข้อมูลล่าสุดจากชีตทันทีเพื่อแสดงผลแบบ real-time
    await fetchEventsFromGoogleSheet(true);
  } catch (err) {
    console.error('Single Sync Error:', err);
    showToast(`ไม่สามารถซิงก์ #${id} ได้: ${err.message}`, 'error');
  }
};

/**
 * Prompt user to connect Google Sheet or open modal
 */
function promptGoogleSheetsConnect() {
  const modal = document.getElementById('settingsModal');
  const sheetsUrlInput = document.getElementById('settingGoogleSheetsUrl');
  if (modal && sheetsUrlInput) {
    modal.classList.add('active');
    setTimeout(() => {
      sheetsUrlInput.focus();
      sheetsUrlInput.select();
    }, 200);
    showToast('กรุณากรอก Web App URL ของ Google Apps Script เพื่อเชื่อมต่อชีต', 'info');
  }
}

/**
 * Update Google Sheets Connection Status Badge & Banner
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
 * Format any timestamp or date string into clean date only (DD/MM/YYYY)
 */
function formatOnlyDate(raw) {
  if (!raw) return '-';
  const str = String(raw).trim();

  // Match standard Thai/Western DD/MM/YYYY or D/M/YYYY
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

  // Parse as Date object (e.g. 'Tue Oct 03 2569 20:31:59 GMT+0700...')
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    const d = String(parsed.getDate()).padStart(2, '0');
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    let y = parsed.getFullYear();
    if (y < 2400) y += 543; // Convert AD to BE if needed
    return `${d}/${m}/${y}`;
  }

  // Fallback: take first token before space
  if (str.includes(' ')) {
    return str.split(' ')[0];
  }
  return str;
}

/**
 * Escape text before inserting into HTML (ป้องกัน XSS จากข้อมูลในชีตที่ใช้ร่วมกัน)
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
 * Build a safe JS string literal for use inside an HTML onclick="..." attribute
 */
function jsArgAttr(value) {
  return escapeHtml(JSON.stringify(String(value == null ? '' : value)));
}

/**
 * Render Local Audit History Table with Google Sheet Sync Status
 */
function renderAuditTable() {
  const tbody = document.getElementById('auditTableBody');
  if (!tbody) return;

  if (state.auditHistory.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-dim); padding: 18px;">ยังไม่มีประวัติการประเมิน (กดบันทึกหลังจากประเมินเสร็จเพื่อสร้างประวัติ)</td></tr>`;
    return;
  }

  tbody.innerHTML = state.auditHistory.slice(0, 25).map(rec => {
    let colorBadge = 'status-unk';
    if (rec.riskLevelEn === 'Very Low' || rec.riskLevelEn === 'Low') colorBadge = 'status-no';
    if (rec.riskLevelEn === 'High' || rec.riskLevelEn === 'Very High') colorBadge = 'status-yes';

    const idArg = jsArgAttr(rec.id);
    const sheetStatusHtml = rec.syncedToSheet
      ? `<span class="badge-synced">✅ ซิงก์แล้ว</span>`
      : `<span class="badge-pending">⏳ ยังไม่ซิงก์</span> <button class="btn btn-outline btn-sm btn-quick-sync" onclick="syncSingleAuditRow(${idArg})">💾 ซิงก์</button>`;

    const locHtml = rec.location ? `<div class="audit-event-loc">📍 ${escapeHtml(rec.location)}</div>` : '';
    const displayDate = escapeHtml(formatOnlyDate(rec.timestamp || rec.assessmentDate));

    return `
      <tr>
        <td class="col-audit-id"><span class="audit-id-badge">${escapeHtml(rec.id)}</span></td>
        <td class="col-audit-time">${displayDate}</td>
        <td class="col-audit-event">
          <div class="audit-event-name">${escapeHtml(rec.eventName || '-')}</div>
          ${locHtml}
        </td>
        <td class="col-audit-risk"><span class="audit-risk-badge ${colorBadge}">${escapeHtml(rec.riskLevel)}</span></td>
        <td class="col-audit-user"><div class="audit-assessor">${escapeHtml(rec.assessorName || '-')}</div></td>
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

window.viewAuditDetail = function (id) {
  const item = state.auditHistory.find(x => x.id === id);
  if (!item) return;

  const dateStr = item.assessmentDate || (item.timestamp ? formatOnlyDate(item.timestamp) : '-');
  const clinicSnippet = item.clinicalDetails
    ? (item.clinicalDetails.length > 70 ? item.clinicalDetails.slice(0, 70) + '...' : item.clinicalDetails)
    : '-';

  const shouldLoad = confirm(
    `[ประวัติการประเมิน #${item.id}]\n` +
    `เหตุการณ์: ${item.eventName}\n` +
    `พื้นที่: ${item.location}\n` +
    `วันที่ประเมิน: ${dateStr}\n` +
    `ผู้ประเมิน: ${item.assessorName}\n` +
    `ข้อมูลทางคลินิก: ${clinicSnippet}\n` +
    `ระดับความเสี่ยง: ${item.riskLevel} (${item.riskLevelEn} Risk)\n` +
    `สถานะ Google Sheet: ${item.syncedToSheet ? '✅ ซิงก์แล้ว' : '⏳ ยังไม่ซิงก์'}\n\n` +
    `มาตรการที่แนะนำ:\n${item.actions}\n\n` +
    `บทสรุป AI:\n${item.aiSummary}\n\n` +
    `=========================================\n` +
    `👉 ต้องการโหลดเคสนี้ขึ้นมาแก้ไขเพื่อ "บันทึกทับ (Overwrite)" หรือไม่?\n` +
    `- กด ตกลง (OK): เพื่อดึงข้อมูลเดิมทั้งหมด (รายละเอียดทางคลินิก, วันที่, คำตอบทั้ง 5 มิติ, เกณฑ์ย่อย, และบันทึกข้อความ) ขึ้นมาแก้ไข\n` +
    `- กด ยกเลิก (Cancel): ปิดหน้าต่างนี้`
  );

  if (shouldLoad) {
    loadAuditRecordToForm(id);
  }
};

window.loadAuditRecordToForm = function (id) {
  const item = state.auditHistory.find(x => x.id === id);
  if (!item) return;

  // 1. If item has rawPayload as JSON string, parse and merge into item
  if (item.rawPayload && typeof item.rawPayload === 'string') {
    try {
      const parsed = JSON.parse(item.rawPayload);
      Object.assign(item, parsed);
    } catch (e) {
      console.warn('Failed to parse rawPayload for item:', id, e);
    }
  }

  // 2. Set Active Assessment ID for in-place overwriting
  setActiveAssessmentId(item.id);

  // 3. Restore Metadata Fields
  state.metadata.eventName = item.eventName || '';
  state.metadata.location = item.location || '';
  state.metadata.assessmentDate = item.assessmentDate || (item.timestamp ? formatOnlyDate(item.timestamp) : new Date().toISOString().split('T')[0]);
  state.metadata.assessorName = item.assessorName || '';
  state.metadata.clinicalDetails = item.clinicalDetails || '';

  const eventInput = document.getElementById('eventName');
  const locInput = document.getElementById('location');
  const dateInput = document.getElementById('assessmentDate');
  const assessorInput = document.getElementById('assessorName');
  const clinicalInput = document.getElementById('clinicalDetails');

  if (eventInput) eventInput.value = state.metadata.eventName;
  if (locInput) locInput.value = state.metadata.location;
  if (dateInput && state.metadata.assessmentDate) dateInput.value = state.metadata.assessmentDate;
  if (assessorInput) assessorInput.value = state.metadata.assessorName;
  if (clinicalInput) clinicalInput.value = state.metadata.clinicalDetails;

  // 4. Restore Sub-Criteria Choices (Domain 1 - 5)
  if (item.subAnswers && typeof item.subAnswers === 'object') {
    state.subAnswers = Object.assign({}, state.subAnswers, item.subAnswers);
    Object.entries(item.subAnswers).forEach(([subId, val]) => {
      setSubChoiceVal(subId, val);
    });
  }

  // Helper to normalize answers
  const normalizeVal = (v, defaultVal = 'no') => {
    if (!v) return defaultVal;
    const s = String(v).trim().toLowerCase();
    if (s === 'yes' || s === 'ใช่' || s === 'true' || s === '1') return 'yes';
    if (s === 'no' || s === 'ไม่ใช่' || s === 'false' || s === '0') return 'no';
    if (s === 'unk' || s === 'ไม่แน่ชัด' || s === 'unknown') return 'unk';
    return defaultVal;
  };

  // 5. Restore Main Domain Answers
  if (item.answers && typeof item.answers === 'object') {
    state.answers = Object.assign({}, state.answers, item.answers);
  } else {
    // Fallback for legacy rows loaded from Google Sheet or older history
    if (item.d1_highThreat) state.answers.q1_highThreat = normalizeVal(item.d1_highThreat, 'no');
    if (item.d2_exposure) state.answers.q2_exposureActive = normalizeVal(item.d2_exposure, 'yes');
    if (item.d3_severity) state.answers.q3_severityHigh = normalizeVal(item.d3_severity, 'yes');
    if (item.d4_spread) {
      const sp = normalizeVal(item.d4_spread, 'yes');
      state.answers.q4_spreadFuture = sp;
      state.answers.q4_2_significantCurrent = sp;
    }
    if (item.d5_capacity) state.answers.q5_1_capacitySufficient = normalizeVal(item.d5_capacity, 'no');
  }

  // Update Main Radio UI
  setMainRadioVal('q1_highThreat', state.answers.q1_highThreat || 'no');
  setMainRadioVal('q2_exposure', state.answers.q2_exposureActive || 'yes');
  setMainRadioVal('q3_severity', state.answers.q3_severityHigh || 'yes');
  setMainRadioVal('q4_spread', state.answers.q4_spreadFuture || 'yes');
  setMainRadioVal('q4_2_significant', state.answers.q4_2_significantCurrent || 'no');
  setMainRadioVal('q5_1_capacity', state.answers.q5_1_capacitySufficient || 'no');
  setMainRadioVal('q5_2_overwhelmed', state.answers.q5_2_systemOverwhelmed || 'no');

  // 6. Restore Domain & Sub-criteria Notes
  document.querySelectorAll('.domain-notes-textarea, .sub-criterion-input').forEach(inp => {
    inp.value = '';
  });
  state.notes = {};

  if (item.notes && typeof item.notes === 'object') {
    state.notes = Object.assign({}, item.notes);
    Object.entries(item.notes).forEach(([noteId, val]) => {
      const el = document.getElementById(noteId);
      if (el) el.value = val;
    });
  } else if (item.userNotes && item.userNotes !== 'ไม่มีบันทึกเพิ่มเติม') {
    const q1Note = document.getElementById('note_q1_general');
    if (q1Note) {
      q1Note.value = item.userNotes;
      state.notes['note_q1_general'] = item.userNotes;
    }
  }

  // 7. Restore AI Narrative Summary
  if (item.aiSummary && item.aiSummary !== 'ยังไม่มีการสร้างบทสรุป AI') {
    state.aiSummary = item.aiSummary;
    const box = document.getElementById('aiNarrativeBox');
    if (box) box.textContent = item.aiSummary;
  } else {
    state.aiSummary = '';
    const box = document.getElementById('aiNarrativeBox');
    if (box) box.textContent = 'กดปุ่ม "🌪️ สรุปรายงานสถานการณ์ด้วย Typhoon AI" เพื่อสร้างบทวิเคราะห์ทางการแพทย์';
  }

  // 8. Re-evaluate Risk Algorithm & update all dynamic UI cards & pills
  evaluateRiskAlgorithm();

  // 9. Smooth scroll to top and show toast
  window.scrollTo({ top: 0, behavior: 'smooth' });
  showToast(`โหลดเคส #${item.id} (${item.eventName}) ทุกรายละเอียดขึ้นมาแก้ไขแล้ว`, 'success');
};

/**
 * Authentication-Protected Event Deletion System
 */
let pendingDeleteId = null;

window.promptDeleteEvent = function (id) {
  const item = state.auditHistory.find(x => x.id === id);
  if (!item) return;

  pendingDeleteId = id;
  const modal = document.getElementById('deleteAuthModal');
  const nameEl = document.getElementById('delModalEventName');
  const idEl = document.getElementById('delModalEventId');
  const dateEl = document.getElementById('delModalDate');
  const errEl = document.getElementById('deleteAuthError');
  const userInp = document.getElementById('deleteUsername');
  const passInp = document.getElementById('deletePassword');
  const btnConfirm = document.getElementById('btnConfirmDelete');

  if (nameEl) nameEl.textContent = item.eventName;
  if (idEl) idEl.textContent = item.id;
  if (dateEl) dateEl.textContent = item.timestamp;
  if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
  if (userInp) userInp.value = '';
  if (passInp) passInp.value = '';
  if (btnConfirm) { btnConfirm.disabled = false; btnConfirm.innerHTML = '🗑️ ยืนยันการลบ'; }

  if (modal) {
    modal.classList.add('active');
    setTimeout(() => {
      if (userInp) userInp.focus();
    }, 200);
  }
};

window.closeDeleteModal = function () {
  const modal = document.getElementById('deleteAuthModal');
  if (modal) modal.classList.remove('active');
  pendingDeleteId = null;
};

async function executeDeleteEvent() {
  if (!pendingDeleteId) return;

  const item = state.auditHistory.find(x => x.id === pendingDeleteId);
  if (!item) {
    closeDeleteModal();
    return;
  }

  const userInp = document.getElementById('deleteUsername');
  const passInp = document.getElementById('deletePassword');
  const errEl = document.getElementById('deleteAuthError');
  const btnConfirm = document.getElementById('btnConfirmDelete');

  const username = userInp ? userInp.value.trim() : '';
  const password = passInp ? passInp.value.trim() : '';

  if (!username || !password) {
    if (errEl) {
      errEl.textContent = 'กรุณากรอกทั้งชื่อผู้ใช้และรหัสผ่านเพื่อยืนยันสิทธิ์';
      errEl.style.display = 'block';
    }
    return;
  }

  if (btnConfirm) {
    btnConfirm.disabled = true;
    btnConfirm.innerHTML = '⏳ กำลังตรวจสอบสิทธิ์และลบ...';
  }
  if (errEl) {
    errEl.style.display = 'none';
  }

  const sheetsUrl = state.settings.googleSheetsUrl.trim();

  // If Google Sheets is configured, send deletion request to Apps Script (which checks Auth_Users tab)
  if (sheetsUrl && (sheetsUrl.startsWith('http://') || sheetsUrl.startsWith('https://'))) {
    try {
      const deleteUrl = `${sheetsUrl}?action=delete&id=${encodeURIComponent(item.id)}&eventName=${encodeURIComponent(item.eventName)}&user=${encodeURIComponent(username)}&pass=${encodeURIComponent(password)}`;

      const res = await fetch(deleteUrl);
      const json = await res.json();

      if (json.status === 'error') {
        if (errEl) {
          errEl.textContent = json.message || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง (ตรวจสอบในแท็บ Auth_Users บนชีต)';
          errEl.style.display = 'block';
        }
        if (btnConfirm) {
          btnConfirm.disabled = false;
          btnConfirm.innerHTML = '🗑️ ยืนยันการลบ';
        }
        return;
      }

      finishLocalDeletion(item.id, `ลบข้อมูลเหตุการณ์ #${item.id} ใน Google Sheet และประวัติเรียบร้อยแล้ว`);
    } catch (err) {
      console.warn('GET delete failed, attempting POST fallback:', err);
      try {
        const postRes = await fetch(sheetsUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'delete',
            id: item.id,
            eventName: item.eventName,
            username: username,
            password: password
          }),
          redirect: 'follow'
        });
        const postText = await postRes.text();
        let postJson;
        try {
          postJson = JSON.parse(postText);
        } catch (e) {
          throw new Error('ไม่สามารถอ่านการตอบกลับการลบข้อมูล (ตรวจสอบสิทธิ์บนชีต)');
        }
        if (postJson && postJson.status === 'error') {
          throw new Error(postJson.message || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง (ตรวจสอบในแท็บ Auth_Users บนชีต)');
        }

        finishLocalDeletion(item.id, `ลบข้อมูลเหตุการณ์ #${item.id} ใน Google Sheet และประวัติเรียบร้อยแล้ว`);
      } catch (err2) {
        if (errEl) {
          errEl.textContent = err2.message || `เกิดข้อผิดพลาดในการเชื่อมต่อ Google Sheets`;
          errEl.style.display = 'block';
        }
        if (btnConfirm) {
          btnConfirm.disabled = false;
          btnConfirm.innerHTML = '🗑️ ยืนยันการลบ';
        }
      }
    }
  } else {
    // Offline mode: Verify default administrator credentials
    if (username.toLowerCase() === 'admin' && password === 'admin') {
      finishLocalDeletion(item.id, `ลบเหตุการณ์ #${item.id} จากประวัติในเครื่องเรียบร้อย (โหมดออฟไลน์: สิทธิ์ Admin)`);
    } else {
      if (errEl) {
        errEl.textContent = 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง (โหมดออฟไลน์ใช้ user: admin / pass: admin หรือเชื่อมต่อ Google Sheet เพื่อใช้แท็บ Auth_Users)';
        errEl.style.display = 'block';
      }
      if (btnConfirm) {
        btnConfirm.disabled = false;
        btnConfirm.innerHTML = '🗑️ ยืนยันการลบ';
      }
    }
  }
}

function finishLocalDeletion(deletedId, successMsg) {
  state.auditHistory = state.auditHistory.filter(x => x.id !== deletedId);
  localStorage.setItem('ira_audit_history', JSON.stringify(state.auditHistory.slice(0, 100)));

  if (state.currentAssessmentId === deletedId) {
    setActiveAssessmentId(null);
  }

  renderAuditTable();
  closeDeleteModal();
  showToast(successMsg, 'success');
}

/**
 * Export Audit History to CSV
 */
function exportHistoryCSV() {
  if (state.auditHistory.length === 0) {
    showToast('ไม่มีข้อมูลประวัติสำหรับส่งออก', 'warn');
    return;
  }

  const headers = ['ID', 'Timestamp', 'Event_Name', 'Location', 'Assessor', 'Risk_Level_TH', 'Risk_Level_EN', 'Actions', 'Sheet_Synced', 'User_Notes', 'AI_Summary'];
  const rows = state.auditHistory.map(r => [
    `"${r.id}"`,
    `"${r.timestamp}"`,
    `"${r.eventName}"`,
    `"${r.location}"`,
    `"${r.assessorName}"`,
    `"${r.riskLevel}"`,
    `"${r.riskLevelEn}"`,
    `"${r.actions.replace(/"/g, '""')}"`,
    `"${r.syncedToSheet ? 'Yes' : 'No'}"`,
    `"${(r.userNotes || '').replace(/"/g, '""')}"`,
    `"${(r.aiSummary || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `IRA_Assessment_History_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  showToast('ส่งออกไฟล์ CSV สำเร็จ', 'success');
}

/**
 * Pre-fill Sample Outbreak Case (Wuhan pneumonia case study from slides 64-67)
 */
function loadPresetWuhanOutbreak() {
  // If Wuhan already exists in history, reuse its exact ID, else assign Wuhan ID
  const existingWuhan = state.auditHistory.find(r => r.eventName.includes('อู่ฮั่น'));
  const wuhanId = existingWuhan ? existingWuhan.id : 'IRA-001-2020';
  setActiveAssessmentId(wuhanId);

  state.metadata = {
    eventName: 'การระบาดของโรคปอดอักเสบจากเชื้อไวรัสสายพันธุ์ใหม่ (อู่ฮั่น)',
    location: 'มณฑลหูเป่ย / เฝ้าระวังเที่ยวบินตรงเข้าไทย',
    assessmentDate: '2020-01-03',
    assessorName: 'ทีมตระหนักรู้สถานการณ์ กรมควบคุมโรค',
    clinicalDetails: 'ผู้ป่วยเพิ่มจาก 27 เป็น 44 รายใน 1 สัปดาห์ มีอาการรุนแรงภาวะวิกฤต 7 ราย (26%) ยังไม่มีรายงานผู้เสียชีวิต มีไข้และปอดอักเสบเฉียบพลัน คาดว่ามีแหล่งโรคจากตลาดสดค้าสัตว์ป่า'
  };

  // Populate metadata in UI
  document.getElementById('eventName').value = state.metadata.eventName;
  document.getElementById('location').value = state.metadata.location;
  document.getElementById('assessmentDate').value = state.metadata.assessmentDate;
  document.getElementById('assessorName').value = state.metadata.assessorName;
  document.getElementById('clinicalDetails').value = state.metadata.clinicalDetails;

  // Set Sub-Criteria Choices (ใช่ / ไม่ใช่)
  // Domain 1: Not standard high-threat (novel virus) -> all no except coronavirus
  setSubChoiceVal('sub_d1_1', 'no');
  setSubChoiceVal('sub_d1_2', 'yes'); // Novel coronavirus
  setSubChoiceVal('sub_d1_3', 'no');
  setSubChoiceVal('sub_d1_4', 'no');

  // Domain 2: Exposure is active
  setSubChoiceVal('sub_d2_a', 'yes');
  setSubChoiceVal('sub_d2_b', 'yes');
  setSubChoiceVal('sub_d2_c', 'yes');

  // Domain 3: High clinical severity (26% ICU)
  setSubChoiceVal('sub_d3_a', 'no');
  setSubChoiceVal('sub_d3_b', 'yes');
  setSubChoiceVal('sub_d3_c', 'yes');

  // Domain 4: High spread potential (flights, attack rate)
  setSubChoiceVal('sub_d4_a', 'yes');
  setSubChoiceVal('sub_d4_b', 'yes');
  setSubChoiceVal('sub_d4_c', 'yes');

  // Domain 5: Capacity insufficient, Obstacle D is Yes (risk of system overwhelm)
  setSubChoiceVal('sub_d5_a', 'no');
  setSubChoiceVal('sub_d5_b', 'no');
  setSubChoiceVal('sub_d5_c', 'no');
  setSubChoiceVal('sub_d5_d', 'yes');

  // Main Answers according to slide 64-67
  state.answers.q1_highThreat = 'no';
  state.answers.q2_exposureActive = 'yes';
  state.answers.q3_severityHigh = 'yes';
  state.answers.q4_spreadFuture = 'yes';
  state.answers.q5_1_capacitySufficient = 'no';
  state.answers.q5_2_systemOverwhelmed = 'yes';

  // Fill sample granular notes into inputs
  setVal('note_q1_general', 'เบื้องต้นสงสัยโรคซาร์ส แต่จากการสอบสวนสงสัยเชื้อไวรัสสายพันธุ์ใหม่ ยังไม่มีในรายชื่อ 13 โรคติดต่ออันตรายเดิม');
  setVal('note_d1_2', 'ตรวจเบื้องต้นสงสัยไวรัสโคโรนาสายพันธุ์ใหม่ที่ยังไม่เคยพบในมนุษย์มาก่อน');
  setVal('note_d2_a', 'ตลาดสดค้าสัตว์ป่าอู่ฮั่นยังคงเป็นแหล่งแพร่โรคในช่วงสัปดาห์แรก');
  setVal('note_d2_b', 'ผู้ป่วยส่วนใหญ่เป็นเจ้าของแผงในตลาดค้าสัตว์ป่า แต่เริ่มติดตามผู้สัมผัส 163 ราย');
  setVal('note_d2_c', 'ประชากรทั่วไปยังไม่มีภูมิคุ้มกันต่อเชื้อไวรัสสายพันธุ์ใหม่');
  setVal('note_q3_general', 'พบผู้ป่วยปอดอักเสบขั้นรุนแรงในภาวะวิกฤต 7 ราย จาก 44 ราย (อัตราความรุนแรง 26%)');
  setVal('note_d3_b', 'มีภาวะปอดอักเสบเฉียบพลันและระบบทางเดินหายใจล้มเหลว');
  setVal('note_q4_general', 'มีเที่ยวบินตรงจากเมืองอู่ฮั่นมายังสนามบินสุวรรณภูมิ ดอนเมือง เชียงใหม่ ภูเก็ต และกระบี่ หลายเที่ยวต่อวัน');
  setVal('note_d4_a', 'เที่ยวบินตรงและเทศกาลตรุษจีนที่กำลังมาถึง อาจมีการเดินทางหนาแน่น');
  setVal('note_d4_b', 'จำนวนผู้ป่วยในจีนเพิ่มขึ้นอย่างรวดเร็วจาก 27 เป็น 44 รายในระยะเวลาไม่กี่วัน');
  setVal('note_q5_2_general', 'หากเกิดการระบาดในวงกว้าง ระบบเตียง ICU และเครื่องช่วยหายใจอาจเผชิญวิกฤตเกินกำลัง');
  setVal('note_d5_d', 'ห้องแยกกักความดันลบ เครื่องเทอร์โมสแกน และบุคลากรทางการแพทย์ที่ด่านควบคุมโรคระหว่างประเทศอาจไม่เพียงพอ');

  syncRadiosWithState();
  evaluateRiskAlgorithm();
  showToast('โหลดข้อมูลตัวอย่าง: โรคปอดอักเสบอู่ฮั่น พร้อมคำนวณข้อย่อยครบถ้วน', 'success');
}

function setVal(id, val) {
  const el = document.getElementById(id);
  if (el) {
    el.value = val;
    state.notes[id] = val;
  }
}

function syncRadiosWithState() {
  const map = {
    'q1_highThreat': state.answers.q1_highThreat,
    'q2_exposure': state.answers.q2_exposureActive,
    'q3_severity': state.answers.q3_severityHigh,
    'q4_spread': state.answers.q4_spreadFuture,
    'q4_2_significant': state.answers.q4_2_significantCurrent,
    'q5_1_capacity': state.answers.q5_1_capacitySufficient,
    'q5_2_overwhelmed': state.answers.q5_2_systemOverwhelmed
  };

  Object.entries(map).forEach(([name, val]) => {
    if (val) {
      const radio = document.querySelector(`input[name="${name}"][value="${val}"]`);
      if (radio) {
        radio.checked = true;
        document.querySelectorAll(`input[name="${name}"]`).forEach(r => r.closest('.opt-card')?.classList.remove('selected', 'danger-selected'));
        radio.closest('.opt-card')?.classList.add('selected');
      }
    }
  });
}

/**
 * Toast Notifications
 */
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const span = document.createElement('span');
  span.textContent = message;
  toast.appendChild(span);
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

/**
 * Settings Modal Controls
 */
function setupSettingsModal() {
  const modal = document.getElementById('settingsModal');
  const btnOpen = document.getElementById('btnOpenSettings');
  const btnClose = document.getElementById('btnCloseSettings');
  const btnSave = document.getElementById('btnSaveSettings');

  const apiKeyInput = document.getElementById('settingTyphoonApiKey');
  const modelSelect = document.getElementById('settingTyphoonModel');
  const modelCustomInput = document.getElementById('settingTyphoonModelCustom');
  const sheetsUrlInput = document.getElementById('settingGoogleSheetsUrl');

  if (modelSelect && modelCustomInput) {
    modelSelect.addEventListener('change', () => {
      if (modelSelect.value === 'custom') {
        modelCustomInput.style.display = 'block';
        modelCustomInput.focus();
      } else {
        modelCustomInput.style.display = 'none';
      }
    });
  }

  if (btnOpen) {
    btnOpen.addEventListener('click', () => {
      apiKeyInput.value = state.settings.typhoonApiKey;
      const currentModel = state.settings.typhoonModel || 'typhoon-v2.5-30b-a3b-instruct';

      if (modelSelect) {
        const matchingOpt = Array.from(modelSelect.options).find(opt => opt.value === currentModel);
        if (matchingOpt) {
          modelSelect.value = currentModel;
          if (modelCustomInput) modelCustomInput.style.display = 'none';
        } else {
          modelSelect.value = 'custom';
          if (modelCustomInput) {
            modelCustomInput.value = currentModel;
            modelCustomInput.style.display = 'block';
          }
        }
      }

      sheetsUrlInput.value = state.settings.googleSheetsUrl;
      modal.classList.add('active');
    });
  }

  if (btnClose) {
    btnClose.addEventListener('click', () => modal.classList.remove('active'));
  }

  if (btnSave) {
    btnSave.addEventListener('click', () => {
      state.settings.typhoonApiKey = apiKeyInput.value.trim();
      let chosenModel = modelSelect.value;
      if (chosenModel === 'custom') {
        chosenModel = modelCustomInput ? modelCustomInput.value.trim() : '';
      }
      state.settings.typhoonModel = chosenModel || 'typhoon-v2.5-30b-a3b-instruct';
      state.settings.googleSheetsUrl = sheetsUrlInput.value.trim();

      localStorage.setItem('ira_typhoon_api_key', state.settings.typhoonApiKey);
      localStorage.setItem('ira_typhoon_model', state.settings.typhoonModel);
      localStorage.setItem('ira_sheets_url', state.settings.googleSheetsUrl);

      updateGoogleSheetsStatusUI();
      modal.classList.remove('active');
      showToast('บันทึกการตั้งค่าเรียบร้อยแล้ว (ใช้โมเดล ' + state.settings.typhoonModel + ')', 'success');

      if (state.settings.googleSheetsUrl) {
        fetchEventsFromGoogleSheet(false);
      } else {
        setActiveAssessmentId(null);
      }
    });
  }
}

/**
 * Copy to Clipboard Helper
 */
function copyAiSummary() {
  const box = document.getElementById('aiNarrativeBox');
  if (!box || !box.textContent.trim()) {
    showToast('ยังไม่มีข้อความบทสรุปให้คัดลอก', 'warn');
    return;
  }
  navigator.clipboard.writeText(box.textContent);
  showToast('คัดลอกข้อความบทสรุปเรียบร้อยแล้ว', 'success');
}

/**
 * Mobile Navigation & Smooth Scroll Helpers
 */
function setupMobileTabs() {
  const btnTabForm = document.getElementById('btnMobileTabForm');
  const btnTabResult = document.getElementById('btnMobileTabResult');
  const wizardCol = document.getElementById('wizardCol');
  const sidebarCol = document.getElementById('sidebarCol');
  const riskResultCard = document.getElementById('riskResultCard');

  if (wizardCol) wizardCol.classList.remove('mobile-pane-hidden');
  if (sidebarCol) sidebarCol.classList.remove('mobile-pane-hidden');

  function scrollToSection(target) {
    if (target === 'result') {
      if (btnTabResult) btnTabResult.classList.add('active');
      if (btnTabForm) btnTabForm.classList.remove('active');
      if (riskResultCard) {
        riskResultCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } else {
      if (btnTabForm) btnTabForm.classList.add('active');
      if (btnTabResult) btnTabResult.classList.remove('active');
      if (wizardCol) {
        wizardCol.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }

  if (btnTabForm) btnTabForm.addEventListener('click', () => scrollToSection('form'));
  if (btnTabResult) btnTabResult.addEventListener('click', () => scrollToSection('result'));
}

// Initialise application on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  setupOptionCards();
  setupSettingsModal();
  setupMobileTabs();
  evaluateRiskAlgorithm();
  renderAuditTable();
  updateGoogleSheetsStatusUI();
  // Initialize date input if not populated
  const dateInput = document.getElementById('assessmentDate');
  if (dateInput && !dateInput.value) {
    dateInput.value = state.metadata.assessmentDate;
  }

  // Set initial preview ID (shows syncing if Google Sheet is configured)
  const hasSheet = !!state.settings.googleSheetsUrl;
  setActiveAssessmentId(null, hasSheet);

  // Attach button events
  const btnGenAi = document.getElementById('btnGenerateAi');
  const btnSaveSheet = document.getElementById('btnSaveSheet');
  const btnCopyAi = document.getElementById('btnCopyAi');
  const btnExportCsv = document.getElementById('btnExportCsv');
  const btnPresetWuhan = document.getElementById('btnPresetWuhan');
  const btnReset = document.getElementById('btnResetForm');

  const btnConnectSheetAudit = document.getElementById('btnConnectSheetFromAudit');
  const btnQuickConnectSheet = document.getElementById('btnQuickConnectSheet');

  if (btnGenAi) btnGenAi.addEventListener('click', generateAiSummary);
  if (btnSaveSheet) btnSaveSheet.addEventListener('click', saveToGoogleSheets);
  if (btnCopyAi) btnCopyAi.addEventListener('click', copyAiSummary);
  if (btnExportCsv) btnExportCsv.addEventListener('click', exportHistoryCSV);
  if (btnPresetWuhan) btnPresetWuhan.addEventListener('click', loadPresetWuhanOutbreak);

  if (btnConnectSheetAudit) btnConnectSheetAudit.addEventListener('click', promptGoogleSheetsConnect);
  if (btnQuickConnectSheet) btnQuickConnectSheet.addEventListener('click', promptGoogleSheetsConnect);

  const btnPullSheet = document.getElementById('btnPullSheetEvents');
  if (btnPullSheet) btnPullSheet.addEventListener('click', () => fetchEventsFromGoogleSheet(false));

  // If Google Sheets URL is already configured, fetch latest history from Sheet immediately on startup
  if (state.settings.googleSheetsUrl) {
    fetchEventsFromGoogleSheet(true);
  }

  const btnResetToNewCase = document.getElementById('btnResetToNewCase');
  if (btnResetToNewCase) {
    btnResetToNewCase.addEventListener('click', () => {
      if (state.settings.googleSheetsUrl) {
        setActiveAssessmentId(null, true);
        fetchEventsFromGoogleSheet(true);
      } else {
        setActiveAssessmentId(null);
      }
      const nextId = generateNextAssessmentId();
      showToast(`เปิดเซสชันสำหรับบันทึกเป็นเหตุการณ์ใหม่แล้ว (รหัสถัดไป: ${nextId})`, 'info');
    });
  }

  // Delete modal buttons
  const btnCloseDel = document.getElementById('btnCloseDeleteModal');
  const btnCancelDel = document.getElementById('btnCancelDelete');
  const btnConfirmDel = document.getElementById('btnConfirmDelete');
  const deletePassInp = document.getElementById('deletePassword');

  if (btnCloseDel) btnCloseDel.addEventListener('click', closeDeleteModal);
  if (btnCancelDel) btnCancelDel.addEventListener('click', closeDeleteModal);
  if (btnConfirmDel) btnConfirmDel.addEventListener('click', executeDeleteEvent);
  if (deletePassInp) {
    deletePassInp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') executeDeleteEvent();
    });
  }

  if (btnReset) {
    btnReset.addEventListener('click', () => {
      if (confirm('คุณต้องการล้างข้อมูลเพื่อเริ่มประเมินเหตุการณ์ใหม่หรือไม่?')) {
        location.reload();
      }
    });
  }
});

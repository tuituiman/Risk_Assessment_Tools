/**
 * ==============================================================================
 * IRA Assistant - WHO Initial Risk Assessment Algorithm Engine (algorithm.js)
 * ==============================================================================
 * 
 * รับผิดชอบ:
 * 1. ตรรกะการประเมินความเสี่ยงตามกรอบแนวคิด WHO IRA (Slides 25-40)
 * 2. การควบคุม Dynamic Decision Tree & Progressive Disclosure (แสดงทีละข้อ)
 * 3. การตรวจสอบความครบถ้วนของการประเมิน (Assessment Completeness)
 * 4. การจัดการสถานะระหว่างประเมิน (Incomplete State) ป้องกันการขึ้น Very High ทันที
 * ==============================================================================
 */

// ตารางมาตรการตอบสนองและคุณลักษณะของแต่ละระดับความเสี่ยงตามเกณฑ์ WHO IRA
const RISK_ACTIONS = {
  'Incomplete': {
    th: 'อยู่ระหว่างการประเมิน',
    en: 'INCOMPLETE',
    class: 'risk-incomplete',
    actions: [
      'โปรดตอบคำถามตามลำดับการตัดสินใจ (Decision Flow) ด้านซ้ายให้ครบถ้วนเพื่อแสดงมาตรการที่แนะนำ'
    ]
  },
  'Very Low': {
    th: 'ต่ำมาก',
    en: 'VERY LOW RISK',
    class: 'risk-very-low',
    actions: [
      'เฝ้าระวังตามปกติผ่านระบบรายงานประจำ (Routine Surveillance)',
      'บันทึกข้อมูลและยุติการติดตามในระดับภาวะฉุกเฉิน',
      'แจ้งผลการประเมินแก่หน่วยงานในพื้นที่เพื่อทราบ'
    ]
  },
  'Low': {
    th: 'ต่ำ',
    en: 'LOW RISK',
    class: 'risk-low',
    actions: [
      'เฝ้าระวังเหตุการณ์อย่างใกล้ชิด (Enhanced Event-based Surveillance)',
      'แจ้งเตือนเครือข่ายระบาดวิทยาและสถานพยาบาลในพื้นที่',
      'ติดตามผู้สัมผัสและทบทวนข้อมูลเป็นระยะ'
    ]
  },
  'Moderate': {
    th: 'ปานกลาง',
    en: 'MODERATE RISK',
    class: 'risk-moderate',
    actions: [
      'เริ่มเตรียมความพร้อมทรัพยากร ทีมสอบสวน และห้องปฏิบัติการ',
      'เตรียมการเปิดศูนย์ปฏิบัติการภาวะฉุกเฉิน (EOC) หากแนวโน้มขยายตัว',
      'สื่อสารความเสี่ยงเบื้องต้นแก่ประชาชนกลุ่มเสี่ยง',
      'สนับสนุนทีมสอบสวนโรคลงพื้นที่ตรวจสอบเชิงรุก'
    ]
  },
  'High': {
    th: 'สูง',
    en: 'HIGH RISK',
    class: 'risk-high',
    actions: [
      'พิจารณาเปิดศูนย์ปฏิบัติการภาวะฉุกเฉิน (EOC) ระดับจังหวัด/เขตทันที',
      'ระดมทรัพยากร เวชภัณฑ์ และบุคลากรทางการแพทย์สนับสนุนพื้นที่',
      'ใช้มาตรการควบคุมโรคเข้มข้น เช่น คัดกรอง กักกัน และแยกกักผู้ป่วย',
      'จัดระบบสื่อสารความเสี่ยงแบบเชิงรุกเพื่อลดความตระหนก'
    ]
  },
  'Very High': {
    th: 'สูงมาก',
    en: 'VERY HIGH RISK',
    class: 'risk-very-high',
    actions: [
      'เปิดศูนย์ปฏิบัติการภาวะฉุกเฉิน (EOC) เต็มรูปแบบระดับกระทรวง/ชาติ',
      'ยกระดับมาตรการควบคุมขั้นสูงสุดตาม พ.ร.บ. โรคติดต่อ',
      'ประสานงานทุกภาคส่วน สนับสนุนห้องไอซียูและสำรองเตียงระดับสูงสุด',
      'รายงานผู้บริหารระดับสูงและประสานองค์การอนามัยโลก (IHR Focal Point)'
    ]
  }
};

/**
 * ตรวจสอบว่าผู้ใช้ตอบคำถามครบตามเส้นทางของ Decision Tree แล้วหรือยัง
 * @param {Object} answers - วัตถุเก็บคำตอบคำถามหลัก
 * @returns {boolean} true เมื่อตอบครบเงื่อนไขของเส้นทางนั้นๆ
 */
function isAssessmentComplete(answers) {
  if (!answers || !answers.q1_highThreat) {
    return false;
  }

  // เส้นทางที่ 1: High Threat Hazard = YES (Priority Rule)
  // ต้องการเพียง ข้อ 1 และ ข้อ 5.1 (ศักยภาพระบบ)
  if (answers.q1_highThreat === 'yes') {
    return !!answers.q5_1_capacitySufficient;
  }

  // เส้นทางที่ 2: High Threat = NO หรือ UNK
  // ต้องตอบข้อ 2 (การสัมผัส) เสมอ
  if (!answers.q2_exposureActive) {
    return false;
  }

  // 2.1 ไม่มีการสัมผัสแล้ว (Exposure = NO)
  if (answers.q2_exposureActive === 'no') {
    if (!answers.q4_2_significantCurrent) return false;
    // ถ้าผลกระทบไม่มาก -> สิ้นสุดทันที (Very Low)
    if (answers.q4_2_significantCurrent === 'no') return true;
    // ถ้าผลกระทบมาก -> ต้องตอบข้อ 5.1
    return !!answers.q5_1_capacitySufficient;
  }

  // 2.2 มีการสัมผัสต่อเนื่อง (Exposure = YES หรือ UNK)
  // ต้องตอบข้อ 3 (ความรุนแรง) และ ข้อ 4.1 (การแพร่ระบาด)
  if (!answers.q3_severityHigh || !answers.q4_spreadFuture) {
    return false;
  }

  // กรณีความรุนแรงสูง และ การแพร่ระบาดสูง
  const isSevere = answers.q3_severityHigh !== 'no';
  const isSpread = answers.q4_spreadFuture !== 'no';

  if (isSevere && isSpread) {
    // ต้องตอบข้อ 5.2 (ระบบล่ม) และ ข้อ 5.1 (ศักยภาพ)
    return !!answers.q5_2_systemOverwhelmed && !!answers.q5_1_capacitySufficient;
  }

  // กรณีอื่นๆ ต้องการข้อ 5.1 (ศักยภาพ)
  return !!answers.q5_1_capacitySufficient;
}

/**
 * ปรับปรุงการแสดงผลการ์ดคำถามแบบ Progressive Disclosure (แสดงทีละข้อตาม Flow)
 * @param {Object} state - Application State
 */
function updateDynamicFlow(state) {
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

  // รีเซ็ตคลาส Flow Breadcrumb ทั้งหมด
  [tag1, tag2, tag3, tag4, tag5].forEach(t => {
    if (t) t.className = 'flow-step-tag';
  });

  // ข้อ 1 แสดงเสมอเป็นข้อเริ่มต้น
  if (cardQ1) cardQ1.classList.remove('hidden');
  if (tag1) tag1.classList.add('active');

  // --------------------------------------------------------------------------
  // กรณีที่ยังไม่ได้ตอบข้อ 1 เลย (Initial Blank State)
  // ให้ซ่อนข้อ 2, 3, 4, 5 ทั้งหมด
  // --------------------------------------------------------------------------
  if (!answers.q1_highThreat) {
    if (bannerQ1Skip) bannerQ1Skip.style.display = 'none';
    if (bannerQ2Skip) bannerQ2Skip.style.display = 'none';
    if (bannerQ4_2VeryLow) bannerQ4_2VeryLow.style.display = 'none';

    if (cardQ2) cardQ2.classList.add('hidden');
    if (cardQ3) cardQ3.classList.add('hidden');
    if (cardQ4_1) cardQ4_1.classList.add('hidden');
    if (cardQ4_2) cardQ4_2.classList.add('hidden');
    if (cardQ5_1) cardQ5_1.classList.add('hidden');
    if (cardQ5_2) cardQ5_2.classList.add('hidden');

    if (tag1) tag1.classList.add('current');
    return;
  }

  // --------------------------------------------------------------------------
  // เส้นทางที่ 1: High Threat Hazard = YES -> ข้าม 2, 3, 4 ไปยัง 5.1 ทันที
  // --------------------------------------------------------------------------
  if (answers.q1_highThreat === 'yes') {
    if (bannerQ1Skip) bannerQ1Skip.style.display = 'flex';
    if (bannerQ2Skip) bannerQ2Skip.style.display = 'none';
    if (bannerQ4_2VeryLow) bannerQ4_2VeryLow.style.display = 'none';

    // ซ่อนข้อ 2, 3, 4, 5.2
    if (cardQ2) cardQ2.classList.add('hidden');
    if (cardQ3) cardQ3.classList.add('hidden');
    if (cardQ4_1) cardQ4_1.classList.add('hidden');
    if (cardQ4_2) cardQ4_2.classList.add('hidden');
    if (cardQ5_2) cardQ5_2.classList.add('hidden');

    // เปิดข้อ 5.1
    if (cardQ5_1) cardQ5_1.classList.remove('hidden');

    if (tag2) tag2.classList.add('skipped');
    if (tag3) tag3.classList.add('skipped');
    if (tag4) tag4.classList.add('skipped');
    if (tag5) {
      tag5.classList.add('active');
      if (!answers.q5_1_capacitySufficient) tag5.classList.add('current');
    }
    return;
  }

  // --------------------------------------------------------------------------
  // เส้นทางที่ 2: High Threat = NO / UNK -> แสดงข้อ 2 (การสัมผัส)
  // --------------------------------------------------------------------------
  if (bannerQ1Skip) bannerQ1Skip.style.display = 'none';
  if (cardQ2) cardQ2.classList.remove('hidden');
  if (tag2) tag2.classList.add('active');

  // ถ้ายังไม่ตอบข้อ 2 -> ซ่อนข้อ 3, 4, 5 ที่เหลือไว้ก่อน
  if (!answers.q2_exposureActive) {
    if (cardQ3) cardQ3.classList.add('hidden');
    if (cardQ4_1) cardQ4_1.classList.add('hidden');
    if (cardQ4_2) cardQ4_2.classList.add('hidden');
    if (cardQ5_1) cardQ5_1.classList.add('hidden');
    if (cardQ5_2) cardQ5_2.classList.add('hidden');
    if (bannerQ2Skip) bannerQ2Skip.style.display = 'none';
    if (bannerQ4_2VeryLow) bannerQ4_2VeryLow.style.display = 'none';
    if (tag2) tag2.classList.add('current');
    return;
  }

  // --------------------------------------------------------------------------
  // เส้นทางที่ 2.1: ไม่มีการสัมผัสแล้ว (Exposure = NO) -> ข้าม 3 & 4.1 ไปยัง 4.2
  // --------------------------------------------------------------------------
  if (answers.q2_exposureActive === 'no') {
    if (bannerQ2Skip) bannerQ2Skip.style.display = 'flex';
    if (cardQ3) cardQ3.classList.add('hidden');
    if (cardQ4_1) cardQ4_1.classList.add('hidden');
    if (cardQ4_2) cardQ4_2.classList.remove('hidden');
    if (cardQ5_2) cardQ5_2.classList.add('hidden');

    if (tag3) tag3.classList.add('skipped');
    if (tag4) {
      tag4.textContent = '4.2 ขนาดผลกระทบ';
      tag4.classList.add('active');
    }

    if (!answers.q4_2_significantCurrent) {
      // ยังไม่ตอบ 4.2 -> ซ่อน 5.1
      if (cardQ5_1) cardQ5_1.classList.add('hidden');
      if (bannerQ4_2VeryLow) bannerQ4_2VeryLow.style.display = 'none';
      if (tag4) tag4.classList.add('current');
      return;
    }

    if (answers.q4_2_significantCurrent === 'yes') {
      if (cardQ5_1) cardQ5_1.classList.remove('hidden');
      if (bannerQ4_2VeryLow) bannerQ4_2VeryLow.style.display = 'none';
      if (tag5) {
        tag5.classList.add('active');
        if (!answers.q5_1_capacitySufficient) tag5.classList.add('current');
      }
    } else {
      // Very Low ทันที สิ้นสุดการประเมิน
      if (cardQ5_1) cardQ5_1.classList.add('hidden');
      if (bannerQ4_2VeryLow) bannerQ4_2VeryLow.style.display = 'flex';
      if (tag5) tag5.classList.add('skipped');
    }
    return;
  }

  // --------------------------------------------------------------------------
  // เส้นทางที่ 2.2: มีการสัมผัสต่อเนื่อง (Exposure = YES / UNK)
  // เปิดข้อ 3 (ความรุนแรง) และ ข้อ 4.1 (การแพร่ระบาด)
  // --------------------------------------------------------------------------
  if (bannerQ2Skip) bannerQ2Skip.style.display = 'none';
  if (bannerQ4_2VeryLow) bannerQ4_2VeryLow.style.display = 'none';
  if (cardQ4_2) cardQ4_2.classList.add('hidden');

  if (cardQ3) cardQ3.classList.remove('hidden');
  if (cardQ4_1) cardQ4_1.classList.remove('hidden');

  if (tag3) tag3.classList.add('active');
  if (tag4) {
    tag4.textContent = '4.1 การแพร่ระบาด';
    tag4.classList.add('active');
  }

  // ถ้ายังตอบ 3 หรือ 4.1 ไม่ครบ -> ซ่อน 5.1 และ 5.2 ไว้ก่อน
  if (!answers.q3_severityHigh || !answers.q4_spreadFuture) {
    if (cardQ5_1) cardQ5_1.classList.add('hidden');
    if (cardQ5_2) cardQ5_2.classList.add('hidden');
    if (!answers.q3_severityHigh && tag3) tag3.classList.add('current');
    else if (!answers.q4_spreadFuture && tag4) tag4.classList.add('current');
    return;
  }

  // เมื่อตอบทั้ง 3 และ 4.1 ครบแล้ว -> ตรวจสอบว่าต้องแสดง 5.2 (ระบบล่ม) หรือไม่
  const severityHigh = answers.q3_severityHigh !== 'no';
  const spreadHigh = answers.q4_spreadFuture !== 'no';

  if (severityHigh && spreadHigh) {
    if (cardQ5_2) cardQ5_2.classList.remove('hidden');
  } else {
    if (cardQ5_2) cardQ5_2.classList.add('hidden');
  }

  // แสดงข้อ 5.1 (ศักยภาพระบบ) เสมอ
  if (cardQ5_1) cardQ5_1.classList.remove('hidden');
  if (tag5) {
    tag5.classList.add('active');
    if (!answers.q5_1_capacitySufficient) tag5.classList.add('current');
  }
}

/**
 * คำนวณระดับความเสี่ยงตามอัลกอริทึม WHO Initial Risk Assessment
 * @param {Object} state - Application State
 */
function evaluateRiskAlgorithm(state) {
  const { answers } = state;
  updateDynamicFlow(state);

  // ตรวจสอบความครบถ้วนของการประเมิน
  const isComplete = isAssessmentComplete(answers);

  if (!isComplete) {
    const incompleteConf = RISK_ACTIONS['Incomplete'];
    state.assessmentResult = {
      level: 'Incomplete',
      levelTh: incompleteConf.th,
      colorClass: incompleteConf.class,
      suggestedActions: incompleteConf.actions,
      rationaleBreakdown: {},
      isComplete: false
    };
    updateRiskDisplay(state);
    return;
  }

  let level = 'Moderate';
  let rationale = {};

  // Step 1: High Threat Hazard
  if (answers.q1_highThreat === 'yes') {
    rationale.step1 = 'พบเชื้อ/ภัยคุกคามระดับสูง (High Threat Hazard - Priority Rule)';
    if (answers.q5_1_capacitySufficient === 'yes') {
      level = 'High';
      rationale.step5 = 'ศักยภาพการควบคุมในพื้นที่เพียงพอ -> ระดับความเสี่ยง: สูง (High)';
    } else {
      level = 'Very High';
      rationale.step5 = 'ศักยภาพการควบคุมไม่เพียงพอ/ไม่แน่ชัด -> ระดับความเสี่ยง: สูงมาก (Very High)';
    }
  } else {
    rationale.step1 = 'ไม่ใช่เชื้อ/ภัยคุกคามระดับสูงที่กำหนดไว้เบื้องต้น';

    // Step 2: Exposure
    if (answers.q2_exposureActive === 'no') {
      rationale.step2 = 'ไม่มีการสัมผัสต่อเนื่องแล้ว';

      if (answers.q4_2_significantCurrent === 'yes') {
        rationale.step4 = 'มีผู้ได้รับผลกระทบเป็นจำนวนมากในปัจจุบัน (Tier 1)';
        if (answers.q5_1_capacitySufficient === 'yes') {
          level = 'Very Low';
          rationale.step5 = 'มีศักยภาพการควบคุมเพียงพอ -> ระดับความเสี่ยง: ต่ำมาก (Very Low)';
        } else {
          level = 'Low';
          rationale.step5 = 'ศักยภาพไม่เพียงพอ/ไม่แน่ชัด -> ระดับความเสี่ยง: ต่ำ (Low)';
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

        if (answers.q4_spreadFuture === 'yes' || answers.q4_spreadFuture === 'unk') {
          rationale.step4 = 'คาดว่าจะมีการแพร่ระบาดเพิ่มมากหรือขยายพื้นที่ (Tier 2)';
          if (answers.q5_1_capacitySufficient === 'yes') {
            level = 'Low';
            rationale.step5 = 'มีศักยภาพเพียงพอ -> ระดับความเสี่ยง: ต่ำ (Low)';
          } else {
            level = 'Moderate';
            rationale.step5 = 'ศักยภาพไม่เพียงพอ/ไม่แน่ชัด -> ระดับความเสี่ยง: ปานกลาง (Moderate)';
          }
        } else {
          rationale.step4 = 'ไม่คาดว่าจะมีการแพร่ระบาดขยายวงกว้าง (Tier 1)';
          if (answers.q5_1_capacitySufficient === 'yes') {
            level = 'Very Low';
            rationale.step5 = 'มีศักยภาพเพียงพอ -> ระดับความเสี่ยง: ต่ำมาก (Very Low)';
          } else {
            level = 'Low';
            rationale.step5 = 'ศักยภาพไม่เพียงพอ/ไม่แน่ชัด -> ระดับความเสี่ยง: ต่ำ (Low)';
          }
        }
      } else {
        // Severity is 'yes' or 'unk'
        rationale.step3 = 'ความรุนแรงของโรคอยู่ในระดับปานกลางถึงสูง (CFR/อาการวิกฤต)';

        if (answers.q4_spreadFuture === 'yes' || answers.q4_spreadFuture === 'unk') {
          rationale.step4 = 'คาดว่าจะมีการแพร่กระจายสูง/จำนวนป่วยพุ่งขึ้น';

          if (answers.q5_2_systemOverwhelmed === 'yes') {
            rationale.step5_2 = 'ระบบบริการสุขภาพมีแนวโน้มจะล่ม (Overwhelmed - Tier 4)';
            if (answers.q5_1_capacitySufficient === 'yes') {
              level = 'High';
              rationale.step5 = 'ระบบสุขภาพล่มแต่มีศักยภาพรองรับบางส่วน -> ระดับความเสี่ยง: สูง (High)';
            } else {
              level = 'Very High';
              rationale.step5 = 'ระบบสุขภาพล่มและศักยภาพไม่เพียงพอ -> ระดับความเสี่ยง: สูงมาก (Very High)';
            }
          } else {
            rationale.step5_2 = 'ระบบบริการสุขภาพยังไม่ถึงขั้นล่ม (Tier 3)';
            if (answers.q5_1_capacitySufficient === 'yes') {
              level = 'Moderate';
              rationale.step5 = 'ระบบยังไม่ล่มและมีศักยภาพเพียงพอ -> ระดับความเสี่ยง: ปานกลาง (Moderate)';
            } else {
              level = 'High';
              rationale.step5 = 'ระบบยังไม่ล่มแต่ศักยภาพไม่เพียงพอ -> ระดับความเสี่ยง: สูง (High)';
            }
          }
        } else {
          rationale.step4 = 'ไม่คาดว่าเชื้อจะแพร่ระบาดขยายวงกว้าง (Tier 2)';
          if (answers.q5_1_capacitySufficient === 'yes') {
            level = 'Low';
            rationale.step5 = 'มีศักยภาพเพียงพอ -> ระดับความเสี่ยง: ต่ำ (Low)';
          } else {
            level = 'Moderate';
            rationale.step5 = 'ศักยภาพไม่เพียงพอ/ไม่แน่ชัด -> ระดับความเสี่ยง: ปานกลาง (Moderate)';
          }
        }
      }
    }
  }

  const conf = RISK_ACTIONS[level];
  state.assessmentResult = {
    level: level,
    levelTh: conf.th,
    colorClass: conf.class,
    suggestedActions: conf.actions,
    rationaleBreakdown: rationale,
    isComplete: true
  };

  updateRiskDisplay(state);
}

/**
 * อัปเดตการแสดงผลใน Card ผลลัพธ์และ Badges
 * @param {Object} state - Application State
 */
function updateRiskDisplay(state) {
  const result = state.assessmentResult;
  const answers = state.answers;
  const metadata = state.metadata;

  const card = document.getElementById('riskResultCard');
  const badgeBox = document.getElementById('riskBadgeBox');
  const textLevel = document.getElementById('riskLevelText');
  const textLevelEn = document.getElementById('riskLevelEn');
  const verdictSummary = document.getElementById('riskVerdictSummary');
  const verdictDesc = document.getElementById('riskVerdictDesc');
  const verdictDrivers = document.getElementById('riskVerdictDrivers');
  const focalBox = document.getElementById('verdictFocalBox');
  const focalText = document.getElementById('verdictFocalText');
  const actionsList = document.getElementById('suggestedActionsList');

  // 1. อัปเดตการแสดงผล ประเด็นที่ประเมิน (Focal Issue)
  if (focalBox && focalText) {
    if (metadata.riskQuestion && metadata.riskQuestion.trim()) {
      focalBox.style.display = 'block';
      focalText.textContent = metadata.riskQuestion.trim();
    } else {
      focalBox.style.display = 'none';
    }
  }

  // 2. ล้างคลาสสีเดิม
  const allRiskClasses = ['risk-incomplete', 'risk-very-low', 'risk-low', 'risk-moderate', 'risk-high', 'risk-very-high'];
  if (card) {
    card.classList.remove(...allRiskClasses);
    card.classList.add(result.colorClass);
  }
  if (badgeBox) {
    badgeBox.classList.remove(...allRiskClasses);
    badgeBox.classList.add(result.colorClass);
  }
  if (verdictSummary) {
    verdictSummary.classList.remove(...allRiskClasses);
    verdictSummary.classList.add(result.colorClass);
  }

  // 3. กำหนดข้อความผลลัพธ์
  if (textLevel) {
    textLevel.textContent = result.isComplete ? `ระดับความเสี่ยง: ${result.levelTh}` : `⏳ ${result.levelTh}`;
  }
  if (textLevelEn) {
    textLevelEn.textContent = result.level === 'Incomplete' ? 'INCOMPLETE ASSESSMENT' : `${result.level.toUpperCase()} RISK`;
  }

  // 4. แสดงคำอธิบาย Rationale & Drivers
  if (verdictDesc && verdictDrivers) {
    if (!result.isComplete) {
      verdictDesc.textContent = 'โปรดตอบคำถามตามลำดับการประเมินความเสี่ยงด้านซ้ายให้ครบถ้วน เพื่อให้ระบบประมวลผลระดับความเสี่ยงและมาตรการตามเกณฑ์ WHO IRA';
      verdictDrivers.innerHTML = `
        <div style="font-size: 0.82rem; color: #64748b; margin-top: 6px;">
          📍 สถานะปัจจุบัน: กำลังตอบคำถามตาม Decision Tree
        </div>
      `;
    } else {
      let descText = '';
      if (result.level === 'Very High') {
        descText = 'เหตุการณ์นี้มีความเสี่ยงระดับวิกฤตสูงสุด เนื่องจากเป็นภัยคุกคามรุนแรงหรือมีอัตราการแพร่ระบาดสูงร่วมกับภาวะระบบสาธารณสุขในพื้นที่ไม่เพียงพอ';
      } else if (result.level === 'High') {
        descText = 'เหตุการณ์มีความเสี่ยงสูง มีแนวโน้มส่งผลกระทบเป็นวงกว้าง จำเป็นต้องยกระดับทรัพยากรและติดตามอย่างใกล้ชิดทันที';
      } else if (result.level === 'Moderate') {
        descText = 'เหตุการณ์มีความเสี่ยงปานกลาง สามารถบริหารจัดการได้ด้วยศักยภาพในพื้นที่ แต่ต้องเตรียมความพร้อมกรณีสถานการณ์ขยายตัว';
      } else if (result.level === 'Low') {
        descText = 'เหตุการณ์มีความเสี่ยงต่ำ ผลกระทบจำกัดและมีศักยภาพรองรับเพียงพอ ให้เน้นการเฝ้าระวังเชิงรุกอย่างต่อเนื่อง';
      } else {
        descText = 'เหตุการณ์มีความเสี่ยงต่ำมาก ไม่พบการแพร่ระบาดต่อเนื่องหรือผลกระทบจำกัดอย่างยิ่ง ให้ติดตามตามระบบปกติ';
      }
      verdictDesc.textContent = descText;

      const driversHtml = Object.values(result.rationaleBreakdown || {}).map(stepTxt => `
        <div class="verdict-driver-item">
          <span class="driver-bullet">•</span>
          <span>${stepTxt}</span>
        </div>
      `).join('');
      verdictDrivers.innerHTML = driversHtml;
    }
  }

  // 5. อัปเดตรายการมาตรการที่แนะนำ (Suggested Actions)
  if (actionsList) {
    actionsList.innerHTML = (result.suggestedActions || []).map(action => `
      <li>${action}</li>
    `).join('');
  }

  // 6. อัปเดต Domain Status Pills (1-5)
  updateDomainPill('pill-d1', answers.q1_highThreat);
  updateDomainPill('pill-d2', answers.q1_highThreat === 'yes' ? 'skip' : answers.q2_exposureActive);
  updateDomainPill('pill-d3', answers.q1_highThreat === 'yes' || answers.q2_exposureActive === 'no' ? 'skip' : answers.q3_severityHigh);
  updateDomainPill('pill-d4', answers.q1_highThreat === 'yes' ? 'skip' : (answers.q2_exposureActive === 'no' ? answers.q4_2_significantCurrent : answers.q4_spreadFuture));
  updateDomainPill('pill-d5', answers.q1_highThreat === 'yes' ? answers.q5_1_capacitySufficient : (answers.q2_exposureActive === 'no' && answers.q4_2_significantCurrent === 'no' ? 'skip' : answers.q5_1_capacitySufficient));

  // 7. อัปเดต Mobile Badges & Floating Summary Bar
  const mobBadge = document.getElementById('mobileRiskBadge');
  if (mobBadge) {
    mobBadge.textContent = result.levelTh;
    mobBadge.className = `mobile-risk-badge ${result.colorClass}`;
  }
  const mobFloatText = document.getElementById('mobileFloatingText');
  if (mobFloatText) {
    mobFloatText.textContent = `ความเสี่ยง: ${result.levelTh}`;
    mobFloatText.className = `mobile-floating-badge ${result.colorClass}`;
  }
}

/**
 * ปรับปรุงสถานะ Pill รายมิติ
 */
function updateDomainPill(elId, val) {
  const el = document.getElementById(elId);
  if (!el) return;

  if (val === 'yes') {
    el.textContent = 'ใช่ (Yes)';
    el.className = 'domain-pill-status pill-yes';
  } else if (val === 'no') {
    el.textContent = 'ไม่ใช่ (No)';
    el.className = 'domain-pill-status pill-no';
  } else if (val === 'unk') {
    el.textContent = 'ไม่แน่ชัด (Unk)';
    el.className = 'domain-pill-status pill-unk';
  } else if (val === 'skip') {
    el.textContent = 'ข้าม (N/A)';
    el.className = 'domain-pill-status pill-skip';
  } else {
    el.textContent = '-';
    el.className = 'domain-pill-status';
  }
}

/**
 * คำนวณสรุปผลคำถามข้อหลักอัตโนมัติจากเกณฑ์ย่อย (Sub-criteria to Main Domain)
 * รองรับรหัสโดเมนทั้งแบบ 'q1'/'d1', 'q2'/'d2', 'q3'/'d3', 'q4'/'d4', 'q5_1'/'d5'
 * ตามเกณฑ์มาตรฐาน WHO IRA (Slides 30, 32, 34, 36, 39)
 */
function calculateDomainFromSubAnswers(domain, state) {
  if (!state || !state.subAnswers) return;
  const sa = state.subAnswers;
  const d = String(domain).toLowerCase();

  if (d === 'q1' || d === 'd1') {
    // Slide 30: หากมีข้อใดข้อหนึ่งเข้าข่าย (Yes) -> ถือเป็นภัยคุกคามสูง (Yes); หากตอบ No ครบ -> No
    const anyYes = ['sub_d1_1', 'sub_d1_2', 'sub_d1_3', 'sub_d1_4'].some(k => sa[k] === 'yes');
    const allNo = ['sub_d1_1', 'sub_d1_2', 'sub_d1_3', 'sub_d1_4'].every(k => sa[k] === 'no');
    const hasAny = ['sub_d1_1', 'sub_d1_2', 'sub_d1_3', 'sub_d1_4'].some(k => sa[k] !== null && sa[k] !== undefined);

    if (anyYes) {
      setMainQuestionRadio('q1_highThreat', 'yes', state);
    } else if (allNo || hasAny) {
      setMainQuestionRadio('q1_highThreat', 'no', state);
    }
  } else if (d === 'q2' || d === 'd2') {
    // Slide 32: ต้องเข้าเกณฑ์ครบทั้ง 3 ด้าน (A: ต้นตอ, B: ทางผ่าน, C: ประชากรเสี่ยง) จึงถือว่ายังมีการสัมผัสสมบูรณ์ (Yes)
    const allYes = sa['sub_d2_a'] === 'yes' && sa['sub_d2_b'] === 'yes' && sa['sub_d2_c'] === 'yes';
    const anyNo = sa['sub_d2_a'] === 'no' || sa['sub_d2_b'] === 'no' || sa['sub_d2_c'] === 'no';

    if (allYes) {
      setMainQuestionRadio('q2_exposure', 'yes', state);
    } else if (anyNo) {
      setMainQuestionRadio('q2_exposure', 'no', state);
    }
  } else if (d === 'q3' || d === 'd3') {
    // Slide 34: เข้าเกณฑ์ A หรือ B หรือ C อย่างน้อย 1 ข้อ -> ถือว่าความรุนแรงสูง (Yes); หากตอบ No ครบ -> No
    const anyYes = ['sub_d3_a', 'sub_d3_b', 'sub_d3_c'].some(k => sa[k] === 'yes');
    const allNo = ['sub_d3_a', 'sub_d3_b', 'sub_d3_c'].every(k => sa[k] === 'no');
    const hasAny = ['sub_d3_a', 'sub_d3_b', 'sub_d3_c'].some(k => sa[k] !== null && sa[k] !== undefined);

    if (anyYes) {
      setMainQuestionRadio('q3_severity', 'yes', state);
    } else if (allNo || hasAny) {
      setMainQuestionRadio('q3_severity', 'no', state);
    }
  } else if (d === 'q4' || d === 'd4') {
    // Slide 36: เข้าเกณฑ์ A หรือ B หรือ C อย่างน้อย 1 ข้อ -> ถือว่าแนวโน้มการแพร่กระจายสูง (Yes); หากตอบ No ครบ -> No
    const anyYes = ['sub_d4_a', 'sub_d4_b', 'sub_d4_c'].some(k => sa[k] === 'yes');
    const allNo = ['sub_d4_a', 'sub_d4_b', 'sub_d4_c'].every(k => sa[k] === 'no');
    const hasAny = ['sub_d4_a', 'sub_d4_b', 'sub_d4_c'].some(k => sa[k] !== null && sa[k] !== undefined);

    if (anyYes) {
      setMainQuestionRadio('q4_spread', 'yes', state);
    } else if (allNo || hasAny) {
      setMainQuestionRadio('q4_spread', 'no', state);
    }
  } else if (d === 'q5_1' || d === 'd5' || d === 'q5') {
    // Slide 39: ศักยภาพด้าน A, B, C ต้องพร้อม (Yes) และต้อง "ไม่มีอุปสรรคสำคัญ (D = No)" จึงถือว่าเพียงพอ (Yes)
    const capacitiesMet = sa['sub_d5_a'] === 'yes' && sa['sub_d5_b'] === 'yes' && sa['sub_d5_c'] === 'yes';
    const noObstacle = sa['sub_d5_d'] === 'no';
    const hasObstacle = sa['sub_d5_d'] === 'yes';
    const anyNoCapacity = sa['sub_d5_a'] === 'no' || sa['sub_d5_b'] === 'no' || sa['sub_d5_c'] === 'no';

    if (capacitiesMet && noObstacle) {
      setMainQuestionRadio('q5_1_capacity', 'yes', state);
    } else if (anyNoCapacity || hasObstacle) {
      setMainQuestionRadio('q5_1_capacity', 'no', state);
      // หากพบอุปสรรควิกฤต (D = Yes) ให้เสนอแนะหรือตั้งค่าระบบบริการสุขภาพมีแนวโน้มล่ม (Q5.2 = Yes)
      if (hasObstacle) {
        setMainQuestionRadio('q5_2_overwhelmed', 'yes', state);
      }
    }
  }
}

/**
 * ช่วยอัปเดต Radio Input ของข้อหลักให้ตรงกับผลคำนวณ
 */
function setMainQuestionRadio(groupName, val, state) {
  const radio = document.querySelector(`input[name="${groupName}"][value="${val}"]`);
  if (radio) {
    radio.checked = true;
    document.querySelectorAll(`input[name="${groupName}"]`).forEach(inp => {
      inp.closest('.opt-card')?.classList.remove('selected', 'danger-selected');
    });
    const card = radio.closest('.opt-card');
    if (card) {
      card.classList.add('selected');
      if (val === 'yes' && groupName === 'q1_highThreat') card.classList.add('danger-selected');
    }

    // อัปเดตค่าใน state
    if (groupName === 'q1_highThreat') state.answers.q1_highThreat = val;
    else if (groupName === 'q2_exposure') state.answers.q2_exposureActive = val;
    else if (groupName === 'q3_severity') state.answers.q3_severityHigh = val;
    else if (groupName === 'q4_spread') state.answers.q4_spreadFuture = val;
    else if (groupName === 'q4_2_significant') state.answers.q4_2_significantCurrent = val;
    else if (groupName === 'q5_1_capacity') state.answers.q5_1_capacitySufficient = val;
    else if (groupName === 'q5_2_overwhelmed') state.answers.q5_2_systemOverwhelmed = val;

    evaluateRiskAlgorithm(state);
  }
}

// ผูกเข้ากับ Global Object
window.IraEngine = {
  RISK_ACTIONS: RISK_ACTIONS,
  isAssessmentComplete: isAssessmentComplete,
  updateDynamicFlow: updateDynamicFlow,
  evaluateRiskAlgorithm: evaluateRiskAlgorithm,
  updateRiskDisplay: updateRiskDisplay,
  calculateDomainFromSubAnswers: calculateDomainFromSubAnswers,
  setMainQuestionRadio: setMainQuestionRadio
};

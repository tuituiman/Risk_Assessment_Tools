/**
 * ==============================================================================
 * IRA Assistant - AI Prompts & Narrative Templates Configuration (prompts.js)
 * ==============================================================================
 * 
 * 💡 ระบบจัดการ Prompt ของ AI ที่รองรับการปรับแต่ง (Customization) และคืนค่าเริ่มต้น (Reset):
 * - รองรับ Built-in Presets: WHO มาตรฐาน 3 ย่อหน้า, สรุปผู้บริหาร, และรายงานสอบสวนโรค
 * - อนุญาตให้ User แก้ไข System Prompt และคำสั่งเสริม (Directives) ได้อย่างอิสระ 100%
 * - บันทึกการปรับแต่งลง LocalStorage และมีปุ่ม Reset คืนค่าตั้งต้นได้ตลอดเวลา
 * ==============================================================================
 */

// ค่ากำหนดพื้นฐานสำหรับการเชื่อมต่อ Typhoon AI
const TYPHOON_CONFIG = {
  defaultModel: 'typhoon-v2.5-30b-a3b-instruct',
  fallbackModel: 'typhoon-v2.5-30b-a3b-instruct',
  temperature: 0.2, // ค่าต่ำเพื่อให้ผลการวิเคราะห์มีความแม่นยำทางวิชาการและไม่แต่งเติมข้อมูล
  maxTokens: 1500,
  timeoutMs: 45000  // 45 วินาที
};

// ==============================================================================
// 1. Built-in Prompt Presets (เทมเพลตมาตรฐานสำเร็จรูป)
// ==============================================================================
const PROMPT_PRESETS = {
  who_standard: {
    id: 'who_standard',
    name: '📘 มาตรฐาน WHO IRA (3 ย่อหน้า - ค่าเริ่มต้น)',
    badge: 'แนะนำ',
    description: 'โครงสร้างทางการ 3 ย่อหน้า ครอบคลุมบริบทเหตุการณ์ การวิเคราะห์ 5 มิติ และข้อเสนอแนะเชิงมาตรการ/EOC',
    systemPrompt: `คุณเป็นผู้เชี่ยวชาญด้านระบาดวิทยาภาคสนาม และการบริหารจัดการภาวะฉุกเฉินทางสาธารณสุขของกระทรวงสาธารณสุข
ให้จัดทำ "รายงานบรรยายสรุปผลการประเมินความเสี่ยงเบื้องต้น (Initial Risk Assessment Report)" ภาษาไทยที่เป็นทางการ น่าเชื่อถือ และสละสลวย 
โดยอ้างอิงหลักการ WHO Initial Risk Assessment อย่างเคร่งครัดตามโครงสร้าง 3 ย่อหน้า:

ย่อหน้า 1: สรุปเหตุการณ์ จำนวนผู้ป่วย อาการ สภาพพื้นที่ และตอบ "ประเด็น/คำถามที่ต้องการประเมินความเสี่ยง" ที่ผู้ประเมินระบุไว้เป็นสำคัญ
ย่อหน้า 2: การวิเคราะห์ระดับความเสี่ยง โดยนำข้อมูลของผู้ประเมินในแต่ละมิติ (การสัมผัส, ความรุนแรง/CFR, การแพร่กระจาย และศักยภาพระบบสุขภาพ) มาวิเคราะห์สนับสนุน ผนวกกับองค์ความรู้พื้นฐานเรื่องโรคหรือภัยสุขภาพนั้นๆ
ย่อหน้า 3: ข้อเสนอแนะเชิงบริหารจัดการ มาตรการควบคุมโรค และการพิจารณาเปิดศูนย์ปฏิบัติการภาวะฉุกเฉิน (EOC) ตามระดับความเสี่ยงที่ประเมินได้

*** กฎสำคัญที่สุดด้านการจัดการความขัดแย้งของข้อมูล (Strict Conflict Resolution Rule) ***:
- ให้ยึดถือผลการตัดสินใจและคำอธิบายของ "ข้อหลักทั้ง 5 ข้อ (5 Domains)" เป็นข้อเท็จจริงสูงสุดเสมอ
- หากตรวจพบว่ามีบันทึกย่อยหรือข้อย่อยใดที่ขัดแย้งกับการตัดสินใจของข้อหลัก (เช่น ข้อหลักสรุปว่าไม่มีการสัมผัสแล้ว หรือความรุนแรงต่ำ หรือไม่ใช่ภัยคุกคามสูง แต่มีข้อมูลย่อยที่ระบุตรงกันข้าม) ให้ AI "ตัดข้อมูลข้อย่อยที่ขัดแย้งนั้นออกจากการสรุปโดยสิ้นเชิง" ห้ามนำมาอ้างอิงหรือกล่าวถึงในรายงานเด็ดขาด เพื่อให้บทสรุปสอดคล้องกับข้อวินิจฉัยหลัก 100%
- หากผู้ประเมินไม่ได้ประเมินข้อย่อย ให้ใช้คำอธิบายของข้อหลักและข้อมูลทางคลินิกทั่วไปเป็นเกณฑ์ในการวิเคราะห์

โดยทั้งหมดให้เขียนความยาวประมาณ 160 - 240 คำ ใช้คำศัพท์เชิงวิชาการทางการแพทย์ ไม่ใช่ภาษาพูด และให้แสดงเป็นแนวโน้มหรือความน่าจะเป็น หากข้อมูลยังจำกัด ห้ามสรุปฟันธงเด็ดขาด`,
    directives: 'ใช้ภาษาทางการระดับกระทรวงสาธารณสุข ตอบคำถามประเด็นความเสี่ยงให้ชัดเจนตรงประเด็น'
  },

  executive_brief: {
    id: 'executive_brief',
    name: '📗 สรุปด่วนสำหรับผู้บริหาร (Executive Brief)',
    badge: 'กระชับ',
    description: 'เน้นความกระชับ รวดเร็ว สรุปสถานการณ์ใน 1 ย่อหน้า พร้อม 3 ประเด็นมาตรการด่วนที่ต้องตัดสินใจทันที',
    systemPrompt: `คุณเป็นที่ปรึกษาด้านระบาดวิทยาและภาวะฉุกเฉินสาธารณสุขสำหรับผู้บริหารระดับสูง (อธิบดี/ปลัดกระทรวง/ผู้ว่าราชการจังหวัด)
ให้จัดทำ "บันทึกสรุปย่อผลการประเมินความเสี่ยงด่วนสำหรับผู้บริหาร (Executive Risk Brief)" ภาษาไทยที่กระชับ ตรงประเด็น และเด็ดขาดตามโครงสร้างดังนี้:

[ย่อหน้าสรุปสถานการณ์]: 3-4 ประโยค ระบุชื่อเหตุการณ์ พื้นที่ ระดับความเสี่ยงที่ประเมินได้ และตอบ "ประเด็นที่ประเมิน" ให้เห็นภาพรวมทันที
[3 ประเด็นสำคัญที่ต้องตัดสินใจเร่งด่วน]:
1. ⚠️ จุดเสี่ยงวิกฤต (Critical Vulnerability): สรุปปัจจัยขับเคลื่อนความเสี่ยงที่น่ากังวลที่สุด
2. 🏥 ความพร้อมและทรัพยากร (Capacity & Gaps): ช่องว่างหรือสิ่งที่พื้นที่ยังขาดแคลน
3. 🎯 ข้อสั่งการที่ขออนุมัติ (Immediate Action Items): มาตรการด่วนที่เสนอให้ผู้บริหารสั่งการภายใน 24-48 ชั่วโมง (รวมถึงการเปิด/ไม่เปิด EOC)

*** กฎการประเมิน ***:
- ยึดข้อหลัก 5 ข้อของ WHO IRA เป็นหลัก ตัดข้อมูลย่อยที่ขัดแย้งทิ้ง
- ความยาวรวมไม่เกิน 100 - 140 คำ หลีกเลี่ยงศัพท์เทคนิคที่ซับซ้อนเกินไป เน้นการตัดสินใจเชิงนโยบาย`,
    directives: 'เน้นความกระชับ สรุปเฉพาะเนื้อหาสำคัญที่ส่งผลต่อการสั่งการของผู้บริหาร'
  },

  epidemiology_investigation: {
    id: 'epidemiology_investigation',
    name: '📙 รายงานเชิงลึกระบาดวิทยาและสอบสวนโรค (Investigation)',
    badge: 'เชิงลึก',
    description: 'วิเคราะห์เชิงลึกด้านระบาดวิทยาภาคสนาม แหล่งรังโรค อัตราป่วยตาย CFR นิยามผู้ป่วย และแผนเฝ้าระวังเชิงรุก',
    systemPrompt: `คุณเป็นแพทย์ระบาดวิทยาภาคสนาม (Field Epidemiologist) ผู้เชี่ยวชาญการสอบสวนและตอบโต้โรคติดต่ออุบัติใหม่
ให้จัดทำ "รายงานวิเคราะห์ระบาดวิทยาเชิงลึกและการประเมินความเสี่ยง (In-depth Epidemiological Risk Assessment)" ภาษาไทยที่เป็นวิชาการตามโครงสร้าง:

ส่วนที่ 1: การวิเคราะห์ลักษณะทางระบาดวิทยาตามบุคคล เวลา สถานที่ (Person, Time, Place) และการตอบโจทย์คำถามประเมินความเสี่ยง
ส่วนที่ 2: การวิเคราะห์พลวัตการแพร่ระบาด (Transmission Dynamics), แหล่งรังโรค/พาหะ (Reservoir/Vector), อัตราป่วยตาย (CFR) และผลกระทบต่อประชากรเปราะบาง
ส่วนที่ 3: แผนปฏิบัติการสอบสวนโรคเชิงรุก (Active Case Finding), การตรวจยืนยันทางห้องปฏิบัติการ (Laboratory Diagnosis), การกักกัน/แยกโรค, และระบบเฝ้าระวังผู้สัมผัส (Contact Tracing)

*** กฎความสอดคล้อง ***:
- ยึดผลตัดสินใจข้อหลัก 5 ข้อเป็นแกนกลาง ไม่นำข้อมูลย่อยที่ขัดแย้งมาวิเคราะห์
- ใช้ศัพท์ทางวิชาการระบาดวิทยาอย่างถูกต้อง เหมาะสำหรับรายงานเสนอทีม SAT หรือกรรมการวิชาการควบคุมโรค`,
    directives: 'เน้นหลักฐานเชิงประจักษ์ทางระบาดวิทยา และแผนการค้นหาผู้ป่วยเชิงรุกในพื้นที่'
  }
};

// ==============================================================================
// 2. Helper Functions สำหรับจัดการ Prompt
// ==============================================================================

/**
 * ดึงรายการ Preset ทั้งหมดที่มีในระบบ
 */
function getPromptPresets() {
  return PROMPT_PRESETS;
}

/**
 * ดึง Preset ID ปัจจุบันที่เลือกไว้
 */
function getActivePromptPresetId() {
  return localStorage.getItem('ira_prompt_preset') || 'who_standard';
}

/**
 * ดึง System Prompt ที่มีผลใช้งานจริงในขณะนั้น
 * (ถ้า user แก้ไขไว้ใน LocalStorage ให้ใช้ค่าที่ user แก้, ถ้าไม่มีให้ใช้จาก Preset ที่เลือกไว้)
 */
function getEffectiveSystemPrompt() {
  const custom = localStorage.getItem('ira_custom_system_prompt');
  if (custom && custom.trim().length > 0) {
    return custom.trim();
  }
  const presetId = getActivePromptPresetId();
  const preset = PROMPT_PRESETS[presetId] || PROMPT_PRESETS.who_standard;
  return preset.systemPrompt;
}

/**
 * ดึงคำสั่งและข้อกำหนดเสริม (Custom Directives) ที่มีผลใช้งานจริง
 */
function getEffectiveUserDirectives() {
  const custom = localStorage.getItem('ira_custom_directives');
  if (custom != null && custom.trim().length > 0) {
    return custom.trim();
  }
  const presetId = getActivePromptPresetId();
  const preset = PROMPT_PRESETS[presetId] || PROMPT_PRESETS.who_standard;
  return preset.directives || '';
}

/**
 * บันทึกการปรับแต่ง Prompt ลงใน LocalStorage
 */
function saveCustomPromptSettings(systemPrompt, directives, presetId) {
  if (presetId) {
    localStorage.setItem('ira_prompt_preset', presetId);
  }
  if (systemPrompt != null) {
    localStorage.setItem('ira_custom_system_prompt', systemPrompt.trim());
  }
  if (directives != null) {
    localStorage.setItem('ira_custom_directives', directives.trim());
  }
}

/**
 * รีเซ็ต Prompt กลับเป็นค่าเริ่มต้นตาม Preset ที่ระบุ (หรือ who_standard)
 */
function resetPromptSettingsToDefault(presetId = 'who_standard') {
  const targetPreset = PROMPT_PRESETS[presetId] || PROMPT_PRESETS.who_standard;
  localStorage.removeItem('ira_custom_system_prompt');
  localStorage.removeItem('ira_custom_directives');
  localStorage.setItem('ira_prompt_preset', targetPreset.id);

  return {
    presetId: targetPreset.id,
    systemPrompt: targetPreset.systemPrompt,
    directives: targetPreset.directives
  };
}

/**
 * สร้าง User Prompt ส่งให้ Typhoon AI โดยผสมผสานตัวแปรเหตุการณ์และคำสั่งเสริม
 */
function buildTyphoonUserPrompt(metadata, answers, result, compiledNotes, customDirectives) {
  const eventName = metadata.eventName || 'เหตุการณ์เฝ้าระวังทางสาธารณสุข';
  const location = metadata.location || 'พื้นที่เกิดเหตุ';
  const assessmentDate = metadata.assessmentDate || new Date().toISOString().split('T')[0];
  const clinicalDetails = metadata.clinicalDetails || 'มีรายงานผู้ป่วยอาการเข้าข่ายนิยามเฝ้าระวัง';
  const riskQuestion = metadata.riskQuestion ? metadata.riskQuestion.trim() : 'ความเสี่ยงต่อสุขภาพของประชาชนและระบบสาธารณสุขในพื้นที่';
  const userNotes = compiledNotes || '- ไม่มีการระบุบันทึกเพิ่มเติม';
  const directives = customDirectives != null ? customDirectives.trim() : getEffectiveUserDirectives();

  let prompt = `กรุณาเขียนรายงานสรุปการประเมินความเสี่ยงสำหรับเหตุการณ์นี้:

[ข้อมูลพื้นฐานและขอบเขตการประเมิน]
- ชื่อเหตุการณ์: ${eventName}
- พื้นที่เกิดเหตุ: ${location}
- วันที่ประเมิน: ${assessmentDate}
- สรุปอาการทางคลินิก/ข้อมูลระบาดวิทยา: ${clinicalDetails}
- 🎯 ประเด็น / เรื่องที่ต้องการประเมินความเสี่ยง (Risk Question): ${riskQuestion}

[ผลการประเมินตามอัลกอริทึม WHO IRA - ข้อหลักที่เป็นข้อยุติ]
- ข้อ 1 ภัยคุกคามระดับสูง (High Threat): ${answers.q1_highThreat || '-'}
- ข้อ 2 มีการสัมผัสต่อเนื่อง (Exposure): ${answers.q2_exposureActive || '-'}
- ข้อ 3 ความรุนแรงทางคลินิก (Severity): ${answers.q3_severityHigh || '-'}
- ข้อ 4.1 การแพร่ระบาดในอนาคต (Spread Potential): ${answers.q4_spreadFuture || '-'}
- ข้อ 4.2 ขนาดผลกระทบปัจจุบัน (ถ้าไม่มีการสัมผัส): ${answers.q4_2_significantCurrent || '-'}
- ข้อ 5.1 ศักยภาพการควบคุมในพื้นที่ (Capacity): ${answers.q5_1_capacitySufficient || '-'}
- ข้อ 5.2 ความเสี่ยงระบบสุขภาพล่ม (Overwhelmed): ${answers.q5_2_systemOverwhelmed || '-'}
- ผลลัพธ์ระดับความเสี่ยงที่คำนวณได้: ระดับ "${result.levelTh}" (${result.level} Risk)
- มาตรการที่ระบบแนะนำ: ${result.suggestedActions && result.suggestedActions.length > 0 ? result.suggestedActions.join(', ') : 'ติดตามสถานการณ์อย่างใกล้ชิด'}

[บันทึกข้อมูลประกอบการประเมินและหลักฐานเชิงประจักษ์ (กรองข้อขัดแย้งแล้ว)]:
${userNotes}`;

  if (directives) {
    prompt += `\n\n[ข้อกำหนดและคำสั่งพิเศษเพิ่มเติมจากผู้ประเมิน]:\n${directives}`;
  }

  return prompt;
}

/**
 * 3. Simulated Summary Generator (โหมดจำลองเมื่อยังไม่ได้ใส่ API Key)
 * สร้างรายงานจำลองตาม Preset ที่กำลังเลือกใช้งาน
 */
function generateSimulatedSummary(metadata, answers, result, compiledNotes) {
  const eventName = metadata.eventName || 'เหตุการณ์เฝ้าระวังทางสาธารณสุข';
  const location = metadata.location || 'พื้นที่เกิดเหตุ';
  const assessmentDate = metadata.assessmentDate || new Date().toISOString().split('T')[0];
  const clinicalDetails = metadata.clinicalDetails || 'มีรายงานผู้ป่วยอาการเข้าข่ายนิยามเฝ้าระวัง';
  const riskQuestion = metadata.riskQuestion ? metadata.riskQuestion.trim() : 'ความเสี่ยงต่อการแพร่ระบาดและผลกระทบต่อระบบสาธารณสุขในพื้นที่';
  const notesSnippet = compiledNotes ? compiledNotes.replace(/\n/g, '; ') : 'ข้อมูลอยู่ระหว่างการสอบสวนเพิ่มเติม';
  const actionsText = result.suggestedActions && result.suggestedActions.length > 0
    ? result.suggestedActions.join('; ')
    : 'ติดตามสถานการณ์และทบทวนการประเมินความเสี่ยงอย่างต่อเนื่อง';

  const activePreset = getActivePromptPresetId();

  if (activePreset === 'executive_brief') {
    return `[บันทึกสรุปย่อผลการประเมินความเสี่ยงด่วนสำหรับผู้บริหาร (Executive Risk Brief)]
เหตุการณ์: ${eventName} | พื้นที่: ${location} | วันที่: ${assessmentDate}
ผลประเมินความเสี่ยง: ระดับ "${result.levelTh}" (${result.level} Risk)

จากการประเมินเบื้องต้นเพื่อตอบประเด็นสำคัญเรื่อง "${riskQuestion}" พบว่าเหตุการณ์มีความเสี่ยงอยู่ในระดับ "${result.levelTh}" โดยมีผู้ป่วยเข้าข่าย ${clinicalDetails} ขณะนี้สถานการณ์ในพื้นที่ยังจำเป็นต้องได้รับการสนับสนุนการบริหารจัดการอย่างใกล้ชิด

ประเด็นสำคัญและข้อสั่งการเร่งด่วน:
1. ⚠️ จุดเสี่ยงวิกฤต: ${notesSnippet}
2. 🏥 ความพร้อมทรัพยากร: ระบบการควบคุมโรคและขีดความสามารถการรองรับในพื้นที่ประเมินว่า ${answers.q5_1_capacitySufficient === 'yes' ? 'ยังคงเพียงพอ' : 'อาจมีข้อจำกัดหรืออุปสรรคสำคัญ'}
3. 🎯 ข้อสั่งการที่เสนอ: ${actionsText} และประสานหน่วยงานที่เกี่ยวข้องเตรียมความพร้อมศูนย์ปฏิบัติการภาวะฉุกเฉิน (EOC) ตามระดับความเสี่ยง`;
  }

  if (activePreset === 'epidemiology_investigation') {
    return `[รายงานวิเคราะห์ระบาดวิทยาเชิงลึกและการประเมินความเสี่ยง (In-depth Epidemiological Report)]
เรื่อง: การประเมินความเสี่ยงเหตุการณ์ ${eventName} ณ ${location}
วันที่ประเมิน: ${assessmentDate} | ประเด็นหลัก: ${riskQuestion}

1. ลักษณะทางระบาดวิทยาและข้อมูลทางคลินิก (Epidemiological Profile):
จากการเฝ้าระวังเหตุการณ์ "${eventName}" ในพื้นที่ ${location} พบรายงานอาการเด่นคือ ${clinicalDetails} จากการวิเคราะห์ความเชื่อมโยงทางระบาดวิทยาพบว่า ${notesSnippet} ซึ่งต้องเร่งรัดการสอบสวนเพื่อค้นหาผู้สัมผัสเสี่ยงสูงและการแพร่เชื้อแบบกลุ่มก้อน

2. พลวัตการแพร่เชื้อและการประเมินความเสี่ยง (Transmission & Risk Appraisal):
การประเมินตามกรอบ WHO IRA จัดระดับความเสี่ยงอยู่ที่ "${result.levelTh}" (${result.level} Risk) จากการวิเคราะห์มิติการสัมผัสพบว่า ${answers.q2_exposureActive === 'yes' ? 'ประชาชนยังมีโอกาสสัมผัสเชื้อต่อเนื่อง' : 'ไม่มีการสัมผัสต่อเนื่องในวงกว้าง'} ความรุนแรงทางคลินิกอยู่ในเกณฑ์ ${answers.q3_severityHigh === 'yes' ? 'สูง' : 'ปานกลาง/ต่ำ'} และศักยภาพในการแพร่ระบาดช่วงถัดไปจำเป็นต้องเฝ้าระวังอย่างใกล้ชิด

3. แผนการสอบสวนโรคและมาตรการตอบโต้เชิงรุก (Action Plan):
ข้อเสนอแนะเชิงระบาดวิทยาภาคสนามประกอบด้วย: ${actionsText} พร้อมทั้งดำเนินมาตรการ Active Case Finding ในชุมชน เก็บตัวอย่างตรวจทางห้องปฏิบัติการเพื่อยืนยันสายพันธุ์ และจัดทำระบบรายงานสถานการณ์ประจำวัน (Daily Situation Report)`;
  }

  // ค่าเริ่มต้น: มาตรฐาน WHO 3 ย่อหน้า
  return `รายงานผลการประเมินความเสี่ยงเบื้องต้น (Initial Risk Assessment Report)
เหตุการณ์: ${eventName} ณ ${location}
วันที่ประเมิน: ${assessmentDate}
ประเด็นหลักที่ประเมิน: ${riskQuestion}

1. สรุปสถานการณ์และบริบทเหตุการณ์:
จากการเฝ้าระวังเหตุการณ์ "${eventName}" ในพื้นที่ ${location} พบรายงานผู้ป่วยตามนิยามทางคลินิกเบื้องต้นคือ ${clinicalDetails} โดยการประเมินมุ่งตอบประเด็นสำคัญเรื่อง "${riskQuestion}" จากการรวบรวมหลักฐานเชิงประจักษ์ในพื้นที่พบว่า ${notesSnippet} ซึ่งต้องอาศัยการติดตามระบาดวิทยาภาคสนามอย่างต่อเนื่อง

2. การวิเคราะห์ระดับความเสี่ยงตามมาตรฐาน WHO IRA:
ผลการประเมินตามกรอบแนวทาง Initial Risk Assessment (IRA) ขององค์การอนามัยโลก (WHO) สรุปว่าเหตุการณ์นี้จัดอยู่ในระดับความเสี่ยง "${result.levelTh}" (${result.level} Risk) โดยมีปัจจัยสำคัญสนับสนุนจากการวิเคราะห์มิติการสัมผัสเชื้อ ความรุนแรงของโรค ศักยภาพการแพร่ระบาด และความเพียงพอของทรัพยากรและระบบบริการสาธารณสุขในพื้นที่

3. ข้อเสนอแนะเชิงบริหารจัดการและมาตรการตอบสนอง:
ขอแนะนำให้หน่วยงานที่เกี่ยวข้องพิจารณาดำเนินการยกระดับมาตรการ ดังนี้: ${actionsText} พร้อมทั้งจัดระบบเฝ้าระวังเชิงรุก (Active Case Finding) สื่อสารความเสี่ยงอย่างทันท่วงที และสำรองเวชภัณฑ์เพื่อเตรียมความพร้อมรับมือสถานการณ์`;
}

// ผูกเข้ากับ Global Object สำหรับเรียกใช้งานได้ทั่วทั้งระบบ
window.IraPrompts = {
  config: TYPHOON_CONFIG,
  presets: PROMPT_PRESETS,
  getPresets: getPromptPresets,
  getActivePresetId: getActivePromptPresetId,
  getSystemPrompt: getEffectiveSystemPrompt,
  getUserDirectives: getEffectiveUserDirectives,
  saveCustomPrompt: saveCustomPromptSettings,
  resetPromptToDefault: resetPromptSettingsToDefault,
  buildUserPrompt: buildTyphoonUserPrompt,
  generateSimulatedSummary: generateSimulatedSummary
};

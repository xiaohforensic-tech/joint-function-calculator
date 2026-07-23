(function () {
  "use strict";
  const { JOINTS, HAND_DIGITS, INJURY_HAND_SEGMENTS, HAND_GROUPS, HAND_SEVERITIES, MUSCLE_LABELS } = window.JointData;
  const Calc = window.JointCalculator;
  const form = document.getElementById("calculatorForm");
  const jointSelect = document.getElementById("jointSelect");
  const methodSelect = document.getElementById("methodSelect");
  const referenceMode = document.getElementById("referenceMode");
  const appraisalType = document.getElementById("appraisalType");
  const table = document.getElementById("measurementTable");
  const record = document.getElementById("record");
  const historyList = document.getElementById("historyList");
  const methodNotice = document.getElementById("methodNotice");
  let deferredPrompt;
  let currentRecord = null;

  const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
  const valueOf = name => form.elements[name]?.value || "";
  const formatPct = n => `${Number(n).toFixed(2)}%`;
  const formatPoints = n => `${Number(n).toFixed(2)}分`;
  const today = () => new Date().toISOString().slice(0, 10);

  Object.entries(JOINTS).forEach(([id, joint]) => jointSelect.add(new Option(joint.name, id)));
  form.elements.examDate.value = today();

  function methodGuidance() {
    const joint = JOINTS[jointSelect.value];
    if (joint.kind === "hand") {
      methodNotice.className = "notice warning";
      methodNotice.innerHTML = appraisalType.value === "injury"
        ? "损伤程度按附录C.7固定权重累计。活动度只作检验记录，不直接按比例折算权重。"
        : "致残程度按附录C.8：实测活动弧自动分档，再由鉴定人确认表C-10受累组合；标准正文直接条款优先。";
      return;
    }
    if (joint.directionOnly) {
      methodNotice.className = "notice";
      methodNotice.innerHTML = "按六个方向与正常参考值比较并取平均。";
      return;
    }
    const injury = appraisalType.value === "injury";
    const tableMethod = methodSelect.value === "table";
    methodSelect.querySelector('option[value="direction"]').disabled = injury;
    if (injury && !tableMethod) methodSelect.value = "table";
    if (injury) {
      methodNotice.className = "notice warning";
      methodNotice.innerHTML = "伤情鉴定使用查表法：伤侧值减去健侧值。";
    } else if (methodSelect.value === "table") {
      methodNotice.className = "notice warning";
      methodNotice.innerHTML = "查表法适用于活动受限并伴相关肌力下降；其他情况可选方向均分法。";
    } else {
      methodNotice.className = "notice";
      methodNotice.innerHTML = "与健侧或正常参考值比较，按各方向平均。";
    }
  }

  function handPatternOptions(group) {
    return `<option value="">未计分</option>${group.patterns.map(pattern => `<option value="${pattern.id}">${escapeHtml(pattern.label)}</option>`).join("")}`;
  }

  function handSeverityOptions() {
    return `<option value="">未计分</option>${Object.entries(HAND_SEVERITIES).map(([value,label]) => `<option value="${value}">${escapeHtml(label)}</option>`).join("")}`;
  }

  function handRomRows(sideId) {
    return HAND_DIGITS.flatMap(digit => digit.joints.map(joint => `<div class="hand-rom-row">
      <div><strong>${digit.label}</strong><small>${joint.label}</small></div>
      <div><input type="number" min="0" max="180" step="0.1" required inputmode="decimal" name="hand.${sideId}.rom.${digit.id}.${joint.id}.actual" value="${joint.upper}" aria-label="${digit.label}${joint.label}实测活动弧"></div>
      <div><input type="number" min="0.1" max="180" step="0.1" required inputmode="decimal" name="hand.${sideId}.rom.${digit.id}.${joint.id}.reference" value="${joint.upper}" aria-label="${digit.label}${joint.label}参考活动弧"></div>
      <div><select name="hand.${sideId}.rom.${digit.id}.${joint.id}.status"><option value="limited">活动受限</option><option value="functionalAnkylosis">功能位强直（已确认）</option><option value="nonfunctional">非功能位强直（已确认）</option></select></div>
      <div><input type="number" min="-180" max="180" step="0.1" inputmode="decimal" name="hand.${sideId}.rom.${digit.id}.${joint.id}.fixedDegree" placeholder="强直时填写" aria-label="${digit.label}${joint.label}强直固定角度"></div>
      <div class="hand-band" data-band-for="hand.${sideId}.rom.${digit.id}.${joint.id}">＞3/4，不计分</div>
    </div>`)).join("");
  }

  function handRomPanel(sideId) {
    return `<details class="hand-details" open><summary>手指活动度（实测活动弧）</summary>
      <div class="hand-rom-row hand-rom-header"><div>手指/关节</div><div>活动弧°</div><div>参考°</div><div>状态</div><div>固定位°</div><div>自动描述</div></div>${handRomRows(sideId)}
    </details>`;
  }

  function disabilityHandPanel(sideId, sideLabel) {
    return `<details class="hand-panel hand-side" ${sideId === "left" ? "open" : ""}><summary><span>${sideLabel}</span><small>点击展开或收起</small></summary>${handRomPanel(sideId)}
      <label class="missing-score">手部分缺失分值（按图C-1人工累计）<input type="number" min="0" max="100" step="1" inputmode="numeric" name="hand.${sideId}.missingScore" value="0"></label>
      <details class="hand-details" open><summary>表C-10计分确认</summary>
      <div class="hand-row hand-header"><div>部位</div><div>受累组合</div><div>障碍程度</div></div>
      ${HAND_GROUPS.map(group => `<div class="hand-row"><div><strong>${group.label}</strong></div><div><select name="hand.${sideId}.${group.id}.pattern">${handPatternOptions(group)}</select></div><div><select name="hand.${sideId}.${group.id}.severity">${handSeverityOptions()}</select></div></div>`).join("")}</details>
    </details>`;
  }

  function injurySegmentOptions() { return `<option value="normal">正常/不计</option><option value="missing">完整缺失</option><option value="completeLoss">功能完全丧失</option><option value="partialMissing">部分实体缺失</option>`; }

  function injuryHandPanel(sideId, sideLabel) {
    return `<details class="hand-panel hand-side" ${sideId === "left" ? "open" : ""}><summary><span>${sideLabel}</span><small>点击展开或收起</small></summary>${handRomPanel(sideId)}
      <details class="hand-details" open><summary>缺失或功能完全丧失（附录C.7）</summary>
      <div class="injury-segment-row injury-segment-header"><div>部位</div><div>权重</div><div>状态</div><div>缺失长度</div><div>健侧同节长度</div></div>
      ${INJURY_HAND_SEGMENTS.map(segment => `<div class="injury-segment-row"><div>${segment.label}</div><div>${segment.weight}%</div><div><select name="hand.${sideId}.segment.${segment.id}.state">${injurySegmentOptions()}</select></div><div><input type="number" min="0" step="0.1" name="hand.${sideId}.segment.${segment.id}.missingLength" placeholder="仅部分缺失"></div><div><input type="number" min="0.1" step="0.1" name="hand.${sideId}.segment.${segment.id}.referenceLength" placeholder="同单位"></div></div>`).join("")}
      </details><label class="missing-score">掌侧感觉丧失比例（0～100%）<input type="number" min="0" max="100" step="1" name="hand.${sideId}.palmarSensoryLoss" value="0"></label>
    </details>`;
  }

  function renderHandMeasurements() {
    const injury=appraisalType.value === "injury";
    table.innerHTML = `<div class="hand-workflow"><span><b>1</b>录入活动弧</span><i></i><span><b>2</b>${injury ? "选择缺失或完全丧失状态" : "确认表C-10受累组合"}</span><i></i><span><b>3</b>生成记录</span></div><div class="hand-grid">${injury ? injuryHandPanel("left","左手")+injuryHandPanel("right","右手") : disabilityHandPanel("left","左手")+disabilityHandPanel("right","右手")}</div>${injury ? `<div class="direct-clauses"><strong>直接条款核对</strong><label><input type="checkbox" name="hand.direct.bothHandsCompleteLoss">双手完全缺失或功能完全丧失</label><label><input type="checkbox" name="hand.direct.thumbContracture">一手拇指挛缩，不能对指和握物</label><label><input type="checkbox" name="hand.direct.threeFingerContracture">一手除拇指外任意三指挛缩，不能对指和握物</label></div>` : `<div class="direct-clauses"><strong>优先规则</strong><span>标准正文已有具体手部致残条款时，应优先适用，不能用表C-10替代。</span></div>`}`;
    document.getElementById("affectedLegendText").textContent = "实测活动弧";
    document.getElementById("referenceLegendText").textContent = injury ? "C.7固定权重" : "C.8参考活动弧";
    document.getElementById("measurementHelp").textContent = injury
      ? "实测度数用于检验记录和功能状态判断；部分实体缺失才按“缺失长度÷健侧同节长度×该节权重”计算。"
      : "填写从最大伸展位到最大屈曲位的实际活动弧。参考值默认采用正常范围上限，可改为健侧实测活动弧。";
    syncHandBands();
  }

  function renderMeasurements() {
    const joint = JOINTS[jointSelect.value];
    const tableOption = methodSelect.querySelector('option[value="table"]');
    const directionOption = methodSelect.querySelector('option[value="direction"]');
    const handOption = methodSelect.querySelector('option[value="hand"]');
    const healthyOption = referenceMode.querySelector('option[value="healthy"]');
    const sideSelect = form.elements.side;
    const injuryOption = appraisalType.querySelector('option[value="injury"]');
    if (joint.kind === "hand") {
      tableOption.disabled = true;
      directionOption.disabled = true;
      handOption.disabled = false;
      handOption.textContent = appraisalType.value === "injury" ? "手功能计权（附录C.7）" : "手功能评分（附录C.8）";
      methodSelect.value = "hand";
      injuryOption.disabled = false;
      referenceMode.disabled = true;
      sideSelect.value = "双侧分别计算";
      sideSelect.disabled = true;
      document.getElementById("jointNote").textContent = joint.note;
      renderHandMeasurements();
      methodGuidance();
      return;
    }
    injuryOption.disabled = false;
    referenceMode.disabled = false;
    handOption.disabled = true;
    handOption.textContent = "手功能专用";
    if (methodSelect.value === "hand") methodSelect.value = appraisalType.value === "injury" ? "table" : "direction";
    tableOption.disabled = Boolean(joint.directionOnly);
    directionOption.disabled = !joint.directionOnly && appraisalType.value === "injury";
    healthyOption.disabled = Boolean(joint.directionOnly);
    if (joint.directionOnly) {
      methodSelect.value = "direction";
      if (referenceMode.value === "healthy") referenceMode.value = "standardUpper";
      sideSelect.value = "不分侧";
      sideSelect.disabled = true;
    } else {
      if (appraisalType.value === "injury") methodSelect.value = "table";
      if (sideSelect.value === "不分侧") sideSelect.value = "左侧";
      sideSelect.disabled = false;
    }
    const isTable = methodSelect.value === "table";
    const upperOption = referenceMode.querySelector('option[value="standardUpper"]');
    const lowerOption = referenceMode.querySelector('option[value="standardLower"]');
    upperOption.textContent = isTable ? "正常参考基线（M5，0%）" : "正常参考值（区间上限）";
    lowerOption.textContent = "正常参考值（区间下限）";
    lowerOption.disabled = isTable;
    if (isTable && referenceMode.value === "standardLower") referenceMode.value = "standardUpper";
    const showReference = referenceMode.value === "healthy";
    const affectedHeading = joint.directionOnly ? "实测活动度" : "伤侧活动度";
    const referenceHeading = joint.directionOnly ? "参考活动度" : "健侧活动度";
    document.getElementById("affectedLegendText").textContent = joint.directionOnly ? "实测输入" : "伤侧输入";
    document.getElementById("referenceLegendText").textContent = joint.directionOnly ? "正常参考" : "健侧/对照输入";
    document.getElementById("measurementHelp").textContent = joint.directionOnly
      ? "单位：度（°）。输入六个方向的实测活动度；不能达到中立位时填负数。"
      : "单位：度（°）。采用中立位0°法，不能达到中立位时填负数；查表法录入被动活动度和对应肌力。";
    document.getElementById("jointNote").textContent = joint.note;
    table.innerHTML = `<div class="measurement-row header"><div>运动方向</div><div>${affectedHeading}</div><div>${isTable ? "伤侧肌力" : "方法"}</div><div>${referenceHeading}</div><div>${isTable ? "健侧肌力" : "对照"}</div><div>${isTable ? "人工覆盖" : "参考区间"}</div></div>` + joint.motions.map(m => {
      const refDegree = showReference ? m.upper : (referenceMode.value === "standardLower" ? m.lower : m.upper);
      const force = isTable ? `<label class="force-box"><input type="checkbox" name="affected.${m.id}.forced100">伤侧按100%</label>${showReference ? `<label class="force-box"><input type="checkbox" name="reference.${m.id}.forced100">健侧按100%</label>` : ""}` : "—";
      return `<div class="measurement-row">
        <div class="motion-name">${escapeHtml(m.label)}${m.hint ? `<small>${escapeHtml(m.hint)}</small>` : ""}</div>
        <div><input required min="-180" max="220" step="0.1" type="number" inputmode="decimal" name="affected.${m.id}.degree" aria-label="${joint.directionOnly ? "实测" : "伤侧"}${escapeHtml(m.label)}"></div>
        <div>${isTable ? muscleSelect(`affected.${m.id}.muscle`) : "方向比值"}</div>
        <div><input required min="-180" max="220" step="0.1" type="number" inputmode="decimal" name="reference.${m.id}.degree" value="${refDegree}" ${showReference ? "" : "readonly"} aria-label="对照${escapeHtml(m.label)}"></div>
        <div>${isTable ? (showReference ? muscleSelect(`reference.${m.id}.muscle`) : "M5（正常）") : escapeHtml(referenceMode.options[referenceMode.selectedIndex].text)}</div>
        <div>${isTable ? force : `${m.lower}°～${m.upper}°`}</div>
      </div>`;
    }).join("") + (joint.directionOnly ? "" : `<div class="ankylosis-card">
      <label>关节状态<select name="jointStatus"><option value="limited">活动度受限 / 常规计算</option><option value="functionalAnkylosis">功能位强直固定</option><option value="nonfunctionalAnkylosis">非功能位强直固定</option></select></label>
      <div class="ankylosis-fields" hidden>
        <label>固定方向<select name="fixationMotion">${joint.motions.map(m => `<option value="${m.id}">${escapeHtml(m.label)}</option>`).join("")}</select></label>
        <label>固定角度（°）<input type="number" min="-180" max="220" step="0.1" inputmode="decimal" name="fixationDegree" placeholder="例：30"></label>
        <label class="check-field"><input type="checkbox" name="ankylosisEvidenceConfirmed">已结合被动活动、重复测量及结构资料确认强直固定</label>
        ${appraisalType.value === "injury" ? `<label class="check-field"><input type="checkbox" name="injuryDeformityConfirmed">已确认属于《人体损伤程度鉴定标准》所称“强直畸形”</label>` : ""}
        <p class="ankylosis-sentence" data-ankylosis-sentence>请选择状态并填写固定角度。</p>
      </div>
      <small>角度用于描述固定位置；功能位性质由鉴定人依据功能影响和多源证据确认，系统不按单一角度推定。</small>
    </div>`);
    methodGuidance();
    syncAnkylosisFields();
  }

  function muscleSelect(name) {
    return `<select name="${name}">${Object.entries(MUSCLE_LABELS).map(([v,l]) => `<option value="${v}" ${v === "5" ? "selected" : ""}>${l}</option>`).join("")}</select>`;
  }

  function readInput() {
    const joint = JOINTS[jointSelect.value];
    if (joint.kind === "hand") {
      const readRom = sideId => Object.fromEntries(HAND_DIGITS.map(digit => [digit.id,Object.fromEntries(digit.joints.map(joint => [joint.id,{
        actual:Number(valueOf(`hand.${sideId}.rom.${digit.id}.${joint.id}.actual`)),
        reference:Number(valueOf(`hand.${sideId}.rom.${digit.id}.${joint.id}.reference`)),
        status:valueOf(`hand.${sideId}.rom.${digit.id}.${joint.id}.status`) || "limited",
        fixedDegree:valueOf(`hand.${sideId}.rom.${digit.id}.${joint.id}.fixedDegree`)
      }]))]));
      const readSide = sideId => appraisalType.value === "injury" ? ({
        rom:readRom(sideId), palmarSensoryLoss:Number(valueOf(`hand.${sideId}.palmarSensoryLoss`)||0),
        segments:Object.fromEntries(INJURY_HAND_SEGMENTS.map(segment=>[segment.id,{
          state:valueOf(`hand.${sideId}.segment.${segment.id}.state`) || "normal",
          missingLength:Number(valueOf(`hand.${sideId}.segment.${segment.id}.missingLength`)),
          referenceLength:Number(valueOf(`hand.${sideId}.segment.${segment.id}.referenceLength`))
        }]))
      }) : ({
        rom:readRom(sideId), missingScore: Number(valueOf(`hand.${sideId}.missingScore`) || 0),
        groups: Object.fromEntries(HAND_GROUPS.map(group => [group.id, {
          patternId: valueOf(`hand.${sideId}.${group.id}.pattern`),
          severity: valueOf(`hand.${sideId}.${group.id}.severity`)
        }]))
      });
      return { left: readSide("left"), right: readSide("right"), direct:{
        bothHandsCompleteLoss:Boolean(form.elements["hand.direct.bothHandsCompleteLoss"]?.checked),
        thumbContracture:Boolean(form.elements["hand.direct.thumbContracture"]?.checked),
        threeFingerContracture:Boolean(form.elements["hand.direct.threeFingerContracture"]?.checked)
      }};
    }
    const input = { referenceMode: referenceMode.value, affected: {}, reference: {} };
    joint.motions.forEach(m => {
      input.affected[m.id] = {
        degree: Number(valueOf(`affected.${m.id}.degree`)),
        muscle: Number(valueOf(`affected.${m.id}.muscle`) || 5),
        forced100: Boolean(form.elements[`affected.${m.id}.forced100`]?.checked)
      };
      input.reference[m.id] = {
        degree: Number(valueOf(`reference.${m.id}.degree`)),
        muscle: Number(valueOf(`reference.${m.id}.muscle`) || 5),
        forced100: Boolean(form.elements[`reference.${m.id}.forced100`]?.checked)
      };
    });
    input.jointStatus = valueOf("jointStatus") || "limited";
    const fixationMotion = valueOf("fixationMotion");
    const motion = joint.motions.find(item => item.id === fixationMotion);
    input.fixation = {
      motionId: fixationMotion,
      motionLabel: motion?.label || "",
      degree: valueOf("fixationDegree"),
      evidenceConfirmed: Boolean(form.elements.ankylosisEvidenceConfirmed?.checked),
      injuryDeformityConfirmed: Boolean(form.elements.injuryDeformityConfirmed?.checked)
    };
    return input;
  }

  function validateInput(input) {
    const joint = JOINTS[jointSelect.value];
    if (joint.kind === "hand") {
      for (const [label, side] of [["左手",input.left],["右手",input.right]]) {
        for (const digit of HAND_DIGITS) for (const handJoint of digit.joints) {
          const item=side.rom[digit.id][handJoint.id];
          if (!Number.isFinite(item.actual) || item.actual < 0 || item.actual > 180 || !Number.isFinite(item.reference) || item.reference <= 0 || item.reference > 180) throw new Error(`${label}${digit.label}${handJoint.label}应填写0～180°的实测活动弧和大于0的参考值`);
          if (item.status !== "limited") {
            if (item.actual > 5) throw new Error(`${label}${digit.label}${handJoint.label}已选择强直，但活动弧大于5°；请核对状态或测量值`);
            const fixed = item.fixedDegree === "" ? NaN : Number(item.fixedDegree);
            if (!Number.isFinite(fixed) || fixed < -180 || fixed > 180) throw new Error(`${label}${digit.label}${handJoint.label}选择强直时须填写-180～180°的固定角度`);
          }
        }
        if (appraisalType.value === "injury") {
          if (!Number.isFinite(side.palmarSensoryLoss) || side.palmarSensoryLoss < 0 || side.palmarSensoryLoss > 100) throw new Error(`${label}掌侧感觉丧失比例应为0～100%`);
        } else {
          if (!Number.isFinite(side.missingScore) || side.missingScore < 0 || side.missingScore > 100) throw new Error(`${label}缺失分值应填写0～100之间的有效分值`);
          for (const group of HAND_GROUPS) {
            const selected=side.groups[group.id];
            if (Boolean(selected.patternId)!==Boolean(selected.severity)) throw new Error(`${label}${group.label}的受累组合与障碍程度应同时选择`);
          }
        }
      }
      return;
    }
    for (const m of joint.motions) {
      const values = [input.affected[m.id].degree, input.reference[m.id].degree];
      if (values.some(v => !Number.isFinite(v) || v < -180 || v > 220)) throw new Error(`${m.label}应填写-180～220之间的有效角度`);
    }
    if (joint.axisMode) {
      if (input.affected.flexion.degree + input.affected.extension.degree < 0) throw new Error("伤侧屈伸活动弧不能为负数");
      if (input.reference.flexion.degree + input.reference.extension.degree < 0) throw new Error("对照侧屈伸活动弧不能为负数");
    }
    if (input.jointStatus !== "limited") {
      const degree = input.fixation.degree === "" ? NaN : Number(input.fixation.degree);
      if (!input.fixation.motionId || !Number.isFinite(degree) || degree < -180 || degree > 220) throw new Error("选择强直固定时，须填写固定方向和-180～220°的固定角度");
    }
  }

  function buildSnapshot(result, input) {
    const jointId = jointSelect.value;
    const isHand = JOINTS[jointId].kind === "hand";
    const jointStatusLabels = { limited:"活动度受限/常规计算", functionalAnkylosis:"功能位强直", nonfunctionalAnkylosis:"非功能位强直" };
    const meta = {
      caseNumber: valueOf("caseNumber") || "未填写", subjectName: valueOf("subjectName") || "未填写",
      examDate: valueOf("examDate") || "未填写", examiner: valueOf("examiner") || "未填写",
      appraisalType: appraisalType.value, appraisalLabel: appraisalType.options[appraisalType.selectedIndex].text,
      side: valueOf("side"), jointId, jointName: JOINTS[jointId].name,
      method: methodSelect.value, methodLabel: methodSelect.options[methodSelect.selectedIndex].text,
      referenceMode: isHand ? (appraisalType.value === "injury" ? "injuryC7" : "disabilityC8") : referenceMode.value, referenceLabel: isHand ? (appraisalType.value === "injury" ? "附录C.7固定权重" : "附录C.8评分") : referenceMode.options[referenceMode.selectedIndex].text,
      jointStatus: isHand ? "" : input.jointStatus, jointStatusLabel: isHand ? "" : jointStatusLabels[input.jointStatus],
      evidence: "", notes: ""
    };
    return {
      id: `${Date.now()}-${Math.random().toString(16).slice(2,8)}`,
      createdAt: new Date().toISOString(), ruleVersion: "1.7.0", meta, input, result,
      threshold: result.method === "handInjury" ? Calc.injuryHandThreshold(result.result,input.direct) : Calc.contextualThreshold(jointId, meta.appraisalType, result.result, input.jointStatus, input.fixation)
    };
  }

  function handCalculationRows(snapshot) {
    return [["左手",snapshot.result.left],["右手",snapshot.result.right]].flatMap(([sideLabel,side]) => {
      const rows = [`<tr><td>${sideLabel}</td><td>手部分缺失</td><td>按图C-1人工累计</td><td>—</td><td>${formatPoints(side.missingScore)}</td></tr>`];
      side.rows.filter(row => row.patternId).forEach(row => rows.push(`<tr><td>${sideLabel}</td><td>${escapeHtml(row.groupLabel)}</td><td>${escapeHtml(row.patternLabel)}</td><td>${escapeHtml(HAND_SEVERITIES[row.severity] || "未选择")}</td><td>${formatPoints(row.score)}</td></tr>`));
      rows.push(`<tr class="subtotal-row"><td>${sideLabel}</td><td colspan="3">单手合计（缺失分值+功能障碍分值，封顶100分）</td><td>${formatPoints(side.subtotal)}</td></tr>`);
      return rows;
    }).join("");
  }

  function handRomCalculationRows(snapshot) {
    return [["左手",snapshot.result.left],["右手",snapshot.result.right]].flatMap(([sideLabel,side]) => side.romRows.map(row => `<tr><td>${sideLabel}</td><td>${row.digitLabel} ${row.jointLabel}</td><td>${row.actual}°</td><td>${row.reference}°</td><td>${(row.ratio*100).toFixed(2)}%</td><td>${escapeHtml(row.label)}</td></tr>`)).join("");
  }

  function injuryHandCalculationRows(snapshot) {
    return [["左手",snapshot.result.left],["右手",snapshot.result.right]].flatMap(([sideLabel,side]) => {
      const rows=side.rows.filter(row=>row.state!=="normal").map(row=>`<tr><td>${sideLabel}</td><td>${row.label}</td><td>${row.weight}%</td><td>${row.state === "missing" ? "完整缺失" : row.state === "completeLoss" ? "功能完全丧失" : "部分实体缺失"}</td><td>${escapeHtml(row.formula)}</td><td>${formatPct(row.score)}</td></tr>`);
      if(side.palmarSensoryLoss>0) rows.push(`<tr><td>${sideLabel}</td><td>掌侧感觉丧失</td><td>手功能权重的50%</td><td>${side.palmarSensoryLoss}%</td><td>${side.palmarSensoryLoss}%×50%</td><td>${formatPct(side.sensoryScore)}</td></tr>`);
      rows.push(`<tr class="subtotal-row"><td>${sideLabel}</td><td colspan="4">小计</td><td>${formatPct(side.subtotal)}</td></tr>`); return rows;
    }).join("");
  }

  function calculationRows(snapshot) {
    const { result, meta } = snapshot;
    if (result.method === "direction") return result.rows.map(row => `<tr><td>${escapeHtml(row.label)}</td><td>${row.affected}°</td><td>${row.reference}°</td><td>${formatPct(row.loss)}</td><td>—</td></tr>`).join("");
    const refById = Object.fromEntries(result.referenceRows.map(r => [r.motion.id, r]));
    return result.affectedRows.map(row => {
      const ref = refById[row.motion.id];
      const muscle = snapshot.input.affected[row.motion.id].muscle;
      const refMuscle = meta.referenceMode === "healthy" ? snapshot.input.reference[row.motion.id].muscle : 5;
      const refText = meta.referenceMode === "healthy"
        ? `${ref.converted}° / ${MUSCLE_LABELS[refMuscle]} / ${escapeHtml(ref.band)} → ${formatPct(ref.loss)}`
        : `正常参考 / M5 / ${escapeHtml(ref.band)} → 0.00%`;
      return `<tr><td>${escapeHtml(row.motion.label)}</td><td>${snapshot.input.affected[row.motion.id].degree}°${row.converted !== snapshot.input.affected[row.motion.id].degree ? `（换算${row.converted}°）` : ""}</td><td>${MUSCLE_LABELS[muscle]}</td><td>${escapeHtml(row.band)} → ${formatPct(row.loss)}</td><td>${refText}</td></tr>`;
    }).join("");
  }

  function renderRecord(snapshot) {
    const { meta, result, threshold } = snapshot;
    const isHand = result.method === "handDisability" || result.method === "handInjury";
    const isInjuryHand = result.method === "handInjury";
    const basis = isInjuryHand
      ? "《人体损伤程度鉴定标准》附录C.7；SF/T 0111—2021 7.11.7.2及表A.3"
      : result.method === "handDisability" ? "《人体损伤致残程度分级》附录C.8、图C-1及表C-10；SF/T 0111—2021 7.11.7.2及表A.3"
      : JOINTS[meta.jointId].directionOnly
      ? "SF/T 0111—2021 附录A.6；方向均分法"
      : meta.appraisalType === "injury"
        ? "《人体损伤程度鉴定标准》附录C.6；SF/T 0096—2021 第7章及附录B"
        : "《人体损伤致残程度分级》附录C.7；SF/T 0096—2021 第7章及附录B";
    const resultLabel = result.method === "handDisability" ? "手功能丧失分值" : "功能丧失百分比";
    const resultText = result.method === "handDisability" ? formatPoints(result.result) : formatPct(result.result);
    const detailTable = result.method === "handDisability"
      ? `<h4>活动度分档</h4><table class="calc-table"><thead><tr><th>侧别</th><th>关节</th><th>实测活动弧</th><th>参考活动弧</th><th>比例</th><th>自动分档</th></tr></thead><tbody>${handRomCalculationRows(snapshot)}</tbody></table><h4>表C-10确认计分</h4><table class="calc-table"><thead><tr><th>侧别</th><th>部位</th><th>受累范围/缺失</th><th>障碍程度</th><th>分值</th></tr></thead><tbody>${handCalculationRows(snapshot)}</tbody></table>`
      : isInjuryHand ? `<h4>活动度检验记录（不直接折算C.7权重）</h4><table class="calc-table"><thead><tr><th>侧别</th><th>关节</th><th>实测活动弧</th><th>参考活动弧</th><th>比例</th><th>观察</th></tr></thead><tbody>${handRomCalculationRows(snapshot)}</tbody></table><h4>附录C.7计权</h4><table class="calc-table"><thead><tr><th>侧别</th><th>部位</th><th>固定权重</th><th>状态</th><th>公式</th><th>计入值</th></tr></thead><tbody>${injuryHandCalculationRows(snapshot)}</tbody></table>`
      : `<table class="calc-table"><thead><tr><th>方向</th><th>${JOINTS[meta.jointId].directionOnly ? "实测活动度" : "伤侧活动度"}</th><th>${result.method === "table" ? "伤侧肌力" : "对照值"}</th><th>${result.method === "table" ? "伤侧查表" : "方向丧失率"}</th><th>${result.method === "table" ? "对照侧" : "备注"}</th></tr></thead><tbody>${calculationRows(snapshot)}</tbody></table>`;
    const summary = result.method === "handDisability"
      ? `左手 ${formatPoints(result.left.subtotal)}；右手 ${formatPoints(result.right.subtotal)}<br>${escapeHtml(result.formula)}`
      : isInjuryHand ? `${escapeHtml(result.formula)}<br><small>活动度比例仅作检验记录，未线性折算为指节权重。</small>`
      : `${escapeHtml(result.formula)}<br>${result.method === "table" ? `伤侧 ${formatPct(result.affectedTotal)} − 对照侧 ${formatPct(result.referenceTotal)} = ` : "计算结果 = "}<strong>${formatPct(result.result)}</strong>`;
    record.hidden = false;
    const ankylosisText = !isHand && meta.jointStatus !== "limited"
      ? Calc.describeAnkylosis(meta.jointName, meta.side, meta.jointStatus, snapshot.input.fixation, meta.appraisalType)
      : "";
    record.innerHTML = `<div class="record-actions no-print"><button class="button ghost" data-action="copy">复制计算意见</button><button class="button ghost" data-action="download">导出JSON记录</button><button class="button secondary" data-action="save">保存至本机</button><button class="button primary" data-action="print">打印 / 另存PDF</button></div>
      <div class="record-header"><div><h2>关节功能丧失计算记录</h2></div><div class="record-number">记录ID<br>${escapeHtml(snapshot.id)}</div></div>
      <div class="record-meta">
        ${metaCell("案件编号",meta.caseNumber)}${metaCell("被鉴定人",meta.subjectName)}${metaCell("检验日期",meta.examDate)}${metaCell("记录人",meta.examiner)}
        ${metaCell("鉴定目的",meta.appraisalLabel)}${metaCell("部位",isHand ? "双手分别记录" : (meta.side === "不分侧" ? meta.jointName : `${meta.side} ${meta.jointName}`))}${metaCell("计算方法",isInjuryHand ? "损伤程度手功能计权" : meta.methodLabel)}${metaCell(isHand ? "规则" : "对照依据",isInjuryHand ? "附录C.7" : meta.referenceLabel)}
        ${isHand ? "" : metaCell("关节状态",meta.jointStatusLabel)}
      </div>
      <div class="result-banner"><div><small>${resultLabel}</small><div class="result-value">${resultText}</div></div><div><strong>${escapeHtml(threshold.level)}</strong><p>${escapeHtml(threshold.text)}</p><small>仅为数值或直接条款提示，不自动形成损伤程度或致残等级结论。</small></div></div>
      <p class="record-basis">依据：${escapeHtml(basis)}</p>
      ${ankylosisText ? `<h3>强直固定描述</h3><div class="finding-box">${escapeHtml(ankylosisText)}</div>` : ""}
      <h3>计算明细</h3>${detailTable}
      <h3>汇总</h3><div class="formula-box">${summary}</div>
      <h3>辅助意见</h3><p>${escapeHtml(opinionText(snapshot))}</p>
      <div class="record-disclaimer">本记录仅供辅助计算，正式结论由鉴定人综合判断。</div>`;
    document.getElementById("liveSummary").innerHTML = `<span class="eyebrow">CALCULATED</span><h3>${resultText}</h3><p>${isHand ? "双手" : escapeHtml(meta.side)} ${escapeHtml(meta.jointName)} · ${isInjuryHand ? "附录C.7" : escapeHtml(meta.methodLabel)}<br>${escapeHtml(threshold.level)}</p>`;
    record.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function metaCell(label, value) { return `<div><small>${label}</small><strong>${escapeHtml(value)}</strong></div>`; }
  function opinionText(s) {
    if (s.result.method === "handDisability") return `按附录C.8确认计分后，手功能丧失最终加权分值为${formatPoints(s.result.result)}（左手${formatPoints(s.result.left.subtotal)}，右手${formatPoints(s.result.right.subtotal)}）。${s.threshold.text}`;
    if (s.result.method === "handInjury") return `按附录C.7计权，双手累计手功能丧失值为${formatPct(s.result.result)}（左手${formatPct(s.result.left.subtotal)}，右手${formatPct(s.result.right.subtotal)}）。实测活动度未直接线性折算权重。${s.threshold.text}`;
    const part = s.meta.side === "不分侧" ? s.meta.jointName : `${s.meta.side}${s.meta.jointName}`;
    const fixationText = s.meta.jointStatus !== "limited" ? `${Calc.describeAnkylosis(s.meta.jointName, s.meta.side, s.meta.jointStatus, s.input.fixation, s.meta.appraisalType)} ` : "";
    return `${fixationText}${part}功能丧失值为${formatPct(s.result.result)}。${s.threshold.text}`;
  }

  function saveHistory(snapshot) {
    const items = JSON.parse(localStorage.getItem("jointLossRecords") || "[]");
    const next = [snapshot, ...items.filter(i => i.id !== snapshot.id)].slice(0, 20);
    localStorage.setItem("jointLossRecords", JSON.stringify(next));
    renderHistory(); toast("记录已保存至本机");
  }

  function renderHistory() {
    const items = JSON.parse(localStorage.getItem("jointLossRecords") || "[]");
    historyList.innerHTML = items.length ? items.slice(0, 8).map(i => `<button class="history-item" data-id="${i.id}"><strong>${escapeHtml(i.meta.caseNumber)} · ${escapeHtml(i.meta.jointName)} ${i.result.method === "hand" || i.result.method === "handDisability" ? formatPoints(i.result.result) : formatPct(i.result.result)}</strong><span>${new Date(i.createdAt).toLocaleString("zh-CN")}</span></button>`).join("") : '<p class="muted">尚无已保存记录</p>';
  }

  function downloadSnapshot(snapshot) {
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], {type:"application/json;charset=utf-8"});
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = `${snapshot.meta.caseNumber.replace(/[\\/:*?"<>|]/g,"_")}_${snapshot.meta.jointName}_辅助计算记录.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function copyOpinion() {
    const text = opinionText(currentRecord);
    try { await navigator.clipboard.writeText(text); } catch { const ta=document.createElement("textarea");ta.value=text;document.body.append(ta);ta.select();document.execCommand("copy");ta.remove(); }
    toast("计算意见已复制");
  }
  function toast(message) { const el=document.getElementById("toast");el.textContent=message;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),1800); }

  function syncAnkylosisFields() {
    const status = valueOf("jointStatus");
    const fields = table.querySelector(".ankylosis-fields");
    if (!fields) return;
    fields.hidden = !status || status === "limited";
    if (fields.hidden) return;
    const joint = JOINTS[jointSelect.value];
    const motionId = valueOf("fixationMotion");
    const motion = joint.motions.find(item => item.id === motionId);
    const fixation = {
      motionLabel: motion?.label || "",
      degree: valueOf("fixationDegree"),
      evidenceConfirmed: Boolean(form.elements.ankylosisEvidenceConfirmed?.checked),
      injuryDeformityConfirmed: Boolean(form.elements.injuryDeformityConfirmed?.checked)
    };
    const output = fields.querySelector("[data-ankylosis-sentence]");
    output.textContent = Calc.describeAnkylosis(joint.name, valueOf("side"), status, fixation, appraisalType.value);
    output.dataset.confirmed = fixation.evidenceConfirmed ? "true" : "false";
  }

  function syncHandBands() {
    if (JOINTS[jointSelect.value].kind !== "hand") return;
    document.querySelectorAll("[data-band-for]").forEach(output => {
      const base=output.dataset.bandFor;
      const actual=Number(valueOf(`${base}.actual`)), reference=Number(valueOf(`${base}.reference`));
      const status=valueOf(`${base}.status`) || "limited";
      const fixedDegree=valueOf(`${base}.fixedDegree`);
      try {
        const band=Calc.classifyHandRom(actual,reference,status,fixedDegree);
        output.textContent=appraisalType.value === "injury" ? `${(band.ratio*100).toFixed(1)}% · 检验记录（不计C.7权重）` : `${(band.ratio*100).toFixed(1)}% · ${band.label}`;
        output.dataset.severity=band.severity;
      } catch { output.textContent="请填写有效参考值"; }
    });
  }

  [jointSelect, methodSelect, referenceMode, appraisalType].forEach(el => el.addEventListener("change", renderMeasurements));
  table.addEventListener("input",() => { syncHandBands(); syncAnkylosisFields(); });
  table.addEventListener("change",() => { syncHandBands(); syncAnkylosisFields(); });
  form.addEventListener("submit", event => {
    event.preventDefault();
    try {
      if (!form.reportValidity()) return;
      const input = readInput(); validateInput(input);
      const result = methodSelect.value === "hand"
        ? appraisalType.value === "injury" ? Calc.calculateInjuryHand(input,INJURY_HAND_SEGMENTS,HAND_DIGITS) : Calc.calculateHand(input, HAND_GROUPS,HAND_DIGITS)
        : methodSelect.value === "table"
          ? Calc.calculateTable(JOINTS[jointSelect.value], input)
          : Calc.calculateDirection(JOINTS[jointSelect.value], input);
      currentRecord = buildSnapshot(result, input); renderRecord(currentRecord);
    } catch (error) { toast(error.message); }
  });
  form.addEventListener("reset", () => setTimeout(() => { form.elements.examDate.value=today(); record.hidden=true; currentRecord=null; renderMeasurements(); }, 0));
  record.addEventListener("click", event => {
    const action = event.target.dataset.action; if (!action || !currentRecord) return;
    if (action === "copy") copyOpinion();
    if (action === "download") downloadSnapshot(currentRecord);
    if (action === "save") saveHistory(currentRecord);
    if (action === "print") window.print();
  });
  historyList.addEventListener("click", event => {
    const button = event.target.closest("[data-id]"); if (!button) return;
    const item = JSON.parse(localStorage.getItem("jointLossRecords") || "[]").find(i => i.id === button.dataset.id);
    if (item) { currentRecord=item; renderRecord(item); }
  });

  window.addEventListener("beforeinstallprompt", event => { event.preventDefault(); deferredPrompt=event; document.getElementById("installButton").hidden=false; });
  document.getElementById("installButton").addEventListener("click", async () => { if(deferredPrompt){deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;} });
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("./sw.js").catch(() => {});
  renderMeasurements(); renderHistory();
})();

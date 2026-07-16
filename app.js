(function () {
  "use strict";
  const { JOINTS, HAND_GROUPS, HAND_SEVERITIES, MUSCLE_LABELS } = window.JointData;
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
      methodNotice.innerHTML = "按附录C.8计分：缺失分值与功能障碍分值累计；同一部位避免重复计分，双手采用加权公式。";
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
    return Object.entries(HAND_SEVERITIES).map(([value,label]) => `<option value="${value}">${escapeHtml(label)}</option>`).join("");
  }

  function handPanel(sideId, sideLabel) {
    return `<section class="hand-panel"><h3>${sideLabel}</h3>
      <label class="missing-score">手部分缺失分值（按图C-1人工累计）<input type="number" min="0" max="100" step="1" inputmode="numeric" name="hand.${sideId}.missingScore" value="0"></label>
      <div class="hand-row hand-header"><div>部位</div><div>受累范围</div><div>障碍程度</div></div>
      ${HAND_GROUPS.map(group => `<div class="hand-row"><div><strong>${group.label}</strong></div><div><select name="hand.${sideId}.${group.id}.pattern">${handPatternOptions(group)}</select></div><div><select name="hand.${sideId}.${group.id}.severity">${handSeverityOptions()}</select></div></div>`).join("")}
    </section>`;
  }

  function renderHandMeasurements() {
    table.innerHTML = `<div class="hand-grid">${handPanel("left","左手")}${handPanel("right","右手")}</div>`;
    document.getElementById("affectedLegendText").textContent = "单手满分100分";
    document.getElementById("referenceLegendText").textContent = "双手满分200分";
    document.getElementById("measurementHelp").textContent = "单手分值=min(缺失分值+关节功能障碍分值,100)；双手最终分值=A+B×(200−A)/200。图C-1缺失分值由鉴定人按缺失平面人工累计。";
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
      methodSelect.value = "hand";
      appraisalType.value = "disability";
      injuryOption.disabled = true;
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
    }).join("") + `<label class="joint-status">关节状态<select name="jointStatus"><option value="limited">活动度受限/常规计算</option><option value="functionalAnkylosis">功能位强直</option><option value="nonfunctionalAnkylosis">非功能位强直（直接条款提示）</option></select></label>`;
    methodGuidance();
  }

  function muscleSelect(name) {
    return `<select name="${name}">${Object.entries(MUSCLE_LABELS).map(([v,l]) => `<option value="${v}" ${v === "5" ? "selected" : ""}>${l}</option>`).join("")}</select>`;
  }

  function readInput() {
    const joint = JOINTS[jointSelect.value];
    if (joint.kind === "hand") {
      const readSide = sideId => ({
        missingScore: Number(valueOf(`hand.${sideId}.missingScore`) || 0),
        groups: Object.fromEntries(HAND_GROUPS.map(group => [group.id, {
          patternId: valueOf(`hand.${sideId}.${group.id}.pattern`),
          severity: valueOf(`hand.${sideId}.${group.id}.severity`)
        }]))
      });
      return { left: readSide("left"), right: readSide("right") };
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
    return input;
  }

  function validateInput(input) {
    const joint = JOINTS[jointSelect.value];
    if (joint.kind === "hand") {
      for (const [label, side] of [["左手",input.left],["右手",input.right]]) {
        if (!Number.isFinite(side.missingScore) || side.missingScore < 0 || side.missingScore > 100) throw new Error(`${label}缺失分值应填写0～100之间的有效分值`);
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
      referenceMode: isHand ? "handScore" : referenceMode.value, referenceLabel: isHand ? "附录C.8评分" : referenceMode.options[referenceMode.selectedIndex].text,
      jointStatus: isHand ? "" : input.jointStatus, jointStatusLabel: isHand ? "" : jointStatusLabels[input.jointStatus],
      evidence: "", notes: ""
    };
    return {
      id: `${Date.now()}-${Math.random().toString(16).slice(2,8)}`,
      createdAt: new Date().toISOString(), ruleVersion: "1.4.0", meta, input, result,
      threshold: Calc.contextualThreshold(jointId, meta.appraisalType, result.result, input.jointStatus)
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
    const isHand = result.method === "hand";
    const basis = isHand
      ? "《人体损伤致残程度分级》附录C.8、图C-1及表C-10"
      : JOINTS[meta.jointId].directionOnly
      ? "SF/T 0111—2021 附录A.6；方向均分法"
      : meta.appraisalType === "injury"
        ? "《人体损伤程度鉴定标准》附录C.6；SF/T 0096—2021 第7章及附录B"
        : "《人体损伤致残程度分级》附录C.7；SF/T 0096—2021 第7章及附录B";
    const resultLabel = isHand ? "手功能丧失分值" : "功能丧失百分比";
    const resultText = isHand ? formatPoints(result.result) : formatPct(result.result);
    const detailTable = isHand
      ? `<table class="calc-table"><thead><tr><th>侧别</th><th>部位</th><th>受累范围/缺失</th><th>障碍程度</th><th>分值</th></tr></thead><tbody>${handCalculationRows(snapshot)}</tbody></table>`
      : `<table class="calc-table"><thead><tr><th>方向</th><th>${JOINTS[meta.jointId].directionOnly ? "实测活动度" : "伤侧活动度"}</th><th>${result.method === "table" ? "伤侧肌力" : "对照值"}</th><th>${result.method === "table" ? "伤侧查表" : "方向丧失率"}</th><th>${result.method === "table" ? "对照侧" : "备注"}</th></tr></thead><tbody>${calculationRows(snapshot)}</tbody></table>`;
    const summary = isHand
      ? `左手 ${formatPoints(result.left.subtotal)}；右手 ${formatPoints(result.right.subtotal)}<br>${escapeHtml(result.formula)}`
      : `${escapeHtml(result.formula)}<br>${result.method === "table" ? `伤侧 ${formatPct(result.affectedTotal)} − 对照侧 ${formatPct(result.referenceTotal)} = ` : "计算结果 = "}<strong>${formatPct(result.result)}</strong>`;
    record.hidden = false;
    record.innerHTML = `<div class="record-actions no-print"><button class="button ghost" data-action="copy">复制计算意见</button><button class="button ghost" data-action="download">导出JSON记录</button><button class="button secondary" data-action="save">保存至本机</button><button class="button primary" data-action="print">打印 / 另存PDF</button></div>
      <div class="record-header"><div><h2>关节功能丧失计算记录</h2></div><div class="record-number">记录ID<br>${escapeHtml(snapshot.id)}</div></div>
      <div class="record-meta">
        ${metaCell("案件编号",meta.caseNumber)}${metaCell("被鉴定人",meta.subjectName)}${metaCell("检验日期",meta.examDate)}${metaCell("记录人",meta.examiner)}
        ${metaCell("鉴定目的",meta.appraisalLabel)}${metaCell("部位",isHand ? "双手（单侧无损伤填0分）" : (meta.side === "不分侧" ? meta.jointName : `${meta.side} ${meta.jointName}`))}${metaCell("计算方法",meta.methodLabel)}${metaCell(isHand ? "评分依据" : "对照依据",meta.referenceLabel)}
        ${isHand ? "" : metaCell("关节状态",meta.jointStatusLabel)}
      </div>
      <div class="result-banner"><div><small>${resultLabel}</small><div class="result-value">${resultText}</div></div><div><strong>${escapeHtml(threshold.level)}</strong><p>${escapeHtml(threshold.text)}</p><small>仅为数值或直接条款提示，不自动形成损伤程度或致残等级结论。</small></div></div>
      <p class="record-basis">依据：${escapeHtml(basis)}</p>
      <h3>计算明细</h3>${detailTable}
      <h3>汇总</h3><div class="formula-box">${summary}</div>
      <h3>辅助意见</h3><p>${escapeHtml(opinionText(snapshot))}</p>
      <div class="record-disclaimer">本记录仅供辅助计算，正式结论由鉴定人综合判断。</div>`;
    document.getElementById("liveSummary").innerHTML = `<span class="eyebrow">CALCULATED</span><h3>${resultText}</h3><p>${isHand ? "双手" : escapeHtml(meta.side)} ${escapeHtml(meta.jointName)} · ${escapeHtml(meta.methodLabel)}<br>${escapeHtml(threshold.level)}</p>`;
    record.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function metaCell(label, value) { return `<div><small>${label}</small><strong>${escapeHtml(value)}</strong></div>`; }
  function opinionText(s) {
    if (s.result.method === "hand") return `手功能丧失最终加权分值为${formatPoints(s.result.result)}（左手${formatPoints(s.result.left.subtotal)}，右手${formatPoints(s.result.right.subtotal)}）。${s.threshold.text}`;
    const part = s.meta.side === "不分侧" ? s.meta.jointName : `${s.meta.side}${s.meta.jointName}`;
    return `${part}功能丧失值为${formatPct(s.result.result)}。${s.threshold.text}`;
  }

  function saveHistory(snapshot) {
    const items = JSON.parse(localStorage.getItem("jointLossRecords") || "[]");
    const next = [snapshot, ...items.filter(i => i.id !== snapshot.id)].slice(0, 20);
    localStorage.setItem("jointLossRecords", JSON.stringify(next));
    renderHistory(); toast("记录已保存至本机");
  }

  function renderHistory() {
    const items = JSON.parse(localStorage.getItem("jointLossRecords") || "[]");
    historyList.innerHTML = items.length ? items.slice(0, 8).map(i => `<button class="history-item" data-id="${i.id}"><strong>${escapeHtml(i.meta.caseNumber)} · ${escapeHtml(i.meta.jointName)} ${i.result.method === "hand" ? formatPoints(i.result.result) : formatPct(i.result.result)}</strong><span>${new Date(i.createdAt).toLocaleString("zh-CN")}</span></button>`).join("") : '<p class="muted">尚无已保存记录</p>';
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

  [jointSelect, methodSelect, referenceMode, appraisalType].forEach(el => el.addEventListener("change", renderMeasurements));
  form.addEventListener("submit", event => {
    event.preventDefault();
    try {
      if (!form.reportValidity()) return;
      const input = readInput(); validateInput(input);
      const result = methodSelect.value === "hand"
        ? Calc.calculateHand(input, HAND_GROUPS)
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

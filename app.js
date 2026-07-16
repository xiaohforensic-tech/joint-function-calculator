(function () {
  "use strict";
  const { JOINTS, MUSCLE_LABELS } = window.JointData;
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
  const today = () => new Date().toISOString().slice(0, 10);

  Object.entries(JOINTS).forEach(([id, joint]) => jointSelect.add(new Option(joint.name, id)));
  form.elements.examDate.value = today();

  function methodGuidance() {
    const joint = JOINTS[jointSelect.value];
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

  function renderMeasurements() {
    const joint = JOINTS[jointSelect.value];
    const tableOption = methodSelect.querySelector('option[value="table"]');
    const directionOption = methodSelect.querySelector('option[value="direction"]');
    const healthyOption = referenceMode.querySelector('option[value="healthy"]');
    const sideSelect = form.elements.side;
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
      ? "单位：度（°）。输入六个方向的实测活动度。"
      : "单位：度（°）。查表法录入被动活动度和对应肌力。";
    document.getElementById("jointNote").textContent = joint.note;
    table.innerHTML = `<div class="measurement-row header"><div>运动方向</div><div>${affectedHeading}</div><div>${isTable ? "伤侧肌力" : "方法"}</div><div>${referenceHeading}</div><div>${isTable ? "健侧肌力" : "对照"}</div><div>${isTable ? "人工覆盖" : "参考区间"}</div></div>` + joint.motions.map(m => {
      const refDegree = showReference ? m.upper : (referenceMode.value === "standardLower" ? m.lower : m.upper);
      const force = isTable ? `<label class="force-box"><input type="checkbox" name="affected.${m.id}.forced100">伤侧按100%</label>${showReference ? `<label class="force-box"><input type="checkbox" name="reference.${m.id}.forced100">健侧按100%</label>` : ""}` : "—";
      return `<div class="measurement-row">
        <div class="motion-name">${escapeHtml(m.label)}${m.hint ? `<small>${escapeHtml(m.hint)}</small>` : ""}</div>
        <div><input required min="0" max="220" step="0.1" type="number" inputmode="decimal" name="affected.${m.id}.degree" aria-label="${joint.directionOnly ? "实测" : "伤侧"}${escapeHtml(m.label)}"></div>
        <div>${isTable ? muscleSelect(`affected.${m.id}.muscle`) : "方向比值"}</div>
        <div><input required min="0" max="220" step="0.1" type="number" inputmode="decimal" name="reference.${m.id}.degree" value="${refDegree}" ${showReference ? "" : "readonly"} aria-label="对照${escapeHtml(m.label)}"></div>
        <div>${isTable ? (showReference ? muscleSelect(`reference.${m.id}.muscle`) : "M5（正常）") : escapeHtml(referenceMode.options[referenceMode.selectedIndex].text)}</div>
        <div>${isTable ? force : `${m.lower}°～${m.upper}°`}</div>
      </div>`;
    }).join("");
    methodGuidance();
  }

  function muscleSelect(name) {
    return `<select name="${name}">${Object.entries(MUSCLE_LABELS).map(([v,l]) => `<option value="${v}" ${v === "5" ? "selected" : ""}>${l}</option>`).join("")}</select>`;
  }

  function readInput() {
    const joint = JOINTS[jointSelect.value];
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
    return input;
  }

  function validateInput(input) {
    const joint = JOINTS[jointSelect.value];
    for (const m of joint.motions) {
      const values = [input.affected[m.id].degree, input.reference[m.id].degree];
      if (values.some(v => !Number.isFinite(v) || v < 0 || v > 220)) throw new Error(`${m.label}应填写0～220之间的有效角度`);
    }
    if (joint.axisMode) {
      if (input.affected.flexion.degree < input.affected.extension.degree) throw new Error("最大屈曲角应大于伸直欠缺角");
      if (input.reference.flexion.degree < input.reference.extension.degree) throw new Error("对照侧最大屈曲角应大于伸直欠缺角");
    }
  }

  function buildSnapshot(result, input) {
    const jointId = jointSelect.value;
    const meta = {
      caseNumber: valueOf("caseNumber") || "未填写", subjectName: valueOf("subjectName") || "未填写",
      examDate: valueOf("examDate") || "未填写", examiner: valueOf("examiner") || "未填写",
      appraisalType: appraisalType.value, appraisalLabel: appraisalType.options[appraisalType.selectedIndex].text,
      side: valueOf("side"), jointId, jointName: JOINTS[jointId].name,
      method: methodSelect.value, methodLabel: methodSelect.options[methodSelect.selectedIndex].text,
      referenceMode: referenceMode.value, referenceLabel: referenceMode.options[referenceMode.selectedIndex].text,
      evidence: "", notes: ""
    };
    return {
      id: `${Date.now()}-${Math.random().toString(16).slice(2,8)}`,
      createdAt: new Date().toISOString(), ruleVersion: "1.3.0", meta, input, result,
      threshold: Calc.contextualThreshold(jointId, meta.appraisalType, result.result)
    };
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
    const basis = JOINTS[meta.jointId].directionOnly
      ? "SF/T 0111—2021 附录A.6；方向均分法"
      : meta.appraisalType === "injury"
        ? "《人体损伤程度鉴定标准》附录C.6；SF/T 0096—2021 第7章及附录B"
        : "《人体损伤致残程度分级》附录C.7；SF/T 0096—2021 第7章及附录B";
    record.hidden = false;
    record.innerHTML = `<div class="record-actions no-print"><button class="button ghost" data-action="copy">复制计算意见</button><button class="button ghost" data-action="download">导出JSON记录</button><button class="button secondary" data-action="save">保存至本机</button><button class="button primary" data-action="print">打印 / 另存PDF</button></div>
      <div class="record-header"><div><h2>关节功能丧失计算记录</h2></div><div class="record-number">记录ID<br>${escapeHtml(snapshot.id)}</div></div>
      <div class="record-meta">
        ${metaCell("案件编号",meta.caseNumber)}${metaCell("被鉴定人",meta.subjectName)}${metaCell("检验日期",meta.examDate)}${metaCell("记录人",meta.examiner)}
        ${metaCell("鉴定目的",meta.appraisalLabel)}${metaCell("部位",meta.side === "不分侧" ? meta.jointName : `${meta.side} ${meta.jointName}`)}${metaCell("计算方法",meta.methodLabel)}${metaCell("对照依据",meta.referenceLabel)}
      </div>
      <div class="result-banner"><div><small>功能丧失百分比</small><div class="result-value">${formatPct(result.result)}</div></div><div><strong>${escapeHtml(threshold.level)}</strong><p>${escapeHtml(threshold.text)}</p><small>仅为数值阈值提示，不自动形成损伤程度或致残等级结论。</small></div></div>
      <p class="record-basis">依据：${escapeHtml(basis)}</p>
      <h3>计算明细</h3><table class="calc-table"><thead><tr><th>方向</th><th>${JOINTS[meta.jointId].directionOnly ? "实测活动度" : "伤侧活动度"}</th><th>${result.method === "table" ? "伤侧肌力" : "对照值"}</th><th>${result.method === "table" ? "伤侧查表" : "方向丧失率"}</th><th>${result.method === "table" ? "对照侧" : "备注"}</th></tr></thead><tbody>${calculationRows(snapshot)}</tbody></table>
      <h3>汇总</h3><div class="formula-box">${escapeHtml(result.formula)}<br>${result.method === "table" ? `伤侧 ${formatPct(result.affectedTotal)} − 对照侧 ${formatPct(result.referenceTotal)} = ` : "计算结果 = "}<strong>${formatPct(result.result)}</strong></div>
      <h3>辅助意见</h3><p>${escapeHtml(opinionText(snapshot))}</p>
      <div class="record-disclaimer">本记录仅供辅助计算，正式结论由鉴定人综合判断。</div>`;
    document.getElementById("liveSummary").innerHTML = `<span class="eyebrow">CALCULATED</span><h3>${formatPct(result.result)}</h3><p>${escapeHtml(meta.side)} ${escapeHtml(meta.jointName)} · ${escapeHtml(meta.methodLabel)}<br>${escapeHtml(threshold.level)}</p>`;
    record.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function metaCell(label, value) { return `<div><small>${label}</small><strong>${escapeHtml(value)}</strong></div>`; }
  function opinionText(s) {
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
    historyList.innerHTML = items.length ? items.slice(0, 8).map(i => `<button class="history-item" data-id="${i.id}"><strong>${escapeHtml(i.meta.caseNumber)} · ${escapeHtml(i.meta.jointName)} ${formatPct(i.result.result)}</strong><span>${new Date(i.createdAt).toLocaleString("zh-CN")}</span></button>`).join("") : '<p class="muted">尚无已保存记录</p>';
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
      const result = methodSelect.value === "table" ? Calc.calculateTable(JOINTS[jointSelect.value], input) : Calc.calculateDirection(JOINTS[jointSelect.value], input);
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

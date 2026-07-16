(function (root) {
  "use strict";

  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const round = (n, digits = 2) => Number(n.toFixed(digits));

  function tableValue(motion, rawValue) {
    const value = Number(rawValue);
    if (motion.transform === "elbowFlex") return Math.max(0, value - 90);
    if (motion.transform === "elbowExtensionSigned") return Math.max(0, 90 + value);
    if (motion.transform === "extensionDeficitSigned") return Math.max(0, -value);
    return Math.max(0, value);
  }

  function lookup(motion, rawValue, muscle, forced100) {
    const converted = tableValue(motion, rawValue);
    if (forced100) return { converted, band: "同轴反向方位按100%", loss: 100, forced: true };
    const band = motion.bands.find(b => converted >= b.min && converted <= b.max);
    if (!band) throw new Error(`${motion.label}活动度${converted}°不在查表范围内`);
    return { converted, band: band.label, loss: band.loss[clamp(Number(muscle), 1, 5) - 1], forced: false };
  }

  function aggregateTable(joint, sideRows) {
    const total = sideRows.reduce((sum, row) => sum + row.loss, 0);
    return joint.kneeSum ? Math.min(100, total) : total / joint.motions.length;
  }

  function calculateTable(joint, input) {
    if (joint.directionOnly) throw new Error(`${joint.name}仅适用方向均分法`);
    const affectedRows = joint.motions.map(m => ({
      motion: m,
      ...lookup(m, input.affected[m.id].degree, input.affected[m.id].muscle, input.affected[m.id].forced100)
    }));
    const affectedTotal = aggregateTable(joint, affectedRows);
    const referenceRows = input.referenceMode === "healthy"
      ? joint.motions.map(m => ({ motion: m, ...lookup(m, input.reference[m.id].degree, input.reference[m.id].muscle, input.reference[m.id].forced100) }))
      : joint.motions.map(m => ({ motion: m, converted: Number(input.reference[m.id].degree), band: "正常参考基线", loss: 0, forced: false }));
    const referenceTotal = input.referenceMode === "healthy" ? aggregateTable(joint, referenceRows) : 0;
    return {
      method: "table", affectedRows, referenceRows,
      affectedTotal: round(affectedTotal), referenceTotal: round(referenceTotal),
      result: round(clamp(affectedTotal - referenceTotal, 0, 100)),
      formula: joint.kneeSum
        ? "min(屈曲查表值 + 伸展查表值, 100%)；实际丧失=伤侧−对照侧"
        : `(各方向查表值之和 ÷ ${joint.motions.length})；实际丧失=伤侧−对照侧`
    };
  }

  function calculateDirection(joint, input) {
    const referenceValue = m => input.referenceMode === "healthy"
      ? Number(input.reference[m.id].degree)
      : Number(input.referenceMode === "standardLower" ? m.lower : m.upper);

    if (joint.axisMode) {
      const flex = joint.motions[0];
      const extension = joint.motions[1];
      const affectedArc = Number(input.affected[flex.id].degree) + Number(input.affected[extension.id].degree);
      const refArc = referenceValue(flex) + referenceValue(extension);
      const loss = refArc > 0 ? clamp((refArc - affectedArc) / refArc * 100, 0, 100) : 0;
      return {
        method: "direction", result: round(loss), affectedArc: round(affectedArc), referenceArc: round(refArc),
        rows: [{ label: "屈伸活动弧", affected: affectedArc, reference: refArc, loss: round(loss) }],
        formula: `(${round(refArc)}° − ${round(affectedArc)}°) ÷ ${round(refArc)}° × 100%`
      };
    }

    const rows = joint.motions.map(m => {
      const affected = Number(input.affected[m.id].degree);
      const reference = referenceValue(m);
      const loss = reference > 0 ? clamp((reference - affected) / reference * 100, 0, 100) : 0;
      return { label: m.label, affected, reference, loss: round(loss) };
    });
    const result = rows.reduce((sum, row) => sum + row.loss, 0) / rows.length;
    return {
      method: "direction", rows, result: round(result),
      formula: `Σ各方向[(对照值−${joint.directionOnly ? "实测值" : "伤侧值"})÷对照值×100%] ÷ ${rows.length}`
    };
  }

  function scoreHandSide(sideInput, handGroups) {
    const missingScore = clamp(Number(sideInput.missingScore) || 0, 0, 100);
    const rows = handGroups.map(group => {
      const selected = sideInput.groups?.[group.id] || {};
      const pattern = group.patterns.find(item => item.id === selected.patternId);
      const severity = selected.severity;
      const score = pattern && Object.prototype.hasOwnProperty.call(pattern.scores, severity) ? pattern.scores[severity] : 0;
      return {
        groupId: group.id, groupLabel: group.label,
        patternId: pattern?.id || "", patternLabel: pattern?.label || "未计分",
        severity: severity || "", score
      };
    });
    const dysfunctionScore = rows.reduce((sum, row) => sum + row.score, 0);
    const subtotal = clamp(missingScore + dysfunctionScore, 0, 100);
    return { missingScore: round(missingScore), dysfunctionScore: round(dysfunctionScore), subtotal: round(subtotal), rows };
  }

  function classifyHandRom(actual, reference, status="limited") {
    const ref = Number(reference);
    const measured = Math.max(0, Number(actual));
    if (status === "nonfunctional") return { severity:"nonfunctional", ratio:0, loss:100, label:"非功能位强直" };
    if (status === "functionalAnkylosis") return { severity:"functionalHalf", ratio:0, loss:100, label:"功能位强直" };
    if (!Number.isFinite(ref) || ref <= 0 || !Number.isFinite(measured)) throw new Error("手指活动度和参考值应为有效数字，且参考值大于0");
    const ratio = measured / ref;
    const severity = ratio <= 0.5 ? "functionalHalf" : ratio <= 0.75 ? "threeQuarter" : "";
    const label = ratio <= 0.5 ? "活动度≤1/2参考值" : ratio <= 0.75 ? "活动度＞1/2且≤3/4参考值" : "活动度＞3/4参考值（表C-10不计分）";
    return { severity, ratio:round(ratio), loss:round(clamp((1-ratio)*100,0,100)), label };
  }

  function assessHandRomSide(sideInput, handDigits) {
    return handDigits.flatMap(digit => digit.joints.map(joint => {
      const item = sideInput.rom?.[digit.id]?.[joint.id] || {};
      return { digitId:digit.id, digitLabel:digit.label, jointId:joint.id, jointLabel:joint.label,
        actual:Number(item.actual), reference:Number(item.reference), status:item.status || "limited",
        ...classifyHandRom(item.actual, item.reference, item.status) };
    }));
  }

  function calculateHand(input, handGroups, handDigits=[]) {
    const left = scoreHandSide(input.left, handGroups);
    const right = scoreHandSide(input.right, handGroups);
    left.romRows = assessHandRomSide(input.left, handDigits);
    right.romRows = assessHandRomSide(input.right, handDigits);
    const A = Math.max(left.subtotal, right.subtotal);
    const B = Math.min(left.subtotal, right.subtotal);
    const result = A + B * (200 - A) / 200;
    return {
      method: "handDisability", left, right, A: round(A), B: round(B), result: round(result),
      formula: `A + B × (200 − A) ÷ 200 = ${round(A)} + ${round(B)} × (200 − ${round(A)}) ÷ 200 = ${round(result)}分`
    };
  }

  function scoreInjuryHandSide(sideInput, segments) {
    const rows = segments.map(segment => {
      const item = sideInput.segments?.[segment.id] || {};
      const state = item.state || "normal";
      let score = 0;
      let formula = "未计分";
      if (state === "missing" || state === "completeLoss") {
        score = segment.weight;
        formula = `${segment.weight}%（该指节/掌骨固定权重）`;
      } else if (state === "partialMissing") {
        const missingLength = Number(item.missingLength);
        const referenceLength = Number(item.referenceLength);
        if (!(missingLength >= 0) || !(referenceLength > 0) || missingLength > referenceLength) throw new Error(`${segment.label}部分缺失长度应在0至健侧同节长度之间`);
        score = missingLength / referenceLength * segment.weight;
        formula = `${round(missingLength)}÷${round(referenceLength)}×${segment.weight}%`;
      }
      return {...segment,state,score:round(score),formula};
    });
    const segmentScore = rows.reduce((sum,row)=>sum+row.score,0);
    const palmarSensoryLoss = clamp(Number(sideInput.palmarSensoryLoss)||0,0,100);
    const sensoryScore = palmarSensoryLoss * 0.5;
    return {rows,segmentScore:round(segmentScore),palmarSensoryLoss:round(palmarSensoryLoss),sensoryScore:round(sensoryScore),subtotal:round(segmentScore+sensoryScore)};
  }

  function injuryHandThreshold(result, direct={}) {
    if (direct.bothHandsCompleteLoss) return {level:"重伤一级直接条款提示",text:"勾选了双手完全缺失或功能完全丧失情形，需核实直接条款。"};
    if (direct.thumbContracture || direct.threeFingerContracture) return {level:"重伤二级直接条款提示",text:"勾选了不能对指和握物的挛缩情形，需核实直接条款。"};
    if (result >= 36) return {level:"达到36%阈值",text:"手功能丧失累计值达到重伤二级相关数值阈值。"};
    if (result >= 16) return {level:"达到16%阈值",text:"手功能丧失累计值达到轻伤一级相关数值阈值。"};
    if (result >= 4) return {level:"达到4%阈值",text:"手功能丧失累计值达到轻伤二级相关数值阈值。"};
    return {level:"未达4%阈值",text:"本项累计值未达到手功能丧失4%的相关数值阈值。"};
  }

  function calculateInjuryHand(input, segments, handDigits=[]) {
    const left=scoreInjuryHandSide(input.left,segments), right=scoreInjuryHandSide(input.right,segments);
    left.romRows=assessHandRomSide(input.left,handDigits); right.romRows=assessHandRomSide(input.right,handDigits);
    const result=round(left.subtotal+right.subtotal);
    return {method:"handInjury",left,right,result,direct:input.direct||{},formula:`左手 ${left.subtotal}% + 右手 ${right.subtotal}% = ${result}%`};
  }

  function handThreshold(result) {
    if (result >= 150) return { level:"达到四级数值阈值", text:"手功能丧失分值达到150分的数值阈值。" };
    if (result >= 120) return { level:"达到五级数值阈值", text:"手功能丧失分值达到120分的数值阈值。" };
    if (result >= 90) return { level:"达到六级数值阈值", text:"手功能丧失分值达到90分的数值阈值。" };
    if (result >= 60) return { level:"达到七级数值阈值", text:"手功能丧失分值达到60分的数值阈值。" };
    if (result >= 40) return { level:"达到八级数值阈值", text:"手功能丧失分值达到40分的数值阈值。" };
    if (result >= 25) return { level:"达到九级数值阈值", text:"手功能丧失分值达到25分的数值阈值。" };
    if (result >= 10) return { level:"达到十级数值阈值", text:"手功能丧失分值达到10分的数值阈值。" };
    return { level:"未达10分阈值", text:"仅就本项分值未达到手功能丧失10分的相关数值阈值。" };
  }

  function contextualThreshold(jointId, appraisalType, result, jointStatus="limited") {
    if (jointId === "hand") return appraisalType === "injury" ? injuryHandThreshold(result) : handThreshold(result);
    if (jointId === "cervical" || jointId === "lumbar") {
      return { level: "仅计算", text: "颈、腰椎活动度丧失百分比不自动对应鉴定等级。" };
    }
    if (appraisalType === "injury") {
      if (result >= 25) return { level: "达到25%阈值", text: "数值达到《人体损伤程度鉴定标准》轻伤一级相关条款阈值。" };
      if (result >= 10) return { level: "达到10%阈值", text: "数值达到《人体损伤程度鉴定标准》轻伤二级相关条款阈值。" };
      return { level: "未达10%阈值", text: "仅就本项数值未达到四肢大关节功能丧失10%的相关阈值。" };
    }
    if (jointStatus === "nonfunctionalAnkylosis") {
      if (jointId === "ankle") return { level:"九级直接条款提示", text:"存在“一踝关节强直固定于非功能位”的直接条款情形；仍需鉴定人核实固定位置及标准适用。" };
      return { level:"八级直接条款提示", text:"存在“四肢任一大关节（踝除外）强直固定于非功能位”的直接条款情形；仍需鉴定人核实固定位置及标准适用。" };
    }
    if (jointId === "ankle") {
      if (result >= 75) return { level: "达到75%阈值", text: "达到九级中“一踝关节功能丧失75%以上”的数值阈值。" };
      if (result >= 50) return { level: "达到50%阈值", text: "达到十级中“一踝关节功能丧失50%以上”的数值阈值。" };
      return { level: "未达50%阈值", text: "仅就本项数值未达到一踝关节功能丧失50%的相关阈值。" };
    }
    if (result >= 75) return { level: "达到75%阈值", text: "达到八级中“四肢任一大关节（踝除外）功能丧失75%以上”的数值阈值。" };
    if (result >= 50) return { level: "达到50%阈值", text: "达到九级中“四肢任一大关节（踝除外）功能丧失50%以上”的数值阈值。" };
    if (result >= 25) return { level: "达到25%阈值", text: "达到十级中“四肢任一大关节（踝除外）功能丧失25%以上”的数值阈值。" };
    return { level: "未达25%阈值", text: "仅就本项数值未达到四肢任一大关节（踝除外）功能丧失25%的相关阈值。" };
  }

  const API = { calculateTable, calculateDirection, calculateHand, calculateInjuryHand, scoreHandSide, scoreInjuryHandSide, classifyHandRom, assessHandRomSide, handThreshold, injuryHandThreshold, contextualThreshold, tableValue, lookup, round };
  root.JointCalculator = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);

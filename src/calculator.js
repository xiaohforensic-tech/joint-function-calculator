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

  function classifyHandRom(actual, reference, status="limited", fixedDegree=null) {
    const ref = Number(reference);
    const measured = Math.max(0, Number(actual));
    if (!Number.isFinite(ref) || ref <= 0 || !Number.isFinite(measured)) throw new Error("手指活动度和参考值应为有效数字，且参考值大于0");
    const ratio = measured / ref;
    const loss = round(clamp((1-ratio)*100,0,100));
    const fixed = fixedDegree === "" || fixedDegree == null ? NaN : Number(fixedDegree);
    if (status === "nonfunctional") return {
      severity:"nonfunctional", ratio:round(ratio), loss,
      label:`活动弧${round(measured)}°；强直固定于${Number.isFinite(fixed) ? `${round(fixed)}°位` : "未填写角度的位置"}，已录入为非功能位`
    };
    if (status === "functionalAnkylosis") return {
      severity:"functionalHalf", ratio:round(ratio), loss,
      label:`活动弧${round(measured)}°；强直固定于${Number.isFinite(fixed) ? `${round(fixed)}°位` : "未填写角度的位置"}，已录入为功能位`
    };
    const severity = ratio <= 0.5 ? "functionalHalf" : ratio <= 0.75 ? "threeQuarter" : "";
    const label = ratio <= 0.5 ? "活动度≤1/2参考值" : ratio <= 0.75 ? "活动度＞1/2且≤3/4参考值" : "活动度＞3/4参考值（表C-10不计分）";
    return { severity, ratio:round(ratio), loss, label };
  }

  function assessHandRomSide(sideInput, handDigits) {
    return handDigits.flatMap(digit => digit.joints.map(joint => {
      const item = sideInput.rom?.[digit.id]?.[joint.id] || {};
      return { digitId:digit.id, digitLabel:digit.label, jointId:joint.id, jointLabel:joint.label,
        actual:Number(item.actual), reference:Number(item.reference), status:item.status || "limited",
        fixedDegree:item.fixedDegree === "" || item.fixedDegree == null ? null : Number(item.fixedDegree),
        ...classifyHandRom(item.actual, item.reference, item.status, item.fixedDegree) };
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
    if (direct.bothHandsCompleteLoss) return {level:"重伤一级（直接条款）",grade:"重伤一级",text:"已确认双手完全缺失或功能完全丧失，符合重伤一级直接条款。"};
    if (direct.thumbContracture || direct.threeFingerContracture) return {level:"重伤二级（直接条款）",grade:"重伤二级",text:"已确认不能对指和握物的相应手指挛缩情形，符合重伤二级直接条款。"};
    if (result >= 36) return {level:"重伤二级",grade:"重伤二级",text:"手功能丧失累计值达到36%，对应重伤二级数值条款。"};
    if (result >= 16) return {level:"轻伤一级",grade:"轻伤一级",text:"手功能丧失累计值达到16%，对应轻伤一级数值条款。"};
    if (result >= 4) return {level:"轻伤二级",grade:"轻伤二级",text:"手功能丧失累计值达到4%，对应轻伤二级数值条款。"};
    return {level:"未达轻伤二级数值阈值",grade:null,text:"本项累计值未达到手功能丧失4%的相关数值阈值。"};
  }

  function calculateInjuryHand(input, segments, handDigits=[]) {
    const left=scoreInjuryHandSide(input.left,segments), right=scoreInjuryHandSide(input.right,segments);
    left.romRows=assessHandRomSide(input.left,handDigits); right.romRows=assessHandRomSide(input.right,handDigits);
    const result=round(left.subtotal+right.subtotal);
    return {method:"handInjury",left,right,result,direct:input.direct||{},formula:`左手 ${left.subtotal}% + 右手 ${right.subtotal}% = ${result}%`};
  }

  function handThreshold(result) {
    if (result >= 150) return { level:"四级", grade:"四级", text:"手功能丧失分值达到150分，对应四级数值条款。" };
    if (result >= 120) return { level:"五级", grade:"五级", text:"手功能丧失分值达到120分，对应五级数值条款。" };
    if (result >= 90) return { level:"六级", grade:"六级", text:"手功能丧失分值达到90分，对应六级数值条款。" };
    if (result >= 60) return { level:"七级", grade:"七级", text:"手功能丧失分值达到60分，对应七级数值条款。" };
    if (result >= 40) return { level:"八级", grade:"八级", text:"手功能丧失分值达到40分，对应八级数值条款。" };
    if (result >= 25) return { level:"九级", grade:"九级", text:"手功能丧失分值达到25分，对应九级数值条款。" };
    if (result >= 10) return { level:"十级", grade:"十级", text:"手功能丧失分值达到10分，对应十级数值条款。" };
    return { level:"未达十级数值阈值", grade:null, text:"仅就本项分值，未达到手功能丧失10分的相关数值阈值。" };
  }

  function functionalRangeLabel(axis) {
    return axis.min === axis.max ? `${axis.min}°` : `${axis.min}°～${axis.max}°`;
  }

  function assessFunctionalPosition(rule, values={}, checks={}) {
    if (!rule || !Array.isArray(rule.axes)) return {state:"unsupported",jointStatus:"ankylosisPending",text:"该部位没有可用的功能位角度规则，需人工复核。",rows:[]};
    const rows=rule.axes.map(axis=>{
      const raw=values[axis.id];
      const value=raw === "" || raw == null ? NaN : Number(raw);
      if (!Number.isFinite(value)) return {...axis,value:null,state:"missing",range: functionalRangeLabel(axis)};
      if (value >= axis.min && value <= axis.max) return {...axis,value,state:"inside",range:functionalRangeLabel(axis),distance:0};
      const distance=value < axis.min ? axis.min-value : value-axis.max;
      return {...axis,value,state:distance <= (axis.boundary || 0) ? "boundary" : "outside",range:functionalRangeLabel(axis),distance:round(distance)};
    });
    const missing=rows.filter(row=>row.state==="missing");
    const outside=rows.filter(row=>row.state==="outside");
    const boundary=rows.filter(row=>row.state==="boundary");
    const unchecked=(rule.checks || []).filter(item=>!checks[item.id]);
    const positions=rows.filter(row=>row.value != null).map(row=>`${row.label}${round(row.value)}°`).join("、");
    if (outside.length) {
      const reasons=outside.map(row=>`${row.label}${round(row.value)}°超出参考${row.range}`).join("；");
      return {state:"nonfunctionalLikely",jointStatus:"nonfunctionalAnkylosis",rows,positions,text:`角度初判：${reasons}，初判为非功能位。`};
    }
    if (missing.length || unchecked.length) {
      const reasons=[
        missing.length ? `还需填写${missing.map(row=>row.label).join("、")}` : "",
        unchecked.length ? `还需核实${unchecked.map(item=>item.label).join("、")}` : ""
      ].filter(Boolean).join("；");
      return {state:"insufficient",jointStatus:"ankylosisPending",rows,positions,text:`角度初判：信息不足；${reasons}。`};
    }
    if (boundary.length) {
      const reasons=boundary.map(row=>`${row.label}${round(row.value)}°接近参考边界${row.range}`).join("；");
      return {state:"borderline",jointStatus:"ankylosisPending",rows,positions,text:`角度初判：${reasons}，处于系统设置的±${Math.max(...boundary.map(row=>row.boundary || 0))}°边界复核区。`};
    }
    return {state:"functionalLikely",jointStatus:"functionalAnkylosis",rows,positions,text:`角度初判：${positions}均在临床功能位参考范围内，初判为功能位。`};
  }

  function describeAnkylosis(jointName, side, jointStatus, fixation={}, appraisalType="disability") {
    if (jointStatus === "limited") return "";
    const statusLabel = jointStatus === "nonfunctionalAnkylosis" ? "非功能位" : jointStatus === "functionalAnkylosis" ? "功能位" : "性质待复核";
    const assessment=fixation.assessment;
    const legacyDegree = fixation.degree === "" || fixation.degree == null ? NaN : Number(fixation.degree);
    const position = assessment?.positions
      ? `${assessment.positions}位`
      : Number.isFinite(legacyDegree) ? `${fixation.motionLabel || "未注明方向"}${round(legacyDegree)}°位` : "尚未完整填写角度的位置";
    const subject = `${side && side !== "不分侧" ? side : ""}${jointName}`;
    const evidence = fixation.evidenceConfirmed ? "已结合被动活动、重复测量及结构资料核实强直固定" : "尚未确认强直固定的多源证据";
    const legal = appraisalType === "injury"
      ? (fixation.injuryDeformityConfirmed ? "并已确认属于强直畸形" : "尚未确认是否属于损伤程度标准所称强直畸形")
      : (fixation.reviewMode && fixation.reviewMode !== "auto" ? `经鉴定人复核确认为${statusLabel}${fixation.reviewReason ? `（${fixation.reviewReason}）` : ""}` : `系统角度初判为${statusLabel}`);
    const angleText=assessment?.text ? `${assessment.text}` : "";
    return `${subject}强直固定于${position}；${angleText}${evidence}，${legal}。功能位角度属于临床参考，最终性质仍须结合个体功能及多源证据确认。`;
  }

  function contextualThreshold(jointId, appraisalType, result, jointStatus="limited", fixation={}) {
    if (jointId === "hand") return appraisalType === "injury" ? injuryHandThreshold(result) : handThreshold(result);
    if (jointId === "cervical" || jointId === "lumbar") return { level:"仅计算，不输出等级", grade:null, text:"颈、腰椎活动度丧失百分比不在本模块中自动对应鉴定等级。" };
    if (appraisalType === "injury") {
      if (jointStatus !== "limited" && fixation.injuryDeformityConfirmed && fixation.evidenceConfirmed) {
        return { level:"重伤二级（直接条款）", grade:"重伤二级", basis:"5.9.2(a)", text:"已确认四肢任一大关节强直畸形，适用《人体损伤程度鉴定标准》5.9.2(a)直接条款。" };
      }
      const pending = jointStatus !== "limited" ? "录入的强直状态尚未同时确认多源证据及“强直畸形”，未按直接条款处理；" : "";
      if (result >= 50) return { level:"重伤二级", grade:"重伤二级", basis:"5.9.2(a)", text:`${pending}四肢任一大关节功能丧失50%以上，达到《人体损伤程度鉴定标准》5.9.2(a)数值条款。` };
      if (result >= 25) return { level:"轻伤一级", grade:"轻伤一级", basis:"5.9.3(a)", text:`${pending}四肢任一大关节功能丧失25%以上，达到《人体损伤程度鉴定标准》5.9.3(a)数值条款。` };
      if (result >= 10) return { level:"轻伤二级", grade:"轻伤二级", basis:"5.9.4(a)", text:`${pending}四肢任一大关节功能丧失10%以上，达到《人体损伤程度鉴定标准》5.9.4(a)数值条款。` };
      return { level:jointStatus !== "limited" ? "强直待核实；未达轻伤二级数值阈值" : "未达轻伤二级数值阈值", grade:null, text:`${pending}仅就本项数值，未达到四肢任一大关节功能丧失10%的相关数值阈值。` };
    }
    if (jointStatus === "nonfunctionalAnkylosis") {
      if (!fixation.evidenceConfirmed) return { level:"非功能位强直待核实", grade:null, text:"已录入非功能位强直，但尚未确认被动活动、重复测量及结构资料等证据，暂不自动输出伤残等级。" };
      if (jointId === "ankle") return { level:"八级（直接条款）", grade:"八级", basis:"5.8.6(9)", text:"一踝关节强直固定于非功能位，适用《人体损伤致残程度分级》5.8.6(9)直接条款。" };
      return { level:"七级（直接条款）", grade:"七级", basis:"5.7.6(3)", text:"四肢任一大关节（踝关节除外）强直固定于非功能位，适用《人体损伤致残程度分级》5.7.6(3)直接条款。" };
    }
    if (jointId === "ankle") {
      if (result >= 75) return { level:"九级", grade:"九级", text:"一踝关节功能丧失75%以上，达到九级相关数值条款。" };
      if (result >= 50) return { level:"十级", grade:"十级", text:"一踝关节功能丧失50%以上，达到十级相关数值条款。" };
      return { level:"未达十级数值阈值", grade:null, text:"仅就本项数值，未达到一踝关节功能丧失50%的相关数值阈值。" };
    }
    if (result >= 75) return { level:"八级", grade:"八级", text:"四肢任一大关节（踝关节除外）功能丧失75%以上，达到八级相关数值条款。" };
    if (result >= 50) return { level:"九级", grade:"九级", text:"四肢任一大关节（踝关节除外）功能丧失50%以上，达到九级相关数值条款。" };
    if (result >= 25) return { level:"十级", grade:"十级", text:"四肢任一大关节（踝关节除外）功能丧失25%以上，达到十级相关数值条款。" };
    return { level:"未达十级数值阈值", grade:null, text:"仅就本项数值，未达到四肢任一大关节（踝关节除外）功能丧失25%的相关数值阈值。" };
  }

  const API = { calculateTable, calculateDirection, calculateHand, calculateInjuryHand, scoreHandSide, scoreInjuryHandSide, classifyHandRom, assessHandRomSide, handThreshold, injuryHandThreshold, assessFunctionalPosition, describeAnkylosis, contextualThreshold, tableValue, lookup, round };
  root.JointCalculator = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);

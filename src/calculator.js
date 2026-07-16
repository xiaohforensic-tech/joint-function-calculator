(function (root) {
  "use strict";

  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const round = (n, digits = 2) => Number(n.toFixed(digits));

  function tableValue(motion, rawValue) {
    const value = Number(rawValue);
    if (motion.transform === "elbowFlex") return Math.max(0, value - 90);
    if (motion.transform === "elbowExtend") return Math.max(0, 90 - value);
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
      const affectedArc = Number(input.affected[flex.id].degree) - Number(input.affected[extension.id].degree);
      const refArc = referenceValue(flex) - referenceValue(extension);
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

  function contextualThreshold(jointId, appraisalType, result) {
    if (jointId === "cervical" || jointId === "lumbar") {
      return { level: "仅计算", text: "颈、腰椎活动度丧失百分比不自动对应鉴定等级。" };
    }
    if (appraisalType === "injury") {
      if (result >= 25) return { level: "达到25%阈值", text: "数值达到《人体损伤程度鉴定标准》轻伤一级相关条款阈值。" };
      if (result >= 10) return { level: "达到10%阈值", text: "数值达到《人体损伤程度鉴定标准》轻伤二级相关条款阈值。" };
      return { level: "未达10%阈值", text: "仅就本项数值未达到四肢大关节功能丧失10%的相关阈值。" };
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

  const API = { calculateTable, calculateDirection, contextualThreshold, tableValue, lookup, round };
  root.JointCalculator = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);

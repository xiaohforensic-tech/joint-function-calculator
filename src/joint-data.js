(function (root) {
  "use strict";

  const L9 = [
    [100, 75, 50, 25, 0], [100, 77, 55, 32, 10], [100, 80, 60, 40, 20],
    [100, 82, 65, 47, 30], [100, 85, 70, 55, 40], [100, 87, 75, 62, 50],
    [100, 90, 80, 70, 60], [100, 92, 85, 77, 70], [100, 95, 90, 85, 80]
  ];
  const L5 = [L9[0], L9[2], L9[4], L9[6], L9[8]];
  const L4 = [L9[0], L9[4], L9[6], L9[8]];

  function ranges(edges, labels, losses) {
    return labels.map((label, i) => ({ min: edges[i][0], max: edges[i][1], label, loss: losses[i] }));
  }

  const R = {
    shoulderLong: ranges([[171, Infinity],[151,170],[131,150],[111,130],[91,110],[71,90],[51,70],[31,50],[-Infinity,30]], ["≥171","151～170","131～150","111～130","91～110","71～90","51～70","31～50","≤30"], L9),
    shoulderShort: ranges([[41,Infinity],[31,40],[21,30],[11,20],[-Infinity,10]], ["≥41","31～40","21～30","11～20","≤10"], L5),
    shoulderRotation: ranges([[81,Infinity],[71,80],[61,70],[51,60],[41,50],[31,40],[21,30],[11,20],[-Infinity,10]], ["≥81","71～80","61～70","51～60","41～50","31～40","21～30","11～20","≤10"], L9),
    elbowFlex: ranges([[41,Infinity],[36,40],[31,35],[26,30],[21,25],[16,20],[11,15],[6,10],[-Infinity,5]], ["≥41","36～40","31～35","26～30","21～25","16～20","11～15","6～10","≤5"], L9),
    elbowExtend: ranges([[81,Infinity],[71,80],[61,70],[51,60],[41,50],[31,40],[21,30],[11,20],[-Infinity,10]], ["≥81","71～80","61～70","51～60","41～50","31～40","21～30","11～20","≤10"], L9),
    wristLong: ranges([[61,Infinity],[51,60],[41,50],[31,40],[26,30],[21,25],[16,20],[11,15],[-Infinity,10]], ["≥61","51～60","41～50","31～40","26～30","21～25","16～20","11～15","≤10"], L9),
    wristRadial: ranges([[21,Infinity],[16,20],[11,15],[6,10],[-Infinity,5]], ["≥21","16～20","11～15","6～10","≤5"], L5),
    wristUlnar: ranges([[41,Infinity],[31,40],[21,30],[11,20],[-Infinity,10]], ["≥41","31～40","21～30","11～20","≤10"], L5),
    hipFlex: ranges([[121,Infinity],[106,120],[91,105],[76,90],[61,75],[46,60],[31,45],[16,30],[-Infinity,15]], ["≥121","106～120","91～105","76～90","61～75","46～60","31～45","16～30","≤15"], L9),
    hipExtend: ranges([[11,Infinity],[6,10],[1,5],[0,0]], ["≥11","6～10","1～5","0"], [L9[0], L9[4], L9[6], L9[8]]),
    hipAbAdRot: ranges([[41,Infinity],[31,40],[21,30],[11,20],[-Infinity,10]], ["≥41","31～40","21～30","11～20","≤10"], L5),
    hipAdduction: ranges([[16,Infinity],[11,15],[6,10],[1,5],[0,0]], ["≥16","11～15","6～10","1～5","0"], L5),
    kneeFlex: ranges([[130,Infinity],[116,129],[101,115],[86,100],[71,85],[61,70],[46,60],[31,45],[-Infinity,30]], ["≥130","116～129","101～115","86～100","71～85","61～70","46～60","31～45","≤30"], L9),
    kneeDeficit: ranges([[0,5],[6,10],[11,20],[21,25],[26,30],[31,35],[36,40],[41,45],[46,Infinity]], ["欠伸≤5（表值≥-5）","欠伸6～10","欠伸11～20","欠伸21～25","欠伸26～30","欠伸31～35","欠伸36～40","欠伸41～45","欠伸≥46"], L9),
    ankleDorsi: ranges([[16,Infinity],[11,15],[6,10],[1,5],[0,0]], ["≥16","11～15","6～10","1～5","0"], L5),
    anklePlantar: ranges([[41,Infinity],[31,40],[21,30],[11,20],[-Infinity,10]], ["≥41","31～40","21～30","11～20","≤10"], L5)
  };

  const JOINTS = {
    shoulder: {
      name: "肩关节", directions: 6, note: "内旋、外旋默认采用贴壁位测量。",
      motions: [
        ["flexion","前屈上举",180,160,R.shoulderLong], ["extension","后伸",50,40,R.shoulderShort],
        ["abduction","外展上举",180,160,R.shoulderLong], ["adduction","内收",45,20,R.shoulderShort],
        ["externalRotation","贴壁位外旋",60,45,R.shoulderRotation], ["internalRotation","贴壁位内旋",70,45,R.shoulderRotation]
      ]
    },
    elbow: {
      name: "肘关节", directions: 1, axisMode: true,
      note: "采用中立位0°法：欠伸填负数，过伸填正数；查表时自动换算为以屈曲90°为中立位的两个方向活动度。",
      motions: [
        ["flexion","最大屈曲",150,135,R.elbowFlex,"elbowFlex"],
        ["extension","伸展",0,0,R.elbowExtend,"elbowExtensionSigned","欠伸填负数，过伸填正数"]
      ]
    },
    wrist: {
      name: "腕关节", directions: 4, note: "掌屈/背屈及桡偏/尺偏为两个轴位。",
      motions: [
        ["palmarFlexion","掌屈",60,50,R.wristLong], ["dorsiflexion","背伸",60,50,R.wristLong],
        ["ulnarDeviation","尺偏",40,30,R.wristUlnar], ["radialDeviation","桡偏",30,25,R.wristRadial]
      ]
    },
    hip: {
      name: "髋关节", directions: 6, note: "表中前屈指屈膝位前屈。",
      motions: [
        ["flexion","前屈（屈膝位）",140,125,R.hipFlex], ["extension","后伸",15,10,R.hipExtend],
        ["abduction","外展",45,30,R.hipAbAdRot], ["adduction","内收",30,20,R.hipAdduction],
        ["externalRotation","外旋",45,30,R.hipAbAdRot], ["internalRotation","内旋",50,40,R.hipAbAdRot]
      ]
    },
    knee: {
      name: "膝关节", directions: 1, axisMode: true, kneeSum: true,
      note: "采用中立位0°法：欠伸填负数，过伸填正数；查表法将屈曲、伸展丧失值相加并封顶100%。",
      motions: [
        ["flexion","最大屈曲",150,120,R.kneeFlex],
        ["extension","伸展",0,0,R.kneeDeficit,"extensionDeficitSigned","欠伸填负数，过伸填正数"]
      ]
    },
    ankle: {
      name: "踝关节", directions: 2, note: "测量背屈、跖屈两个方向。",
      motions: [
        ["dorsiflexion","背屈",30,20,R.ankleDorsi], ["plantarFlexion","跖屈",50,40,R.anklePlantar]
      ]
    },
    cervical: {
      name: "颈椎", directions: 6, directionOnly: true,
      note: "测量前屈、后伸、左右侧屈和左右旋转。",
      motions: [
        ["flexion","前屈",45,35], ["extension","后伸",45,35],
        ["leftLateralFlexion","左侧屈",45,45], ["rightLateralFlexion","右侧屈",45,45],
        ["leftRotation","左旋转",80,60], ["rightRotation","右旋转",80,60]
      ]
    },
    lumbar: {
      name: "腰椎", directions: 6, directionOnly: true,
      note: "测量前屈、后伸、左右侧屈和左右旋转。",
      motions: [
        ["flexion","前屈",90,90], ["extension","后伸",30,30],
        ["leftLateralFlexion","左侧屈",35,20], ["rightLateralFlexion","右侧屈",35,20],
        ["leftRotation","左旋转",45,30], ["rightRotation","右旋转",45,30]
      ]
    },
    hand: {
      name: "手功能评分", kind: "hand", directions: 0,
      note: "按《人体损伤致残程度分级》附录C.8计算手部分缺失及手指关节功能障碍分值。",
      motions: []
    }
  };

  const HAND_SEVERITIES = {
    nonfunctional: "非功能位强直",
    functionalHalf: "功能位强直或活动度≤1/2参考值",
    threeQuarter: "活动度＞1/2、但≤3/4参考值"
  };

  const HAND_GROUPS = [
    { id:"thumb", label:"拇指", patterns:[
      {id:"all",label:"第一掌腕、掌指、指间关节均受累",scores:{nonfunctional:40,functionalHalf:25,threeQuarter:15}},
      {id:"mcpIp",label:"掌指、指间关节均受累",scores:{nonfunctional:30,functionalHalf:20,threeQuarter:10}},
      {id:"single",label:"掌指、指间单一关节受累",scores:{nonfunctional:20,functionalHalf:15,threeQuarter:5}}
    ]},
    { id:"index", label:"示指", patterns:[
      {id:"all",label:"掌指、指间关节均受累",scores:{nonfunctional:20,functionalHalf:15,threeQuarter:5}},
      {id:"mcpPip",label:"掌指或近侧指间关节受累",scores:{nonfunctional:15,functionalHalf:10,threeQuarter:0}},
      {id:"dip",label:"远侧指间关节受累",scores:{nonfunctional:5,functionalHalf:5,threeQuarter:0}}
    ]},
    { id:"middle", label:"中指", patterns:[
      {id:"all",label:"掌指、指间关节均受累",scores:{nonfunctional:15,functionalHalf:5,threeQuarter:5}},
      {id:"mcpPip",label:"掌指或近侧指间关节受累",scores:{nonfunctional:10,functionalHalf:5,threeQuarter:0}},
      {id:"dip",label:"远侧指间关节受累",scores:{nonfunctional:5,functionalHalf:0,threeQuarter:0}}
    ]},
    { id:"ring", label:"环指", patterns:[
      {id:"all",label:"掌指、指间关节均受累",scores:{nonfunctional:10,functionalHalf:5,threeQuarter:5}},
      {id:"mcpPip",label:"掌指或近侧指间关节受累",scores:{nonfunctional:5,functionalHalf:5,threeQuarter:0}},
      {id:"dip",label:"远侧指间关节受累",scores:{nonfunctional:5,functionalHalf:0,threeQuarter:0}}
    ]},
    { id:"little", label:"小指", patterns:[
      {id:"all",label:"掌指、指间关节均受累",scores:{nonfunctional:5,functionalHalf:5,threeQuarter:0}},
      {id:"mcpPip",label:"掌指或近侧指间关节受累",scores:{nonfunctional:5,functionalHalf:5,threeQuarter:0}},
      {id:"dip",label:"远侧指间关节受累",scores:{nonfunctional:0,functionalHalf:0,threeQuarter:0}}
    ]},
    { id:"wrist", label:"腕关节", patterns:[
      {id:"majorHandLoss",label:"手功能大部分丧失时腕关节受累",scores:{nonfunctional:10,functionalHalf:5,threeQuarter:0}}
    ]}
  ];

  Object.values(JOINTS).forEach(joint => {
    joint.motions = joint.motions.map(([id,label,upper,lower,bands,transform="identity",hint=""]) => ({id,label,upper,lower,bands,transform,hint}));
  });

  const API = { JOINTS, HAND_GROUPS, HAND_SEVERITIES, MUSCLE_LABELS: {1:"≤M1",2:"M2",3:"M3",4:"M4",5:"M5"} };
  root.JointData = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);

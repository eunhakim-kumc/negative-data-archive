/* Field definitions shared by the public archive (index.html) and the
   submission app (submit.html).

   Keys are the Postgres column names from supabase/schema.sql, so a value
   read from the API renders without translation. Keep the two in step: a
   column added there needs its label here before it shows anywhere. */

const OUTCOMES = {
  dead:   { label: "작동 안 함",      cls: "o-dead",   stripe: "var(--o-dead)" },
  cond:   { label: "조건부 작동",     cls: "o-cond",   stripe: "var(--o-cond)" },
  repro:  { label: "재현 실패",       cls: "o-repro",  stripe: "var(--o-repro)" },
  nodiff: { label: "유의한 차이 없음", cls: "o-nodiff", stripe: "var(--o-nodiff)" },
};

const f = (k, label, opt) => Object.assign({ k, label }, opt || {});

const TYPES = {
  antibody: {
    label: "항체",
    blurb: "IHC·IF·WB·FACS에서 기대한 신호가 나오지 않았거나, 특정 조건에서만 나온 경우",
    fields: [
      f("target", "표적 항원 / 단백질", { req: true, ph: "예: IBA1, CD45, phospho-STAT3 (Tyr705)" }),
      f("vendor", "제조사", { ph: "예: Abcam, Cell Signaling, BioLegend" }),
      f("catalog", "Catalog #", { mono: true, ph: "예: ab178846" }),
      f("clone", "Clone", { mono: true, ph: "예: EPR16588, 30-F11" }),
      f("lot", "Lot #", { mono: true, ph: "예: GR3374129-3", hint: "lot마다 성능이 다른 경우가 많아 추적에 가장 중요한 항목입니다." }),
      f("host_iso", "Host / Isotype", { ph: "예: Rabbit monoclonal IgG" }),
      f("conjugate", "Conjugate / Fluorophore", { ph: "예: unconjugated, BV421, AF647" }),
      f("application", "적용 (Application)", { type: "multi", opts: ["IHC-P", "IHC-F", "IF/ICC", "WB", "Flow", "IP", "ChIP", "기타"] }),
      f("dilution", "시험한 희석배수", { mono: true, ph: "예: 1:200, 1:500, 1:1000 모두 시험" }),
      f("fixation", "고정 조건", { ph: "예: 4% PFA 침지 16 h, 4°C → 30% sucrose" }),
      f("retrieval", "항원 부활 (Antigen retrieval)", { ph: "예: citrate pH 6.0, 95°C 20 min / EDTA pH 9.0 / 미시행" }),
      f("blocking", "Blocking / Permeabilization", { ph: "예: 5% NDS + 0.3% Triton X-100, RT 1 h" }),
      f("pos_control", "양성 대조", { type: "textarea", ph: "같은 실험에서 함께 돌린 양성 대조와 그 결과. 대조가 살아 있어야 음성 데이터가 의미를 가집니다." }),
    ],
  },
  mouse: {
    label: "마우스 라인 / Cre",
    blurb: "Cre leakiness, recombination 효율, 유도 조건, 예상과 다른 발현 패턴, 유전형 판정 문제",
    fields: [
      f("line_name", "라인 통칭", { req: true, ph: "예: Cx3cr1-CreER, Nestin-Cre" }),
      f("nomenclature", "공식 명명 (Nomenclature)", { mono: true, ph: "예: B6.129P2(Cg)-Cx3cr1tm2.1(cre/ERT2)Litt/WganJ" }),
      f("stock_id", "Stock / MGI ID", { mono: true, ph: "예: JAX 021160, RBRC05454" }),
      f("background", "배경 계통", { ph: "예: C57BL/6J, 8세대 backcross" }),
      f("driver", "Driver 종류", { type: "select", opts: ["Cre", "CreERT2 / CreER", "Flp / FlpO", "rtTA / tTA", "Dre", "기타 / 해당 없음"] }),
      f("reporter", "교배한 Reporter / floxed allele", { ph: "예: Ai14 (Rosa26-lsl-tdTomato), Il6rafl/fl" }),
      f("induction", "유도 조건", { type: "textarea", ph: "예: Tamoxifen 2 mg/일, 경구 투여, 연속 5일, P21부터. 분석은 마지막 투여 후 21일." }),
      f("efficiency", "Recombination 효율", { ph: "예: 피질 미세아교세포에서 tdTomato+ ~62% (IBA1+ 기준, n=4)" }),
      f("leak", "Leaky 발현 부위 / 시점", { type: "textarea", ph: "예: tamoxifen 미투여 대조에서 간과 비장 대식세포의 8~12%가 이미 tdTomato+. 뇌에서는 1% 미만." }),
      f("genotyping", "유전형 판정 문제", { type: "textarea", ph: "예: 공급처 프로토콜 프라이머로 WT/het 밴드 구분 불가. 사용한 대체 프라이머와 조건." }),
      f("pheno", "배경 표현형", { type: "textarea", ph: "Cre 자체의 독성, 번식력 저하, 체중 차이 등 실험 해석에 영향을 주는 관찰." }),
    ],
  },
  protocol: {
    label: "프로토콜 / 시약",
    blurb: "조직 분리, 배양, 키트, buffer 조성 등에서 실패했거나 재현되지 않은 조건",
    fields: [
      f("procedure_name", "프로토콜 / 수기 이름", { req: true, ph: "예: 성체 마우스 뇌 미세아교세포 분리 (Percoll gradient)" }),
      f("kit_vendor", "키트 / 시약 제조사", { ph: "예: Miltenyi, Worthington" }),
      f("kit_catalog", "Catalog / Lot #", { mono: true, ph: "예: 130-107-677" }),
      f("source_ref", "따른 원 프로토콜 출처", { ph: "예: PMID 29472486의 Methods, 또는 제조사 매뉴얼 v4.2" }),
      f("failed_step", "실패한 단계", { req: true, type: "textarea", ph: "어느 단계에서 어떻게 어긋났는지. 예: 효소 처리 후 세포 생존율이 30% 미만으로 떨어져 이후 염색이 불가." }),
      f("conditions", "시험한 조건 범위", { type: "textarea", ph: "예: papain 농도 20/30/40 U/mL, 처리 시간 20/30/45 min 조합 시험." }),
      f("alternative", "대안 / 해결 조건", { type: "textarea", ph: "결국 통한 방법이 있으면 적어 주세요. 없으면 '미해결'로 남겨도 충분한 정보입니다." }),
    ],
  },
  null_result: {
    label: "실험 결과 (null result)",
    blurb: "가설을 제대로 검정했으나 유의한 차이가 없었던 결과. 중복 실험을 막는 가장 값진 기록입니다.",
    fields: [
      f("hypothesis", "검정한 가설", { req: true, type: "textarea", ph: "예: 모체 면역 활성화가 태아 뇌의 미세아교세포 수를 증가시킬 것이다." }),
      f("model", "모델 / 계통", { ph: "예: C57BL/6J, poly(I:C) 20 mg/kg i.p., E12.5" }),
      f("intervention", "처치 / 비교군", { ph: "예: poly(I:C) vs saline, E17.5에 분석" }),
      f("readout", "측정 지표 / 방법", { ph: "예: IBA1+ 세포 밀도 (IHC), 유세포분석 CD45int CD11b+ 분획" }),
      f("group_sizes", "군 구성과 n수", { req: true, mono: true, ph: "예: saline n=6 (3 litters), poly(I:C) n=7 (4 litters), 모두 수컷 태자" }),
      f("stat_test", "통계 검정", { req: true, ph: "예: Shapiro-Wilk 통과 후 Welch's t-test (litter를 단위로)" }),
      f("stat_result", "검정 결과", { req: true, mono: true, ph: "예: t(10.2)=0.84, p=0.42, Hedges' g=0.41 [-0.6, 1.4]" }),
      f("power_note", "검정력 / 해석상 한계", { type: "textarea", ph: "예: 현재 n으로는 g=1.2 이상만 80% 검정력으로 검출 가능. 작은 효과는 배제하지 못함.", hint: "음성 결과를 '효과 없음'으로 읽을 수 있는 범위를 적어 주면 인용 가치가 크게 올라갑니다." }),
    ],
  },
};

const COMMON = [
  f("species", "종 / 세포", { ph: "예: Mus musculus (C57BL/6J), 또는 BV2 세포주" }),
  f("tissue", "조직 / 시료", { ph: "예: 성체 뇌 관류고정 절편 (30 µm), 비장 단일세포" }),
];

const NARRATIVE = [
  f("detail", "상세 기록", { type: "textarea", ph: "관찰한 내용을 그대로. 대조군은 어땠는지, 몇 번 반복했는지 포함하면 좋습니다." }),
  f("tried", "시도한 조건", { type: "textarea", ph: "바꿔 본 변수와 범위. 예: 희석 1:200~1:1000, 항원 부활 citrate/EDTA 모두 시험." }),
  f("resolution", "해결 / 대안", { type: "textarea", ph: "통한 방법이 있으면 적어 주세요. 없으면 비워 두셔도 됩니다 — 그것도 정보입니다." }),
  f("refs", "참고 문헌 / 링크", { ph: "PMID 또는 DOI. 예: PMID 29472486, doi:10.1038/s41586-021-03563-7" }),
];

/* The one line that tells a reader whether a record is about their reagent. */
function keyLine(r) {
  if (r.type === "antibody") return [r.target, r.clone, r.catalog].filter(Boolean).join(" · ");
  if (r.type === "mouse") return [r.line_name, r.stock_id].filter(Boolean).join(" · ");
  if (r.type === "protocol") return [r.procedure_name, r.kit_catalog].filter(Boolean).join(" · ");
  if (r.type === "null_result") return r.group_sizes || "";
  return "";
}

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return d.getFullYear() + "." + String(d.getMonth() + 1).padStart(2, "0") + "." + String(d.getDate()).padStart(2, "0");
}

/* Every field of a record, in display order, for detail views and copying. */
function allFields(type) {
  return ((TYPES[type] || {}).fields || []).concat(COMMON);
}

function recordToText(r, url) {
  const lines = [];
  lines.push("[" + ((TYPES[r.type] || {}).label || r.type) + " / " + ((OUTCOMES[r.outcome] || {}).label || "") + "] " + r.title);
  if (r.summary) lines.push(r.summary);
  lines.push("");
  allFields(r.type).forEach((fd) => {
    const v = r[fd.k];
    if (v && (!Array.isArray(v) || v.length)) lines.push("- " + fd.label + ": " + (Array.isArray(v) ? v.join(", ") : v));
  });
  NARRATIVE.forEach((fd) => {
    if (r[fd.k]) lines.push("", fd.label + ": " + r[fd.k]);
  });
  lines.push("", "제출: " + (r.submitter_name || "") + " (" + (r.submitter_lab || "") + ") " + fmtDate(r.created_at));
  if (url) lines.push(url);
  return lines.join("\n");
}

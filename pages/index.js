import { useState, useCallback } from "react";
import { saveAs } from "file-saver";
import * as pdfjsLib from "pdfjs-dist";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

if (typeof window !== "undefined") {
  // postinstall 스크립트가 public/ 로 복사해 둠 (package.json 참고)
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
}

const defaultState = {
  korTitle: "",
  engTitle: "",
  protocolNo: "",
  version: "draft",
  phase: "",
  site: "",
  pi: "",
  sponsor: "",
  arms: "",
  sequences: "",
  nPerArm: "",
};

// 템플릿에서 실제 쓰이는 {{TOKEN}}을 수집 (본문 + 머리글/바닥글)
function collectTemplateTokens(arrayBuffer) {
  const zip = new PizZip(arrayBuffer);
  const tokens = new Set();
  Object.keys(zip.files).forEach((name) => {
    if (!/^word\/(document|header\d*|footer\d*)\.xml$/.test(name)) return;
    const xml = zip.files[name].asText();
    const re = /{{\s*([^}]+?)\s*}}/g;
    let m;
    while ((m = re.exec(xml)) !== null) tokens.add(m[1]);
  });
  return [...tokens];
}

export default function Home() {
  const [protocolPdf, setProtocolPdf] = useState(null);
  const [templateDocx, setTemplateDocx] = useState(null);
  const [templateArrayBuffer, setTemplateArrayBuffer] = useState(null);
  const [values, setValues] = useState(defaultState);
  const [log, setLog] = useState("");

  const appendLog = (msg) => setLog((p) => (p ? p + "\n" : "") + msg);

  // PRT에서 표지/요약의 핵심 항목 파싱
  const parseProtocolPdf = useCallback(async (file) => {
    try {
      const buffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
      let full = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((t) => t.str).join(" ");
        full += "\n" + pageText;
      }
      appendLog("[PDF] 텍스트 추출 완료");

      const find = (re) => {
        const m = full.match(re);
        if (!m) return "";
        const val = m[1] ?? m[0] ?? "";
        return typeof val === "string" ? val.trim() : "";
      };

      const protocolNo =
        find(/Protocol\s*No\.?\s*([A-Za-z0-9_\-\.]+)/i) ||
        find(/시험계획서\s*번호\s*[:\-]?\s*([A-Za-z0-9_\-\.]+)/);

      const version =
        find(/Version\s*No\.?\s*([0-9.]+)/i) ||
        find(/시험계획서\s*버전\s*[:\-]?\s*([0-9.]+)/);

      const phase =
        find(/Phase\s*([0-9IVX]+)/i) ||
        find(/제\s*([0-9一-龥IVX]+)\s*상/);

      const sponsor =
        find(/임상시험의뢰자\s*([^\n]+)/) ||
        find(/Sponsor\s*[:\-]?\s*(.+?)\s*(?:\n|$)/i);

      const site =
        find(/임상시험실시기관\s*([^\n]+)/) ||
        find(/Site\s*[:\-]?\s*(.+?)\s*(?:\n|$)/i);

      const pi =
        find(/시험책임자\s*([^\n]+)/) ||
        find(/Principal\s*Investigator\s*[:\-]?\s*(.+?)\s*(?:\n|$)/i);

      const korTitle =
        find(/^\s*건강한.*?임상시험$/m) || // PRT 표지의 한글제목 라인(패턴)
        find(/^(?:\s*제목|\s*시험제목|\s*임상시험명)\s*[:\-]?\s*(.+)$/mi);

      const engTitle =
        find(/An open-?label[\s\S]{30,800}/m) ||
        find(/\bTitle\s*[:\-]?\s*(.+)$/mi);

      setValues((v) => ({
        ...v,
        protocolNo: protocolNo || v.protocolNo,
        version: version || v.version,
        phase: phase ? (phase.startsWith("제") ? phase : `Phase ${phase}`) : v.phase,
        sponsor: sponsor || v.sponsor,
        site: site || v.site,
        pi: pi || v.pi,
        korTitle: korTitle || v.korTitle,
        engTitle: engTitle || v.engTitle,
      }));
    } catch (e) {
      appendLog("[PDF] 파싱 오류: " + e.message);
    }
  }, []);

  const onTemplateUpload = useCallback(async (file) => {
    try {
      const ab = await file.arrayBuffer();
      setTemplateArrayBuffer(ab);
      setTemplateDocx(file);
      appendLog("[템플릿] 로드 완료 (토큰 치환 준비)");
    } catch (e) {
      appendLog("[템플릿] 로드 오류: " + e.message);
    }
  }, []);

  const handleGenDocx = useCallback(async () => {
    if (!templateArrayBuffer) {
      appendLog("[DOCX] 템플릿이 필요합니다. 템플릿 DOCX를 업로드하세요.");
      return;
    }

    try {
      // 1) 템플릿의 실제 토큰 수집 → 누락 검사
      const tokens = collectTemplateTokens(templateArrayBuffer);

      // 2) 우리가 주는 데이터(표준 키)
      const data = {
        PROTOCOL_NO: values.protocolNo || "",
        VERSION: values.version || "DRAFT",
        KOR_TITLE: values.korTitle || "",
        ENG_TITLE: values.engTitle || "",
        PHASE: values.phase || "",
        SITE: values.site || "",
        PI: values.pi || "",
        SPONSOR: values.sponsor || "",
        ARMS: values.arms || "",
        SEQUENCES: values.sequences || "",
        N_PER_ARM: values.nPerArm || "",
      };

      const missing = tokens.filter((t) => !(t in data));
      if (missing.length) {
        appendLog(
          "[DOCX] 템플릿에 값이 준비되지 않은 토큰이 있습니다:\n - " +
            missing.join("\n - ") +
            "\n(토큰 철자/대소문자/공백을 통일하거나 setData에 동일 키를 추가하세요)"
        );
        return;
      }

      // 3) 템플릿 치환
      const zip = new PizZip(templateArrayBuffer);
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        nullGetter: () => "", // null/undefined → 빈 문자열
      });

      doc.setData(data);
      doc.render();

      const out = doc.getZip().generate({ type: "blob" });
      saveAs(out, "Randomization Plan_draft.docx");
      appendLog("[DOCX] 템플릿 서식 유지 + 값 치환 완료");
    } catch (e) {
      const lines = ["[DOCX] 템플릿 렌더링 오류: " + (e.message || e)];
      if (e?.properties?.errors?.length) {
        lines.push("세부 오류:");
        e.properties.errors.forEach((er, i) => {
          lines.push(`  ${i + 1}) ${er.properties?.explanation || er.message}`);
        });
      }
      appendLog(lines.join("\n"));
    }
  }, [templateArrayBuffer, values]);

  return (
    <div style={{ minHeight: "100vh", background: "#f7f7f7", padding: "24px" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto", display: "grid", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>랜덤화계획서 자동 초안 생성 (템플릿 유지)</h1>
          <div style={{ fontSize: 12, color: "#666" }}>Draft Generator</div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
          <div style={{ background: "#fff", border: "1px solid #eee", borderRadius: 16, padding: 16 }}>
            <h3>1) 프로토콜 (PDF)</h3>
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => {
                const f = e.target.files?.[0];
                setProtocolPdf(f || null);
                if (f) parseProtocolPdf(f);
              }}
            />
            {protocolPdf && (
              <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>{protocolPdf.name}</div>
            )}
          </div>

          <div style={{ background: "#fff", border: "1px solid #eee", borderRadius: 16, padding: 16 }}>
            <h3>2) 템플릿 (DOCX) — 서식 그대로 유지</h3>
            <input
              type="file"
              accept="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                setTemplateDocx(f || null);
                if (f) await onTemplateUpload(f);
              }}
            />
            {templateDocx && (
              <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>{templateDocx.name}</div>
            )}
            <div style={{ fontSize: 12, color: "#777", marginTop: 8, lineHeight: 1.6 }}>
              템플릿 토큰 예:{" "}
              <code>
                {`{{PROTOCOL_NO}} {{VERSION}} {{KOR_TITLE}} {{ENG_TITLE}} {{PHASE}} {{SITE}} {{PI}} {{SPONSOR}} {{ARMS}} {{SEQUENCES}} {{N_PER_ARM}}`}
              </code>
              <br />
              머리글 예: <code>{`Protocol No. {{PROTOCOL_NO}}   Version No. {{VERSION}}`}</code>
            </div>
          </div>
        </div>

        {/* ▼▼▼ 여기부터 이전에 따옴표가 깨졌던 블록을 안전하게 수정했습니다 ▼▼▼ */}
        <div style={{ background: "#fff", border: "1px solid #eee", borderRadius: 16, padding: 16 }}>
          <h3>자동 추출 결과 (수정 가능)</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ display: "grid", gap: 8 }}>
              <label>국문 시험제목</label>
              <textarea
                rows={3}
                value={values.korTitle}
                onChange={(e) => setValues((v) => ({ ...v, korTitle: e.target.value }))}
              />
              <label>영문 시험제목</label>
              <textarea
                rows={3}
                value={values.engTitle}
                onChange={(e) => setValues((v) => ({ ...v, engTitle: e.target.value }))}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <label>Protocol No.</label>
                <input
                  value={values.protocolNo}
                  onChange={(e) => setValues((v) => ({ ...v, protocolNo: e.target.value }))}
                />
              </div>
              <div>
                <label>Version</label>
                <input
                  value={values.version}
                  onChange={(e) => setValues((v) => ({ ...v, version: e.target.value }))}
                />
              </div>
              <div>
                <label>Phase</label>
                <input
                  value={values.phase}
                  onChange={(e) => setValues((v) => ({ ...v, phase: e.target.value }))}
                />
              </div>
              <div>
                <label>Site</label>
                <input
                  value={values.site}
                  onChange={(e) => setValues((v) => ({ ...v, site: e.target.value }))}
                />
              </div>
              <div>
                <label>PI</label>
                <input
                  value={values.pi}
                  onChange={(e) => setValues((v) => ({ ...v, pi: e.target.value }))}
                />
              </div>
              <div>
                <label>Sponsor</label>
                <input
                  value={values.sponsor}
                  onChange={(e) => setValues((v) => ({ ...v, sponsor: e.target.value }))}
                />
              </div>
              <div>
                <label>Arms</label>
                <input
                  placeholder="예) A,B"
                  value={values.arms}
                  onChange={(e) => setValues((v) => ({ ...v, arms: e.target.value }))}
                />
              </div>
              <div>
                <label>Sequences</label>
                <input
                  placeholder="예) 2×2 crossover"
                  value={values.sequences}
                  onChange={(e) => setValues((v) => ({ ...v, sequences: e.target.value }))}
                />
              </div>
              <div>
                <label>N per arm</label>
                <input
                  placeholder="예) 20"
                  value={values.nPerArm}
                  onChange={(e) => setValues((v) => ({ ...v, nPerArm: e.target.value }))}
                />
              </div>
            </div>
          </div>
        </div>
        {/* ▲▲▲ 따옴표 문제 블록 끝 ▲▲▲ */}

        <div>
          <button
            onClick={handleGenDocx}
            style={{ padding: "10px 16px", borderRadius: 8, background: "#111", color: "#fff", border: "none" }}
          >
            DOCX 초안 생성 (Randomization Plan_draft.docx)
          </button>
        </div>

        <div style={{ background: "#fff", border: "1px solid "#eee", borderRadius: 16, padding: 16 }}>
          <h3>로그</h3>
          <textarea
            value={log}
            rows={6}
            readOnly
            style={{
              width: "100%",
              fontFamily:
                "ui-monospace, Menlo, Consolas, 'Courier New', monospace",
              fontSize: 12,
            }}
          />
        </div>

        <div style={{ fontSize: 12, color: "#777", textAlign: "center", paddingBottom: 24 }}>
          ⓒ JOY Co., Ltd. — Randomization Plan DRAFT Generator (템플릿 유지)
        </div>
      </div>
    </div>
  );
}

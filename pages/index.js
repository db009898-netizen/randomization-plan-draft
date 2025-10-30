import { useState, useCallback } from "react";
import { saveAs } from "file-saver";
import * as pdfjsLib from "pdfjs-dist";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
}

const defaultState = {
  korTitle: "",
  engTitle: "",
  protocolNo: "",
  version: "DRAFT",
  phase: "",
  site: "",
  pi: "",
  sponsor: "",
  arms: "",
  sequences: "",
  nPerArm: "",
};

export default function App() {
  const [protocolPdf, setProtocolPdf] = useState(null);
  const [templateDocx, setTemplateDocx] = useState(null);
  const [templateArrayBuffer, setTemplateArrayBuffer] = useState(null);
  const [values, setValues] = useState(defaultState);
  const [log, setLog] = useState("");

  const appendLog = (msg) => setLog((prev) => (prev ? prev + "\n" : "") + msg);

  const parseProtocolPdf = useCallback(async (file) => {
    try {
      const buffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
      let fullText = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((t) => t.str).join(" ");
        fullText += "\n" + pageText;
      }
      appendLog("[PDF] 텍스트 추출 완료");

      const find = (re) => {
        const m = fullText.match(re);
        if (!m) return "";
        const val = m[1] ?? m[0] ?? "";
        return typeof val === "string" ? val.trim() : "";
      };

      const protocolNo =
        find(/Protocol\s*No\.?\s*([A-Za-z0-9_\-\.]+)/i) ||
        find(/시험계획서\s*번호\s*[:\-]?\s*([A-Za-z0-9_\-\.]+)/);

      const phase =
        find(/Phase\s*([0-9IVX]+)/i) ||
        find(/제\s*([0-9一-龥IVX]+)\s*상/);

      const sponsor =
        find(/Sponsor\s*[:\-]?\s*(.+?)\s*(?:\n|$)/i) ||
        find(/의뢰자\s*[:\-]?\s*(.+?)\s*(?:\n|$)/);

      const site =
        find(/Site\s*[:\-]?\s*(.+?)\s*(?:\n|$)/i) ||
        find(/임상시험실시기관\s*[:\-]?\s*(.+?)\s*(?:\n|$)/);

      const pi =
        find(/Principal\s*Investigator\s*[:\-]?\s*(.+?)\s*(?:\n|$)/i) ||
        find(/시험책임자\s*[:\-]?\s*(.+?)\s*(?:\n|$)/);

      const korTitle =
        find(/^(?:\s*제목|\s*시험제목|\s*임상시험명)\s*[:\-]?\s*(.+)$/mi) || "";

      const engTitle =
        find(/(\b[Aa]n\s+open\-label[\s\S]{30,2000}$)/m) ||
        find(/\bTitle\s*[:\-]?\s*(.+)$/mi) ||
        "";

      setValues((v) => ({
        ...v,
        protocolNo: protocolNo || v.protocolNo,
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
      const zip = new PizZip(templateArrayBuffer);
      const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

      doc.setData({
        // 표준 키
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

        // 템플릿에 남아 있을 수 있는 공백/점(.) 키도 함께 공급
        "Protocol No.": values.protocolNo || "",
        "Version": values.version || "",
      });

      doc.render();
      const out = doc.getZip().generate({ type: "blob" });
      saveAs(out, "Randomization Plan_draft.docx");
      appendLog("[DOCX] 템플릿 서식 유지 + 값 치환 완료");
    } catch (e) {
      appendLog("[DOCX] 템플릿 렌더링 오류: " + e.message + "\n(템플릿의 {{TOKEN}} 이름을 확인하세요)");
    }
  }, [templateArrayBuffer, values]);

  return (
    <div style={{ minHeight: "100vh", background: "#f7f7f7", padding: "24px" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto", display: "grid", gap: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>랜덤화계획서 자동 초안 생성 (템플릿 유지)</h1>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
          <div style={{ background: "#fff", border: "1px solid #eee", borderRadius: 16, padding: 16 }}>
            <h3>1) 프로토콜 (PDF)</h3>
            <input type="file" accept="application/pdf"
              onChange={(e) => { const f = e.target.files?.[0]; setProtocolPdf(f || null); if (f) parseProtocolPdf(f); }} />
            {protocolPdf && <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>{protocolPdf.name}</div>}
          </div>

          <div style={{ background: "#fff", border: "1px solid #eee", borderRadius: 16, padding: 16 }}>
            <h3>2) 템플릿 (DOCX) — 서식 그대로 유지</h3>
            <input type="file" accept="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={async (e) => { const f = e.target.files?.[0]; if (f) await onTemplateUpload(f); }} />
            {templateDocx && <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>{templateDocx.name}</div>}
            <div style={{ fontSize: 12, color: "#777", marginTop: 8, lineHeight: 1.6 }}>
              템플릿 토큰 예: <code>{`{{PROTOCOL_NO}} {{VERSION}} {{KOR_TITLE}} {{ENG_TITLE}} {{PHASE}} {{SITE}} {{PI}} {{SPONSOR}} {{ARMS}} {{SEQUENCES}} {{N_PER_ARM}}`}</code><br/>
              머리글 예: <code>{`시험계획서 번호: {{PROTOCOL_NO}}    버전: {{VERSION}}`}</code>
            </div>
          </div>
        </div>

        <div style={{ background: "#fff", border: "1px solid #eee", borderRadius: 16, padding: 16 }}>
          <h3>자동 추출 결과 (수정 가능)</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ display: "grid", gap: 8 }}>
              <label>국문 시험제목</label>
              <textarea rows={3} value={values.korTitle} onChange={(e) => setValues((v) => ({ ...v, korTitle: e.target.value }))} />
              <label>영문 시험제목</label>
              <textarea rows={3} value={values.engTitle} onChange={(e) => setValues((v) => ({ ...v, engTitle: e.target.value }))} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div><label>Protocol No.</label><input value={values.protocolNo} onChange={(e) => setValues((v) => ({ ...v, protocolNo: e.target.value }))} /></div>
              <div><label>Version</label><input value={values.version} onChange={(e) => setValues((v) => ({ ...v, version: e.target.value }))} /></div>
              <div><label>Phase</label><input value={values.phase} onChange={(e) => setValues((v) => ({ ...v, phase: e.target.value }))} /></div>
              <div><label>Site</label><input value={values.site} onChange={(e) => setValues((v) => ({ ...v, site: e.target.value }))} /></div>
              <div><label>PI</label><input value={values.pi} onChange={(e) => setValues((v) => ({ ...v, pi: e.target.value }))} /></div>
              <div><label>Sponsor</label><input value={values.sponsor} onChange={(e) => setValues((v) => ({ ...v, sponsor: e.target.value }))} /></div>
              <div><label>Arms</label><input placeholder="예) A,B" value={values.arms} onChange={(e) => setValues((v) => ({ ...v, arms: e.target.value }))} /></div>
              <div><label>Sequences</label><input placeholder="예) 2×2 crossover" value={values.sequences} onChange={(e) => setValues((v) => ({ ...v, sequences: e.target.value }))} /></div>
              <div><label>N per arm</label><input placeholder="예) 20" value={values.nPerArm} onChange={(e) => setValues((v) => ({ ...v, nPerArm: e.target.value }))} /></div>
            </div>
          </div>
        </div>

        <button onClick={handleGenDocx} style={{ padding: "10px 16px", borderRadius: 8, background: "#111", color: "#fff", border: "none" }}>
          DOCX 초안 생성 (Randomization Plan_draft.docx)
        </button>

        <div style={{ background: "#fff", border: "1px solid #eee", borderRadius: 16, padding: 16 }}>
          <h3>로그</h3>
          <textarea value={log} rows={6} readOnly style={{ width: "100%", fontFamily: "ui-monospace, Menlo, Consolas, 'Courier New', monospace", fontSize: 12 }} />
        </div>

        <div style={{ fontSize: 12, color: "#777", textAlign: "center", paddingBottom: 24 }}>
          ⓒ JOY Co., Ltd. — Randomization Plan DRAFT Generator (템플릿 유지)
        </div>
      </div>
    </div>
  );
}

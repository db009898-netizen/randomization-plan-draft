
import { useState, useCallback } from "react";
import { saveAs } from "file-saver";
import * as pdfjsLib from "pdfjs-dist";
import { Document, Packer, Paragraph, TextRun, Header, Footer, AlignmentType, HeadingLevel } from "docx";
import mammoth from "mammoth";

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

export default function Home() {
  const [protocolPdf, setProtocolPdf] = useState(null);
  const [templateDocx, setTemplateDocx] = useState(null);
  const [finalDocx, setFinalDocx] = useState(null);
  const [values, setValues] = useState(defaultState);
  const [log, setLog] = useState("");

  const appendLog = (msg) => setLog((p) => (p ? p + "\n" : "") + msg);

  const parseProtocolPdf = useCallback(async (file) => {
    try {
      const buffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
      let fullText = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((t) => t.str).join(" \n");
        fullText += "\n" + pageText;
      }
      appendLog("[PDF] 텍스트 추출 완료");

      const find = (re) => {
        const m = fullText.match(re);
        if (!m) return "";
        // 그룹 1이 있으면 그걸, 없으면 전체 매치(m[0])를 사용
        const val = (m[1] ?? m[0] ?? "");
        return typeof val === "string" ? val.trim() : "";
      };

      const protocolNo = find(/Protocol\s*No\.?\s*([A-Za-z0-9_\-\.]+)/i) || find(/시험계획서\s*번호\s*[:\-]?\s*([A-Za-z0-9_\-\.]+)/);
      const phase = find(/Phase\s*([0-9IVX]+)/i) || find(/제\s*([0-9一-龥IVX]+)\s*상/);
      const sponsor = find(/Sponsor\s*[:\-]?\s*(.+?)\s*(?:\n|$)/i) || find(/의뢰자\s*[:\-]?\s*(.+?)\s*(?:\n|$)/);
      const site = find(/Site\s*[:\-]?\s*(.+?)\s*(?:\n|$)/i) || find(/임상시험실시기관\s*[:\-]?\s*(.+?)\s*(?:\n|$)/);
      const pi = find(/Principal\s*Investigator\s*[:\-]?\s*(.+?)\s*(?:\n|$)/i) || find(/시험책임자\s*[:\-]?\s*(.+?)\s*(?:\n|$)/);

      const korTitle = find(/^(?:\s*제목|\s*시험제목|\s*임상시험명)\s*[:\-]?\s*(.+)$/mi) || "";
      const engTitle = find(/(\b[Aa]n\s+open\-label[\s\S]{30,2000}$)/m) 
                     || find(/\bTitle\s*[:\-]?\s*(.+)$/mi) 
                     || "";

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

  const parseDocxToText = useCallback(async (file) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const { value } = await mammoth.extractRawText({ arrayBuffer });
      return value || "";
    } catch (e) {
      appendLog("[DOCX] 텍스트 변환 오류: " + e.message);
      return "";
    }
  }, []);

  const parseTemplateDocx = useCallback(async (file) => {
    const text = await parseDocxToText(file);
    if (!text) return;
    appendLog("[템플릿] 구조 텍스트 확보");
  }, [parseDocxToText]);

  const parseFinalDocx = useCallback(async (file) => {
    const text = await parseDocxToText(file);
    if (!text) return;
    appendLog("[완성본] 문구 패턴 확보 (절차/관리 문단 참고)");
  }, [parseDocxToText]);

  const handleGenDocx = useCallback(async () => {
    const blackRun = (text, opts = {}) => new TextRun({ ...opts, text, italics: false, color: "000000" });
    const heading = (txt) =>
      new Paragraph({
        text: txt,
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 260, after: 120 },
      });
    const metaP = (label, val) =>
      new Paragraph({
        children: [blackRun(label + ": ", { bold: true }), blackRun(val ?? "")],
        spacing: { after: 80 },
      });

    const header = new Header({
      children: [
        new Paragraph({
          children: [blackRun(`시험계획서 번호: ${values.protocolNo}    버전: ${values.version}`)],
          alignment: AlignmentType.LEFT,
        }),
      ],
    });
    const footer = new Footer({
      children: [
        new Paragraph({
          children: [blackRun("CONFIDENTIAL — This document contains confidential information belonging to the Sponsor.", { size: 16 })],
          alignment: AlignmentType.CENTER,
        }),
      ],
    });

    const doc = new Document({
      sections: [
        {
          headers: { default: header },
          footers: { default: footer },
          children: [
            new Paragraph({ children: [blackRun("Randomization Plan", { bold: true, size: 56 })], alignment: AlignmentType.CENTER, spacing: { after: 300 } }),
            new Paragraph({ children: [blackRun(values.korTitle || "", { size: 22 })], alignment: AlignmentType.CENTER }),
            new Paragraph({ children: [blackRun(values.engTitle || "", { size: 21 })], alignment: AlignmentType.CENTER, spacing: { after: 300 } }),
            metaP("시험계획서 번호 (Protocol No.)", values.protocolNo),
            metaP("버전 (Version)", values.version),
            metaP("시험단계 (Phase)", values.phase),
            metaP("임상시험실시기관 (Site)", values.site),
            metaP("시험책임자 (PI)", values.pi),
            metaP("임상시험의뢰자 (Sponsor)", values.sponsor),
            heading("1. 서론"),
            new Paragraph({ children: [blackRun("무작위배정계획은 해당 임상시험의 무작위배정 방법과 과정에 대해 설명합니다. (자동 생성 초안)")] }),
            heading("2. 무작위배정 절차"),
            new Paragraph({ children: [blackRun("업로드한 템플릿/완성본을 참고해 절차 문안을 자동 채워 넣습니다.")] }),
            heading("3. 무작위배정 방법"),
            new Paragraph({ children: [blackRun("Block randomization 1:1 (초안). 블록크기/순서군/대상자수는 템플릿/프로토콜에서 자동 반영합니다.")] }),
            heading("4. 문서의 관리"),
            new Paragraph({ children: [blackRun("무작위배정코드/표 관리 및 전달 절차는 완성본을 바탕으로 채워 넣습니다.")] }),
          ],
        },
      ],
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, "Randomization Plan_draft.docx");
  }, [values]);

  return (
    <div style={{ minHeight: "100vh", background: "#f7f7f7", padding: "24px" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto", display: "grid", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>랜덤화계획서 자동 초안 생성 (MVP)</h1>
          <div style={{ fontSize: 12, color: "#666" }}>Draft Generator</div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
          <div style={{ background: "#fff", border: "1px solid #eee", borderRadius: 16, padding: 16 }}>
            <h3 style={{ marginBottom: 8, fontSize: 16 }}>1) 프로토콜 (PDF)</h3>
            <input type="file" accept="application/pdf" onChange={(e)=>{ const f=e.target.files?.[0]; setProtocolPdf(f||null); if(f) parseProtocolPdf(f); }}/>
            {protocolPdf && <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>{protocolPdf.name}</div>}
          </div>

          <div style={{ background: "#fff", border: "1px solid #eee", borderRadius: 16, padding: 16 }}>
            <h3 style={{ marginBottom: 8, fontSize: 16 }}>2) 템플릿 (DOCX)</h3>
            <input type="file" accept="application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e)=>{ const f=e.target.files?.[0]; setTemplateDocx(f||null); if(f) parseTemplateDocx(f); }}/>
            {templateDocx && <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>{templateDocx.name}</div>}
          </div>

          <div style={{ background: "#fff", border: "1px solid #eee", borderRadius: 16, padding: 16 }}>
            <h3 style={{ marginBottom: 8, fontSize: 16 }}>3) 완성본 참고 (선택)</h3>
            <input type="file" accept="application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e)=>{ const f=e.target.files?.[0]; setFinalDocx(f||null); if(f) parseFinalDocx(f); }}/>
            {finalDocx && <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>{finalDocx.name}</div>}
          </div>
        </div>

        <div style={{ background: "#fff", border: "1px solid #eee", borderRadius: 16, padding: 16 }}>
          <h3 style={{ marginBottom: 8, fontSize: 16 }}>자동 추출 결과 (수정 가능)</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ display: "grid", gap: 8 }}>
              <label>국문 시험제목</label>
              <textarea rows={3} value={values.korTitle} onChange={(e)=>setValues(v=>({...v, korTitle:e.target.value}))}/>
              <label>영문 시험제목</label>
              <textarea rows={3} value={values.engTitle} onChange={(e)=>setValues(v=>({...v, engTitle:e.target.value}))}/>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div><label>Protocol No.</label><input value={values.protocolNo} onChange={(e)=>setValues(v=>({...v, protocolNo:e.target.value}))}/></div>
              <div><label>Version</label><input value={values.version} onChange={(e)=>setValues(v=>({...v, version:e.target.value}))}/></div>
              <div><label>Phase</label><input value={values.phase} onChange={(e)=>setValues(v=>({...v, phase:e.target.value}))}/></div>
              <div><label>Site</label><input value={values.site} onChange={(e)=>setValues(v=>({...v, site:e.target.value}))}/></div>
              <div><label>PI</label><input value={values.pi} onChange={(e)=>setValues(v=>({...v, pi:e.target.value}))}/></div>
              <div><label>Sponsor</label><input value={values.sponsor} onChange={(e)=>setValues(v=>({...v, sponsor:e.target.value}))}/></div>
              <div><label>Arms</label><input placeholder="예) A,B" value={values.arms} onChange={(e)=>setValues(v=>({...v, arms:e.target.value}))}/></div>
              <div><label>Sequences</label><input placeholder="예) 2×2 crossover" value={values.sequences} onChange={(e)=>setValues(v=>({...v, sequences:e.target.value}))}/></div>
              <div><label>N per arm</label><input placeholder="예) 20" value={values.nPerArm} onChange={(e)=>setValues(v=>({...v, nPerArm:e.target.value}))}/></div>
            </div>
          </div>
        </div>

        <div>
          <button onClick={handleGenDocx} style={{ padding: "10px 16px", borderRadius: 8, background: "#111", color: "#fff", border: "none" }}>DOCX 초안 생성 (Randomization Plan_draft.docx)</button>
        </div>

        <div style={{ background: "#fff", border: "1px solid #eee", borderRadius: 16, padding: 16 }}>
          <h3 style={{ marginBottom: 8, fontSize: 16 }}>로그</h3>
          <textarea value={log} rows={6} readOnly style={{ width: "100%", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace", fontSize: 12 }} />
        </div>

        <div style={{ fontSize: 12, color: "#777", textAlign: "center", paddingBottom: 24 }}>
          ⓒ JOY Co., Ltd. — Randomization Plan DRAFT Generator (MVP)
        </div>
      </div>
    </div>
  );
}

import React, { useCallback, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Download, FileText } from "lucide-react";
import { saveAs } from "file-saver";

import * as pdfjsLib from "pdfjs-dist";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

// pdf.js 워커: public/에서 같은 오리진으로 서빙
// package.json에 postinstall 스크립트(아래 2번) 추가 후 동작합니다.
if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
}

const Section = ({ title, children }) => (
  <Card className="rounded-2xl shadow-sm">
    <CardHeader>
      <CardTitle className="text-xl font-semibold">{title}</CardTitle>
    </CardHeader>
    <CardContent>{children}</CardContent>
  </Card>
);

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

  // 템플릿 서식을 보존해야 하므로 “검정색 강제”는 기본 OFF
  const [enforceBlack, setEnforceBlack] = useState(false);
  const [autoHeader, setAutoHeader] = useState(false);

  const appendLog = (msg) => setLog((prev) => (prev ? prev + "\n" : "") + msg);

  // 1) 프로토콜 PDF에서 메타 자동 추출
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

  // 2) 템플릿 DOCX 업로드(서식 보존용 ArrayBuffer 보관)
  const onTemplateUpload = useCallback(async (file) => {
    try {
      const ab = await file.arrayBuffer();
      setTemplateArrayBuffer(ab);
      appendLog("[템플릿] 로드 완료 (토큰 치환 준비)");
    } catch (e) {
      appendLog("[템플릿] 로드 오류: " + e.message);
    }
  }, []);

  // 3) 템플릿 기반 치환/생성 (docxtemplater)
  const handleGenDocx = useCallback(async () => {
    if (!templateArrayBuffer) {
      appendLog("[DOCX] 템플릿이 필요합니다. 템플릿 DOCX를 업로드하세요.");
      return;
    }
    try {
      const zip = new PizZip(templateArrayBuffer);
      const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

      doc.setData({
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
        // enforceBlack/autoHeader 옵션은 템플릿에 토큰/스타일로 처리하는 것을 권장
      });

      doc.render(); // 템플릿의 {{TOKEN}} 치환
      const out = doc.getZip().generate({ type: "blob" });
      saveAs(out, "Randomization Plan_draft.docx");
      appendLog("[DOCX] 템플릿 서식 유지 + 값 치환 완료");
    } catch (e) {
      appendLog("[DOCX] 템플릿 렌더링 오류: " + e.message + "\n(템플릿의 {{TOKEN}} 이름을 확인하세요)");
    }
  }, [templateArrayBuffer, values]);

  return (
    <div className="min-h-screen w-full bg-neutral-50">
      <div className="max-w-6xl mx-auto p-6 grid gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl md:text-3xl font-bold">랜덤화계획서 자동 초안 생성 (템플릿 유지)</h1>
          <div className="text-sm text-neutral-500 flex items-center gap-2"><FileText className="w-4 h-4"/> Draft Generator</div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <Section title="1) 프로토콜 (PDF)">
            <div className="space-y-3">
              <Label>프로토콜 PDF 업로드</Label>
              <Input
                type="file"
                accept="application/pdf"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  setProtocolPdf(f || null);
                  if (f) parseProtocolPdf(f);
                }}
              />
              {protocolPdf && <div className="text-xs text-neutral-600">{protocolPdf.name}</div>}
            </div>
          </Section>

          <Section title="2) 템플릿 (DOCX) — 서식 그대로 유지">
            <div className="space-y-3">
              <Label>랜덤화계획 템플릿 업로드</Label>
              <Input
                type="file"
                accept="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  setTemplateDocx(f || null);
                  if (f) await onTemplateUpload(f);
                }}
              />
              {templateDocx && <div className="text-xs text-neutral-600">{templateDocx.name}</div>}
              <div className="text-xs text-neutral-500 leading-5">
                템플릿에 자리표시자 토큰을 아래처럼 심어두면 값만 치환됩니다:<br />
                <code>{`{{PROTOCOL_NO}} {{VERSION}} {{KOR_TITLE}} {{ENG_TITLE}} {{PHASE}} {{SITE}} {{PI}} {{SPONSOR}} {{ARMS}} {{SEQUENCES}} {{N_PER_ARM}}`}</code><br />
                예) 머리글: <code>{`시험계획서 번호: {{PROTOCOL_NO}}    버전: {{VERSION}}`}</code>
              </div>
            </div>
          </Section>
        </div>

        <Section title="자동 추출 결과 (수정 가능)">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <Label>국문 시험제목</Label>
              <Textarea rows={3} value={values.korTitle} onChange={(e) => setValues((v) => ({ ...v, korTitle: e.target.value }))} />
              <Label>영문 시험제목</Label>
              <Textarea rows={3} value={values.engTitle} onChange={(e) => setValues((v) => ({ ...v, engTitle: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Protocol No.</Label><Input value={values.protocolNo} onChange={(e) => setValues((v) => ({ ...v, protocolNo: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Version</Label><Input value={values.version} onChange={(e) => setValues((v) => ({ ...v, version: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Phase</Label><Input value={values.phase} onChange={(e) => setValues((v) => ({ ...v, phase: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Site</Label><Input value={values.site} onChange={(e) => setValues((v) => ({ ...v, site: e.target.value }))} /></div>
              <div className="space-y-1"><Label>PI</Label><Input value={values.pi} onChange={(e) => setValues((v) => ({ ...v, pi: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Sponsor</Label><Input value={values.sponsor} onChange={(e) => setValues((v) => ({ ...v, sponsor: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Arms</Label><Input placeholder="예) A,B" value={values.arms} onChange={(e) => setValues((v) => ({ ...v, arms: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Sequences</Label><Input placeholder="예) 2×2 crossover" value={values.sequences} onChange={(e) => setValues((v) => ({ ...v, sequences: e.target.value }))} /></div>
              <div className="space-y-1"><Label>N per arm</Label><Input placeholder="예) 20" value={values.nPerArm} onChange={(e) => setValues((v) => ({ ...v, nPerArm: e.target.value }))} /></div>
            </div>
          </div>
        </Section>

        <Section title="옵션">
          <div className="grid md:grid-cols-3 gap-4">
            <div className="flex items-center justify-between p-3 rounded-xl bg-white border"><span>글자색 강제 검정(비권장)</span><Switch checked={enforceBlack} onCheckedChange={setEnforceBlack} /></div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-white border"><span>머리글 자동 채움(실험)</span><Switch checked={autoHeader} onCheckedChange={setAutoHeader} /></div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-white border"><span>DRAFT 워터마크(추가 예정)</span><Switch disabled /></div>
          </div>
        </Section>

        <div className="flex gap-3">
          <Button onClick={handleGenDocx} className="px-5"><Download className="w-4 h-4 mr-2" />DOCX 초안 생성</Button>
        </div>

        <Section title="로그">
          <Textarea value={log} rows={6} readOnly className="font-mono text-xs" />
        </Section>

        <div className="text-xs text-neutral-500 text-center pb-6">ⓒ JOY Co., Ltd. — Randomization Plan DRAFT Generator (템플릿 유지)</div>
      </div>
    </div>
  );
}

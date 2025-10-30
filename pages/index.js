import React, { useCallback, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Download, FileText, Upload } from "lucide-react";
import { saveAs } from "file-saver";


// NPM libs available in this environment per instructions
import * as pdfjsLib from "pdfjs-dist";
import mammoth from "mammoth"; // DOCX -> text
import { Document, Packer, Paragraph, TextRun, Header, Footer, AlignmentType, HeadingLevel, PageNumber, TabStopType, TabStopPosition } from "docx";


pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/4.2.67/pdf.worker.min.js`;


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
const [finalDocx, setFinalDocx] = useState(null);
const [values, setValues] = useState(defaultState);
const [log, setLog] = useState("");


const [enforceBlack, setEnforceBlack] = useState(true);
const [removeItalic, setRemoveItalic] = useState(true);
const [autoHeader, setAutoHeader] = useState(true);
const [draftWatermark, setDraftWatermark] = useState(false);


const appendLog = (msg) => setLog((prev) => `${prev}\n${msg}`);


const parseProtocolPdf = useCallback(async (file) => {
try {
const buffer = await file.arrayBuffer();
const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
let fullText = "";
for (let i = 1; i <= pdf.numPages; i++) {
const page = await pdf.getPage(i);
const textContent = await page.getTextContent();
const pageText = textContent.items.map((t) => t.str).join(" \n");
fullText += `\n${pageText}`;
}
appendLog("[PDF] 텍스트 추출 완료");


// crude regex helpers
const find = (re) => {
const m = fullText.match(re);
return m ? m[1].trim() : "";
};


const protocolNo = find(/Protocol\s*No\.?\s*([A-Za-z0-9_\-\.]+)/i) || find(/시험계획서\s*번호\s*[:\-]?\s*([A-Za-z0-9_\-\.]+)/);
const phase = find(/Phase\s*([0-9IVX]+)/i) || find(/제\s*([0-9一-龥IVX]+)\s*상/);
const sponsor = find(/Sponsor\s*[:\-]?\s*(.+?)\s*(?:\n|$)/i) || find(/의뢰자\s*[:\-]?\s*(.+?)\s*(?:\n|$)/);
const site = find(/Site\s*[:\-]?\s*(.+?)\s*(?:\n|$)/i) || find(/임상시험실시기관\s*[:\-]?\s*(.+?)\s*(?:\n|$)/);
const pi = find(/Principal\s*Investigator\s*[:\-]?\s*(.+?)\s*(?:\n|$)/i) || find(/시험책임자\s*[:\-]?\s*(.+?)\s*(?:\n|$)/);


// Titles (KOR/ENG) – try multiple cues
const korTitle = find(/^(?:\s*제목|\s*시험제목|\s*임상시험명)\s*[:\-]?\s*(.+)$/mi) || find(/\n(.{20,})\n.*?임상시험/mi);
const engTitle = find(/\b[Aa]n\s+open\-label[\s\S]{30,2000}$/m) || find(/\bTitle\s*[:\-]?\s*(.+)$/mi);


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
appendLog(`[PDF] 파싱 오류: ${e.message}`);
}
}, []);


const parseDocxToText = useCallback(async (file) => {
try {
const arrayBuffer = await file.arrayBuffer();
const { value } = await mammoth.extractRawText({ arrayBuffer });
return value || "";
} catch (e) {
appendLog(`[DOCX] 텍스트 변환 오류: ${e.message}`);
return "";
}
}, []);


const parseTemplateDocx = useCallback(async (file) => {
const text = await parseDocxToText(file);
if (!text) return;
appendLog("[템플릿] 구조 텍스트 확보");
// 자리표시자 토큰 자동 제안
// 사용자가 템플릿을 그대로 쓰는 경우를 가정해, 존재하지 않으면 내부적으로 치환
}, [parseDocxToText]);


const parseFinalDocx = useCallback(async (file) => {
const text = await parseDocxToText(file);

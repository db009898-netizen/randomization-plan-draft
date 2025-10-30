import React, { useCallback, useMemo, useRef, useState } from "react";
],
alignment: AlignmentType.CENTER,
}),
],
});


const titlePara = new Paragraph({
children: [blackRun("Randomization Plan", { bold: true, size: 56 })],
alignment: AlignmentType.CENTER,
spacing: { after: 300 },
});


const korTitleP = new Paragraph({ children: [blackRun(values.korTitle || "", { size: 22 })], alignment: AlignmentType.CENTER });
const engTitleP = new Paragraph({ children: [blackRun(values.engTitle || "", { size: 21 })], alignment: AlignmentType.CENTER, spacing: { after: 300 } });


const doc = new Document({
sections: [
{
headers: header ? { default: header } : undefined,
footers: { default: footer },
children: [
titlePara,
korTitleP,
engTitleP,
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
saveAs(blob, `Randomization_Plan_DRAFT_${values.protocolNo || "UNKNOWN"}.docx`);
}, [values, autoHeader, enforceBlack]);


return (
<div className="min-h-screen w-full bg-neutral-50">
<div className="max-w-6xl mx-auto p-6 grid gap-6">
<div className="flex items-center justify-between">
<h1 className="text-2xl md:text-3xl font-bold">랜덤화계획서 자동 초안 생성 (MVP)</h1>
<div className="text-sm text-neutral-500 flex items-center gap-2"><FileText className="w-4 h-4"/> Draft Generator</div>
</div>


<div className="grid md:grid-cols-3 gap-6">
<Section title="1) 프로토콜 (PDF)">
<div className="space-y-3">
<Label>프로토콜 PDF 업로드</Label>
<Input type="file" accept="application/pdf" onChange={(e)=>{ const f=e.target.files?.[0]; setProtocolPdf(f||null); if(f) parseProtocolPdf(f); }}/>
{protocolPdf && <div className="text-xs text-neutral-600">{protocolPdf.name}</div>}
</div>
</Section>


<Section title="2) 템플릿 (DOCX)">
<div className="space-y-3">
<Label>랜덤화계획 템플릿 업로드</Label>
<Input type="file" accept="application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e)=>{ const f=e.target.files?.[0]; setTemplateDocx(f||null); if(f) parseTemplateDocx(f); }}/>
{templateDocx && <div className="text-xs text-neutral-600">{templateDocx.name}</div>}
</div>
</Section>


<Section title="3) 완성본 참고 (선택)">
<div className="space-y-3">
<Label>완성본 DOCX 업로드</Label>
<Input type="file" accept="application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e)=>{ const f=e.target.files?.[0]; setFinalDocx(f||null); if(f) parseFinalDocx(f); }}/>
{finalDocx && <div className="text-xs text-neutral-600">{finalDocx.name}</div>}
</div>
</Section>
</div>


<Section title="자동 추출 결과 (수정 가능)">
<div className="grid md:grid-cols-2 gap-4">
<div className="space-y-3">
<Label>국문 시험제목</Label>
<Textarea rows={3} value={values.korTitle} onChange={(e)=>setValues(v=>({...v, korTitle:e.target.value}))}/>
<Label>영문 시험제목</Label>
<Textarea rows={3} value={values.engTitle} onChange={(e)=>setValues(v=>({...v, engTitle:e.target.value}))}/>
</div>
<div className="grid grid-cols-2 gap-3">
<div className="space-y-1"><Label>Protocol No.</Label><Input value={values.protocolNo} onChange={(e)=>setValues(v=>({...v, protocolNo:e.target.value}))}/></div>
<div className="space-y-1"><Label>Version</Label><Input value={values.version} onChange={(e)=>setValues(v=>({...v, version:e.target.value}))}/></div>
<div className="space-y-1"><Label>Phase</Label><Input value={values.phase} onChange={(e)=>setValues(v=>({...v, phase:e.target.value}))}/></div>
<div className="space-y-1"><Label>Site</Label><Input value={values.site} onChange={(e)=>setValues(v=>({...v, site:e.target.value}))}/></div>
<div className="space-y-1"><Label>PI</Label><Input value={values.pi} onChange={(e)=>setValues(v=>({...v, pi:e.target.value}))}/></div>
<div className="space-y-1"><Label>Sponsor</Label><Input value={values.sponsor} onChange={(e)=>setValues(v=>({...v, sponsor:e.target.value}))}/></div>
<div className="space-y-1"><Label>Arms</Label><Input placeholder="예) A,B" value={values.arms} onChange={(e)=>setValues(v=>({...v, arms:e.target.value}))}/></div>
<div className="space-y-1"><Label>Sequences</Label><Input placeholder="예) 2×2 crossover" value={values.sequences} onChange={(e)=>setValues(v=>({...v, sequences:e.target.value}))}/></div>
<div className="space-y-1"><Label>N per arm</Label><Input placeholder="예) 20" value={values.nPerArm} onChange={(e)=>setValues(v=>({...v, nPerArm:e.target.value}))}/></div>
</div>
</div>
</Section>


<Section title="옵션">
<div className="grid md:grid-cols-4 gap-4">
<div className="flex items-center justify-between p-3 rounded-xl bg-white border"><span>기울임 제거</span><Switch checked={removeItalic} onCheckedChange={setRemoveItalic}/></div>
<div className="flex items-center justify-between p-3 rounded-xl bg-white border"><span>글자색 강제 검정</span><Switch checked={enforceBlack} onCheckedChange={setEnforceBlack}/></div>
<div className="flex items-center justify-between p-3 rounded-xl bg-white border"><span>머리글 자동 채움</span><Switch checked={autoHeader} onCheckedChange={setAutoHeader}/></div>
<div className="flex items-center justify-between p-3 rounded-xl bg-white border"><span>DRAFT 워터마크(차후)</span><Switch checked={draftWatermark} onCheckedChange={setDraftWatermark} disabled/></div>
</div>
</Section>


<div className="flex gap-3">
<Button onClick={handleGenDocx} className="px-5"><Download className="w-4 h-4 mr-2"/>DOCX 초안 생성</Button>
</div>


<Section title="로그">
<Textarea value={log} rows={6} readOnly className="font-mono text-xs"/>
</Section>


<div className="text-xs text-neutral-500 text-center pb-6">ⓒ JOY Co., Ltd. — Randomization Plan DRAFT Generator (MVP)</div>
</div>
</div>
);
}

# Randomization Plan DRAFT Generator (MVP)

브라우저에서 프로토콜/템플릿/완성본을 업로드하고, 자동 추출된 값으로 **Randomization Plan_draft.docx** 를 생성합니다.

## 로컬 실행
```bash
npm i
npm run dev
# http://localhost:3000
```

## Vercel 배포
1. 새 Git 리포지토리로 이 폴더 전체를 푸시
2. [Vercel](https://vercel.com)에서 New Project → Git 연결
3. Framework: **Next.js**, Build Command: `next build`, Output: `.vercel/output` 기본값
4. Deploy 하면 URL이 생성됩니다.

## 주요 라이브러리
- pdfjs-dist: 프로토콜 PDF 텍스트 추출
- mammoth: DOCX → 텍스트
- docx: 최종 DOCX 생성 (머리글: `시험계획서 번호: <...>    버전: <...>`, 본문은 기울임 제외, 글자색 검정)
- file-saver: 브라우저 다운로드

> 파일명은 요청대로 **Randomization Plan_draft.docx** 로 고정 저장됩니다.

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Vercel 배포에 안전한 기본값
  swcMinify: true,
  output: 'standalone',

  // (선택) ESLint/TS 사용 안 할 때 빌드 막히지 않게
  // 필요 없으면 두 줄 삭제해도 됩니다.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },

  // pdf.worker.min.mjs는 /public에서 그대로 정적 제공되므로 별도 rewrites 불필요
  // webpack 커스터마이즈도 필요 없음
};

module.exports = nextConfig;

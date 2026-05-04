/** @type {import('next').NextConfig} */
const nextConfig = {
  // 讓 pdf-parse 使用 CJS（避免 Turbopack 選到沒有 default export 的 ESM 版）
  serverExternalPackages: ['pdf-parse'],
  // Vercel 部署相容設定
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb', // 支援較大的 PDF 上傳
    },
  },
};

module.exports = nextConfig;

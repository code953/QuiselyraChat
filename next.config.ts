import type { NextConfig } from "next";

/**
 * 全站安全响应头。JWT 存放在 localStorage，因此把 XSS 面积压到最小尤为重要。
 * 上传文件路由 (/api/uploads/*) 自带更严格的 CSP，会覆盖此处的默认值。
 */
const securityHeaders = [
  // 禁止被嵌入其它站点的 frame，避免点击劫持
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  {
    // Next.js 运行时需要 inline script/style；img 放开 data: 以支持 base64 预览，
    // connect-src 放开 https 以便在浏览器侧直接访问服务商（当前仅服务端调用）。
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  devIndicators: false,
  outputFileTracingIncludes: {
    "/*": ["./drizzle/**/*"],
  },
  // 注意：不要启用 compiler.removeConsole —— 首次启动的初始访问密码依赖
  // console.log 输出到启动日志（见 src/lib/secrets.ts）。
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

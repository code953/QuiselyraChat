# QuiselyraChat

QuiselyraChat 是一个面向个人自托管的轻量 AI 聊天客户端，支持多模型服务商接入、图片生成、联网搜索、文件附件和对话分享。

## 功能概览

### 聊天与对话
- 多轮流式对话（SSE），支持 Markdown / 代码高亮 / LaTeX 渲染
- 文件附件：拖拽、粘贴或点击上传图片和文本文件，Vision 模型自动识图
- OCR 降级：聊天模型不支持识图时，自动调用 OCR 模型提取图片内容
- 上下文窗口管理：自动截断历史消息（保留 system prompt + 最近 N 轮）
- 模型 Fallback：主模型 429/503/超时时自动切换备选模型
- 联网搜索：支持智谱、Grok、OpenAI、Claude、Gemini、Perplexity 原生搜索，以及 Tavily/Bing/SearXNG 通用搜索
- 对话分享：生成只读链接，可设置过期时间

### 模型管理
- 多服务商配置：OpenAI、Anthropic、Google、xAI、DeepSeek、Moonshot、智谱、OpenRouter、Ollama、自定义
- 远程模型列表拉取（`/v1/models`）+ 手动添加
- 模型能力测试（文本聊天、Vision、Function Calling）
- API Key AES-256-GCM 加密存储

### 图片生成
- 文生图（DALL·E、Stable Diffusion、Flux、即梦等 OpenAI 兼容接口）
- 图生图：上传参考图片进行风格迁移
- 生成画廊：历史记录、下载、删除

### 人格系统
- 5 个内置人格 + 自定义人格
- 系统提示词、推荐模型、开场白

### 其他
- 会话管理：文件夹、置顶、归档、标题自动生成
- Token 用量与费用追踪
- 数据导出 (JSON) / 导入合并（冲突安全）
- 主题切换（深色 / 浅色）
- Docker 单容器部署

## 技术栈

- **框架**：Next.js 16 App Router、React 19、TypeScript 5
- **样式**：Tailwind CSS 4、Radix UI、shadcn/ui 风格组件
- **状态**：Zustand
- **数据库**：SQLite (libSQL) + Drizzle ORM
- **LLM 调用**：OpenAI SDK（`openai` 包）统一适配所有服务商
- **文件存储**：本地磁盘 `./data/uploads/`

## 快速开始

### 本地开发

```bash
npm install
npm run dev
```

首次启动时，系统会自动生成访问密码、JWT 密钥与加密密钥，并持久化到数据库。**初始访问密码会打印在启动日志中**：

```
========================================================
  QuiselyraChat 首次启动：已自动生成初始访问密码
  初始密码: Ab3x9Kd2Qz7...
  请妥善保存。登录后可在「设置 - 通用」中修改密码。
========================================================
```

访问 http://localhost:3000 ，使用日志中打印的初始密码登录。

> Windows 下 `npm run dev` 默认使用 Webpack 以避免 Turbopack 的 `@libsql` junction 问题。如需验证 Turbopack，使用 `npm run dev:turbo`。

### Docker 部署

```bash
docker compose up -d --build
```

首次启动后用 `docker compose logs` 查看初始密码。容器将 `./data` 挂载到 `/app/data`（数据库 + 上传文件）。

也可以直接使用 Docker：

```bash
docker build -t quiselyrachat:local .
docker run -d --name quiselyrachat -p 3000:3000 -v ./data:/app/data quiselyrachat:local
```

## 环境变量

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | 否 | SQLite/libSQL 地址，默认 `file:./data/app.db` |

> 访问密码、JWT 密钥、加密密钥均自动生成并持久化在数据库 `settings` 表中，无需手动配置。

## 常用命令

```bash
npm run dev          # 开发服务器 (Webpack)
npm run dev:turbo    # 开发服务器 (Turbopack)
npm run build        # 生产构建 (standalone)
npm run start        # 启动生产服务
npm run lint         # ESLint 检查
npx tsc --noEmit     # TypeScript 类型检查
npx drizzle-kit generate   # 生成数据库迁移
npx drizzle-kit migrate    # 执行迁移
npx drizzle-kit push       # 直接推送 schema (仅开发)
```

## 部署注意事项

- 密钥保存在 `./data` 下的数据库里。**该目录丢失后，已保存的 API Key 无法解密**，登录 token 也会失效，务必备份。
- 建议配置 HTTPS 反向代理（Caddy / Nginx / Cloudflare Access）。
- 模型服务商 API Key 在登录后的设置页添加。
- 定期备份 `./data` 目录。

## 项目结构

```
src/
├── app/
│   ├── (chat)/          # 主聊天页面
│   ├── images/          # 图片生成页面
│   ├── settings/        # 设置页面
│   ├── share/           # 分享页面
│   ├── login/           # 登录页面
│   └── api/             # API 路由
│       ├── chat/        # 聊天 (SSE 流式)
│       ├── upload/      # 文件上传
│       ├── uploads/     # 文件服务
│       ├── images/      # 图片生成
│       ├── conversations/
│       ├── models/
│       ├── model-configs/
│       ├── personas/
│       ├── search-configs/
│       ├── shares/
│       ├── settings/    # OCR模型、摘要模型、密码等
│       └── ...
├── components/          # UI 组件
├── db/                  # Drizzle schema + seed
├── lib/                 # 服务端工具库
└── stores/              # Zustand 状态管理
```

## License

MIT

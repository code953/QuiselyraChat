该项目完全由AI编写，且作者因学业原因，不能经常维护，敬请谅解

# NekoraChat

NekoraChat 是一个面向个人自托管的轻量 AI 聊天客户端。当前代码对应 M1 阶段，重点覆盖单用户访问、多服务商配置、模型列表拉取、模型能力测试、人格预设、会话管理、上下文窗口管理与 Docker 部署基础能力。

## 功能状态

- 单一访问密码登录，登录后使用 JWT 访问受保护 API。
- SQLite/libSQL 服务端持久化会话、消息、文件夹、人格、模型服务商、模型库与用量记录。
- 支持 OpenAI 兼容服务商配置，包括 Base URL、API Key 加密存储和远程模型拉取。
- 支持将远程模型加入本地模型库，并进行基础文本、Vision、Tools 能力测试。
- 支持人格预设、自定义人格、会话文件夹、置顶、归档与流式聊天。

## 技术栈

- Next.js 16 App Router、React 19、TypeScript
- Tailwind CSS 4、Radix UI、shadcn/ui 风格组件
- Zustand 状态管理
- Drizzle ORM、@libsql/client、SQLite
- OpenAI SDK 兼容多服务商调用

## 本地开发

复制环境变量模板并填写密钥：

```bash
cp .env.example .env.local
```

生成 64 位十六进制加密密钥：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

安装依赖并启动开发服务：

```bash
npm install
npm run dev
```

访问 http://localhost:3000，使用 `ACCESS_PASSWORD` 登录。数据库默认写入 `./data/app.db`。

Windows 下 `npm run dev` 默认使用 Webpack，这是为了避开 Next.js 16 Turbopack 在 `.next/dev/node_modules/@libsql` 创建 junction 时可能出现的 `os error 145`。如果需要主动验证 Turbopack，可运行：

```bash
npm run dev:turbo
```

## 环境变量

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `ACCESS_PASSWORD` | 是 | 站点访问密码 |
| `JWT_SECRET` | 是 | JWT 签名密钥，建议使用 32 字符以上随机字符串 |
| `ENCRYPTION_KEY` | 是 | API Key 加密主密钥，必须是 32 字节/64 位十六进制字符串 |
| `DATABASE_URL` | 否 | SQLite/libSQL 地址，默认 `file:./data/app.db` |
| `OPENAI_API_KEY` | 否 | 可选标题生成接口使用的 OpenAI 兼容 Key，留空则使用首条用户消息生成标题 |
| `OPENAI_BASE_URL` | 否 | 可选标题生成接口 Base URL，留空使用 SDK 默认值 |
| `OPENAI_MODEL` | 否 | 可选标题生成模型，留空时不调用标题模型 |

## Docker 部署

先准备 `.env` 文件：

```bash
cp .env.example .env
```

构建并启动：

```bash
docker compose up -d --build
```

访问 http://localhost:3000。容器会将 `./data` 挂载到 `/app/data`，用于保存 SQLite 数据库和后续上传文件。

也可以直接使用 Docker：

```bash
docker build -t nekorachat:local .
docker run -d --name nekorachat -p 3000:3000 -v ./data:/app/data --env-file .env nekorachat:local
```

## 常用命令

```bash
npm run dev
npm run dev:turbo
npm run lint
npx tsc --noEmit
npm run build
```

## 部署注意事项

- 生产环境必须替换 `ACCESS_PASSWORD`、`JWT_SECRET` 和 `ENCRYPTION_KEY`，不要使用示例值。
- `ENCRYPTION_KEY` 丢失后，已保存的服务商 API Key 将无法解密，部署前应做好备份。
- 建议为站点配置 HTTPS 反向代理，例如 Caddy、Nginx 或 Cloudflare Access。
- 建议定期备份 `./data` 目录，数据库和运行数据默认都保存在该目录下。
- 模型服务商 API Key 在设置页添加，`.env` 不再内置默认 OpenAI 提供商；可选 `OPENAI_*` 变量仅用于自动生成会话标题。

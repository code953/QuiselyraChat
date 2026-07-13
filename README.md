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

复制环境变量模板（可选，仅用于自定义数据库地址）：

```bash
cp .env.example .env.local
```

安装依赖并启动开发服务：

```bash
npm install
npm run dev
```

首次启动时，系统会自动生成访问密码、JWT 密钥与加密密钥，并持久化到数据库。**初始访问密码会打印在启动日志中**，形如：

```
========================================================
  NekoraChat 首次启动：已自动生成初始访问密码
  初始密码: Ab3x9Kd2Qz7...
  请妥善保存。登录后可在「设置 - 通用」中修改密码。
========================================================
```

访问 http://localhost:3000 ，使用日志中打印的初始密码登录。数据库默认写入 `./data/app.db`。

Windows 下 `npm run dev` 默认使用 Webpack，这是为了避开 Next.js 16 Turbopack 在 `.next/dev/node_modules/@libsql` 创建 junction 时可能出现的 `os error 145`。如果需要主动验证 Turbopack，可运行：

```bash
npm run dev:turbo
```

## 环境变量

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | 否 | SQLite/libSQL 地址，默认 `file:./data/app.db` |

> 访问密码、JWT 签名密钥（`JWT_SECRET`）和 API Key 加密主密钥（`ENCRYPTION_KEY`）不再通过环境变量配置，改为首次启动时自动生成并持久化到数据库的 `settings` 表，重启后保持不变。

## Docker 部署

构建并启动：

```bash
docker compose up -d --build
```

首次启动后，用 `docker compose logs` 查看容器日志，其中会打印自动生成的初始访问密码。访问 http://localhost:3000 使用该密码登录。容器会将 `./data` 挂载到 `/app/data`，用于保存 SQLite 数据库（含自动生成的密钥）和后续上传文件。

也可以直接使用 Docker：

```bash
docker build -t nekorachat:local .
docker run -d --name nekorachat -p 3000:3000 -v ./data:/app/data nekorachat:local
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

- 访问密码、`JWT_SECRET`、`ENCRYPTION_KEY` 均由系统首次启动时自动生成并保存在数据库中，无需手动配置。初始密码在启动日志中打印一次，请及时保存。
- 密钥保存在 `./data` 下的数据库里。**该目录（尤其是加密密钥）丢失后，已保存的服务商 API Key 将无法解密**，已签发的登录 token 也会失效，务必做好备份。
- 建议为站点配置 HTTPS 反向代理，例如 Caddy、Nginx 或 Cloudflare Access。
- 建议定期备份 `./data` 目录，数据库和运行数据默认都保存在该目录下。
- 模型服务商 API Key 在设置页添加。


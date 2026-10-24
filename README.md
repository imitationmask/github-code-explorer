This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## AI 分析配置

左侧面板的「AI 项目分析」功能依赖一个 OpenAI 兼容接口。在项目根目录新建 `.env.local`（可参考 `.env.example`）并填写以下环境变量：

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `OPENAI_API_KEY` | 是 | 模型服务的 API Key |
| `OPENAI_BASE_URL` | 否 | 兼容接口地址，默认 `https://api.openai.com/v1` |
| `OPENAI_MODEL` | 否 | 模型名，默认 `gpt-4o-mini` |

配置完成后重启 dev server 生效。常见兼容端点：

- OpenAI：`https://api.openai.com/v1`
- DeepSeek：`https://api.deepseek.com/v1`
- 通义千问：`https://dashscope.aliyuncs.com/compatible-mode/v1`
- Moonshot：`https://api.moonshot.cn/v1`
- 本地 Ollama：`http://localhost:11434/v1`

若未配置 `OPENAI_API_KEY`，点击「开始 AI 分析」时会在左侧面板展示配置引导，不会影响文件树浏览与代码查看。

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

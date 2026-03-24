<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# 独立仓库使用说明

这个目录已经是可独立发布的版本，不依赖外层大项目。

建议你把当前目录单独作为一个新 GitHub 仓库：

1. 在 GitHub 新建一个空仓库（例如 `replenishment-tool`）。
2. 进入本目录后执行 `git init` 并推送到新仓库。
3. 在仓库 `Settings -> Pages` 把 `Source` 设为 `GitHub Actions`。
4. 推送到 `main` 后会自动触发 `.github/workflows/deploy-pages.yml`。

发布地址格式：

- `https://<你的用户名>.github.io/<仓库名>/`

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/1f1b196c-5dcc-4c34-a332-afcfedbc20fd

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## GitHub 免费部署（推荐）

这个工具是纯前端项目，可以直接部署到 GitHub Pages 免费使用。

### 一次性准备

1. 把整个项目推送到 GitHub 仓库（建议默认分支是 `main`）。
2. 打开仓库设置：`Settings -> Pages -> Build and deployment`。
3. `Source` 选择 `GitHub Actions`。

### 自动部署已就绪

仓库已包含自动部署工作流：

- `.github/workflows/deploy-replenishment-tool.yml`

当你向 `main` 分支提交 `tools/补货预测工具` 下的代码时，会自动：

1. 安装依赖
2. 执行 `npm run build`
3. 发布到 GitHub Pages

### 访问地址

发布成功后，地址一般是：

- `https://<你的GitHub用户名>.github.io/<仓库名>/`

首次部署通常需要 1-3 分钟。

### 本地自测（可选）

```bash
npm install
npm run build
npm run preview
```

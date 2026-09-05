# Portal

给自己片刻，去别处。

一个全屏的沉浸式窗口：转动手机看向星海或湖畔，前置摄像头在本机估计眼位，让透视跟随观看位置变化。可以不授权，直接拖动浏览。

## 启动

使用 Node.js 22.12+ 或 24+。

```sh
npm ci
npm run dev
```

打开终端显示的 localhost 地址。桌面 localhost 可以申请摄像头；局域网 HTTP 手机地址只能用于无权限浏览。

模型与 WASM 已随项目提供。需要重新准备它们时执行 `npm run assets`；这一步需要访问 Google 官方模型存储。依赖升级后重新运行该命令以同步 WASM。

## 手机 HTTPS 调试

准备匹配电脑局域网 IP/主机名、且已被 iPhone 信任的开发证书。证书及私钥不要提交进仓库。运行：

```sh
PORTAL_HTTPS_KEY=/absolute/path/dev-key.pem PORTAL_HTTPS_CERT=/absolute/path/dev-cert.pem npm run dev
```

电脑和手机连接同一网络，在 iPhone Safari 打开 `https://电脑的局域网IP:5173`。证书域名/IP 必须匹配；对未受信任证书点“继续”不等于建立可用的安全环境。生产测试可使用受信任的 HTTPS 静态托管，但本仓库未自动发布到公网。

## 构建与验证

```sh
npm run build
npm run preview
npm test
```

静态发布目录为 `dist/`，从站点根目录提供即可。浏览器测试先执行构建，再运行：

```sh
npx playwright install chromium
npm run test:e2e
```

如果已经安装 Google Chrome，可以使用 `PORTAL_TEST_CHROME=1 npm run test:e2e`，无需下载 Playwright Chromium。

## 使用

- 首屏选择“打开这扇窗”启用姿态和前摄，或“先随便看看”直接浏览。
- 轻触全景唤出工具栏；可切换环境、开关眼位、校准、回正或返回。
- 校准填写显示区域短边和观看距离，正对前摄后保存。普通手机默认 64 mm / 350 mm；精确尺度需要实际测量。
- 桌面可拖动或使用方向键，Escape 显示/隐藏工具栏。
- 切换到后台立即释放摄像头；返回后轻触继续。

## 当前边界

已通过 14 项几何单元测试、7 项 Chrome 浏览器流程测试、TypeScript 检查与生产构建。浏览器测试覆盖模型加载、合成视频推理、无第三方请求、权限拒绝、模型失败、暂停恢复和退出后的延迟权限结果。已检查 390 × 844 竖屏、844 × 390 横屏和桌面布局。

优先面向 iPhone Safari；桌面可用于开发预览。真实 iPhone 的姿态方向、眼位跟随精度、横竖屏和持续性能仍需真机验收。浏览器自动化使用合成视频验证媒体管线，不代表真人追踪已经验收。

这是单目近似的窗口原型：默认相机内参与摄像头位置不能覆盖所有手机。双眼中点是折中观察点；普通屏幕没有双眼独立图像。全景提供观看方向变化，不提供真实场景深度。两张素材为生成的 PNG 全景概念图，不是 HDR，背面和极点使用渲染过渡遮盖。

## 文档

- [产品需求](docs/PRD.md)：目标、使用流程、隐私、边界和验收标准。
- [技术架构](docs/architecture.md)：投影、追踪、坐标、校准和生命周期。
- [第三方资源说明](THIRD_PARTY_NOTICES.md)：模型、运行时与素材来源。

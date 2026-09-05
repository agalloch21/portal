# Portal 技术架构

## 运行结构

Vite + TypeScript + Three.js，原生 HTML/CSS，纯静态单页，无服务端 API，依赖精确锁定。

| 模块 | 责任 |
| --- | --- |
| main.ts | 页面状态、授权、面板、渲染循环及资源生命周期 |
| renderer.ts | 全屏射线采样、颜色转换、纹理缓存与边界过渡 |
| view.ts | 固定短边视场角投影 |
| orientation.ts / orientation-filter.ts | 设备坐标、重力方向、水平参考及姿态滤波 |
| tracking.ts / face-worker.ts | 前摄、单人脸推理、Worker 与主线程降级 |
| geometry.ts / face-observation.ts | 关键点到近似物理眼位 |
| eye-filter.ts | 稳定中心采样、眼位增益、速度连续跟随和丢失保持 |
| environments.ts | 环境标识、名称、纹理、初始水平朝向及主题色 |

## 固定投影与眼位

屏幕中心为原点，X 向右、Y 向上、Z 指向观看者。以画布 CSS 短边为 1，固定短边视场角 60°。不读取旧 portal-fov 和 portal-calibration。

```text
size = (width, height) / min(width, height)
z0 = 1 / (2 * tan(60° / 2))
E = (offsetX * z0, offsetY * z0, z0)
P = ((uv - 0.5) * size, 0)
d = R * normalize(P - E)
u = fract(atan2(d.x, -d.z) / (2π) + 0.5)
v = asin(d.y) / π + 0.5
```

着色器沿用 screenMm 命名，但传入统一的归一化尺度。观察点偏移只用于屏幕局部坐标，手机姿态 R 只应用一次。固定 z0 避免距离噪声导致缩放；侧移产生非对称视野，离轴透视仍可能改变边缘角度。这不是按物理屏幕尺寸标定的完整离轴窗口。

画布 clientWidth/clientHeight 决定比例和渲染尺寸，横竖屏保持短边尺度。sRGB PNG 经 Three.js 输出颜色转换。

## 重力方向与姿态滤波

DeviceOrientationEvent 的 beta/gamma 提供相对重力的倾斜，alpha 提供浏览器参考系内的水平旋转。使用 requestPermission(false)，不要求地理北方或磁力计。设备角度以 YXZ 欧拉角转四元数，补偿相机 -Z 朝向和屏幕旋转。

参考只绕世界 Y 轴：首次读数对齐水平朝向，保留俯仰与倾斜。根据 forward 水平投影提取 heading，在垂直极点使用 right 向量兜底。渲染为环境初始水平方向与拖动旋转乘以 inverse(yawReference) × deviceQuaternion。回正只重设 yawReference；不会将倾斜姿势变成虚拟直立。

前 220 ms 吸收初始水平朝向变化；小于 0.15° 不更新目标。四元数 slerp 按时间指数平滑，小误差时间常数 120 ms，大于 5° 时 65 ms，单次积分最多 100 ms。突变阈值为 max(30°, 间隔 × 720°/秒)，孤立突变丢弃；连续 3 个相近突变重新对齐水平参考，俯仰与倾斜仍回到真实姿态。

间隔超过 750 ms 时重新对齐水平参考，2 秒无读数提示可拖动。停止后保留显示方向，恢复时重新获取姿态；重力方向重新生效而非锁定在后台前的俯仰。屏幕方向补偿直接参与原始四元数，不用完整姿态重置抵消它。

## 眼位估计与稳定性

MediaPipe 0.10.21 Face Landmarker 只追踪一张脸，虹膜/眼角中点作为观察点。使用 63 mm 瞳距、60° 近似前摄水平视角和头部旋转缩短系数估计距离；不把模型归一化 Z 当作物理深度。原始前摄图像 X 转为屏幕 X 时反向，处理画面横竖方向不匹配和前摄顶部偏移。物理短边暂按 64 mm 估计，仍属单目近似。

开始或重新采样时收集连续 10 帧、跨度至少 280 ms，以中位数建立中心；样本相对中位数的 XY 距离不超过 15 mm、Z 差不超过 35 mm。未稳定时继续滑动采样窗口，间隔超过 350 ms 或无人脸时清空窗口。此门槛只用于建立中心，不限制之后的移动。基准只在内存中保留；眼位偏离中心多远都不因此丢弃。输入须为有限数值、眼间距和画面尺寸须为正数；不再要求眼间距至少 8 像素，也不裁剪 X/Y 到 ±250 mm。距离估计仍保留 150–1000 mm 的近似范围。

```text
offsetX = 3 * (eye.x - baseline.x) / eye.z
offsetY = 3 * (eye.y - baseline.y) / eye.z
```

每个有效观测更新目标，不设置眼位死区或大幅跳变丢弃；不限制偏移幅度。采样间估计眼位偏移速度 v，连续同向移动至少两次后启用短期预测：按采集到渲染的时间补偿，最多 50 ms，预测额外偏移长度最多 0.1；真实位置不受此限幅影响。反向时立即重估速度，低速或丢失识别时清除预测。渲染阶段使用临界阻尼二阶跟随，ω=75/s，并维护独立的显示速度。对于当前帧目标 g，令 y=x−g、j=v+ωy，精确更新 x=g+(y+jΔt)exp(−ωΔt)、v=(v−ωjΔt)exp(−ωΔt)。新观测只改变目标，不重置显示速度，因此位置和速度连续；固定目标的更新不依赖刷新率。该解析更新不增加观测缓冲帧。主动重置或识别丢失时清零显示速度，避免惯性滑行。无人脸结果立即冻结最后显示的偏移；超过 200 ms 未收到有效观测也冻结，不回零。只有主动关闭或重新采样等显式重置才回中。识别恢复后立即接纳当前位置，由平滑保证连续过渡。距离只用于估计横向角度，不改变投影焦距。横竖屏改变后重新采样眼位，避免混用屏幕坐标系。

## 调度与资源

MediaPipe 0.10.21 的 WASM 加载器调用 importScripts，必须使用经典 Worker。生产采用 Vite 的 IIFE worker 构建并以经典 Worker 启动；开发服务器通过专用中间件把同一入口打包为 IIFE 后提供，避免开发模式的 ESM worker 不兼容。构建在内存中完成，不新增线上 API、第三方资源或服务端运行要求。浏览器测试明确断言 Worker 执行模式，并单独验证开发服务器与主线程降级路径。

用户点击后立即触发姿态授权并启动前摄。摄像头视频不可见、静音、playsinline，无音频采集。摄像头目标 30 fps，优先 requestVideoFrameCallback 驱动；不支持时使用定时器。Worker 目标 30 Hz，上一帧完成后先检查 video.currentTime，有更新的帧则在频率预算允许时立即取最新帧，没有才等待下一视频回调，忙碌时不积压；失败或单帧超过 3 秒降为主线程 CPU 15 Hz。性能面板展示实际推理结果频率、帧拷贝到结果返回的处理耗时、渲染帧间隔估算的 fps 及当前执行模式；统计仅在本机展示，不含相机采集延迟。计时基于上次开始时间，不在推理完成后再固定等待完整间隔。帧携带采集时间用于样本排序与稳定窗口，结果接收时间用于丢失判断，避免把推理延迟误判为丢失。停止时同时取消视频回调和定时器。模型和 WASM 均由本站提供。异步权限、模型初始化及帧处理用代次阻止退出后复活；停止媒体轨道、终止 Worker、关闭检测器并清空 video 源。

独立 requestAnimationFrame 渲染，初始像素比最高 2，连续两个 3 秒窗口低于 30 fps 时降低，最低 1，并降低推理频率。后台停止循环、前摄与姿态；返回需轻触，并重新采样眼位。WebGL context lost 暂停。

## 输入互斥

motionWanted 开启时，指针移动仍累计手势距离，以区分滑动与轻触，但不改变 manualYaw/manualPitch；方向键也不改变方向。关闭跟随后恢复手动输入。轻触唤出控件不受限制。等待姿态事件时不临时开放拖动，避免传感器恢复后两种逻辑叠加。

## 页面、素材与验证

固定画布覆盖视口，控件适配安全区域。普通标签页 theme-color 随环境变化。通过 display-mode: standalone 或 navigator.standalone 检测主屏幕模式：body 使用 position: relative、height: 100lvh、min-height: 100%，画布采用 absolute 定位及 height: 100% 铺满 body，工具层仍按可用固定视口布局，根节点与 body 使用 #0b0d10；manifest 启动背景与主题色也使用该中性深色。主屏幕模式不在切换场景时更改系统主题色，避免启动时缓存紫色。manifest standalone、Apple 元数据和图标支持主屏幕打开。没有 Service Worker 或离线缓存。WebKit 的主屏幕系统栏和视口存在版本差异，页面样式测试不能替代 iPhone 验收；系统保留区可能仍显示中性深色而不能绘制全景。参见 [WebKit 主屏幕视口问题](https://bugs.webkit.org/show_bug.cgi?id=301994)。

两张 1774 × 887 PNG 保持不变；背面接缝两侧约 2.2% 混合、极点约 4.5% 过渡会产生拉伸状伪影，不能重建真实球面内容。本轮不修改素材或过渡策略。

单元测试验证重力方向、姿态噪声、参考、固定投影及眼位滤波。浏览器测试使用公开界面和模拟媒体/姿态 API 验证授权、降级及资源释放，使用合成视频验证真实模型管线；不添加生产测试注入接口。真机由用户测试反馈。

- [设备姿态授权与 absolute 参数](https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent/requestPermission_static)
- [MediaPipe Web 推理与 Worker](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js)

# Portal 技术架构

## 1. 运行结构

Portal 是 Vite + TypeScript + Three.js 静态单页应用，使用原生 HTML/CSS 构建界面，不依赖服务端 API。依赖使用精确版本和 npm lockfile 固定。

| 子系统 | 责任 |
| --- | --- |
| 页面控制器 | 首页/沉浸/暂停状态、权限入口、弹层、校准保存、渲染循环、错误提示 |
| 环境渲染 | 全屏三角网格、球面方向采样、颜色管理、接缝与极点过渡、纹理缓存 |
| 设备姿态 | 权限申请、设备欧拉角转四元数、屏幕旋转补偿、参考方向与释放 |
| 眼位追踪 | 前置视频采集、模型初始化、Worker 推理与主线程降级、资源生命周期 |
| 几何计算 | 屏幕尺度、原始关键点观测到眼位、时间相关滤波、输入边界 |

环境配置包含 `id`、`name`、`texture`、`initialYaw`。场景资源位于站点本地；模型和 WASM 也由本站提供。无视频上传端点、远程推理或在线字体。

MediaPipe 固定为 0.10.21。1.0.1 的自动运行日志不符合本产品的外部请求边界；升级依赖必须重新通过“模型启动、推理、关闭全程无第三方请求”的浏览器测试。

## 2. 渲染与坐标

屏幕中心为原点，屏幕 X 向右、Y 向上、Z 指向观看者。眼位 `E` 与像素的屏幕位置 `P` 都以毫米表示。实际画布像素根据显示区域短边的物理尺度换算，不把 CSS 像素当作毫米。

每像素方向为：

```text
P = ((uv - 0.5) * screenMm, 0)
d = normalize(R * normalize(P - E))
u = fract(atan2(d.x, -d.z) / (2π) + 0.5)
v = asin(d.y) / π + 0.5
```

PNG 纹理使用 sRGB 输入，着色器输出通过 Three.js 的输出颜色转换。渲染没有额外照明或 HDR 曝光重建。

手机世界平移不参与渲染：眼位与屏幕位置相减后共同平移抵消，且环境被视为无限远。手机姿态只进入一次 `R`，不再旋转局部眼位。

设备角度按 YXZ 欧拉顺序转换，补偿相机的 -Z 朝向与屏幕方向。保存初始姿态 `Q0`，相对旋转为 `inverse(Q0) * Q`，再与环境初始方向、手动浏览偏移组合。方向回正和横竖屏切换重新建立姿态参考。

首页采用开阔构图，横屏水平视野 92°、竖屏 68°；纯拖动浏览采用横屏 68°、竖屏 43°。姿态或眼位启用时使用物理窗口尺度。这使无追踪浏览可用，同时保留追踪模式的正确几何含义。

## 3. 眼位估计与校准

MediaPipe Face Landmarker 只检测一张人脸，输出眼睛关键点和脸部变换矩阵。优先使用虹膜中心，缺失时使用眼角。将图像中的双眼中点、眼间距、图像尺寸和头部转向造成的缩短系数作为观测；不使用归一化关键点 Z 作为绝对深度。

近似水平视角为 60°，默认瞳距 63 mm：

```text
f = imageWidth / (2 * tan(30°))
zRaw = f * 63 * foreshortening / eyeDistancePixels
z = clamp(zRaw * distanceScale, 150, 1000)
xCamera = -(eyeMidX - imageWidth / 2) * z / f
yCamera = -(eyeMidY - imageHeight / 2) * z / f
```

原始前摄图像不镜像；X 在转换到屏幕空间时反向。若视频与显示区域的横竖方向不同，再按屏幕方向旋转局部偏移；方向相同则不重复旋转。前摄位置默认在手机纵向顶部，距显示边缘约 6 mm；依据屏幕角度将偏移转换到当前坐标。

这些视角、主点和摄像头位置均为原型近似。浏览器无法可靠提供所有手机的相机内参与物理尺寸，距离校准只修正全局尺度，不声称完成完整相机标定。

校准保存显示区域短边、当前观看距离和距离修正系数。使用最近 650 ms 至少 3 帧的原始距离中位数，计算 `distanceScale = enteredDistance / medianRawDistance`。没有足够观测时只保存尺度并明确提示。持久化键为 `portal-calibration`，仅包含数值设置；损坏或越界数据恢复安全默认。

横向与纵向眼位限制为 ±250 mm，深度限制为 150–1000 mm。滤波采用 65 ms 时间常数的指数平滑，限制每次目标变化；连续丢失超过 650 ms 后向默认居中眼位平滑过渡。

## 4. 调度与生命周期

用户点击后立即触发需要用户激活的姿态授权，并发启动摄像头申请。视频使用 `playsinline`、静音播放和不可见的 1px video 元素，防止 iPhone 强制全屏播放。无音频采集。

Worker 优先推理，目标 15 Hz；只在上一帧完成后提交下一帧，传输 `ImageBitmap` 并在推理后关闭。Worker 初始化失败、运行错误或一帧超过 3 秒无回应时，终止 Worker，降为主线程 CPU 推理，目标 8 Hz。模型加载使用本站路径。

渲染使用独立 `requestAnimationFrame`。初始像素比最高 2；连续两个 3 秒窗口低于 30 fps 时逐步降至最低 1，同时把推理频率限制为 8 Hz。界面追踪状态每 200 ms 更新，不按显示刷新率重复修改文字。

摄像头与初始化任务使用递增代次防止退出后的异步结果重新激活资源。停止时取消定时器、终止 Worker、关闭主线程模型、停止所有媒体轨道、清空 video 源。姿态独立取消监听并使未完成的权限申请失效。

后台触发停止并保留用户所需能力；恢复需用户轻触。离开页面同样停止。WebGL context lost 触发暂停与兼容提示；恢复后允许重新进入。

## 5. 素材与交付

两张 1774 × 887 PNG 来自本次产品探索的内置图像生成工具。原始资源保留；着色器在经度接缝左右各约 2.2% 范围混合边界颜色，在南北极约 4.5% 范围向经度平均颜色过渡。该方法隐藏突变，不重建真实球面几何；精修后的无缝素材可直接替换资源。

`npm run assets` 从已安装的 MediaPipe 包复制 WASM，并在模型不存在时下载版本固定的官方模型。提交或分发项目时包含 `public/models` 和 `public/wasm`，构建后由 `dist` 提供，不需要用户在运行时访问 Google。

开发服务器支持可选 `PORTAL_HTTPS_KEY` 和 `PORTAL_HTTPS_CERT`，二者必须同时提供。手机访问的 HTTPS 证书需要被手机信任。公共部署不在第一版交付内。

## 6. 验证边界与参考

几何单元测试验证射线方向、尺度、姿态补偿、眼位近似与滤波；浏览器测试通过公开界面、浏览器媒体 API 和合成视频验证流程及资源释放。生产接口不为测试添加注入开关。合成视频只验证模型管线和生命周期，不验证人脸精度。

真机需独立测试 iPhone Safari 权限、眼位方向、横竖屏、摄像头偏移、距离尺度、后台恢复与持续帧率。

- [MediaPipe Face Landmarker Web](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js)
- [设备姿态授权](https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent/requestPermission_static)
- [摄像头 API](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
- [Three.js ShaderMaterial](https://threejs.org/docs/pages/ShaderMaterial.html)

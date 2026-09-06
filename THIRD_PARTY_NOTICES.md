# 第三方资源说明

## 软件依赖

- Three.js 0.185.1：MIT，https://github.com/mrdoob/three.js
- MediaPipe Tasks Vision 0.10.21：Apache-2.0，https://github.com/google-ai-edge/mediapipe
- 开发工具的版本与许可证见 package-lock.json 及各依赖包。

public/wasm 中的运行时文件从安装的 @mediapipe/tasks-vision 包原样复制；应保留其源文件中的版权与许可说明。

## 人脸模型

face_landmarker.task 来源于 Google 官方 MediaPipe 模型存储，固定版本 float16/1：

https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task

模型能力与使用说明见 https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker 。项目不声称拥有第三方模型的版权。

## 全景素材

- `forest-8k.jpg`：Poly Haven [Sunset Forest](https://polyhaven.com/a/sunset_forest)，作者 Andreas Mischok，CC0，作者提供的原生 8K 色调映射 JPG。
- `lake-8k.jpg`：Poly Haven [Lakeside Dawn](https://polyhaven.com/a/lakeside_dawn)，摄影 Greg Zaal，处理 Jarod Guest，CC0。原生 8K 色调映射 JPG 经网页 JPEG 压缩，像素尺寸保持 8192 × 4096。
- Poly Haven [许可说明](https://polyhaven.com/license)。资源随站点提供，运行时不请求 Poly Haven。
- `underwater.png`、`nebula.png`：内置 image_gen 于 2026-09-06 生成，1774 × 887；完整提示词见 docs/scene-exploration.md。
- `star-greenhouse.png`、`dream-sea.png` 和保留但未使用的 `quiet-lake.png`：此前内置 image_gen 生成的全景，均为 1774 × 887 普通 LDR PNG。原图保留在工具输出目录。

站点背景不包含浮点 HDR 数据，不声称具备真实 HDR 动态范围。WebP 缩略图来自相应背景图；动态星点、微粒、气泡和流星为项目自有程序化几何，没有新增第三方模型。

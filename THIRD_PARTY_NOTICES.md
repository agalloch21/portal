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

dream-sea.png（星海浅眠）与 quiet-lake.png（清晨湖畔）由本次 Portal 产品探索中的内置 image_gen 工具生成，2026-09-06。为 2:1 普通 PNG，不具有真实 HDR 动态范围。原图未经像素编辑；接缝与极点修饰由运行时着色器完成。

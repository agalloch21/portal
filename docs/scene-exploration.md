# 全景素材与动态层

当前方向为静态全景与稀疏空间动态元素。独立三维庭院、回廊和树屋已移除，不进入生产构建。

## 素材与许可

| 站点文件 | 尺寸 | 来源 |
| --- | --- | --- |
| public/environments/forest-8k.jpg | 8192 × 4096 | [Sunset Forest](https://polyhaven.com/a/sunset_forest)，Andreas Mischok，CC0，作者的 8K Tonemapped JPG |
| public/environments/lake-8k.jpg | 8192 × 4096 | [Lakeside Dawn](https://polyhaven.com/a/lakeside_dawn)，Greg Zaal / Jarod Guest，CC0，作者的 8K Tonemapped JPG，经网页 JPEG 编码压缩，像素尺寸未改变 |
| public/environments/underwater.png | 1774 × 887 | 内置 image_gen，2026-09-06，浅蓝之下 |
| public/environments/nebula.png | 1774 × 887 | 内置 image_gen，2026-09-06，星云缓行 |
| public/environments/star-greenhouse.png | 1774 × 887 | 之前的内置 image_gen 第二版星间花房 |
| public/environments/dream-sea.png | 1774 × 887 | 之前的内置 image_gen 星海浅眠 |

新场景的 `*-preview.webp` 是缩略图，不作为渲染背景。旧 quiet-lake.png 保留原文件，但不再用于当前湖畔场景。所有站点全景都是 LDR，摄影素材来自 HDRI 作者提供的色调映射版本。原生 8K 会增加下载量和显存需求，缓存避免同时驻留两张 8K。

## 生成分辨率限制

水下和星云均明确请求 4096 × 2048 或更大，但内置工具实际输出仍为 1774 × 887。没有把普通放大标为真正的 4K，也未私自切换到需要 API Key 的图像 API。它们可用于比较构图与动态方向；最终选中后仍需要更高原生分辨率的源图。

## 本轮完整生成提示词

使用内置 image_gen，从文字生成；原文件保留在工具默认 generated_images 目录，项目副本保存于上述 public/environments 路径。

### underwater

```text
Asset: immersive mobile meditation environment texture. ONE full spherical 360x180 EQUIRECTANGULAR panorama, exact 2:1 aspect ratio. Deliver native 4096x2048 pixels or larger if supported; prioritize genuinely high-resolution fine detail. Not a normal wide photograph: full latitude-longitude spherical projection, horizon at middle height, centre column is initial forward direction. Left and right boundaries must depict precisely the same rear direction, continuous in lighting, colors and geometry. No text, UI, border, people, watermark. Camera upright, level at natural human eye height, comfortable breathing room, no object closer than 2 meters. Subtle cinematic natural lighting, carefully composed, beautiful tactile detail, calm meditative atmosphere, restrained colors; not cartoon low-poly. Top and bottom poles must resolve to coherent simple colors instead of stretched clutter. Fine background details, but central initial mobile view should be calm and uncluttered. Scene: a shallow turquoise underwater sanctuary in a clear tropical lagoon. Observer gently suspended 1.5 meters above a pale rippled sand seabed. Graceful seagrass and soft corals at the far left/right edges of the initial window, curved rocks 3-6 meters away frame an open luminous blue underwater path. Calm water surface far overhead scatters dappled shafts of sunlight. Front view is open water with receding layers of blue, sand appears in the lower third, plants never crowd the lens. No fish, no bubbles, no floating particles baked into the picture: these will be real animated 3D layers. Behind the observer a coherent quiet reef and low seagrass continue all around. Natural aquatic colors, peaceful not ominous, not a deep dark abyss. No fisheye circle, no above-water split.
```

### space

```text
Asset: immersive mobile meditation environment texture. ONE full spherical 360x180 EQUIRECTANGULAR panorama, exact 2:1 aspect ratio. Deliver native 4096x2048 pixels or larger if supported; prioritize genuinely high-resolution fine detail. Not a normal wide photograph: full latitude-longitude spherical projection, horizon at middle height, centre column is initial forward direction. Left and right boundaries must depict precisely the same rear direction, continuous in lighting, colors and geometry. No text, UI, border, people, watermark. Camera upright, level at natural human eye height, comfortable breathing room, no object closer than 2 meters. Subtle cinematic natural lighting, carefully composed, beautiful tactile detail, calm meditative atmosphere, restrained colors; not cartoon low-poly. Top and bottom poles must resolve to coherent simple colors instead of stretched clutter. Fine background details, but central initial mobile view should be calm and uncluttered. Scene: an ethereal quiet cosmic cloud garden. Observer floats inside a broad pocket of luminous peach, lavender and midnight teal interstellar dust, with gently curling nebula veils forming nearby framing layers at angular sides 20-40 degrees from forward. Initial centre opens toward a softly illuminated distant crescent planet, relatively small (8 degrees across), at a slight upper-right elevation. Cosmic cloud textures look exquisitely detailed and photographic yet subtly dreamy, no harsh saturation, not a garish sci-fi game. The nebula wraps coherently through rear view and overhead/underfoot, with soft sparse detail at the poles. Very few faint tiny baked stars; no bright star points, no meteors or trails, as these will be real animated 3D elements. Avoid gigantic nearby planet, spaceship, buildings or a landscape ground plane. A welcoming celestial space rather than black emptiness.
```

## 动态与边界

森林浮光、水下微粒/气泡、星海漂浮微光、环游星尘与花瓣均由世界坐标中的 Points 绘制；水下光束为低透明度平面；流星为三维 Line。它们与全景共享投影和朝向，没有对背景做 UV 扭曲或动态缩放。暂停只冻结时间，摄像机仍能转动。

背景没有深度图，粒子不能被图片中的树木或星球准确遮挡。生成图也不保证测量准确的球面结构，仅对生成图启用小范围接缝和极点缓和。摄影全景保留原始球面采样。真实 iPhone 清晰度、运动舒适度、显存与持续帧率需要用户验收。

## 保留的新增梦境环境

- `clouds.png` / `clouds-preview.webp`：云端花海，内置 image_gen，1774 × 887。桃粉云海、漂浮花岛、两侧花枝和远处落日。
- `moonforest.png` / `moonforest-preview.webp`：月隐灵森，内置 image_gen，1774 × 887。深青灰绿的月夜森林，银白独角兽在中央偏右的林间空地，苔藓古树、蕨类、稀薄雾气。前景萤火虫由代码绘制，独角兽不动画。

新夜林提示要求：完整 360×180 等距柱状 2:1 全景、左右边缘与极点连续、自然眼高、独角兽距观察点约 7 米且位于初始视野、单角、自然解剖与安静姿态；深青灰绿与银色月光，禁止霓虹紫和高饱和配色；无文字、UI 或边框。请求 4096×2048 或最高支持尺寸，实际返回 1774×887。生成素材不保证精确的球面几何。

水母湾与梦窟图片已移出发布目录，仅保留在忽略的本地实验目录。动态不再使用水母或花瓣。

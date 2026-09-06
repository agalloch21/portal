import { NoToneMapping, Color, LinearMipmapLinearFilter, Matrix3, Matrix4, Mesh, OrthographicCamera, PerspectiveCamera, PlaneGeometry, Quaternion, RepeatWrapping, Scene, ShaderMaterial, SRGBColorSpace, Texture, TextureLoader, Vector2, Vector3, WebGLRenderer } from 'three';
import type { Environment } from './environments';
import { createAmbient, type AmbientWorld } from './ambient';
import { VIEW_DISTANCE, offAxisProjection } from './view';
import type { Eye } from './geometry';

const fragmentShader = `
precision highp float;
uniform sampler2D panorama;
uniform vec2 screenMm;
uniform vec3 eyePosition;
uniform mat3 rotation;
uniform float exposure;
uniform float repairEdges;
varying vec2 vUv;
const float PI = 3.14159265359;
vec3 sampleEnvironment(vec2 uv, vec2 dx, vec2 dy) {
  vec3 c = textureGrad(panorama, uv, dx, dy).rgb;
  float edge = min(uv.x, 1.0 - uv.x);
  if (repairEdges > .5 && edge < 0.012) {
    // Crossfade nearby directions, not a stretched column; the exact seam samples agree.
    vec3 across = textureGrad(panorama, vec2(1.0 - uv.x, uv.y), dx * vec2(-1.0, 1.0), dy * vec2(-1.0, 1.0)).rgb;
    c = mix(c, across, .5 * (1.0 - smoothstep(0.0, .012, edge)));
  }
  float pole = min(uv.y, 1.0 - uv.y);
  if (repairEdges > .5 && pole < 0.015) {
    vec3 average = vec3(0.0);
    for (int i = 0; i < 8; i++) average += textureGrad(panorama, vec2((float(i) + 0.5) / 8.0, clamp(uv.y, 0.008, 0.992)), dx, dy).rgb;
    c = mix(average / 8.0, c, smoothstep(0.0, 0.015, pole));
  }
  return c;
}
void main() {
  vec3 p = vec3((vUv - 0.5) * screenMm, 0.0);
  vec3 d = normalize(rotation * normalize(p - eyePosition));
  vec2 uv = vec2(fract(atan(d.x, -d.z) / (2.0 * PI) + 0.5), asin(clamp(d.y, -1.0, 1.0)) / PI + 0.5);
  // Longitude wraps at the rear; an implicit ~1.0 jump picks the lowest mip and draws a bright line.
  vec2 dx = dFdx(uv), dy = dFdy(uv);
  dx.x -= floor(dx.x + .5);
  dy.x -= floor(dy.x + .5);
  gl_FragColor = vec4(sampleEnvironment(uv, dx, dy) * exposure, 1.0);
  #include <colorspace_fragment>
}`;

export class PortalRenderer {
  private canvas: HTMLCanvasElement;
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private material: ShaderMaterial;
  private textures = new Map<string, Texture>();
  private loader = new TextureLoader();
  private changeToken = 0;
  private ratio = Math.min(devicePixelRatio, 2);
  private matrix = new Matrix4();
  private lastWidth = 0;
  private lastHeight = 0;
  private ambient: AmbientWorld | null = null;
  private effectCamera = new PerspectiveCamera(60, 1, .1, 100);
  private elapsed = 0;
  private lastTime = 0;
  private motionEnabled = true;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'default' });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.autoClear = false;
    this.renderer.setClearColor(new Color('#c7b8da'));
    this.renderer.setPixelRatio(this.ratio);
    this.material = new ShaderMaterial({
      uniforms: {
        panorama: { value: null }, screenMm: { value: new Vector2(64, 138) },
        eyePosition: { value: new Vector3(0, 0, VIEW_DISTANCE) }, rotation: { value: new Matrix3() }, exposure: { value: 1 }, repairEdges: { value: 0 },
      },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader, depthTest: false, depthWrite: false,
    });
    this.scene.add(new Mesh(new PlaneGeometry(2, 2), this.material));
  }

  async load(environment: Environment) {
    const token = ++this.changeToken;
    let texture = this.textures.get(environment.id);
    if (!texture) {
      texture = await this.loader.loadAsync(environment.texture);
      if (token !== this.changeToken) { texture.dispose(); return false; }
      texture.colorSpace = SRGBColorSpace;
      texture.wrapS = RepeatWrapping;
      texture.minFilter = LinearMipmapLinearFilter;
      texture.generateMipmaps = true;
      texture.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
      this.textures.set(environment.id, texture);
    }
    if (token !== this.changeToken) return false;
    this.material.uniforms.panorama.value = texture;
    this.material.uniforms.repairEdges.value = environment.source === 'generated' ? 1 : 0;
    this.ambient?.dispose();
    this.ambient = createAmbient(environment.atmosphere, environment.initialYaw);
    this.elapsed = this.lastTime = 0;
    // One 8K plus a small panorama fits; never retain two 8K GPU textures together.
    const cachedPixels = () => [...this.textures.values()].reduce((sum, texture) => {
      const image = texture.image as { width: number; height: number };
      return sum + image.width * image.height;
    }, 0);
    while (this.textures.size > 2 || (this.textures.size > 1 && cachedPixels() > 40_000_000)) {
      const key = [...this.textures.keys()].find(key => key !== environment.id)!;
      this.textures.get(key)!.dispose(); this.textures.delete(key);
    }
    return true;
  }

  setAmbientMotion(enabled: boolean) { this.motionEnabled = enabled; }

  draw(size: { width: number; height: number }, rotation: Quaternion, eye: Eye) {
    const width = this.canvas.clientWidth, height = this.canvas.clientHeight;
    if (width !== this.lastWidth || height !== this.lastHeight) {
      this.renderer.setSize(width, height, false);
      this.lastWidth = width;
      this.lastHeight = height;
    }
    const now = performance.now();
    if (this.lastTime && this.motionEnabled) this.elapsed += Math.min((now - this.lastTime) / 1000, .05);
    this.lastTime = now;
    this.renderer.toneMapping = NoToneMapping;
    this.material.uniforms.screenMm.value.set(size.width, size.height);
    this.material.uniforms.eyePosition.value.set(eye.x, eye.y, eye.z);
    this.material.uniforms.rotation.value.setFromMatrix4(this.matrix.makeRotationFromQuaternion(rotation));
    if (this.material.uniforms.panorama.value) {
      this.renderer.clear();
      this.renderer.render(this.scene, this.camera);
      const n = this.effectCamera.near;
      this.effectCamera.projectionMatrix.copy(offAxisProjection(size, eye, n, this.effectCamera.far));
      this.effectCamera.projectionMatrixInverse.copy(this.effectCamera.projectionMatrix).invert();
      this.effectCamera.position.set(eye.x, eye.y, eye.z - VIEW_DISTANCE).applyQuaternion(rotation);
      this.effectCamera.quaternion.copy(rotation); this.effectCamera.updateMatrixWorld();
      this.ambient?.update(this.elapsed, this.ratio);
      this.renderer.clearDepth();
      if (this.ambient) this.renderer.render(this.ambient.scene, this.effectCamera);
    }
  }

  lowerResolution() {
    if (this.ratio <= 1) return;
    this.ratio = Math.max(1, this.ratio - 0.25);
    this.renderer.setPixelRatio(this.ratio);
  }
}

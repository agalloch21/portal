import { Color, LinearFilter, Matrix3, Matrix4, Mesh, OrthographicCamera, PlaneGeometry, Quaternion, RepeatWrapping, Scene, ShaderMaterial, SRGBColorSpace, Texture, TextureLoader, Vector2, Vector3, WebGLRenderer } from 'three';
import type { Eye } from './geometry';
import type { Environment } from './environments';

const fragmentShader = `
precision highp float;
uniform sampler2D panorama;
uniform vec2 screenMm;
uniform vec3 eye;
uniform mat3 rotation;
uniform float exposure;
varying vec2 vUv;
const float PI = 3.14159265359;
vec3 sampleEnvironment(vec2 uv) {
  vec3 c = texture2D(panorama, uv).rgb;
  float edge = min(uv.x, 1.0 - uv.x);
  if (edge < 0.022) {
    vec3 joined = (texture2D(panorama, vec2(0.022, uv.y)).rgb + texture2D(panorama, vec2(0.978, uv.y)).rgb) * 0.5;
    c = mix(joined, c, smoothstep(0.0, 0.022, edge));
  }
  float pole = min(uv.y, 1.0 - uv.y);
  if (pole < 0.045) {
    vec3 average = vec3(0.0);
    for (int i = 0; i < 8; i++) average += texture2D(panorama, vec2((float(i) + 0.5) / 8.0, clamp(uv.y, 0.008, 0.992))).rgb;
    c = mix(average / 8.0, c, smoothstep(0.0, 0.045, pole));
  }
  return c;
}
void main() {
  vec3 p = vec3((vUv - 0.5) * screenMm, 0.0);
  vec3 d = normalize(rotation * normalize(p - eye));
  vec2 uv = vec2(fract(atan(d.x, -d.z) / (2.0 * PI) + 0.5), asin(clamp(d.y, -1.0, 1.0)) / PI + 0.5);
  gl_FragColor = vec4(sampleEnvironment(uv) * exposure, 1.0);
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

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'default' });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.setClearColor(new Color('#c7b8da'));
    this.renderer.setPixelRatio(this.ratio);
    this.material = new ShaderMaterial({
      uniforms: {
        panorama: { value: null }, screenMm: { value: new Vector2(64, 138) },
        eye: { value: new Vector3(0, 0, 350) }, rotation: { value: new Matrix3() }, exposure: { value: 1 },
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
      texture.colorSpace = SRGBColorSpace;
      texture.wrapS = RepeatWrapping;
      texture.minFilter = LinearFilter;
      texture.generateMipmaps = false;
      this.textures.set(environment.id, texture);
    }
    if (token !== this.changeToken) return false;
    this.material.uniforms.panorama.value = texture;
    return true;
  }

  draw(eye: Eye, size: { width: number; height: number }, rotation: Quaternion) {
    const width = this.canvas.clientWidth, height = this.canvas.clientHeight;
    if (width !== this.lastWidth || height !== this.lastHeight) {
      this.renderer.setSize(width, height, false);
      this.lastWidth = width;
      this.lastHeight = height;
    }
    this.material.uniforms.eye.value.set(eye.x, eye.y, eye.z);
    this.material.uniforms.screenMm.value.set(size.width, size.height);
    this.material.uniforms.rotation.value.setFromMatrix4(this.matrix.makeRotationFromQuaternion(rotation));
    if (this.material.uniforms.panorama.value) this.renderer.render(this.scene, this.camera);
  }

  lowerResolution() {
    if (this.ratio <= 1) return;
    this.ratio = Math.max(1, this.ratio - 0.25);
    this.renderer.setPixelRatio(this.ratio);
  }
}

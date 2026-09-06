import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, DoubleSide, Mesh, PlaneGeometry, Points, Scene, ShaderMaterial } from 'three';
import { addAmbientAccents } from './ambient-accents';
import { createDreamEvents } from './dream-events';

export type Atmosphere = 'dream' | 'underwater' | 'space' | 'greenhouse' | 'clouds' | 'moonforest' | 'forest' | 'lake';
export interface AmbientWorld { scene: Scene; update(time: number, pixelRatio: number): void; dispose(): void }

/** Each theme has an exclusive motion vocabulary; only geometry machinery is shared. */
export function createAmbient(kind: Atmosphere, initialYaw = 0): AmbientWorld {
  const scene = new Scene(); scene.rotation.y = -initialYaw;
  const materials: ShaderMaterial[] = [], geometries: BufferGeometry[] = [];
  let seed = 617;
  const rnd = () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };
  const mode = kind === 'dream' ? 1 : kind === 'underwater' ? 2 : kind === 'space' ? 3 : kind === 'moonforest' ? 4 : 0;
  if (mode) {
    const count = mode === 3 ? 360 : mode === 2 ? 160 : mode === 4 ? 85 : 60;
    const positions = new Float32Array(count * 3), phases = new Float32Array(count);
    for(let i=0;i<count;i++) {
      const a=i<count*.55 ? -Math.PI/2+(rnd()-.5)*1.2 : rnd()*Math.PI*2;
      const r=mode===3?22+rnd()*18:5+rnd()*14;
      positions.set([Math.cos(a)*r,mode===4?(rnd()-.5)*5:(rnd()-.5)*14,Math.sin(a)*r],i*3);
      phases[i]=rnd()*100;
    }
    const g=new BufferGeometry();g.setAttribute('position',new BufferAttribute(positions,3));g.setAttribute('phase',new BufferAttribute(phases,1));
    const m=new ShaderMaterial({transparent:true,depthWrite:false,blending:AdditiveBlending,
      uniforms:{time:{value:0},pixelRatio:{value:1},mode:{value:mode},tint:{value:new Color(mode===4?'#f4dda0':mode===2?'#a4dce6':mode===3?'#cad5ed':'#efd8f1')}},
      vertexShader:`attribute float phase;uniform float time;uniform float pixelRatio;uniform float mode;varying float opacity;varying float bubble;
        void main(){vec3 p=position;
          if(mode==3.){float a=time*.018;p.xz=mat2(cos(a),-sin(a),sin(a),cos(a))*p.xz;p.y+=sin(time*.2+phase)*.2;}
          else {p.x+=sin(time*.3+phase)*.45;p.y+=sin(time*.24+phase)*.35;p.z+=cos(time*.19+phase)*.3;}
          if(mode==2.)p.y=mod(p.y+time*.22+8.,16.)-8.;
          bubble=mode==2.&&mod(phase,4.)<1.?1.:0.;
          vec4 v=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*v;
          float size=mode==4.?45.:mode==1.?75.:bubble>.5?110.:28.;
          gl_PointSize=mode==3.?(1.3+mod(phase,1.)*1.3)*pixelRatio:clamp(size/max(1.,-v.z),1.5,15.)*pixelRatio;
          opacity=mode==4.?.12+.55*pow(.5+.5*sin(time*.9+phase),3.):.25+.12*sin(time*.35+phase);
          opacity*=1.-smoothstep(6.,8.,abs(p.y));}`,
      fragmentShader:`uniform vec3 tint;varying float opacity;varying float bubble;
        void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;
          float a=bubble>.5?exp(-pow((r-.72)*12.,2.))*.6:exp(-r*r*5.);
          gl_FragColor=vec4(tint,a*opacity);
          #include <colorspace_fragment>
        }`,
    });const points=new Points(g,m);points.name=['','dream-floating-lights','underwater-bubbles','space-orbiting-stars','moonforest-fireflies'][mode];points.frustumCulled=false;
    scene.add(points);materials.push(m);geometries.push(g);
  }
  if(kind==='underwater') {
    const g=new PlaneGeometry(1,1);
    const m=new ShaderMaterial({transparent:true,depthWrite:false,side:DoubleSide,blending:AdditiveBlending,
      uniforms:{time:{value:0}},
      vertexShader:`uniform float time;varying vec2 vUv;void main(){vUv=uv;vec3 p=position;p.x+=sin(time*.18+position.y)*.08;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
      fragmentShader:`uniform float time;varying vec2 vUv;void main(){float edge=pow(max(0.,1.-abs(vUv.x-.5)*2.),3.);gl_FragColor=vec4(.55,.86,1.,edge*sin(vUv.y*3.14159265)*(.045+.01*sin(time*.25)));
        #include <colorspace_fragment>
      }`,
    });for(let i=0;i<5;i++){const beam=new Mesh(g,m);beam.name='underwater-lightshaft';beam.position.set((i-2)*4,3,-12-i%2*3);beam.scale.set(1.5,18,1);beam.rotation.z=-.22;scene.add(beam);}
    geometries.push(g);materials.push(m);
  }
  const accents=addAmbientAccents(scene,kind), events=createDreamEvents(scene,kind);
  return {scene,update(time,ratio){
    for(const m of materials){m.uniforms.time.value=time;if(m.uniforms.pixelRatio)m.uniforms.pixelRatio.value=ratio;}
    accents.update(time);events.update(time,ratio);
  },dispose(){accents.dispose();events.dispose();materials.forEach(m=>m.dispose());geometries.forEach(g=>g.dispose());scene.clear();}};
}

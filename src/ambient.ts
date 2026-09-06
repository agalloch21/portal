import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, DoubleSide, Line, Mesh, NormalBlending, PlaneGeometry, Points, Scene, ShaderMaterial } from 'three';

export type Atmosphere = 'forest' | 'underwater' | 'space' | 'dust' | 'dream' | 'greenhouse';
export interface AmbientWorld { scene: Scene; update(time: number, pixelRatio: number): void; dispose(): void }

/** Sparse geometry in world coordinates. No camera-facing fullscreen animation or scenery models. */
export function createAmbient(kind: Atmosphere, initialYaw = 0): AmbientWorld {
  const scene = new Scene();
  scene.rotation.y = -initialYaw;
  let seed = 617;
  const rnd = () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };
  const materials: ShaderMaterial[] = [], geometries: BufferGeometry[] = [];
  const space = (kind === 'space' || kind === 'dream'), underwater = kind === 'underwater';
  const count = space ? 280 : underwater ? 175 : kind === 'forest' ? 85 : 30;
  const positions = new Float32Array(count * 3), phases = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const a = rnd() * Math.PI * 2, y = rnd() * 2 - 1, r = space ? 40 : 6 + rnd() * 17;
    positions.set([Math.cos(a) * Math.sqrt(1 - y * y) * r, y * r, Math.sin(a) * Math.sqrt(1 - y * y) * r], i * 3);
    phases[i] = rnd() * 100;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3)); geometry.setAttribute('phase', new BufferAttribute(phases, 1));
  const material = new ShaderMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending,
    uniforms: { time: { value: 0 }, pixelRatio: { value: 1 }, space: { value: space ? 1 : 0 }, water: { value: underwater ? 1 : 0 }, tint: { value: new Color(space ? '#d8e8ff' : underwater ? '#acdef0' : '#eadfa4') } },
    vertexShader: `attribute float phase;uniform float time;uniform float pixelRatio;uniform float space;uniform float water;
      varying float opacity; varying float bubble;
      void main(){vec3 p=position;
      if(space<.5){p.x+=sin(time*.15+phase)*.18;p.y+=sin(time*.19+phase)*.2;
        if(water>.5){p.y=mod(p.y+time*.13+24.,48.)-24.;}}
      vec4 v=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*v;
      bubble=water>.5&&mod(phase,5.)<1.?1.:0.;
      gl_PointSize=space>.5?(1.2+mod(phase,1.)*1.3)*pixelRatio:clamp((bubble>.5?90.:24.)/max(1.,-v.z),1.2,10.)*pixelRatio;
      opacity=(space>.5?.34:.23)*(.8+.2*sin(time*.38+phase));
      if(space<.5)opacity*=1.-smoothstep(18.,24.,abs(p.y));}`,
    fragmentShader: `uniform vec3 tint;varying float opacity;varying float bubble;
      void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;
      float a=bubble>.5?exp(-pow((r-.7)*10.,2.))*.5:exp(-r*r*5.);
      gl_FragColor=vec4(tint,a*opacity);
      #include <colorspace_fragment>
      }`,
  });
  scene.add(new Points(geometry, material)); materials.push(material); geometries.push(geometry);
  if (space) {
    // One short, slow meteor roughly every 22 seconds, crossing an upper world-space arc.
    const n = 48, positions = new Float32Array(n * 3), along = new Float32Array(n);
    for (let i = 0; i < n; i++) along[i] = i / (n - 1);
    const g = new BufferGeometry(); g.setAttribute('position', new BufferAttribute(positions, 3)); g.setAttribute('along', new BufferAttribute(along, 1));
    const m = new ShaderMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending,
      uniforms: { time: { value: 0 } },
      vertexShader: `attribute float along;uniform float time;varying float alpha;
        void main(){float cycle=mod(time+1.,22.);float progress=clamp(cycle/3.8,0.,1.);
        float a=progress-along*.09;vec3 p=vec3(mix(-17.,18.,a),mix(17.,4.,a),-32.);
        float rotation=floor((time+1.)/22.)*1.7-.65;
        p.xz=mat2(cos(rotation),-sin(rotation),sin(rotation),cos(rotation))*p.xz;
        alpha=(1.-along)*smoothstep(0.,.45,cycle)*(1.-smoothstep(3.,3.8,cycle))*.4;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
      fragmentShader: `varying float alpha;void main(){gl_FragColor=vec4(.65,.78,1.,alpha);
        #include <colorspace_fragment>
        }`,
    });
    const meteor = new Line(g, m); meteor.frustumCulled = false; scene.add(meteor); materials.push(m); geometries.push(g);
  }

  // Distinct, nearby details, with some in the first view and the rest surrounding the viewer.
  const mode = kind === 'dream' ? 1 : underwater ? 2 : kind === 'space' ? 3 : kind === 'greenhouse' ? 4 : 0;
  if (mode) {
    const count = mode === 3 ? 180 : mode === 2 ? 48 : 42;
    const p = new Float32Array(count * 3), phase = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const angle = i < count / 2 ? -Math.PI / 2 + (rnd() - .5) * 1.1 : rnd() * Math.PI * 2;
      const radius = 5 + rnd() * 9;
      p.set([Math.cos(angle) * radius, (rnd() - .5) * 10, Math.sin(angle) * radius], i * 3);
      phase[i] = rnd() * 100;
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(p, 3));
    g.setAttribute('phase', new BufferAttribute(phase, 1));
    const m = new ShaderMaterial({ transparent: true, depthWrite: false,
      blending: mode === 4 ? NormalBlending : AdditiveBlending,
      uniforms: { time: { value: 0 }, pixelRatio: { value: 1 }, mode: { value: mode } },
      vertexShader: `attribute float phase;uniform float time;uniform float pixelRatio;uniform float mode;
        varying float opacity;varying float turn;varying float hue;
        void main(){vec3 p=position;
          if(mode==3.){float a=time*.018+sin(phase)*.08; p.xz=mat2(cos(a),-sin(a),sin(a),cos(a))*p.xz; p.y+=sin(time*.2+phase)*.25;}
          else {p.x+=sin(time*.25+phase)*.45;p.z+=cos(time*.18+phase)*.25;
            if(mode==2.)p.y=mod(p.y+time*(.25+mod(phase,1.)*.15)+6.,12.)-6.;
            else if(mode==4.)p.y=mod(p.y-time*.16+6.,12.)-6.;
            else p.y+=sin(time*.3+phase)*.6;}
          vec4 v=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*v;
          float size=mode==3.?22.:mode==4.?100.:mode==2.?120.:85.;
          gl_PointSize=clamp(size/max(1.,-v.z),2.,24.)*pixelRatio;
          opacity=(mode==4.?.48:.38)*(.75+.25*sin(time*.6+phase))*(1.-smoothstep(4.5,6.,abs(p.y)));
          turn=time*.3+phase;hue=mod(phase,1.);
        }`,
      fragmentShader: `uniform float mode;varying float opacity;varying float turn;varying float hue;
        void main(){vec2 p=(gl_PointCoord-.5)*2.;float r=length(p);if(r>1.)discard;
          vec3 color=mix(vec3(.55,.8,1.),vec3(1.,.72,.83),hue);float a=exp(-r*r*5.);
          if(mode==2.){a=exp(-pow((r-.72)*12.,2.))*.6+exp(-dot(p-vec2(-.3,.4),p-vec2(-.3,.4))*65.)*.45;color=vec3(.65,.9,1.);}
          if(mode==4.){p=mat2(cos(turn),-sin(turn),sin(turn),cos(turn))*p;
            float petal=length(p*vec2(1.6,1.));a=1.-smoothstep(.65,.95,petal);color=mix(vec3(.98,.85,.65),vec3(.94,.65,.78),hue);}
          gl_FragColor=vec4(color,a*opacity);
          #include <colorspace_fragment>
        }`,
    });
    const details = new Points(g, m); details.frustumCulled = false;
    scene.add(details); materials.push(m); geometries.push(g);
  }
  if (underwater) {
    // Soft shafts exist in the world, not as a screen overlay. Never flash or strobe.
    const g = new PlaneGeometry(1, 1);
    const m = new ShaderMaterial({ transparent: true, depthWrite: false, side: DoubleSide, blending: AdditiveBlending,
      uniforms: { time: { value: 0 } },
      vertexShader: `uniform float time;varying vec2 uvLocal;
        void main(){uvLocal=uv;vec3 p=position;p.x+=sin(time*.18+position.y)*.08;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
      fragmentShader: `uniform float time;varying vec2 uvLocal;
        void main(){float edge=pow(max(0.,1.-abs(uvLocal.x-.5)*2.),3.);
          float a=edge*sin(uvLocal.y*3.14159265)*(.045+.01*sin(time*.25));
          gl_FragColor=vec4(.55,.86,1.,a);
          #include <colorspace_fragment>
        }`,
    });
    for(let i=0;i<5;i++){
      const beam=new Mesh(g,m);beam.position.set((i-2)*4,3,-12-i%2*3);beam.scale.set(1.5,18,1);beam.rotation.z=-.22;scene.add(beam);
    }
    geometries.push(g);materials.push(m);
  }
  return { scene, update(time, pixelRatio) {
    for (const material of materials) { material.uniforms.time.value = time; if (material.uniforms.pixelRatio) material.uniforms.pixelRatio.value = pixelRatio; }
  }, dispose() { geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); scene.clear(); } };
}

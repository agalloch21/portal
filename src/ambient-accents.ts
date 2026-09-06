import { AdditiveBlending, BufferAttribute, BufferGeometry, DoubleSide, Mesh, PlaneGeometry, Scene, ShaderMaterial } from 'three';
import type { Atmosphere } from './ambient';

/** Small world-space accents; share the renderer's clock, pause and camera. */
export function addAmbientAccents(scene: Scene, kind: Atmosphere) {
  const materials: ShaderMaterial[] = [], geometries: BufferGeometry[] = [];
  if (kind === 'forest') {
    const geometry = new PlaneGeometry(1, 1);
    const material = new ShaderMaterial({ transparent: true, depthWrite: false, side: DoubleSide, blending: AdditiveBlending,
      uniforms: { time: { value: 0 } },
      vertexShader: `uniform float time;varying vec2 vUv;
        void main(){vUv=uv;vec3 p=position;p.x+=sin(time*.13+p.y*2.)*.035;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
      fragmentShader: `uniform float time;varying vec2 vUv;
        void main(){float edge=pow(max(0.,1.-abs(vUv.x-.5)*2.),3.);
          float taper=sin(vUv.y*3.14159265);float shimmer=.8+.2*sin(time*.22+vUv.y*3.);
          gl_FragColor=vec4(1.,.72,.36,edge*taper*shimmer*.12);
          #include <colorspace_fragment>
        }`,
    });
    for(let i=0;i<6;i++) {
      const shaft=new Mesh(geometry,material);shaft.name='forest-sunshaft';
      shaft.position.set((i-2.5)*2.6,2,-9-i%3*3);
      shaft.scale.set(.9+i%2*.65,14,1);shaft.rotation.z=-.35;
      scene.add(shaft);
    }
    materials.push(material);geometries.push(geometry);
  }
  if (kind === 'lake') {
    const geometry = new PlaneGeometry(26, 22, 1, 1);
    const material = new ShaderMaterial({ transparent:true, depthWrite:false, side:DoubleSide, blending:AdditiveBlending,
      uniforms:{time:{value:0}},
      vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`uniform float time;varying vec2 vUv;
        void main(){vec2 p=vUv-.5;float mask=(1.-smoothstep(.25,.5,abs(p.x)))*(1.-smoothstep(.2,.5,abs(p.y)));
          float ripple=0.;
          for(int i=0;i<3;i++){float f=float(i);vec2 center=vec2(sin(f*4.)*.22,cos(f*3.)*.2);
            float age=mod(time*.06+f*.33,1.);float radius=age*.42;
            float d=length((p-center)*vec2(1.,1.4));
            ripple+=exp(-pow((d-radius)*150.,2.))*sin(age*3.14159265);}
          float shine=pow(max(0.,sin(vUv.y*180.+sin(vUv.x*24.+time*.3)*2.-time*.65)),18.);
          float band=exp(-pow(p.x*7.+sin(time*.1)*.4,2.));
          gl_FragColor=vec4(1.,.82,.55,mask*(ripple*.18+shine*band*.13));
          #include <colorspace_fragment>
        }`,
    });
    const water=new Mesh(geometry,material);water.name='lake-ripples';water.rotation.x=-Math.PI/2;water.position.set(0,-3.4,-12);
    scene.add(water);materials.push(material);geometries.push(geometry);
  }
  if(kind==='underwater') {
    // Deliberately soft fish silhouettes: body and moving tail, with no detailed models.
    const count=9, vertices=[-.35,0,0, 0,.12,0, .28,0,0, -.35,0,0, .28,0,0, 0,-.12,0, -.3,0,0, -.52,.16,0, -.52,-.16,0];
    const positions=new Float32Array(count*vertices.length), phases=new Float32Array(count*vertices.length/3);
    for(let i=0;i<count;i++){positions.set(vertices,i*vertices.length);phases.fill(i,i*vertices.length/3,(i+1)*vertices.length/3);}
    const geometry=new BufferGeometry();geometry.setAttribute('position',new BufferAttribute(positions,3));geometry.setAttribute('phase',new BufferAttribute(phases,1));
    const material=new ShaderMaterial({transparent:true,depthWrite:false,side:DoubleSide,
      uniforms:{time:{value:0}},
      vertexShader:`attribute float phase;uniform float time;varying float alpha;
        void main(){vec3 p=position;float t=time*.07+phase*.42;
          if(p.x<-.3)p.z+=sin(time*2.+phase)*.1;
          float facing=cos(t);p.x*=facing;
          p+=vec3(sin(t)*7.,sin(phase*2.1)*2.-.7+sin(time*.3+phase)*.15,-10.-mod(phase,3.)*2.);
          alpha=.22+.08*sin(phase);gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
      fragmentShader:`varying float alpha;void main(){gl_FragColor=vec4(.18,.48,.56,alpha);
        #include <colorspace_fragment>
      }`,
    });
    const fish=new Mesh(geometry,material);fish.name='underwater-fish';fish.frustumCulled=false;scene.add(fish);materials.push(material);geometries.push(geometry);
  }
  return {
    update(time:number){for(const material of materials)material.uniforms.time.value=time;},
    dispose(){materials.forEach(m=>m.dispose());geometries.forEach(g=>g.dispose());},
  };
}

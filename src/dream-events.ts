import { AdditiveBlending, BufferAttribute, BufferGeometry, DoubleSide, Mesh, NormalBlending, PlaneGeometry, Scene, ShaderMaterial } from 'three';
import type { Atmosphere } from './ambient';

/** Surreal accents share the ambient clock: periodic events, never wall-clock timers. */
export function createDreamEvents(scene: Scene, kind: Atmosphere) {
  const materials: ShaderMaterial[] = [], geometries: BufferGeometry[] = [];
  const palette = `vec3 palette(float t){return .6+.4*cos(6.2831853*(vec3(0.,.32,.63)+t));}`;
  if (kind === 'greenhouse') {
    // One batched mesh: 20 soft colored trails over a 12-second shower, then a rest.
    const vertices:number[]=[], coords:number[]=[], ids:number[]=[];
    for(let id=0;id<20;id++) for(let segment=0;segment<24;segment++) {
      const a=segment/24,b=(segment+1)/24;
      for(const [u,v] of [[a,-1],[b,-1],[b,1],[a,-1],[b,1],[a,1]]) {
        vertices.push(0,0,0);coords.push(u,v);ids.push(id);
      }
    }
    const g=new BufferGeometry();g.setAttribute('position',new BufferAttribute(new Float32Array(vertices),3));
    g.setAttribute('trail',new BufferAttribute(new Float32Array(coords),2));g.setAttribute('eventId',new BufferAttribute(new Float32Array(ids),1));
    const m=new ShaderMaterial({transparent:true,depthWrite:false,side:DoubleSide,blending:NormalBlending,
      uniforms:{time:{value:0}},
      vertexShader:`attribute vec2 trail;attribute float eventId;uniform float time;varying vec2 vTrail;varying float alpha;varying float hue;
        void main(){float clock=mod(time+1.,28.);float age=clock-eventId*.43;float progress=age/4.2;
          float t=progress-trail.x*.22;float lane=mod(eventId*1.618,1.);
          vec3 p=vec3(mix(-22.,24.,t)+sin(eventId*3.)*8.,mix(17.,-8.,t)+lane*10.-5.,-26.-mod(eventId,4.)*3.);
          p.y+=sin(t*2.5+eventId)*.5;p.xy+=vec2(.48,.88)*trail.y*.12*(1.-trail.x*.8);
          vTrail=trail;alpha=smoothstep(0.,.6,age)*(1.-smoothstep(3.2,4.2,age));hue=eventId*.073+floor((time+1.)/28.)*.13;
          gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
      fragmentShader:`varying vec2 vTrail;varying float alpha;varying float hue;${palette}
        void main(){float glow=pow(max(0.,1.-abs(vTrail.y)),1.5)*pow(1.-vTrail.x,1.4);
          gl_FragColor=vec4(palette(hue+vTrail.x*.12),glow*alpha*.95);
          #include <colorspace_fragment>
        }`,
    });const mesh=new Mesh(g,m);mesh.name='colored-meteor-shower';mesh.frustumCulled=false;scene.add(mesh);geometries.push(g);materials.push(m);
  }
  if(kind==='dream') {
    const g=new PlaneGeometry(26,4,90,4);
    const m=new ShaderMaterial({transparent:true,depthWrite:false,side:DoubleSide,blending:AdditiveBlending,
      uniforms:{time:{value:0},strength:{value:.16}},
      vertexShader:`uniform float time;varying vec2 vUv;void main(){vUv=uv;vec3 p=position;p.y+=sin(p.x*.22+time*.23)*1.4+cos(p.x*.1-time*.17)*.8;p.z+=cos(p.x*.18+time*.14)*1.5;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
      fragmentShader:`uniform float time;uniform float strength;varying vec2 vUv;${palette}
        void main(){float edge=pow(sin(vUv.y*3.14159265),3.)*sin(vUv.x*3.14159265);
          float waves=.6+.4*sin(vUv.x*19.-time*.6+vUv.y*5.);gl_FragColor=vec4(palette(vUv.x*.45+time*.018),edge*waves*strength);
          #include <colorspace_fragment>
        }`,
    });for(let i=0;i<2;i++){const band=new Mesh(g,m);band.name='dream-light-tide';band.position.set(0,i*3-1,-15-i*8);band.frustumCulled=false;scene.add(band);}
    materials.push(m);geometries.push(g);
  }

  if(kind==='clouds') {
    const g=new PlaneGeometry(30,5,50,1);
    const m=new ShaderMaterial({transparent:true,depthWrite:false,side:DoubleSide,blending:NormalBlending,
      uniforms:{time:{value:0}},
      vertexShader:`uniform float time;varying vec2 vUv;void main(){vUv=uv;vec3 p=position;p.y+=sin(p.x*.2+time*.08)*.45;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
      fragmentShader:`uniform float time;varying vec2 vUv;void main(){vec2 p=vUv;float billow=.5+.25*sin(p.x*14.+time*.11)+.15*sin(p.x*31.-time*.07);
        float mist=exp(-pow((p.y-.5)*5.,2.))*billow*sin(p.x*3.14159265);
        gl_FragColor=vec4(1.,.86,.78,mist*.16);
        #include <colorspace_fragment>
      }`,
    });for(let i=0;i<3;i++){const cloud=new Mesh(g,m);cloud.name='drifting-cloud-veil';cloud.position.set(i%2*4-2,-2-i*.8,-9-i*6);cloud.frustumCulled=false;scene.add(cloud);}
    materials.push(m);geometries.push(g);
  }
  return {update(time:number,ratio:number){for(const m of materials){m.uniforms.time.value=time;if(m.uniforms.pixelRatio)m.uniforms.pixelRatio.value=ratio;}},dispose(){materials.forEach(m=>m.dispose());geometries.forEach(g=>g.dispose());}};
}

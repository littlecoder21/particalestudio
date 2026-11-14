/**
 * GLSL for the particle pass. Replaces the inline VERT / FRAG strings in renderer.ts (see UPGRADE.md).
 *
 * With default LightStage / ParticleFx uniforms this is numerically identical to the original shader:
 *   core 0.8·exp(-q²) + halo 0.28·exp(-q²/2.8²), shimmer 1, glint 0.82 + 0.18·sin⁸, gain 1,
 *   size clamp 1..120 px, no jitter / twinkle / depth-of-field / motes / wander / flow.
 *
 * Uniform layout (mirrored by packStageUniforms in lightStage.ts):
 *   uStageA = (reveal, ambient, ambientDepth, gain)       uStageB = (litKnee, glintDepth, glintSharpness, glintRate)
 *   uStageC = (glintBoost, litSize, reflectivityBias, normalResponse)   uStageColor = (r, g, b, mix)
 *   uFxA = (sizeCurve, minPx, maxPx, moteShare)           uFxB = (moteScale, moteAlpha, opacityJitter, colorJitter)
 *   uFxC = (twinkle, twinkleRate, twinkleSharp, dof)      uFxD = (dofDim, wander, wanderSpeed, flow)
 *   uFxE = (flowScale, flowSpeed, -, -)
 *   uBeamExtra[i] = (halo, haloSize, coreSharp, shimmer)  uBeamColor[i] = (r, g, b, mix)
 */
export const STAGE_UNIFORM_NAMES = ["uBeamExtra", "uBeamColor", "uStageA", "uStageB", "uStageC", "uStageColor", "uFxA", "uFxB", "uFxC", "uFxD", "uFxE"] as const;

export const VERT_SHADER = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aVel; layout(location=2) in vec3 aNrm; layout(location=3) in vec4 aMisc;
uniform mat4 uView, uProj; uniform float uPx, uOrtho, uSize, uSizeVar, uSizeAtt, uTime, uOpacity, uEmission, uNorm, uEdge, uDepthFade, uDepthColor, uVelColor, uStretch, uLight, uSpin, uFocus, uRange;
uniform vec3 uLightDir; uniform vec4 uLayer[4]; uniform sampler2D uPalette;
uniform int uBeamCount;
uniform vec4 uBeamOriginLen[20], uBeamDirWidth[20], uBeamProfile[20], uBeamAnim[20], uBeamTint[20], uBeamSideA[20], uBeamSideB[20], uBeamExtra[20], uBeamColor[20];
uniform vec4 uStageA, uStageB, uStageC, uStageColor;
uniform vec4 uFxA, uFxB, uFxC, uFxD, uFxE;
out vec4 vCol; out vec2 vDir; out float vStretch; out float vMote;
float h11(float p){ return fract(sin(p*127.1)*43758.5453); }
void main(){
  float layer = floor(aMisc.w); float ph = fract(aMisc.w); int li = int(clamp(layer,0.,3.));

  // Visual-only motion: per-particle wobble plus a shared air-current field (neighbours drift together).
  vec3 P = aPos;
  if(uFxD.y > 0.0){
    float ws = uFxD.z;
    P += uFxD.y * vec3(sin(uTime*ws*1.31 + ph*37.1), sin(uTime*ws*1.73 + ph*91.7 + 1.3), sin(uTime*ws*1.12 + ph*53.3 + 2.1));
  }
  if(uFxD.w > 0.0){
    float fs = uFxE.x, ft = uTime*uFxE.y;
    P += uFxD.w * vec3(
      sin(aPos.y*fs + ft) + 0.5*sin(aPos.z*fs*2.3 - ft*0.7),
      sin(aPos.z*fs + ft*1.1) + 0.5*sin(aPos.x*fs*2.1 + ft*0.6),
      sin(aPos.x*fs - ft*0.9) + 0.5*sin(aPos.y*fs*1.9 + ft*0.8));
  }
  vec4 vp = uView*vec4(P,1.0); float depth = -vp.z; gl_Position = uProj*vp;
  float hasN = step(0.01, dot(aNrm,aNrm)); vec3 nv = (uView*vec4(aNrm,0.0)).xyz; nv = hasN > 0.5 ? normalize(nv) : vec3(0.0,0.0,1.0);
  vec3 nWorld = hasN > 0.5 ? normalize(aNrm) : vec3(0.0,0.0,1.0);
  float dz = clamp((depth-(uFocus-uRange))/(2.0*uRange),0.0,1.0);

  // ---- light stage: every beam lights the particles it touches ----
  float gain = uStageA.w, gDepth = uStageB.y, gSharp = uStageB.z, gRate = uStageB.w, gBoost = uStageC.x, reflBias = uStageC.z, normResp = uStageC.w;
  float beamEnergy = 0.0, glintAcc = 0.0; vec3 beamColor = vec3(0.0);
  for(int i=0;i<20;i++){
    if(i>=uBeamCount) break;
    vec4 originLen=uBeamOriginLen[i], dirWidth=uBeamDirWidth[i], profile=uBeamProfile[i], anim=uBeamAnim[i], tint=uBeamTint[i], ex=uBeamExtra[i];
    vec3 beamDir=dirWidth.xyz; vec3 rel=P-originLen.xyz;
    float alongDistance=dot(rel,beamDir), u=alongDistance/originLen.w;
    if(u<0.0||u>1.0) continue;
    vec3 lateral=rel-beamDir*alongDistance;
    float sa=dot(lateral,uBeamSideA[i].xyz), sb=dot(lateral,uBeamSideB[i].xyz);
    float bendA=0.0, bendB=0.0;
    if(profile.x>1.5&&profile.x<2.5){
      bendA=profile.z*sin(3.14159265*u)+profile.z*0.22*tint.y*sin(u*7.5+anim.y+uTime*anim.x*0.31);
    }else if(profile.x>2.5){
      float turn=u*6.2831853*max(0.25,abs(tint.z))+anim.y+uTime*anim.x*0.31;
      float helixRadius=dirWidth.w*(0.8+profile.y*0.12);
      bendA=cos(turn)*helixRadius; bendB=sin(turn)*helixRadius;
    }
    float widen=profile.x>0.5&&profile.x<1.5?profile.y:profile.y*0.12;
    float swell=1.0+0.38*tint.y*sin(u*4.2+anim.y+uTime*anim.x*0.33);
    float radius=dirWidth.w*(1.0+widen*u)*swell;
    float q=length(vec2(sa-bendA,sb-bendB))/max(0.001,radius);
    if(q>7.4*max(1.0,ex.y/2.8)) continue;
    float q2=q*q;
    float beamProfile=0.8*exp(-q2*ex.z)+ex.x*exp(-q2/(ex.y*ex.y));
    float alongFade=smoothstep(0.0,anim.z,u)*(1.0-smoothstep(1.0-anim.w,1.0,u));
    float wave=0.84+ex.w*(0.16*sin(u*9.0-uTime*anim.x*0.5+anim.y)+0.07*sin(u*23.0+q*0.6+uTime*anim.x*1.6+anim.y));
    float randRefl=0.25+0.75*pow(h11(ph*113.1),reflBias);
    float normRefl=0.3+0.7*max(dot(nWorld,-beamDir),0.0);
    float reflectivity=hasN>0.5?mix(randRefl,normRefl,normResp):randRefl;
    float glint=pow(max(0.0,sin(uTime*(0.6+anim.x)*gRate+ph*6.2832)),gSharp);
    float reflected=beamProfile*alongFade*max(0.0,wave)*profile.w*gain*reflectivity*((1.0-gDepth)+gDepth*glint)*(1.0+gBoost*glint);
    vec3 pc=texture(uPalette,vec2(tint.x,(layer+0.5)/4.0)).rgb;
    pc=mix(pc,uStageColor.rgb,uStageColor.a);
    pc=mix(pc,uBeamColor[i].rgb,uBeamColor[i].a);
    beamEnergy+=reflected; glintAcc+=glint*reflected; beamColor+=pc*reflected;
  }
  float glintAvg = beamEnergy>0.0001 ? glintAcc/beamEnergy : 0.0;
  float lit = smoothstep(0.0, max(0.01,uStageB.x), beamEnergy);

  // ---- size: distribution curve, rare soft motes, depth of field, growth in the light ----
  float hSize = h11(ph*91.7);
  float sz = uSize * mix(1.0-uSizeVar, 1.0+uSizeVar, pow(hSize, uFxA.x)) * aMisc.y * uLayer[li].x;
  float mote = h11(ph*53.7+3.1) < uFxA.w ? 1.0 : 0.0;
  sz *= mix(1.0, uFxB.x, mote);
  float coc = clamp(abs(depth-uFocus)/max(0.01,2.0*uRange),0.0,1.0);
  float grow = 1.0 + uFxC.w*coc*coc*3.0;
  sz *= grow;
  sz *= 1.0 + uStageC.y*min(1.0,beamEnergy)*(0.35+0.65*glintAvg);
  float persp = uOrtho > 0.5 ? uPx : (uSizeAtt > 0.5 ? uPx/max(depth,0.01) : uPx/max(uFocus,0.01));
  float px = sz*persp;
  float speed = length(aVel); vec2 vv = (uView*vec4(aVel,0.0)).xy; float vl = length(vv);
  float stretch = 1.0 + uStretch*clamp(speed*0.3, 0.0, 5.0);
  vec2 dir = vl > 1e-3 && uStretch > 0.0 ? vv/vl : vec2(cos(ph*6.2832+uSpin*uTime*(ph-0.5)), sin(ph*6.2832+uSpin*uTime*(ph-0.5)));
  float size = clamp(px*stretch, uFxA.y, uFxA.z); gl_PointSize = size;
  float energy = min(1.0, (px*px)/1.0);

  // ---- colour and opacity ----
  float rim = mix(0.5, 1.0-abs(nv.z)*abs(nv.z), hasN);
  float b = 1.0 + uEdge*(rim*rim*1.3 - 0.35);
  float lam = mix(0.6, max(0.0, dot(nv, uLightDir)), hasN); b *= mix(1.0, 0.3 + 1.0*lam, uLight);
  float fade = mix(1.0, 0.26+0.74*(1.0-dz), uDepthFade);
  float t = clamp(aMisc.x + uDepthColor*(dz-0.5) + uVelColor*clamp(speed*0.25,0.0,1.0) + (h11(ph*61.7)-0.5)*uFxB.w, 0.0, 1.0);
  vec3 col = texture(uPalette, vec2(t, (layer+0.5)/4.0)).rgb;
  float a = uOpacity*uNorm*aMisc.z*uLayer[li].y*fade*b*energy;
  a /= mix(1.0, grow*grow, uFxD.x);
  a *= mix(1.0, uFxB.y, mote);
  a *= 1.0 - uFxB.z*h11(ph*29.3);
  float tw = pow(0.5+0.5*sin(uTime*uFxC.y*(0.4+h11(ph*7.7)) + ph*18.8496), uFxC.z);
  a *= mix(1.0, tw, uFxC.x);
  // Reveal by light: dim everything outside the beams so only lit particles show (ignored when there are no beams).
  float gate = uBeamCount>0 ? uStageA.x : 0.0;
  float amb = uStageA.y*mix(1.0, 0.35+0.65*(1.0-dz), uStageA.z);
  a *= mix(1.0, mix(amb, 1.0, lit), gate);
  if(beamEnergy>0.0001) col+=beamColor/max(beamEnergy,0.0001)*min(2.5,beamEnergy)*1.25;
  vCol = vec4(col*uEmission, a); vDir = dir; vStretch = stretch; vMote = mote;
}`;

export const FRAG_SHADER = `#version 300 es
precision mediump float;
in vec4 vCol; in vec2 vDir; in float vStretch; in float vMote;
uniform int uShape; uniform float uSoft;
out vec4 o;
void main(){
  vec2 c = gl_PointCoord*2.0-1.0; vec2 q = vec2(dot(c,vDir), dot(c,vec2(-vDir.y,vDir.x))); q.x /= max(vStretch*0.55,1.0); q.x *= 1.0;
  float r2 = dot(q,q), r = sqrt(r2), a;
  int shp = vMote > 0.5 ? 0 : uShape;
  if(shp==0){ a = exp(-r2*mix(7.0,2.2,uSoft)) * smoothstep(1.0,0.72,r); }
  else if(shp==1){ a = smoothstep(1.0,0.82,r); }
  else if(shp==2){ a = smoothstep(0.22,0.0,abs(r-0.72)); }
  else if(shp==3){ a = max(exp(-abs(q.x)*14.0-abs(q.y)*2.5), exp(-abs(q.y)*14.0-abs(q.x)*2.5)) * smoothstep(1.0,0.8,r) + 0.5*exp(-r2*12.0); }
  else if(shp==4){ a = 1.0-smoothstep(0.78,0.98,max(abs(q.x),abs(q.y))); }
  else { a = 1.0-smoothstep(0.7,0.95,abs(q.x)+abs(q.y)); }
  if(a < 0.004) discard;
  o = vec4(vCol.rgb*vCol.a*a, vCol.a*a);
}`;

/** Beam guides (preview only): plain coloured lines. */
export const GUIDE_VERT = `#version 300 es
precision highp float;
layout(location=0) in vec3 aP; uniform mat4 uView, uProj;
void main(){ gl_Position = uProj*uView*vec4(aP,1.0); }`;
export const GUIDE_FRAG = `#version 300 es
precision mediump float;
uniform vec3 uColor; out vec4 o;
void main(){ o = vec4(uColor, 1.0); }`;

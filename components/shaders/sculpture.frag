#version 460 core
#include <flutter/runtime_effect.glsl>
uniform vec2 uResolution;
uniform float uProgress;
out vec4 fragColor;
const float PI=3.14159265359;
mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
vec3 local(vec3 p){
  p.y-=0.12*sin(2.0*PI*uProgress);
  p.xz=rot(2.0*PI*uProgress)*p.xz;
  p.xy=rot(0.45)*p.xy;
  p.yz=rot(0.70)*p.yz;
  return p;
}
float sculpt(vec3 p){
  p=local(p);
  float a=atan(p.z,p.x);
  float radius=0.87+0.14*cos(3.0*a);
  vec2 tube=vec2(length(p.xz)-radius,p.y-0.22*sin(3.0*a));
  float thickness=0.245+0.025*cos(6.0*a);
  return length(tube)-thickness;
}
vec3 normalAt(vec3 p){
 vec2 e=vec2(0.0015,0.0);
 return normalize(vec3(sculpt(p+e.xyy)-sculpt(p-e.xyy),sculpt(p+e.yxy)-sculpt(p-e.yxy),sculpt(p+e.yyx)-sculpt(p-e.yyx)));
}
vec3 studio(vec3 d){
 vec3 c=mix(vec3(.015,.026,.075),vec3(.14,.23,.48),smoothstep(-.5,.9,d.y));
 float panel=pow(max(0.,dot(d,normalize(vec3(-.65,1.,.8)))),28.);
 float strip=pow(max(0.,dot(d,normalize(vec3(.85,.3,-.5)))),70.);
 float rim=pow(max(0.,dot(d,normalize(vec3(-.3,.2,-1.)))),25.);
 return c+vec3(2.8,3.1,3.5)*panel+vec3(.6,1.8,3.5)*strip+vec3(1.4,.9,.55)*rim;
}
float ao(vec3 p,vec3 n){
 float a=0.;float w=1.;
 for(int i=1;i<=4;i++){float h=.075*float(i);a+=w*(h-sculpt(p+n*h));w*=.55;}
 return clamp(1.-2.*a,.25,1.);
}
vec3 render(vec2 uv){
 vec3 ro=vec3(0.,.35,4.6);
 vec3 forward=normalize(vec3(0.,0.,0.)-ro);
 vec3 right=normalize(cross(forward,vec3(0.,1.,0.)));
 vec3 up=cross(right,forward);
 vec3 rd=normalize(right*uv.x+up*uv.y+forward*1.6);
 float halo=exp(-1.5*dot(uv-vec2(.10,.1),uv-vec2(.10,.1)));
 vec3 color=mix(vec3(.012,.018,.05),vec3(.06,.12,.34),halo);
 // A quiet illuminated ground establishes the sculpture's scale and weight.
 if(rd.y<-.001){
   float tf=(-1.5-ro.y)/rd.y;
   vec3 pf=ro+rd*tf;
   float pool=exp(-.45*dot(pf.xz,pf.xz));
   float shadow=exp(-2.4*dot(pf.xz,pf.xz));
   color+=vec3(.025,.065,.15)*pool;
   color*=1.-.65*shadow;
 }
 float travel=0.;bool hit=false;
 for(int i=0;i<150;i++){
   vec3 p=ro+rd*travel;
   float d=sculpt(p);
   if(d<.001){hit=true;break;}
   travel+=d*.45;
   if(travel>8.)break;
 }
 if(hit){
  vec3 p=ro+rd*travel;
  vec3 n=normalAt(p);
  vec3 v=-rd;
  vec3 r=reflect(rd,n);
  float fres=pow(1.-max(dot(n,v),0.),5.);
  vec3 base=vec3(.035,.12,.55);
  vec3 light=normalize(vec3(-3.,4.,4.));
  float diffuse=max(dot(n,light),0.);
  float sheen=pow(max(dot(n,normalize(light+v)),0.),95.);
  color=base*(.19+.7*diffuse)*ao(p,n);
  color+=studio(r)*mix(vec3(.24,.38,.62),vec3(.95),fres)*.8;
  color+=vec3(.6,.8,1.)*sheen*.75;
  // Fine machined bands follow the surface without adding visual labels.
  vec3 q=local(p);
  float band=.5+.5*cos(90.*atan(q.z,q.x));
  color*=.96+.04*band;
 }
 color=color/(color+vec3(.8));
 color=pow(color,vec3(.85));
 return color;
}
void main(){
 vec2 uv=(FlutterFragCoord().xy-.5*uResolution)/uResolution.x;
 uv.y=-uv.y;
 fragColor=vec4(render(uv),1.);
}

// Original Flutter implementation of standard ordered Bayer dithering.
// Paper Shaders is a visual/API reference; no Paper source is copied here.
#version 460 core
#include <flutter/runtime_effect.glsl>
uniform vec2 uSize;
uniform float uTime;
uniform float uCell;
uniform float uOrder;
uniform float uShape;
uniform float uContrast;
uniform float uBias;
uniform vec4 uBack;
uniform vec4 uFront;
out vec4 fragColor;
float threshold(vec2 cell) {
 float value=0.;float denom=1.;vec2 p=cell;
 for(int i=0;i<3;i++) {
  if(float(i)<uOrder){vec2 bit=mod(p,2.);value=value*4.+2.*mod(bit.x+bit.y,2.)+bit.y;denom*=4.;p=floor(p/2.);}
 }
 return (value+.5)/denom;
}
void main(){
 vec2 cell=floor(FlutterFragCoord().xy/uCell);
 vec2 xy=(cell+.5)*uCell;
 vec2 uv=(xy-.5*uSize)/min(uSize.x,uSize.y);
 float value;
 if(uShape<.5){value=.5+.28*sin(uv.x*9.+sin(uv.y*6.+uTime)*1.6+uTime);}
 else if(uShape<1.5){
  vec2 q=uv*2.6;float r=dot(q,q);
  if(r<1.){vec3 n=vec3(q,sqrt(1.-r));vec3 light=normalize(vec3(.6*cos(uTime),-.65,.8));value=.12+.83*max(dot(n,light),0.);}
  else value=0.;
 } else {value=.5+.45*sin(length(uv)*24.-uTime*2.);}
 value=clamp((value-.5)*uContrast+.5+uBias,0.,1.);
 vec4 color=mix(uBack,uFront,step(threshold(cell),value));
 fragColor=vec4(color.rgb*color.a,color.a);
}

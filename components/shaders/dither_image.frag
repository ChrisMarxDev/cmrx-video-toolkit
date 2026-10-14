// Original two-color ordered-dither image filter. Preserves source alpha.
#version 460 core
#include <flutter/runtime_effect.glsl>
uniform vec2 uSize;
uniform float uCell;
uniform float uOrder;
uniform float uContrast;
uniform float uBias;
uniform float uInvert;
uniform vec4 uBack;
uniform vec4 uFront;
uniform vec4 uSource; // normalized source rectangle
uniform vec4 uDest; // local destination rectangle
uniform sampler2D uImage;
out vec4 fragColor;
float threshold(vec2 cell){
 float value=0.;float denom=1.;vec2 p=cell;
 for(int i=0;i<3;i++){
  if(float(i)<uOrder){vec2 bit=mod(p,2.);value=value*4.+2.*mod(bit.x+bit.y,2.)+bit.y;denom*=4.;p=floor(p/2.);}
 }
 return (value+.5)/denom;
}
void main(){
 vec2 xy=FlutterFragCoord().xy;
 if(xy.x<uDest.x || xy.y<uDest.y || xy.x>=uDest.x+uDest.z || xy.y>=uDest.y+uDest.w){fragColor=vec4(0.);return;}
 vec2 cell=floor(xy/uCell);
 vec2 pos=clamp(((cell+.5)*uCell-uDest.xy)/uDest.zw,vec2(0.),vec2(1.));
 vec4 sampleColor=texture(uImage,uSource.xy+pos*uSource.zw);
 vec3 rgb=sampleColor.a>0.00001 ? sampleColor.rgb/sampleColor.a : vec3(0.);
 float value=dot(rgb,vec3(.2126,.7152,.0722));
 value=mix(value,1.-value,uInvert);
 value=clamp((value-.5)*uContrast+.5+uBias,0.,1.);
 vec4 color=mix(uBack,uFront,step(threshold(cell),value));
 float alpha=color.a*sampleColor.a;
 fragColor=vec4(color.rgb*alpha,alpha);
}

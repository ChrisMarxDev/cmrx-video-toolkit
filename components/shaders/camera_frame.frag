#version 460 core
#include <flutter/runtime_effect.glsl>
uniform vec2 uSize;
uniform float uShape;
uniform float uFeather;
uniform float uDither;
uniform float uCell;
out vec4 fragColor;

float bayer2(vec2 p) {
  return p.y < 1.0 ? (p.x < 1.0 ? 0.0 : 2.0) : (p.x < 1.0 ? 3.0 : 1.0);
}
void main() {
  vec2 p = FlutterFragCoord().xy;
  vec2 halfSize = uSize * .5;
  float shortest = min(uSize.x, uSize.y);
  vec2 edge = halfSize - abs(p - halfSize);
  float inward = uShape < .5 ? min(edge.x, edge.y)
    : shortest * .5 - length(p - halfSize);
  float alpha = smoothstep(0.0, max(.001, shortest * uFeather), inward);
  vec2 cell = floor(p / max(.001, uCell));
  // Fixed canonical 4x4 Bayer grid: no time/noise and no image color quantization.
  float bayer = 4.0 * bayer2(mod(cell, 2.0)) + bayer2(mod(floor(cell / 2.0), 2.0));
  float coverage = step((bayer + .5) / 16.0, alpha);
  float mask = mix(alpha, coverage, uDither);
  fragColor = vec4(mask); // Premultiplied white mask; preserve child RGB and alpha.
}

import React from "react";
export function MatrixLoader({
  className = "matrix-loader",
}: {
  className?: string;
}) {
  return (
    <span className={className} aria-hidden="true">
      {Array.from({ length: 16 }, (_, i) => (
        <i key={i} />
      ))}
    </span>
  );
}

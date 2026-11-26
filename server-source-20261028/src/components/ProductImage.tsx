"use client";

import { useState } from "react";
import Image from "next/image";

type ProductImageProps = {
  src: string;
  alt?: string;
  width?: number;
  height?: number;
  className?: string;
};

export default function ProductImage({
  src,
  alt = "product image",
  width = 384,
  height = 256,
  className = "",
}: ProductImageProps) {
  const [hasError, setHasError] = useState(false);

  const finalSrc = hasError ? "/images/placeholder.png" : src;

  return (
    <div className={`relative overflow-hidden ${className}`} style={{ width, height }}>
      <Image
        src={finalSrc}
        alt={alt}
        width={width}
        height={height}
        className="h-full w-full object-cover"
        onError={() => setHasError(true)}
      />
    </div>
  );
}

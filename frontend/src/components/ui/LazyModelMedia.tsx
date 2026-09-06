import React from 'react';

export function LazyModelMedia({ src, alt, video, style }: {
  src: string;
  alt: string;
  video: boolean;
  style?: React.CSSProperties;
}) {
  const container = React.useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = React.useState(false);
  React.useEffect(() => {
    const node = container.current;
    if (!node) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      setVisible(true);
      observer.disconnect();
    }, { rootMargin: '100px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return (
    <span ref={container} className="block h-full w-full" aria-label={alt}>
      {visible ? video ? (
        <video src={src} className="h-full w-full object-cover" muted playsInline preload="metadata" style={style} />
      ) : (
        <img src={src} alt={alt} className="h-full w-full object-cover" loading="lazy" decoding="async" style={style} />
      ) : null}
    </span>
  );
}

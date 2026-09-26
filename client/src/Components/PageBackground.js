import { useState } from 'react';
import { MOBILE_ART_MEDIA } from '../lib/page-art.js';

export default function PageBackground({ art }) {
  const [ready, setReady] = useState(false);
  return (
    <picture className={`page-background ${ready ? 'is-ready' : ''}`} aria-hidden="true">
      <source media={MOBILE_ART_MEDIA} srcSet={art.mobile} />
      <img
        src={art.desktop}
        alt=""
        fetchpriority="high"
        decoding="async"
        style={{ objectPosition: art.position, mixBlendMode: art.blend || 'multiply' }}
        onLoad={() => setReady(true)}
        onError={() => setReady(false)}
      />
    </picture>
  );
}

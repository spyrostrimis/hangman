import { useState } from 'react';
import { MOBILE_ART_MEDIA } from '../lib/page-art.js';
import { initialLayers, markFailed, markReady, settle, showArt } from '../lib/background-layers.js';

const DECODE_WAIT_MS = 250;

// Fade in decoded pixels where possible, so the crossfade never reveals a blank
// frame. decode() can wait until the page is drawn (background tabs, occluded
// windows), so it may delay the art briefly but never withhold it.
function whenDecoded(image) {
  return Promise.race([
    image.decode().catch(() => {}),
    new Promise(resolve => setTimeout(resolve, DECODE_WAIT_MS)),
  ]);
}

export default function PageBackground({ art }) {
  const [layers, setLayers] = useState(() => initialLayers(art));
  if (layers.at(-1).art.desktop !== art.desktop) setLayers(showArt(layers, art));

  return layers.map(({ art: layerArt, status }) => {
    const key = layerArt.desktop;
    return (
      <picture
        key={key}
        className={`page-background ${status === 'ready' ? 'is-ready' : ''}`}
        aria-hidden="true"
        onAnimationEnd={event => {
          if (event.target === event.currentTarget) setLayers(current => settle(current, key));
        }}
      >
        <source media={MOBILE_ART_MEDIA} srcSet={layerArt.mobile} />
        <img
          src={layerArt.desktop}
          alt=""
          fetchpriority="high"
          decoding="async"
          style={{ objectPosition: layerArt.position, mixBlendMode: layerArt.blend || 'multiply' }}
          onLoad={event => whenDecoded(event.currentTarget)
            .then(() => setLayers(current => markReady(current, key)))}
          onError={() => setLayers(current => markFailed(current, key))}
        />
      </picture>
    );
  });
}

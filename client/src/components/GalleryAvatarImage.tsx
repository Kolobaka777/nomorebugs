import { useEffect, useState } from 'react';
import PixelAvatar from './PixelAvatar';
import { cachedGalleryImage, loadGalleryImage } from '../utils/galleryImages';

// One published gallery avatar. Renders the frog placeholder until its
// image arrives, so the picker draws immediately instead of waiting on a
// grid's worth of downloads — see utils/galleryImages.ts for why the bytes
// are fetched per image rather than shipped with the listing.
export default function GalleryAvatarImage({ id, size = 44 }: { id: number; size?: number }) {
  const [src, setSrc] = useState<string | null>(() => cachedGalleryImage(id) ?? null);

  useEffect(() => {
    if (src) return;
    let cancelled = false;
    loadGalleryImage(id).then(url => { if (!cancelled && url) setSrc(url); });
    return () => { cancelled = true; };
  }, [id, src]);

  return <PixelAvatar id="frog1" customSrc={src} size={size} />;
}

/* One wired photo (blank-upload fix): every picture the office uploads —
   page banners, cards, features — resolves through the same chain wherever
   it shows, so the banner and the console previews can never mismatch: this
   tab's own just-uploaded bytes first (instant, before anything touches the
   server), then the browser cache, the stored address, this copy's disk (an
   absolute old-host address still paints where the file was restored), then
   the repo mirrors, then the bundled fallback. A dead address walks instead
   of blanking; only a dead fallback renders nothing. */
import React, { useEffect, useMemo, useState } from "react";
import { localUploadFallback, useCachedUploadUrl, useFeedUploadUrls, useUploadPreviewUrl } from "../lib/uploadCache";

export function PhotoImg({
  src,
  fallback = "",
  alt = "",
  className,
  loading,
  style,
}: {
  src: string;
  fallback?: string;
  alt?: string;
  className?: string;
  loading?: "lazy" | "eager";
  style?: React.CSSProperties;
}) {
  const stored = String(src || "");
  const session = useUploadPreviewUrl(stored);
  const cached = useCachedUploadUrl(stored);
  const local = localUploadFallback(stored);
  const feeds = useFeedUploadUrls(stored);
  const addrs = useMemo(() => {
    const list: string[] = [];
    for (const c of [session, cached, stored, local, ...feeds, fallback]) {
      const s = String(c || "");
      if (s && !list.includes(s)) list.push(s);
    }
    return list;
  }, [session, cached, stored, local, feeds, fallback]);
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    setIdx(0);
  }, [addrs.join("\0")]);
  if (!addrs.length || idx >= addrs.length) return null;
  const cur = addrs[idx];
  return (
    <img
      key={cur}
      src={cur}
      alt={alt}
      className={className}
      loading={loading}
      style={style}
      onError={() => {
        setIdx((i) => i + 1);
      }}
    />
  );
}

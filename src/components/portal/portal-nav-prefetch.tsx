"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function PortalNavPrefetch({ hrefs }: { hrefs: string[] }) {
  const router = useRouter();

  useEffect(() => {
    if (hrefs.length === 0) {
      return;
    }

    let cancelled = false;

    const runPrefetch = () => {
      hrefs.forEach((href, index) => {
        window.setTimeout(() => {
          if (!cancelled) {
            router.prefetch(href);
          }
        }, index * 120);
      });
    };

    const timeoutId = window.setTimeout(runPrefetch, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [hrefs, router]);

  return null;
}

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

    const timeoutIds = hrefs.map((href, index) =>
      window.setTimeout(() => {
        if (!cancelled) {
          router.prefetch(href);
        }
      }, index * 30),
    );

    return () => {
      cancelled = true;
      timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
    };
  }, [hrefs, router]);

  return null;
}

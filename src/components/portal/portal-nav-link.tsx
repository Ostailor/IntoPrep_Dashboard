"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, type ReactNode } from "react";
import { claimIntentPrefetch } from "@/lib/portal-intent-prefetch";

interface PortalNavLinkProps {
  href: string;
  className?: string;
  children: ReactNode;
}

export function PortalNavLink({ href, className, children }: PortalNavLinkProps) {
  const router = useRouter();
  const seenHrefs = useRef(new Set<string>());

  const prefetchOnIntent = () => {
    if (claimIntentPrefetch(seenHrefs.current, href)) {
      router.prefetch(href);
    }
  };

  return (
    <Link
      href={href}
      prefetch={false}
      className={className}
      onPointerEnter={prefetchOnIntent}
      onFocus={prefetchOnIntent}
    >
      {children}
    </Link>
  );
}

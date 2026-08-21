/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement | string,
        options: {
          sitekey: string;
          callback?: (token: string) => void;
          "error-callback"?: () => void;
          "expired-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
          size?: "normal" | "compact" | "flexible";
        }
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
    onTurnstileLoaded?: () => void;
  }
}

interface TurnstileProps {
  onVerify: (token: string) => void;
  onExpire?: () => void;
  className?: string;
}

// Render Cloudflare Turnstile bot verification widget if site key is configured.
export function Turnstile({ onVerify, onExpire, className }: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
  const [isScriptReady, setIsScriptReady] = useState<boolean>(() => {
    return typeof window !== "undefined" && Boolean(window.turnstile);
  });

  useEffect(() => {
    if (!siteKey || typeof window === "undefined") return;

    if (window.turnstile) {
      setIsScriptReady(true);
      return;
    }

    const scriptId = "cf-turnstile-script";
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;

    if (!script) {
      script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.onload = () => {
        setIsScriptReady(true);
      };
      document.head.appendChild(script);
    } else {
      script.addEventListener("load", () => setIsScriptReady(true));
    }
  }, [siteKey]);

  useEffect(() => {
    if (!siteKey || !isScriptReady || !containerRef.current || !window.turnstile) return;

    // Clean up any existing widget before re-rendering
    if (widgetIdRef.current) {
      try {
        window.turnstile.remove(widgetIdRef.current);
      } catch {}
      widgetIdRef.current = null;
    }

    try {
      const widgetId = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: (token: string) => {
          onVerify(token);
        },
        "expired-callback": () => {
          onExpire?.();
        },
        theme: "auto",
        size: "flexible",
      });
      widgetIdRef.current = widgetId;
    } catch (err) {
      console.warn("[TURNSTILE] Failed to render Turnstile widget:", err);
    }

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {}
        widgetIdRef.current = null;
      }
    };
  }, [siteKey, isScriptReady, onVerify, onExpire]);

  // If no Turnstile site key is configured in env, render nothing (graceful dev bypass)
  if (!siteKey) {
    return null;
  }

  return (
    <div className={className ?? "my-2 min-h-[65px] flex items-center justify-center"}>
      <div ref={containerRef} className="w-full flex justify-center" />
    </div>
  );
}

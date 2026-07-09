"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { ToastProvider } from "@/components/ui/Toast";

const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1 },
        },
      }),
  );

  useEffect(() => {
    if (posthogKey && !posthog.__loaded) {
      posthog.init(posthogKey, {
        api_host:
          process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
        capture_pageview: true,
        // Transcripts are private thinking — never record sessions.
        disable_session_recording: true,
      });
    }
  }, []);

  const app = (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );

  return posthogKey ? <PostHogProvider client={posthog}>{app}</PostHogProvider> : app;
}

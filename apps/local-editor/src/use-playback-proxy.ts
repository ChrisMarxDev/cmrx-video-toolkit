import { useCallback, useEffect, useState } from "react";
export type ProxyState = "original" | "preparing" | "ready" | "failed";
export function usePlaybackProxy(
  originalURL: string,
  statusURL: string,
  quality: string | null,
) {
  const [visible, setVisible] = useState(() => !document.hidden);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  const key = `${statusURL}|${quality}`;
  const [state, setState] = useState({
    key: "",
    originalURL,
    url: originalURL,
    status: "original" as ProxyState,
  });
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false,
      first = true;
    if (!quality) {
      setState({ key, originalURL, url: originalURL, status: "original" });
      return () => controller.abort();
    }
    // Inactive desktop tabs must not start a new encode merely by reopening.
    if (!visible) return () => controller.abort();
    setState((previous) => ({
      key,
      originalURL,
      url: previous.originalURL === originalURL ? previous.url : originalURL,
      status: "preparing",
    }));
    const poll = async () => {
      try {
        const url = new URL(statusURL, location.origin);
        url.searchParams.set("quality", quality);
        if (first) url.searchParams.set("retry", "1");
        first = false;
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw Error("Preview unavailable");
        const result = await response.json();
        if (stopped) return;
        if (result.status === "ready") {
          const media = new URL(originalURL, location.origin);
          if (!result.original) media.searchParams.set("quality", quality);
          setState({
            key,
            originalURL,
            url: result.original ? originalURL : media.href,
            status: "ready",
          });
        } else if (result.status === "failed")
          throw Error("Preview unavailable");
        else timer = setTimeout(poll, 750);
      } catch (error) {
        if (!stopped)
          setState({ key, originalURL, url: originalURL, status: "failed" });
      }
    };
    void poll();
    return () => {
      stopped = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [originalURL, statusURL, quality, visible]);
  const fallback = useCallback(() => {
    setState({ key, originalURL, url: originalURL, status: "failed" });
    if (quality) {
      const url = new URL(statusURL, location.origin);
      url.searchParams.set("quality", quality);
      url.searchParams.set("refresh", "1");
      void fetch(url).catch(() => {});
    }
  }, [key, originalURL, statusURL, quality]);
  if (!quality)
    return { url: originalURL, status: "original" as ProxyState, fallback };
  if (state.key !== key)
    return {
      url: state.originalURL === originalURL ? state.url : originalURL,
      status: "preparing" as ProxyState,
      fallback,
    };
  return { ...state, fallback };
}

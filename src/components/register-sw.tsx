"use client";
import * as React from "react";

/** Registers the service worker that makes the system installable as an app (see public/sw.js). */
export function RegisterSW() {
  React.useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => { /* not supported / blocked */ });
  }, []);
  return null;
}

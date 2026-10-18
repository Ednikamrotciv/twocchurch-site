import React, { useEffect, useState } from "react";

export function useWebGLAvailable(): boolean {
  const [ok, setOk] = useState(true);
  useEffect(() => {
    try {
      const c = document.createElement("canvas");
      const gl = c.getContext("webgl2") || c.getContext("webgl") || (c as any).getContext("experimental-webgl");
      if (!gl) setOk(false);
    } catch {
      setOk(false);
    }
  }, []);
  return ok;
}

export class StageErrorBoundary extends React.Component<{ fallback: React.ReactNode; children: React.ReactNode }, { failed: boolean }> {
  constructor(props: { fallback: React.ReactNode; children: React.ReactNode }) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {}
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

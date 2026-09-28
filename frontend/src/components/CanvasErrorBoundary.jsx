import { Component } from "react";

/** ครอบ <Canvas>: WebGL/โมเดลพัง → แสดง fallback แทนทั้งหน้าขาว */
export default class CanvasErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.error("3D scene failed to render:", error);
    this.props.onError?.(error); // เช่นปิดหน้ารอโหลด ไม่ให้ค้างบังจอ
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

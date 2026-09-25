import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // three.js + R3F เป็นก้อนเดียวที่ใหญ่ (~1 MB) โหลดเฉพาะหน้า Home/3D (หน้า Solver/Benchmark ไม่ต้องใช้)
        // react และ helper ที่ใช้ร่วมกัน (preload ของ lazy import, commonjs) ต้องแยกเป็นก้อน vendor ด้วย
        // ไม่งั้น rollup ดึงไปรวมในก้อน three (R3F ใช้ของพวกนี้) แล้ว entry ต้องโหลด three ทั้งก้อนทุกหน้า
        manualChunks(id) {
          if (/node_modules[\\/](react|react-dom|scheduler)[\\/]|preload-helper|commonjsHelpers/.test(id)) return "vendor";
          if (/node_modules[\\/](three|three-stdlib|@react-three)[\\/]/.test(id)) return "three";
        },
      },
    },
    chunkSizeWarningLimit: 1200,
  },
  server: {
    port: 5173,
    // ส่ง /api/* ต่อไปที่ FastAPI (backend/main.py รันบนพอร์ต 8010 เพราะ 8000 มีโปรเจกต์อื่นใช้อยู่)
    proxy: {
      "/api": "http://127.0.0.1:8010",
    },
  },
});

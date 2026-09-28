// แถบนำทางของหน้าเครื่องมือ (Home / Solver / 3D / Benchmark) — แท็บของหน้าที่เปิดอยู่เป็นสีเข้ม
const TABS = [
  { href: "#", label: "HOME" },
  { href: "#/solve", label: "SOLVER" },
  { href: "#/3d", label: "3D VIEW" },
  { href: "#/benchmark", label: "BENCHMARK" },
];

export default function AppNav({ current, children }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-gray-200 px-6 py-3">
      {/* มือถือ: แท็บลงไปเป็นแถวของตัวเองเต็มความกว้าง */}
      <div className="flex w-full flex-wrap items-center gap-x-6 gap-y-3 sm:w-auto">
        <a href="#" className="whitespace-nowrap font-['Archivo'] text-sm font-bold tracking-[0.35em] text-gray-900 [font-stretch:125%]">
          R O U T E
        </a>
        <nav className="flex w-full gap-1 rounded-full bg-gray-100 p-1 sm:w-auto" aria-label="เมนูหลัก">
          {TABS.map((t) => (
            <a
              key={t.href}
              href={t.href}
              aria-current={current === t.href ? "page" : undefined}
              className={`flex-1 whitespace-nowrap rounded-full px-2 py-2 text-center sm:py-1.5 text-xs font-medium transition-colors sm:flex-none sm:px-4 sm:text-sm ${
                current === t.href ? "bg-gray-900 text-white" : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {t.label}
            </a>
          ))}
        </nav>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}

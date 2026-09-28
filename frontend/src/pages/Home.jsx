import HeroDrive from "../components/hero/HeroDrive";

export default function Home() {
  return (
    <>
      <HeroDrive />
      {/* ส่วนปิดท้าย: ตัวเครื่องมืออยู่หน้า #/solve */}
      <section id="next" className="bg-white px-[8vw] py-24 text-gray-900">
        <div className="flex flex-wrap items-end justify-between gap-8">
          <div>
            <p className="mb-3 text-xs tracking-[0.3em] text-gray-500">ROUTE SOLVER</p>
            <h2 className="font-['Archivo'] text-2xl font-bold uppercase leading-tight [font-stretch:125%] sm:text-3xl md:text-4xl">
              Drop a .vrp file.
              <br />
              Get the route.
            </h2>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-gray-500">
              อัปโหลดไฟล์ CVRP แล้วให้ Google OR-Tools หาเส้นทางที่สั้นที่สุด พร้อมแผนที่ 2D และมุมมอง 3D
            </p>
          </div>
          <a href="#/solve" className="rounded-full bg-gray-900 px-6 py-3 text-sm font-medium text-white hover:bg-gray-700">
            เริ่มคำนวณเส้นทาง →
          </a>
        </div>
      </section>
    </>
  );
}

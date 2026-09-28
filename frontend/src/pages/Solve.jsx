import { useEffect } from "react";
import AppNav from "../components/AppNav";
import SolverSection from "../components/solver/SolverSection";

/** หน้า Solver (#/solve): แถบนำทาง + SolverSection */
export default function Solve() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <AppNav current="#/solve" />
      <SolverSection />
    </div>
  );
}

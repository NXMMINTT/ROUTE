"""
รัน solver กับไฟล์ .vrp จาก command line แล้วสรุปผลเป็นตาราง + บันทึกรูปเส้นทาง (matplotlib)
แยกจาก solver.py เพื่อให้ API server ไม่ต้อง import matplotlib

    python cli.py                      # รันทุกไฟล์ใน instances/
    python cli.py path/to/A.vrp ...    # รันเฉพาะไฟล์ที่ระบุ
"""

import glob
import os
import sys

import matplotlib

matplotlib.use('Agg')
import matplotlib.patches as mpatches  # noqa: E402
import matplotlib.pyplot as plt  # noqa: E402

from solver import parse_vrp, solve_ortools  # noqa: E402

# console ภาษาไทยของ Windows (cp874) พิมพ์ ━ ✅ ❌ ไม่ได้ จนสคริปต์พัง บังคับ stdout เป็น UTF-8
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

GAP_THRESHOLD = 5  # เกณฑ์ gap ของการแข่งขัน (%)
COLORS = ['#00FF88', '#FF6B6B', '#4ECDC4', '#FFE66D', '#A8E6CF', '#FF8B94', '#C7F2A4', '#E8A0BF']


def route_load(route, data):
    return sum(data['demands'].get(c, 0) for c in route)


def solve_file(filepath: str, time_limit: int = 30) -> dict:
    with open(filepath, encoding='utf-8') as f:
        data = parse_vrp(f.read())

    print(f"\n{'━'*58}")
    print(f"  {data['name']}  |  Optimal: {data['optimal']}  |  Time limit: {time_limit}s")
    print(f"{'━'*58}")

    result = solve_ortools(data, time_limit_sec=time_limit)
    result.update(name=data['name'], optimal=data['optimal'], data=data)
    if not result['routes']:
        print("  ❌ หาคำตอบไม่ได้ภายในเวลาที่กำหนด")
        return result

    gap_str = f"{result['gap']:.2f}%" if result['gap'] is not None else "N/A"
    print(f"  {'✅' if result['feasible'] else '❌'} Distance = {result['distance']:.2f}")
    print(f"     Optimal  = {data['optimal']}")
    print(f"     Gap      = {gap_str}")
    print(f"     Routes   = {len(result['routes'])}")
    print(f"     Time     = {result['elapsed']:.1f}s")
    for i, r in enumerate(result['routes']):
        print(f"       Route {i+1}: {r}  [load={route_load(r, data)}/{data['capacity']}]")
    return result


def visualize(result: dict, save_path: str):
    data = result['data']
    coords, depot = data['coords'], data['depot']

    fig, ax = plt.subplots(figsize=(10, 8))
    fig.patch.set_facecolor('#0D1117')
    ax.set_facecolor('#0D1117')

    for idx, route in enumerate(result['routes']):
        color = COLORS[idx % len(COLORS)]
        full = [depot, *route, depot]
        ax.plot([coords[n][0] for n in full], [coords[n][1] for n in full],
                color=color, linewidth=2, alpha=0.85, zorder=2)
        for node in route:
            x, y = coords[node]
            ax.scatter(x, y, color=color, s=120, zorder=4, edgecolors='white', linewidths=0.8)
            ax.text(x + 1.2, y + 1.2, str(node), color='white', fontsize=7, zorder=5, fontweight='bold')

    dx, dy = coords[depot]
    ax.scatter(dx, dy, color='white', s=300, marker='*', zorder=6, edgecolors='gold', linewidths=1.5)
    ax.text(dx + 1.5, dy - 3, 'Depot', color='gold', fontsize=9, fontweight='bold')

    patches = [
        mpatches.Patch(color=COLORS[i % len(COLORS)],
                       label=f"Route {i+1}  (load={route_load(r, data)}/{data['capacity']})")
        for i, r in enumerate(result['routes'])
    ]
    ax.legend(handles=patches, loc='best', facecolor='#1E2A3A', edgecolor='#4ECDC4', labelcolor='white', fontsize=8)

    gap_str = f"  Gap={result['gap']:.2f}%" if result['gap'] is not None else ''
    feas_str = "Feasible" if result['feasible'] else "INFEASIBLE"
    ax.set_title(f"{result['name']}   Dist={result['distance']:.2f}{gap_str}   [{feas_str}]",
                 color='#00FF88', fontsize=12, pad=12, fontweight='bold')
    ax.tick_params(colors='#555')
    for sp in ax.spines.values():
        sp.set_edgecolor('#333')

    plt.tight_layout()
    plt.savefig(save_path, dpi=130, bbox_inches='tight', facecolor='#0D1117')
    plt.close(fig)
    print(f"  Saved: {save_path}")


def print_summary(results: list):
    print(f"\n{'═'*62}")
    print(f"{'  SUMMARY TABLE':^62}")
    print(f"{'═'*62}")
    print(f"  {'Instance':<15} {'Distance':>9} {'Optimal':>9} {'Gap':>8} {'Feasible':>10}")
    print(f"  {'─'*15} {'─'*9} {'─'*9} {'─'*8} {'─'*10}")
    all_ok = True
    for r in results:
        gap_str = f"{r['gap']:.2f}%" if r['gap'] is not None else 'N/A'
        ok = r['feasible'] and r['gap'] is not None and r['gap'] < GAP_THRESHOLD
        tag = f"<{GAP_THRESHOLD}% OK" if ok else ("FEASIBLE" if r['feasible'] else "FAIL")
        all_ok = all_ok and ok
        print(f"  {r['name']:<15} {r['distance']:>9.2f} {str(r['optimal']):>9} {gap_str:>8} "
              f"{'YES' if r['feasible'] else 'NO':>10}  [{tag}]")
    print(f"{'═'*62}")
    print(f"  Overall: {f'ALL INSTANCES < {GAP_THRESHOLD}% GAP' if all_ok else 'Some gaps still high'}")
    print(f"{'═'*62}")


if __name__ == '__main__':
    here = os.path.dirname(os.path.abspath(__file__))
    files = sys.argv[1:] or sorted(glob.glob(os.path.join(here, 'instances', '*.vrp')))

    output_folder = 'solver_results'
    os.makedirs(output_folder, exist_ok=True)
    results = []
    for fpath in files:
        if not os.path.exists(fpath):
            print(f"⚠️ หาไฟล์ไม่เจอ: {fpath}")
            continue
        r = solve_file(fpath, time_limit=30)
        if r['routes']:
            visualize(r, save_path=os.path.join(output_folder, f"{r['name']}.png"))
            results.append(r)

    if results:
        print_summary(results)

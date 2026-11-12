import {fmt} from '../lib/format';

/** 월별 막대그래프 (SVG). 색은 테마 색 변수만 써서 밝은/어두운 화면 모두 맞음. 표와 같은 값을 screen reader 용 표로도 제공 */
export function BarChart({data, height = 120, label}: {data: {월: number; qty: number}[]; height?: number; label: string}) {
  const max = Math.max(1, ...data.map(d => d.qty));
  const w = 100 / data.length;
  return (
    <figure className="barchart" aria-label={label}>
      <svg viewBox={`0 0 100 ${height / 4}`} preserveAspectRatio="none" style={{width: '100%', height}} aria-hidden>
        {data.map((d, i) => {
          const h = (d.qty / max) * (height / 4 - 2);
          return <rect key={i} x={i * w + w * 0.15} y={height / 4 - h} width={w * 0.7} height={h} rx="0.6" className="bar"><title>{`${d.월}월 ${fmt(d.qty)}`}</title></rect>;
        })}
      </svg>
      <div className="bar-labels" aria-hidden>{data.map((d, i) => <span key={i}>{d.월}</span>)}</div>
      <table className="sr-only"><caption>{label}</caption><tbody>{data.map((d, i) => <tr key={i}><th>{d.월}월</th><td>{fmt(d.qty)}</td></tr>)}</tbody></table>
    </figure>
  );
}

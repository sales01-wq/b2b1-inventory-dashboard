/** CSV 내려받기 (기존 download*Csv 의 마지막 부분과 같음: Blob + <a download>) */
export function saveCsv(file: {csv: string; filename: string} | undefined) {
  if (!file) return;
  const url = URL.createObjectURL(new Blob([file.csv], {type: 'text/csv;charset=utf-8;'}));
  const a = document.createElement('a');
  a.href = url;
  a.download = file.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

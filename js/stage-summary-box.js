// ==== "📈 단계별 미달성 금액 (요약)" 박스 ====

function renderStageSummary(){
  const selectedStage = String((parseFloat(document.getElementById('stagePercentInput').value) || 0) / 100);
  STAGES.forEach(s => {
    let shortfall = 0;
    groups.forEach(g => {
      g.rows.forEach(r => {
        if (getRowType(r) !== 'cash') {
          const d = r.diffs[s];
          if (d > 0) shortfall += d;
        }
      });
    });
    const sEl = document.getElementById('shortfall-' + s);
    if (sEl) { sEl.textContent = fmt(shortfall); sEl.classList.toggle('active', String(s) === selectedStage); }
  });
  // header active highlight
  const table = document.getElementById('stageSummaryTable');
  const ths = table.querySelectorAll('thead th');
  const order = ['','0.5','0.7','0.8','0.9','1'];
  ths.forEach((th,i) => th.classList.toggle('active', order[i] === selectedStage));
}

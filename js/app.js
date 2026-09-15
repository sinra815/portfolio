// ==== 부트스트랩: 복원값 반영 후 최초 렌더 ====
if (__restore) {
  if (__restore.stage !== undefined) document.getElementById('stagePercentInput').value = __restore.stage;
  if (__restore.threshold !== undefined) document.getElementById('overweightThreshold').value = __restore.threshold;
}
if (__saved) {
  document.getElementById('saveBadge').style.display = 'block';
}
renderAll();

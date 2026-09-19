// 상단 탭: 박스(📋 요약 / 🏦 My Data / 📌 종목 마스터)를 한 번에 하나씩만 화면에 보여준다.
// 탭 전환은 [data-tab-panel] 엘리먼트의 tab-active 클래스만 바꿀 뿐 DOM을 지우거나 다시
// 그리지 않으므로, 다른 탭에 렌더링돼 있던 표/입력값은 그대로 남아있다가 돌아오면 바로 보인다.
let activeTab = 'summary';

function renderTabs(){
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === activeTab);
  });
  document.querySelectorAll('[data-tab-panel]').forEach(panel => {
    panel.classList.toggle('tab-active', panel.dataset.tabPanel === activeTab);
  });
}

function setActiveTab(tab){
  activeTab = tab;
  renderTabs();
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => setActiveTab(btn.dataset.tab));
});

renderTabs();

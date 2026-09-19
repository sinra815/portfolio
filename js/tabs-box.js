// 상단 탭: 박스(📋 요약 / 🏦 My Data / 📌 종목 마스터)를 한 번에 하나씩만 화면에 보여준다.
// 탭 전환은 [data-tab-panel] 엘리먼트의 tab-active 클래스만 바꿀 뿐 DOM을 지우거나 다시
// 그리지 않으므로, 다른 탭에 렌더링돼 있던 표/입력값은 그대로 남아있다가 돌아오면 바로 보인다.
let activeTab = 'summary';
let kiwoomTabEligible = false;

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

// kiwoom-box.js가 currentUserId 기준으로 "My Data" 박스를 보여줄지 정할 때마다 호출한다.
// 자격이 없어지는 순간 그 탭을 보고 있었다면 "요약" 탭으로 되돌린다.
function setKiwoomTabEligible(eligible){
  kiwoomTabEligible = eligible;
  document.getElementById('kiwoomTabBtn').style.display = eligible ? '' : 'none';
  if (!eligible && activeTab === 'kiwoom') activeTab = 'summary';
  renderTabs();
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => setActiveTab(btn.dataset.tab));
});

renderTabs();

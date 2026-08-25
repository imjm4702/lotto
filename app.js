let hotNumbers = [7, 12, 27, 34, 41, 44];
let coldNumbers = [2, 9, 18, 23, 31, 38];
let history = [];
let balanced = true;
const colors = n => n <= 10 ? 'yellow' : n <= 20 ? 'blue' : n <= 30 ? 'red' : n <= 40 ? 'gray' : 'green';
const $ = id => document.getElementById(id);

function sampleWeighted(pool, weights) {
  const values = [...pool], picked = [];
  while (picked.length < 6 && values.length) {
    const total = values.reduce((sum, n) => sum + (weights[n] || 1), 0);
    let cursor = Math.random() * total, index = 0;
    for (; index < values.length; index++) { cursor -= weights[values[index]] || 1; if (cursor <= 0) break; }
    picked.push(values.splice(Math.min(index, values.length - 1), 1)[0]);
  }
  return picked.sort((a,b) => a-b);
}

function score(numbers) {
  const odd = numbers.filter(n => n % 2).length;
  const sections = new Set(numbers.map(n => Math.ceil(n / 15))).size;
  const consecutive = numbers.filter((n, i) => i && n === numbers[i - 1] + 1).length;
  return Math.max(58, Math.min(98, 72 + Math.min(15, sections * 4) - Math.abs(3 - odd) * 5 - consecutive * 4 + Math.floor(Math.random() * 7) - 3));
}

function makePick(hot, cold) {
  const weights = {};
  for (let n = 1; n <= 45; n++) weights[n] = 1;
  hotNumbers.forEach(n => weights[n] += hot / 32);
  coldNumbers.forEach(n => weights[n] += cold / 32);
  let pick = sampleWeighted(Array.from({length:45}, (_,i) => i+1), weights), tries = 0;
  while (balanced && (Math.abs(3 - pick.filter(n => n % 2).length) > 1 || new Set(pick.map(n => Math.ceil(n/15))).size < 3) && tries++ < 20) pick = sampleWeighted(Array.from({length:45}, (_,i) => i+1), weights);
  return {numbers: pick, score: score(pick)};
}

function renderStats() {
  if (!history.length) return;
  const counts = Array.from({length:46}, () => 0);
  history.forEach(draw => draw.numbers.forEach(n => counts[n]++));
  const ranked = Array.from({length:45}, (_,i) => i + 1).sort((a,b) => counts[b] - counts[a] || a - b);
  hotNumbers = ranked.slice(0, 6); coldNumbers = [...ranked].reverse().slice(0, 6);
  statBalls('hotBalls', hotNumbers); statBalls('coldBalls', coldNumbers);
  $('hotDesc').textContent = `공식 데이터 ${history.length}회에서 가장 자주 등장한 번호`;
  $('coldDesc').textContent = `공식 데이터 ${history.length}회에서 출현 빈도가 낮은 번호`;
}

function statBalls(target, nums) { $(target).innerHTML = nums.map(n => `<span class="ball ${colors(n)}">${String(n).padStart(2,'0')}</span>`).join(''); }
function render() {
  const count = Number($('countRange').value), hot = Number($('hotRange').value), cold = Number($('coldRange').value);
  $('countValue').textContent = `${count} 게임`; $('hotValue').textContent = `${hot}%`; $('coldValue').textContent = `${cold}%`;
  const picks = Array.from({length: count}, () => makePick(hot, cold));
  $('resultGrid').innerHTML = picks.map((pick, i) => `<div class="pick-card"><div class="pick-meta"><span>GAME ${String(i+1).padStart(2,'0')}</span><span class="score">BALANCE ${pick.score}</span></div><div class="balls">${pick.numbers.map(n => `<span class="ball ${colors(n)}">${String(n).padStart(2,'0')}</span>`).join('')}</div></div>`).join('');
  $('generatedAt').textContent = `마지막 생성 ${new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})}`;
}

async function loadOfficialHistory() {
  const status = $('dataStatus'); status.textContent = '공식 데이터 불러오는 중…'; status.className = 'data-status';
  try {
    const response = await fetch('lotto-history.json', {cache:'no-store'});
    if (!response.ok) throw new Error('파일 없음');
    history = await response.json(); renderStats(); render();
    status.textContent = `동행복권 공식 데이터 ${history.length}회 반영됨`; status.className = 'data-status ready';
  } catch (error) {
    status.textContent = '공식 데이터 파일 없음 · 기본 통계 사용 중'; status.className = 'data-status error';
    console.warn('공식 데이터를 먼저 다운로드하세요: node download-lotto-data.js');
  }
}

statBalls('hotBalls', hotNumbers); statBalls('coldBalls', coldNumbers);
$('hotDesc').textContent = '공식 데이터가 연결되면 자동으로 갱신됩니다'; $('coldDesc').textContent = '공식 데이터가 연결되면 자동으로 갱신됩니다';
$('countRange').addEventListener('input', render); $('hotRange').addEventListener('input', render); $('coldRange').addEventListener('input', render);
$('generateBtn').addEventListener('click', render); $('loadHistory').addEventListener('click', loadOfficialHistory);
$('balanceToggle').addEventListener('click', e => { balanced = !balanced; e.currentTarget.classList.toggle('on', balanced); render(); });
$('copyAll').addEventListener('click', async () => { const text = [...document.querySelectorAll('.pick-card')].map(c => [...c.querySelectorAll('.ball')].map(b => b.textContent).join(', ')).join('\n'); try { await navigator.clipboard.writeText(text); $('copyAll').firstChild.textContent = '복사 완료 '; setTimeout(() => $('copyAll').firstChild.textContent = '전체 복사 ', 1400); } catch { alert(text); } });
render(); loadOfficialHistory();

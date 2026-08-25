let hotNumbers = [7, 12, 27, 34, 41, 44];
let coldNumbers = [2, 9, 18, 23, 31, 38];
let history = [];
let model = null;
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

function buildModel() {
  if (!history.length) { model = null; return; }
  const total = history.length, recentSize = Math.min(60, total), counts = Array(46).fill(0), recent = Array(46).fill(0), lastSeen = Array(46).fill(total), pairs = Array.from({length:46}, () => Array(46).fill(0));
  const sumValues = [], oddValues = [], sectionValues = [];
  history.forEach((draw, index) => {
    const numbers = draw.numbers.map(Number).filter(n => n >= 1 && n <= 45);
    numbers.forEach(n => { counts[n]++; lastSeen[n] = total - 1 - index; if (index >= total - recentSize) recent[n]++; });
    numbers.forEach((a, i) => numbers.slice(i + 1).forEach(b => { pairs[a][b]++; pairs[b][a]++; }));
    sumValues.push(numbers.reduce((sum, n) => sum + n, 0));
    oddValues.push(numbers.filter(n => n % 2).length);
    sectionValues.push(new Set(numbers.map(n => Math.ceil(n / 15))).size);
  });
  const normalize = values => { const min = Math.min(...values), max = Math.max(...values); return value => max === min ? .5 : (value - min) / (max - min); };
  const freqNorm = normalize(counts.slice(1)), recentNorm = normalize(recent.slice(1)), gapNorm = normalize(lastSeen.slice(1));
  const pairMax = Math.max(1, ...pairs.flat());
  model = {counts, recent, lastSeen, pairs, pairMax, freqNorm:n => freqNorm(counts[n]), recentNorm:n => recentNorm(recent[n]), gapNorm:n => gapNorm(lastSeen[n]),
    avgSum: sumValues.reduce((a,b) => a + b, 0) / sumValues.length,
    avgOdd: oddValues.reduce((a,b) => a + b, 0) / oddValues.length,
    avgSections: sectionValues.reduce((a,b) => a + b, 0) / sectionValues.length};
}

function analyzedScore(numbers, hot, cold) {
  if (!model) return score(numbers);
  const hotWeight = hot / 100, coldWeight = cold / 100;
  const numberPart = numbers.reduce((sum, n) => sum + model.freqNorm(n) * (.35 + hotWeight * .35) + model.recentNorm(n) * (.15 + hotWeight * .15) + model.gapNorm(n) * (.15 + coldWeight * .35), 0) / 6;
  let pairPart = 0, pairCount = 0;
  numbers.forEach((a, i) => numbers.slice(i + 1).forEach(b => { pairPart += model.pairs[a][b] / model.pairMax; pairCount++; }));
  pairPart = pairCount ? pairPart / pairCount : 0;
  const oddFit = Math.max(0, 1 - Math.abs(numbers.filter(n => n % 2).length - model.avgOdd) / 3);
  const sumFit = Math.max(0, 1 - Math.abs(numbers.reduce((a,b) => a + b, 0) - model.avgSum) / 100);
  const sectionFit = Math.max(0, 1 - Math.abs(new Set(numbers.map(n => Math.ceil(n / 15))).size - model.avgSections) / 3);
  const consecutivePenalty = numbers.filter((n, i) => i && n === numbers[i - 1] + 1).length * .08;
  return Math.round(45 * numberPart + 25 * pairPart + 12 * oddFit + 10 * sumFit + 8 * sectionFit - consecutivePenalty * 10);
}

function makePick(hot, cold) {
  if (model) {
    const weights = {};
    for (let n = 1; n <= 45; n++) weights[n] = .5 + model.freqNorm(n) * (.8 + hot / 80) + model.recentNorm(n) * (hot / 120) + model.gapNorm(n) * (cold / 80);
    const candidates = [];
    for (let attempt = 0; attempt < 900; attempt++) {
      const candidate = sampleWeighted(Array.from({length:45}, (_,i) => i + 1), weights);
      const candidateScore = analyzedScore(candidate, hot, cold);
      if (!balanced || (Math.abs(3 - candidate.filter(n => n % 2).length) <= 1 && new Set(candidate.map(n => Math.ceil(n / 15))).size >= 3)) candidates.push({numbers:candidate, score:candidateScore});
    }
    candidates.sort((a,b) => b.score - a.score);
    const selected = candidates[Math.floor(Math.random() * Math.min(10, candidates.length))] || {numbers:sampleWeighted(Array.from({length:45}, (_,i) => i + 1), weights), score:0};
    return {numbers:selected.numbers, score:Math.max(58, Math.min(98, selected.score))};
  }
  const weights = {};
  for (let n = 1; n <= 45; n++) weights[n] = 1;
  hotNumbers.forEach(n => weights[n] += hot / 32);
  coldNumbers.forEach(n => weights[n] += cold / 32);
  let pick = sampleWeighted(Array.from({length:45}, (_,i) => i+1), weights), tries = 0;
  while (balanced && (Math.abs(3 - pick.filter(n => n % 2).length) > 1 || new Set(pick.map(n => Math.ceil(n/15))).size < 3) && tries++ < 20) pick = sampleWeighted(Array.from({length:45}, (_,i) => i+1), weights);
  return {numbers: pick, score: score(pick)};
}

function makeStrongPick() {
  const selected = [];
  const addFrom = (pool, amount) => {
    [...pool].sort(() => Math.random() - 0.5).forEach(number => {
      if (selected.length < 6 && selected.length < amount && !selected.includes(number)) selected.push(number);
    });
  };
  addFrom(hotNumbers, 2);
  const beforeCold = selected.length;
  [...coldNumbers].sort(() => Math.random() - 0.5).forEach(number => {
    if (selected.length < beforeCold + 2 && !selected.includes(number)) selected.push(number);
  });
  const neutral = Array.from({length:45}, (_, i) => i + 1).filter(number => !selected.includes(number) && !hotNumbers.includes(number) && !coldNumbers.includes(number));
  addFrom(neutral, 6);
  let numbers = selected.sort((a,b) => a-b);
  if (Math.abs(3 - numbers.filter(n => n % 2).length) > 1 || new Set(numbers.map(n => Math.ceil(n / 15))).size < 3) numbers = makePick(70, 70).numbers;
  return {numbers, score: score(numbers)};
}

function renderStats() {
  if (!history.length) return;
  const counts = Array.from({length:46}, () => 0);
  history.forEach(draw => draw.numbers.forEach(n => counts[n]++));
  const ranked = Array.from({length:45}, (_,i) => i + 1).sort((a,b) => counts[b] - counts[a] || a - b);
  hotNumbers = ranked.slice(0, 6); coldNumbers = [...ranked].reverse().slice(0, 6);
  buildModel();
  statBalls('hotBalls', hotNumbers); statBalls('coldBalls', coldNumbers);
  $('hotDesc').textContent = `공식 데이터 ${history.length}회에서 가장 자주 등장한 번호`;
  $('coldDesc').textContent = `공식 데이터 ${history.length}회에서 출현 빈도가 낮은 번호`;
}

function statBalls(target, nums) { $(target).innerHTML = nums.map(n => `<span class="ball ${colors(n)}">${String(n).padStart(2,'0')}</span>`).join(''); }
function render() {
  const count = Number($('countRange').value), hot = Number($('hotRange').value), cold = Number($('coldRange').value);
  $('countValue').textContent = `${count} 게임`; $('hotValue').textContent = `${hot}%`; $('coldValue').textContent = `${cold}%`;
  const picks = Array.from({length: count}, () => makePick(hot, cold));
  if ($('sortBalance').checked) picks.sort((a, b) => b.score - a.score);
  $('resultGrid').innerHTML = picks.map((pick, i) => `<div class="pick-card"><div class="pick-meta"><span>GAME ${String(i+1).padStart(2,'0')}</span><span class="score">BALANCE ${pick.score}</span></div><div class="balls">${pick.numbers.map(n => `<span class="ball ${colors(n)}">${String(n).padStart(2,'0')}</span>`).join('')}</div></div>`).join('');
  const strong = makeStrongPick();
  $('strongPick').innerHTML = `<div class="strong-pick-head"><div><div class="strong-label">✦ STRONG PICK</div><div class="strong-reason">자주 보이는 번호 + 쉬고 있는 번호 + 안정적인 분산</div></div><span class="strong-score">BALANCE ${strong.score}</span></div><div class="strong-balls">${strong.numbers.map(n => `<span class="ball ${colors(n)}">${String(n).padStart(2,'0')}</span>`).join('')}</div><p class="strong-foot"><b>오늘의 강추번호</b> — 세 가지 기준을 함께 반영한 대표 조합입니다.</p>`;
  $('generatedAt').textContent = `마지막 생성 ${new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})}`;
}

async function loadOfficialHistory() {
  const status = $('dataStatus'); status.textContent = '공식 데이터 불러오는 중…'; status.className = 'data-status';
  try {
    const response = await fetch('lotto-history.json', {cache:'no-store'});
    if (!response.ok) throw new Error('파일 없음');
    history = await response.json(); renderStats(); render();
    status.textContent = `동행복권 공식 데이터 ${history.length}회 분석 모델 적용`; status.className = 'data-status ready';
  } catch (error) {
    status.textContent = '공식 데이터 파일 없음 · 기본 통계 사용 중'; status.className = 'data-status error';
    console.warn('공식 데이터를 먼저 다운로드하세요: node download-lotto-data.js');
  }
}

statBalls('hotBalls', hotNumbers); statBalls('coldBalls', coldNumbers);
$('hotDesc').textContent = '공식 데이터가 연결되면 자동으로 갱신됩니다'; $('coldDesc').textContent = '공식 데이터가 연결되면 자동으로 갱신됩니다';
$('countRange').addEventListener('input', render); $('hotRange').addEventListener('input', render); $('coldRange').addEventListener('input', render);
$('sortBalance').addEventListener('change', render);
$('generateBtn').addEventListener('click', render); $('loadHistory').addEventListener('click', loadOfficialHistory);
$('balanceToggle').addEventListener('click', e => { balanced = !balanced; e.currentTarget.classList.toggle('on', balanced); render(); });
$('copyAll').addEventListener('click', async () => { const text = [...document.querySelectorAll('.pick-card')].map(c => [...c.querySelectorAll('.ball')].map(b => b.textContent).join(', ')).join('\n'); try { await navigator.clipboard.writeText(text); $('copyAll').firstChild.textContent = '복사 완료 '; setTimeout(() => $('copyAll').firstChild.textContent = '전체 복사 ', 1400); } catch { alert(text); } });
render(); loadOfficialHistory();

let hotNumbers = [7,12,27,34,41,44], coldNumbers = [2,9,18,23,31,38], history = [], model = null, balanced = true;
const colors = n => n<=10?'yellow':n<=20?'blue':n<=30?'red':n<=40?'gray':'green';
const $ = id => document.getElementById(id);
const allNumbers = () => Array.from({length:45},(_,i)=>i+1);
const average = a => a.length ? a.reduce((x,y)=>x+y,0)/a.length : 0;
const normalize = a => { const min=Math.min(...a), max=Math.max(...a); return v => max===min ? .5 : (v-min)/(max-min); };

function sampleWeighted(pool, weights) {
  const values=[...pool], picked=[];
  while(picked.length<6&&values.length){let total=values.reduce((s,n)=>s+(weights[n]||1),0), cursor=Math.random()*total, i=0;for(;i<values.length;i++){cursor-=weights[values[i]]||1;if(cursor<=0)break}picked.push(values.splice(Math.min(i,values.length-1),1)[0])}
  return picked.sort((a,b)=>a-b);
}

function makeStats(draws) {
  const total=draws.length, recentSize=Math.min(60,total), counts=Array(46).fill(0), recent=Array(46).fill(0), lastSeen=Array(46).fill(total), pairs=Array.from({length:46},()=>Array(46).fill(0));
  const sums=[], odds=[], sections=[], consecutive=[], spans=[], endings=Array(10).fill(0);
  draws.forEach((draw,index)=>{
    const nums=(draw.numbers||[]).map(Number).filter(n=>n>=1&&n<=45).sort((a,b)=>a-b);
    nums.forEach(n=>{counts[n]++;lastSeen[n]=total-1-index;if(index>=total-recentSize)recent[n]++;endings[n%10]++});
    nums.forEach((a,i)=>nums.slice(i+1).forEach(b=>{pairs[a][b]++;pairs[b][a]++}));
    sums.push(nums.reduce((s,n)=>s+n,0)); odds.push(nums.filter(n=>n%2).length); sections.push(new Set(nums.map(n=>Math.ceil(n/15))).size); consecutive.push(nums.filter((n,i)=>i&&n===nums[i-1]+1).length); spans.push(nums.length ? nums.at(-1)-nums[0] : 0);
  });
  const freqN=normalize(counts.slice(1)), recentN=normalize(recent.slice(1)), gapN=normalize(lastSeen.slice(1));
  const pairMax=Math.max(1,...pairs.flat()), pairLift=Array.from({length:46},()=>Array(46).fill(0));
  for(let a=1;a<=45;a++)for(let b=a+1;b<=45;b++){const expected=(counts[a]*counts[b])/Math.max(1,total);pairLift[a][b]=pairLift[b][a]=Math.min(3,(pairs[a][b]+1)/(expected+1));}
  const sumN=normalize(sums), oddN=normalize(odds), sectionN=normalize(sections), consecutiveN=normalize(consecutive);
  const posterior=n=>(counts[n]+2)/(total+15); // Beta prior: expected inclusion rate 6/45
  model={total,counts,recent,lastSeen,pairs,pairLift,pairMax,posterior,freqN:n=>freqN(counts[n]),recentN:n=>recentN(recent[n]),gapN:n=>gapN(lastSeen[n]),sumN,oddN,sectionN,consecutiveN,avgSum:average(sums),avgOdd:average(odds),avgSections:average(sections),avgConsecutive:average(consecutive),avgSpan:average(spans),endingRate:endings.map(v=>v/Math.max(1,total*6))};
}

function popularPenalty(numbers){
  const under32=numbers.filter(n=>n<=31).length, endings=new Set(numbers.map(n=>n%10)).size, dateLike=numbers.every(n=>n<=31);
  const arithmetic=numbers.length>=3&&numbers[1]-numbers[0]===numbers[2]-numbers[1];
  return under32/6*.55+(6-endings)/6*.2+(dateLike?.2:0)+(arithmetic?.2:0);
}

function analyzedScore(numbers,hot,cold){
  const hw=hot/100,cw=cold/100;
  const freqWeight=.35, recentWeight=.15+hw*.15, gapWeight=.15+cw*.15, signalWeight=freqWeight+recentWeight+gapWeight;
  const numberPart=model ? numbers.reduce((s,n)=>s+(model.freqN(n)*freqWeight+model.recentN(n)*recentWeight+model.gapN(n)*gapWeight)/signalWeight,0)/6*100 : 50;
  let lift=0, pairs=0; if(model)numbers.forEach((a,i)=>numbers.slice(i+1).forEach(b=>{lift+=model.pairLift[a][b];pairs++}));
  const pairFit=pairs?Math.max(0,Math.min(100,20+(lift/pairs)*60)):50;
  const sumFit=Math.max(0,100-Math.abs(numbers.reduce((a,b)=>a+b,0)-(model?.avgSum||138))*1.6);
  const oddFit=Math.max(0,100-Math.abs(numbers.filter(n=>n%2).length-3)*22);
  const sectionCounts=[0,0,0];numbers.forEach(n=>sectionCounts[Math.ceil(n/15)-1]++);
  const sectionFit=Math.max(0,100-sectionCounts.reduce((s,count)=>s+Math.abs(count-2),0)*16);
  const consecutive=numbers.filter((n,i)=>i&&n===numbers[i-1]+1).length;
  const consecutiveFit=consecutive<=1?100:Math.max(0,100-(consecutive-1)*30);
  const span=numbers.at(-1)-numbers[0], spanFit=Math.max(0,100-Math.abs(span-(model?.avgSpan||32))*3);
  const endingFit=50+new Set(numbers.map(n=>n%10)).size/6*50;
  const score=oddFit*.18+sectionFit*.20+sumFit*.16+spanFit*.12+endingFit*.10+consecutiveFit*.08+numberPart*.10+pairFit*.06-popularPenalty(numbers)*3;
  return Math.max(0,Math.min(100,Math.round(score)));
}

const passesBalanceRules = numbers => Math.abs(3-numbers.filter(n=>n%2).length)<=1&&new Set(numbers.map(n=>Math.ceil(n/15))).size>=3&&numbers.filter((n,i)=>i&&n===numbers[i-1]+1).length<=1;

function fallbackPick(hot,cold){const weights={};for(let n=1;n<=45;n++)weights[n]=1;hotNumbers.forEach(n=>weights[n]+=hot/32);coldNumbers.forEach(n=>weights[n]+=cold/32);let p=sampleWeighted(allNumbers(),weights),tries=0;while(balanced&&!passesBalanceRules(p)&&tries++<50)p=sampleWeighted(allNumbers(),weights);return{numbers:p,score:analyzedScore(p,hot,cold)};}

function candidateWeights(hot,cold){const weights={};for(let n=1;n<=45;n++)weights[n]=model ? .3+model.posterior(n)*8+model.recentN(n)*(hot/35)+model.gapN(n)*(cold/30) : 1;return weights;}

function candidatePool(hot,cold,samples){
  const weights=candidateWeights(hot,cold), unique=new Map();
  for(let i=0;i<samples;i++){const nums=sampleWeighted(allNumbers(),weights);if(!balanced||passesBalanceRules(nums)){const candidate={numbers:nums,score:analyzedScore(nums,hot,cold)};const key=nums.join('-'), previous=unique.get(key);if(!previous||candidate.score>previous.score)unique.set(key,candidate);}}
  return [...unique.values()].sort((a,b)=>b.score-a.score);
}

function makePick(hot,cold){
  const candidates=candidatePool(hot,cold,1800);return candidates[Math.floor(Math.random()*Math.min(4,candidates.length))]||fallbackPick(hot,cold);
}

function makePicks(count,hot,cold){
  const candidates=candidatePool(hot,cold,Math.max(2200,count*1400)), picks=[];
  for(const candidate of candidates){if(picks.every(pick=>pick.numbers.filter(n=>candidate.numbers.includes(n)).length<=4))picks.push(candidate);if(picks.length===count)break;}
  while(picks.length<count)picks.push(makePick(hot,cold));
  return picks;
}

function makeStrongPick(){
  return candidatePool(80,80,4000)[0]||makePick(80,80);
}

function backtest(){
  if(history.length<80)return null;
  const cut=Math.floor(history.length*.8), train=history.slice(0,cut), test=history.slice(cut), old=model;makeStats(train);let hits=0;
  test.forEach(draw=>{const actual=new Set(draw.numbers.map(Number));const pick=(candidatePool(50,50,300)[0]||fallbackPick(50,50)).numbers;hits+=pick.filter(n=>actual.has(n)).length;});model=old;
  return {draws:test.length,avgHits:(hits/test.length).toFixed(2)};
}

function statBalls(target,nums){$(target).innerHTML=nums.map(n=>`<span class="ball ${colors(n)}">${String(n).padStart(2,'0')}</span>`).join('');}
function renderStats(){if(!history.length)return;const counts=Array(46).fill(0);history.forEach(d=>(d.numbers||[]).forEach(n=>counts[n]++));const ranked=allNumbers().sort((a,b)=>counts[b]-counts[a]||a-b);hotNumbers=ranked.slice(0,6);coldNumbers=[...ranked].reverse().slice(0,6);makeStats(history);statBalls('hotBalls',hotNumbers);statBalls('coldBalls',coldNumbers);$('hotDesc').textContent=`공식 데이터 ${history.length}회에서 가장 자주 등장한 번호`;$('coldDesc').textContent=`공식 데이터 ${history.length}회에서 출현 빈도가 낮은 번호`;$('drawPill').innerHTML=`<span class="live-dot"></span>제 ${history.at(-1).round}회 기준`;const test=backtest();if(test)$('dataStatus').dataset.backtest=`홀드아웃 ${test.draws}회 평균 적중 ${test.avgHits}개`;}
function render(){const count=Number($('countRange').value),hot=Number($('hotRange').value),cold=Number($('coldRange').value);$('countValue').textContent=`${count} 게임`;$('hotValue').textContent=`${hot}%`;$('coldValue').textContent=`${cold}%`;const strong=makeStrongPick();$('strongPick').innerHTML=`<div class="strong-pick-head"><div><div class="strong-label">✦ STRONG PICK</div><div class="strong-reason">홀짝 + 구간 + 합계 + 번호 간격 + 통계 신호</div></div><span class="strong-score">BALANCE ${strong.score}</span></div><div class="strong-balls">${strong.numbers.map(n=>`<span class="ball ${colors(n)}">${String(n).padStart(2,'0')}</span>`).join('')}</div><p class="strong-foot"><b>오늘의 강추번호</b> — 균형도 상위 후보 중 가장 안정적인 대표 조합입니다.</p>`;let picks=makePicks(count,hot,cold);if($('sortBalance').checked)picks.sort((a,b)=>b.score-a.score);$('resultGrid').innerHTML=picks.map((pick,i)=>`<div class="pick-card"><div class="pick-meta"><span>GAME ${String(i+1).padStart(2,'0')}</span><span class="score">BALANCE ${pick.score}</span></div><div class="balls">${pick.numbers.map(n=>`<span class="ball ${colors(n)}">${String(n).padStart(2,'0')}</span>`).join('')}</div></div>`).join('');$('generatedAt').textContent=`마지막 생성 ${new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})}`;}

async function loadOfficialHistory(){const status=$('dataStatus');status.textContent='공식 데이터 불러오는 중…';status.className='data-status';try{const response=await fetch('lotto-history.json',{cache:'no-store'});if(!response.ok)throw new Error('파일 없음');history=await response.json();renderStats();render();const bt=status.dataset.backtest?` · ${status.dataset.backtest}`:'';status.textContent=`동행복권 공식 데이터 ${history.length}회 분석 모델 적용${bt}`;status.className='data-status ready';}catch(error){status.textContent='공식 데이터 파일 없음 · 분석 모델 대기 중';status.className='data-status error';console.warn('lotto-history.json을 먼저 생성하세요.');}}

function init(){
  statBalls('hotBalls',hotNumbers);statBalls('coldBalls',coldNumbers);$('hotDesc').textContent='공식 데이터가 연결되면 자동으로 갱신됩니다';$('coldDesc').textContent='공식 데이터가 연결되면 자동으로 갱신됩니다';
  $('countRange').addEventListener('input',render);$('hotRange').addEventListener('input',render);$('coldRange').addEventListener('input',render);$('sortBalance').addEventListener('change',render);$('generateBtn').addEventListener('click',render);$('loadHistory').addEventListener('click',loadOfficialHistory);$('balanceToggle').addEventListener('click',e=>{balanced=!balanced;e.currentTarget.classList.toggle('on',balanced);render();});$('copyAll').addEventListener('click',async()=>{const text=[...document.querySelectorAll('.pick-card')].map(c=>[...c.querySelectorAll('.ball')].map(b=>b.textContent).join(', ')).join('\n');try{await navigator.clipboard.writeText(text);$('copyAll').firstChild.textContent='복사 완료 ';setTimeout(()=>$('copyAll').firstChild.textContent='전체 복사 ',1400)}catch{alert(text)}});
  render();loadOfficialHistory();
}

if(typeof document!=='undefined')init();
if(typeof module!=='undefined')module.exports={makeStats,analyzedScore,candidatePool,makePicks,makeStrongPick,passesBalanceRules,getModel:()=>model};

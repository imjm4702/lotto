const ENGINE = Object.freeze({
  RECENT_WINDOW: 30,
  OVERDUE_WEEKS: 15,
  SUM_MIN: 120,
  SUM_MAX: 160,
  MONTE_CARLO_SAMPLES: 20000,
  EVOLUTION_GENERATIONS: 6,
  ELITE_SIZE: 160,
  CHILDREN_PER_ELITE: 3,
  BACKTEST_DRAWS: 24
});

let hotNumbers = [7, 12, 27, 34, 41, 44];
let coldNumbers = [2, 9, 18, 23, 31, 38];
let history = [];
let model = null;
let balanced = true;
let generationVariant = 0;
let generationTimer = null;
let currentPortfolio = null;
let backtestSummary = '';

const colors = number => number <= 10 ? 'yellow' : number <= 20 ? 'blue' : number <= 30 ? 'red' : number <= 40 ? 'gray' : 'green';
const $ = id => document.getElementById(id);
const allNumbers = () => Array.from({length: 45}, (_, index) => index + 1);
const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const normalize = values => {
  const min = Math.min(...values);
  const max = Math.max(...values);
  return value => max === min ? 0.5 : (value - min) / (max - min);
};

function seedToUint32(seed) {
  let hash = 2166136261;
  for (const character of String(seed)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0 || 0x6d2b79f5;
}

function createSeededRandom(seed) {
  let state = seedToUint32(seed);
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function sampleOneWeighted(pool, weights, random) {
  const total = pool.reduce((sum, number) => sum + (weights[number] || 0.01), 0);
  let cursor = random() * total;
  for (const number of pool) {
    cursor -= weights[number] || 0.01;
    if (cursor <= 0) return number;
  }
  return pool[pool.length - 1];
}

function sampleWeighted(pool, weights, random = Math.random) {
  const values = [...pool];
  const picked = [];
  while (picked.length < 6 && values.length) {
    const number = sampleOneWeighted(values, weights, random);
    picked.push(number);
    values.splice(values.indexOf(number), 1);
  }
  return picked.sort((a, b) => a - b);
}

function combinationFeatures(numbers) {
  const sorted = [...numbers].sort((a, b) => a - b);
  const decadeCounts = Array(5).fill(0);
  const endingCounts = Array(10).fill(0);
  sorted.forEach(number => {
    decadeCounts[Math.min(4, Math.floor((number - 1) / 10))]++;
    endingCounts[number % 10]++;
  });
  const consecutive = sorted.filter((number, index) => index && number === sorted[index - 1] + 1).length;
  const gaps = sorted.slice(1).map((number, index) => number - sorted[index]);
  return {
    sorted,
    sum: sorted.reduce((total, number) => total + number, 0),
    odd: sorted.filter(number => number % 2).length,
    low: sorted.filter(number => number <= 22).length,
    sections: new Set(sorted.map(number => Math.ceil(number / 15))).size,
    decadeCounts,
    occupiedDecades: decadeCounts.filter(Boolean).length,
    maxDecade: Math.max(...decadeCounts),
    uniqueEndings: endingCounts.filter(Boolean).length,
    maxEnding: Math.max(...endingCounts),
    consecutive,
    span: sorted.at(-1) - sorted[0],
    arithmetic: gaps.length > 1 && gaps.every(gap => gap === gaps[0])
  };
}

function patternSignature(numbers) {
  const feature = combinationFeatures(numbers);
  return [
    Math.floor(feature.sum / 10),
    feature.odd,
    feature.low,
    feature.occupiedDecades,
    feature.maxDecade,
    feature.consecutive,
    feature.uniqueEndings
  ].join('|');
}

function makeStats(draws) {
  const cleanDraws = draws.map(draw => ({
    ...draw,
    numbers: (draw.numbers || []).map(Number).filter(number => number >= 1 && number <= 45).sort((a, b) => a - b)
  })).filter(draw => draw.numbers.length === 6);
  const total = cleanDraws.length;
  const recentSize = Math.min(ENGINE.RECENT_WINDOW, total);
  const counts = Array(46).fill(0);
  const recent = Array(46).fill(0);
  const lastIndex = Array(46).fill(-1);
  const pairs = Array.from({length: 46}, () => Array(46).fill(0));
  const sums = [];
  const odds = [];
  const lows = [];
  const sections = [];
  const consecutive = [];
  const spans = [];
  const signatureFrequency = new Map();

  cleanDraws.forEach((draw, index) => {
    const feature = combinationFeatures(draw.numbers);
    draw.numbers.forEach(number => {
      counts[number]++;
      lastIndex[number] = index;
      if (index >= total - recentSize) recent[number]++;
    });
    draw.numbers.forEach((first, firstIndex) => draw.numbers.slice(firstIndex + 1).forEach(second => {
      pairs[first][second]++;
      pairs[second][first]++;
    }));
    sums.push(feature.sum);
    odds.push(feature.odd);
    lows.push(feature.low);
    sections.push(feature.sections);
    consecutive.push(feature.consecutive);
    spans.push(feature.span);
    const signature = patternSignature(draw.numbers);
    signatureFrequency.set(signature, (signatureFrequency.get(signature) || 0) + 1);
  });

  const lastSeen = Array(46).fill(total);
  for (let number = 1; number <= 45; number++) {
    if (lastIndex[number] >= 0) lastSeen[number] = total - 1 - lastIndex[number];
  }
  const overdue = lastSeen.map((gap, number) => {
    if (!number) return 0;
    if (gap < ENGINE.OVERDUE_WEEKS) return gap / ENGINE.OVERDUE_WEEKS * 0.35;
    return 0.35 + (1 - Math.exp(-(gap - ENGINE.OVERDUE_WEEKS) / 8)) * 0.65;
  });
  const globalNormalizer = normalize(counts.slice(1));
  const recentNormalizer = normalize(recent.slice(1));
  const overdueNormalizer = normalize(overdue.slice(1));
  const trendValues = allNumbers().map(number => {
    const globalRate = total ? counts[number] / total : 6 / 45;
    const recentRate = recentSize ? recent[number] / recentSize : globalRate;
    return clamp(recentRate / Math.max(globalRate, 0.001), 0, 3);
  });
  const trendNormalizer = normalize(trendValues);
  const pairLift = Array.from({length: 46}, () => Array(46).fill(0));
  for (let first = 1; first <= 45; first++) {
    for (let second = first + 1; second <= 45; second++) {
      const expected = counts[first] * counts[second] / Math.max(1, total);
      const lift = clamp((pairs[first][second] + 1) / (expected + 1), 0, 3);
      pairLift[first][second] = pairLift[second][first] = lift;
    }
  }
  const signatureCounts = [...signatureFrequency.values()].sort((a, b) => a - b);
  const signatureThreshold = signatureCounts.length
    ? signatureCounts[Math.floor((signatureCounts.length - 1) * 0.9)]
    : Number.POSITIVE_INFINITY;

  model = {
    total,
    recentSize,
    targetRound: cleanDraws.length ? Number(cleanDraws.at(-1).round) + 1 : 1,
    counts,
    recent,
    lastSeen,
    overdue,
    pairs,
    pairLift,
    signatureFrequency,
    signatureThreshold,
    maxSignatureFrequency: Math.max(1, ...signatureCounts),
    recentSets: cleanDraws.slice(-ENGINE.RECENT_WINDOW).map(draw => new Set(draw.numbers)),
    latestSet: cleanDraws.length ? new Set(cleanDraws.at(-1).numbers) : new Set(),
    posterior: number => (counts[number] + 2) / (Math.max(0, total) + 15),
    freqN: number => globalNormalizer(counts[number]),
    recentN: number => recentNormalizer(recent[number]),
    overdueN: number => overdueNormalizer(overdue[number]),
    trendN: number => trendNormalizer(trendValues[number - 1]),
    avgSum: average(sums),
    avgOdd: average(odds),
    avgLow: average(lows),
    avgSections: average(sections),
    avgConsecutive: average(consecutive),
    avgSpan: average(spans)
  };
  return model;
}

function maxHistoricalOverlap(numbers, activeModel = model) {
  if (!activeModel || !activeModel.recentSets.length) return 0;
  return activeModel.recentSets.reduce((maximum, draw) => {
    const overlap = numbers.reduce((count, number) => count + (draw.has(number) ? 1 : 0), 0);
    return Math.max(maximum, overlap);
  }, 0);
}

function popularPenalty(numbers) {
  const under32 = numbers.filter(number => number <= 31).length;
  const uniqueEndings = new Set(numbers.map(number => number % 10)).size;
  const dateLike = numbers.every(number => number <= 31);
  return under32 / 6 * 0.55 + (6 - uniqueEndings) / 6 * 0.2 + (dateLike ? 0.2 : 0);
}

function scoreCandidate(numbers, hot, cold) {
  const feature = combinationFeatures(numbers);
  const hotRatio = hot / 100;
  const coldRatio = cold / 100;
  const globalWeight = 0.42;
  const recentWeight = 0.18 + hotRatio * 0.32;
  const overdueWeight = 0.12 + coldRatio * 0.3;
  const trendWeight = 0.12;
  const signalWeight = globalWeight + recentWeight + overdueWeight + trendWeight;
  const numberSignal = model ? numbers.reduce((sum, number) => sum + (
    model.freqN(number) * globalWeight +
    model.recentN(number) * recentWeight +
    model.overdueN(number) * overdueWeight +
    model.trendN(number) * trendWeight
  ) / signalWeight, 0) / 6 * 100 : 50;

  let lift = 0;
  let pairCount = 0;
  if (model) numbers.forEach((first, index) => numbers.slice(index + 1).forEach(second => {
    lift += model.pairLift[first][second];
    pairCount++;
  }));
  const pairFit = pairCount ? clamp(25 + lift / pairCount * 55, 0, 100) : 50;
  const targetSum = clamp(model?.avgSum || 140, ENGINE.SUM_MIN, ENGINE.SUM_MAX);
  const sumFit = clamp(100 - Math.abs(feature.sum - targetSum) * 2, 0, 100);
  const oddFit = clamp(100 - Math.abs(feature.odd - 3) * 30, 0, 100);
  const lowHighFit = clamp(100 - Math.abs(feature.low - 3) * 30, 0, 100);
  const decadeFit = clamp(100 - Math.abs(feature.occupiedDecades - 4) * 18 - Math.max(0, feature.maxDecade - 2) * 25, 0, 100);
  const endingFit = clamp(45 + feature.uniqueEndings / 6 * 55 - Math.max(0, feature.maxEnding - 2) * 20, 0, 100);
  const consecutiveFit = feature.consecutive <= 1 ? 100 : clamp(100 - (feature.consecutive - 1) * 45, 0, 100);
  const spanFit = clamp(100 - Math.abs(feature.span - (model?.avgSpan || 32)) * 3, 0, 100);
  const signatureCount = model?.signatureFrequency.get(patternSignature(numbers)) || 0;
  const familiarity = model ? signatureCount / model.maxSignatureFrequency : 0;
  const latestOverlap = model ? numbers.filter(number => model.latestSet.has(number)).length : 0;
  const noveltyFit = clamp(100 - familiarity * 45 - Math.max(0, latestOverlap - 2) * 18, 0, 100);

  const rawScore =
    numberSignal * 0.32 + pairFit * 0.1 + sumFit * 0.12 + oddFit * 0.08 +
    lowHighFit * 0.08 + decadeFit * 0.08 + endingFit * 0.06 +
    consecutiveFit * 0.05 + spanFit * 0.05 + noveltyFit * 0.06 - popularPenalty(numbers) * 2;
  const score = Math.round(clamp(rawScore, 0, 100));
  return {
    numbers: feature.sorted,
    score,
    breakdown: {
      numberSignal: Math.round(numberSignal),
      pairFit: Math.round(pairFit),
      sumFit: Math.round(sumFit),
      distributionFit: Math.round((oddFit + lowHighFit + decadeFit + endingFit + consecutiveFit + spanFit) / 6),
      noveltyFit: Math.round(noveltyFit)
    }
  };
}

function analyzedScore(numbers, hot, cold) {
  return scoreCandidate([...numbers].sort((a, b) => a - b), hot, cold).score;
}

function passesBalanceRules(numbers, activeModel = model) {
  if (!Array.isArray(numbers) || numbers.length !== 6 || new Set(numbers).size !== 6) return false;
  if (numbers.some(number => !Number.isInteger(number) || number < 1 || number > 45)) return false;
  const feature = combinationFeatures(numbers);
  if (feature.sum < ENGINE.SUM_MIN || feature.sum > ENGINE.SUM_MAX) return false;
  if (feature.odd < 2 || feature.odd > 4 || feature.low < 2 || feature.low > 4) return false;
  if (feature.sections < 3 || feature.occupiedDecades < 3 || feature.maxDecade > 2) return false;
  if (feature.consecutive > 1 || feature.uniqueEndings < 4 || feature.maxEnding > 2 || feature.arithmetic) return false;
  if (activeModel && maxHistoricalOverlap(feature.sorted, activeModel) >= 5) return false;
  if (activeModel) {
    const frequency = activeModel.signatureFrequency.get(patternSignature(feature.sorted)) || 0;
    if (frequency > activeModel.signatureThreshold) return false;
  }
  return true;
}

function candidateWeights(hot, cold) {
  const weights = {};
  const hotRatio = hot / 100;
  const coldRatio = cold / 100;
  for (let number = 1; number <= 45; number++) {
    if (!model) {
      weights[number] = 1;
      continue;
    }
    const globalSignal = model.freqN(number) * (0.8 - hotRatio * 0.15);
    const recentSignal = model.recentN(number) * (0.35 + hotRatio * 1.2);
    const overdueSignal = model.overdueN(number) * (0.2 + coldRatio * 1.1);
    const trendSignal = model.trendN(number) * 0.25;
    weights[number] = 0.2 + globalSignal + recentSignal + overdueSignal + trendSignal + model.posterior(number) * 2;
  }
  return weights;
}

function fallbackPick(hot, cold, random = Math.random) {
  const weights = candidateWeights(hot, cold);
  let numbers = sampleWeighted(allNumbers(), weights, random);
  let tries = 0;
  while (balanced && !passesBalanceRules(numbers) && tries++ < 500) {
    numbers = sampleWeighted(allNumbers(), weights, random);
  }
  return scoreCandidate(numbers, hot, cold);
}

function mutateCandidate(numbers, weights, random) {
  const result = [...numbers];
  const mutationCount = random() < 0.7 ? 1 : 2;
  for (let mutation = 0; mutation < mutationCount; mutation++) {
    const removeIndex = Math.floor(random() * result.length);
    const available = allNumbers().filter(number => !result.includes(number));
    result[removeIndex] = sampleOneWeighted(available, weights, random);
  }
  return result.sort((a, b) => a - b);
}

function evolveCandidates(initialCandidates, weights, hot, cold, random, generations) {
  let elites = initialCandidates.slice(0, ENGINE.ELITE_SIZE);
  for (let generation = 0; generation < generations && elites.length; generation++) {
    const population = new Map(elites.map(candidate => [candidate.numbers.join('-'), candidate]));
    elites.forEach(elite => {
      for (let childIndex = 0; childIndex < ENGINE.CHILDREN_PER_ELITE; childIndex++) {
        const numbers = mutateCandidate(elite.numbers, weights, random);
        if (balanced && !passesBalanceRules(numbers)) continue;
        const child = scoreCandidate(numbers, hot, cold);
        const key = numbers.join('-');
        const previous = population.get(key);
        if (!previous || child.score > previous.score) population.set(key, child);
      }
    });
    elites = [...population.values()].sort((first, second) => second.score - first.score).slice(0, ENGINE.ELITE_SIZE);
  }
  return elites;
}

function candidatePool(hot, cold, samples = ENGINE.MONTE_CARLO_SAMPLES, options = {}) {
  const sampleCount = Math.max(1, Math.floor(Number(samples) || ENGINE.MONTE_CARLO_SAMPLES));
  const targetRound = Number(options.targetRound || model?.targetRound || 1);
  const variant = Number(options.variant || 0);
  const seed = options.seed ?? `${targetRound}|${variant}|${hot}|${cold}|${balanced ? 'balanced' : 'open'}`;
  const random = createSeededRandom(seed);
  const weights = candidateWeights(hot, cold);
  const unique = new Map();
  let accepted = 0;

  for (let index = 0; index < sampleCount; index++) {
    const numbers = sampleWeighted(allNumbers(), weights, random);
    if (balanced && !passesBalanceRules(numbers)) continue;
    accepted++;
    const candidate = scoreCandidate(numbers, hot, cold);
    const key = numbers.join('-');
    const previous = unique.get(key);
    if (!previous || candidate.score > previous.score) unique.set(key, candidate);
  }

  if (!unique.size) {
    const fallback = fallbackPick(hot, cold, random);
    unique.set(fallback.numbers.join('-'), fallback);
  }
  const initial = [...unique.values()].sort((first, second) => second.score - first.score);
  const generations = Math.max(0, Number(options.generations ?? ENGINE.EVOLUTION_GENERATIONS));
  const candidates = evolveCandidates(initial, weights, hot, cold, random, generations);
  candidatePool.lastRun = {sampleCount, accepted, unique: unique.size, generations, targetRound, seed: String(seed)};
  return candidates.length ? candidates : initial;
}

function selectDiverse(candidates, count, excluded = []) {
  const excludedKeys = new Set(excluded.map(candidate => candidate.numbers.join('-')));
  const picks = [];
  for (const candidate of candidates) {
    if (excludedKeys.has(candidate.numbers.join('-'))) continue;
    const diverse = picks.every(pick => pick.numbers.filter(number => candidate.numbers.includes(number)).length <= 4);
    if (diverse) picks.push(candidate);
    if (picks.length === count) break;
  }
  return picks;
}

function makePick(hot, cold, options = {}) {
  return candidatePool(hot, cold, options.samples || ENGINE.MONTE_CARLO_SAMPLES, options)[0] || fallbackPick(hot, cold);
}

function makePicks(count, hot, cold, options = {}) {
  const candidates = candidatePool(hot, cold, options.samples || ENGINE.MONTE_CARLO_SAMPLES, options);
  const picks = selectDiverse(candidates, count);
  const random = createSeededRandom(`${candidatePool.lastRun.seed}|fallback`);
  while (picks.length < count) {
    const candidate = fallbackPick(hot, cold, random);
    if (!picks.some(pick => pick.numbers.join('-') === candidate.numbers.join('-'))) picks.push(candidate);
  }
  return picks;
}

function makeStrongPick(options = {}) {
  return makePick(80, 80, options);
}

function runEnsemble(count, hot, cold, options = {}) {
  const candidates = candidatePool(hot, cold, options.samples || ENGINE.MONTE_CARLO_SAMPLES, options);
  const strong = candidates[0] || fallbackPick(hot, cold);
  const picks = selectDiverse(candidates, count, [strong]);
  const random = createSeededRandom(`${candidatePool.lastRun.seed}|portfolio`);
  while (picks.length < count) {
    const candidate = fallbackPick(hot, cold, random);
    const key = candidate.numbers.join('-');
    if (key !== strong.numbers.join('-') && !picks.some(pick => pick.numbers.join('-') === key)) picks.push(candidate);
  }
  return {strong, picks, meta: {...candidatePool.lastRun}};
}

function backtest() {
  if (history.length < 80) return null;
  const oldModel = model;
  const oldRun = candidatePool.lastRun;
  const oldBalanced = balanced;
  const start = Math.max(60, history.length - ENGINE.BACKTEST_DRAWS);
  let hits = 0;
  balanced = true;
  for (let index = start; index < history.length; index++) {
    makeStats(history.slice(0, index));
    const actual = new Set(history[index].numbers.map(Number));
    const pick = candidatePool(50, 50, 500, {
      targetRound: history[index].round,
      seed: `backtest|${history[index].round}`,
      generations: 2
    })[0] || fallbackPick(50, 50, createSeededRandom(history[index].round));
    hits += pick.numbers.filter(number => actual.has(number)).length;
  }
  model = oldModel;
  balanced = oldBalanced;
  candidatePool.lastRun = oldRun;
  const draws = history.length - start;
  return {draws, avgHits: (hits / draws).toFixed(2)};
}

function buildAnalysisPayload(portfolio = currentPortfolio) {
  const overdueNumbers = model
    ? allNumbers().filter(number => model.lastSeen[number] >= ENGINE.OVERDUE_WEEKS).map(number => ({number, absentWeeks: model.lastSeen[number]}))
    : [];
  return {
    schema: 'pick-and-balance.analysis.v1',
    disclaimer: '로또는 독립 시행이며 모든 유효 조합의 1등 확률은 같습니다. 이 자료는 참고용 통계 메타데이터입니다.',
    targetRound: model?.targetRound || 1,
    seed: portfolio?.meta?.seed || null,
    engine: {
      recentWindow: ENGINE.RECENT_WINDOW,
      overdueThresholdWeeks: ENGINE.OVERDUE_WEEKS,
      sumRange: [ENGINE.SUM_MIN, ENGINE.SUM_MAX],
      monteCarloSamples: portfolio?.meta?.sampleCount || ENGINE.MONTE_CARLO_SAMPLES,
      evolutionGenerations: portfolio?.meta?.generations ?? ENGINE.EVOLUTION_GENERATIONS
    },
    data: {
      totalDraws: model?.total || 0,
      hotNumbers,
      overdueNumbers,
      averageSum: model ? Number(model.avgSum.toFixed(2)) : null,
      averageOddCount: model ? Number(model.avgOdd.toFixed(2)) : null
    },
    recommendations: portfolio ? [portfolio.strong, ...portfolio.picks].map(candidate => ({
      numbers: candidate.numbers,
      ensembleScore: candidate.score,
      scoreBreakdown: candidate.breakdown
    })) : []
  };
}

function statBalls(target, numbers) {
  $(target).innerHTML = numbers.map(number => `<span class="ball ${colors(number)}">${String(number).padStart(2, '0')}</span>`).join('');
}

function renderStats() {
  if (!history.length) return;
  makeStats(history);
  hotNumbers = allNumbers().sort((first, second) => model.recent[second] - model.recent[first] || model.counts[second] - model.counts[first] || first - second).slice(0, 6);
  coldNumbers = allNumbers().sort((first, second) => model.lastSeen[second] - model.lastSeen[first] || model.counts[first] - model.counts[second] || first - second).slice(0, 6);
  statBalls('hotBalls', hotNumbers);
  statBalls('coldBalls', coldNumbers);
  $('hotDesc').textContent = `최근 ${model.recentSize}회에서 출현 밀도가 높은 번호`;
  const longAbsentCount = allNumbers().filter(number => model.lastSeen[number] >= ENGINE.OVERDUE_WEEKS).length;
  $('coldDesc').textContent = `${ENGINE.OVERDUE_WEEKS}주 이상 미출현 ${longAbsentCount}개 · 간격 보간 가중치 적용`;
  $('drawPill').innerHTML = `<span class="live-dot"></span>제 ${model.targetRound}회 예측`;
  const test = backtest();
  backtestSummary = test ? ` · 워크포워드 ${test.draws}회 평균 일치 ${test.avgHits}개` : '';
}

function ballMarkup(numbers) {
  return numbers.map(number => `<span class="ball ${colors(number)}">${String(number).padStart(2, '0')}</span>`).join('');
}

function updateControlLabels() {
  $('countValue').textContent = `${Number($('countRange').value)} 게임`;
  $('hotValue').textContent = `${Number($('hotRange').value)}%`;
  $('coldValue').textContent = `${Number($('coldRange').value)}%`;
}

function renderCurrentPortfolio() {
  if (!currentPortfolio) return;
  const strong = currentPortfolio.strong;
  const picks = [...currentPortfolio.picks];
  if ($('sortBalance').checked) picks.sort((first, second) => second.score - first.score);
  $('strongPick').innerHTML = `<div class="strong-pick-head"><div><div class="strong-label">✦ ENSEMBLE PICK</div><div class="strong-reason">최근 30회 + 15주 간격 + 분포 + 페어 시너지 + 패턴 희소성</div></div><span class="strong-score">SCORE ${strong.score}</span></div><div class="strong-balls">${ballMarkup(strong.numbers)}</div><p class="strong-foot"><b>제 ${currentPortfolio.meta.targetRound}회 대표 조합</b> — 2만 회 탐색과 ${currentPortfolio.meta.generations}세대 진화에서 선별한 참고용 후보입니다.</p>`;
  $('resultGrid').innerHTML = picks.map((pick, index) => `<div class="pick-card"><div class="pick-meta"><span>GAME ${String(index + 1).padStart(2, '0')}</span><span class="score">ENSEMBLE ${pick.score}</span></div><div class="balls">${ballMarkup(pick.numbers)}</div></div>`).join('');
  $('generatedAt').textContent = `ROUND ${currentPortfolio.meta.targetRound} · SEED ${generationVariant}`;
  $('engineMeta').innerHTML = `<span>MONTE CARLO <b>${currentPortfolio.meta.sampleCount.toLocaleString('ko-KR')}</b></span><span>PASS <b>${currentPortfolio.meta.accepted.toLocaleString('ko-KR')}</b></span><span>EVOLUTION <b>${currentPortfolio.meta.generations} GEN</b></span>`;
  const dataText = history.length ? `공식 데이터 ${history.length}회 분석` : '내장 균등분포 모델';
  $('dataStatus').textContent = `${dataText} · 회차 기반 결정론적 시드${backtestSummary}`;
  $('dataStatus').className = history.length ? 'data-status ready' : 'data-status';
}

function renderRecommendations() {
  updateControlLabels();
  const count = Number($('countRange').value);
  const hot = Number($('hotRange').value);
  const cold = Number($('coldRange').value);
  currentPortfolio = runEnsemble(count, hot, cold, {
    targetRound: model?.targetRound || 1,
    variant: generationVariant
  });
  renderCurrentPortfolio();
}

function scheduleGeneration(advance = false) {
  if (advance) generationVariant++;
  clearTimeout(generationTimer);
  $('dataStatus').textContent = '20,000개 후보 탐색 및 진화 연산 중…';
  $('generateBtn').disabled = true;
  generationTimer = setTimeout(() => {
    renderRecommendations();
    $('generateBtn').disabled = false;
  }, 20);
}

async function copyText(text, button, doneLabel) {
  try {
    await navigator.clipboard.writeText(text);
    const original = button.textContent;
    button.textContent = doneLabel;
    setTimeout(() => { button.textContent = original; }, 1400);
  } catch {
    alert(text);
  }
}

async function loadOfficialHistory() {
  const status = $('dataStatus');
  status.textContent = '공식 데이터 불러오는 중…';
  status.className = 'data-status';
  try {
    const response = await fetch('lotto-history.json', {cache: 'no-store'});
    if (!response.ok) throw new Error('파일 없음');
    history = await response.json();
    renderStats();
    generationVariant = 0;
    scheduleGeneration();
  } catch (error) {
    status.textContent = '공식 데이터 파일 없음 · 균등분포 모델 사용 중';
    status.className = 'data-status error';
    console.warn('lotto-history.json을 먼저 생성하세요.');
  }
}

function init() {
  statBalls('hotBalls', hotNumbers);
  statBalls('coldBalls', coldNumbers);
  $('hotDesc').textContent = '공식 데이터가 연결되면 최근 30회 기준으로 갱신됩니다';
  $('coldDesc').textContent = '공식 데이터가 연결되면 15주 미출현 간격을 계산합니다';
  updateControlLabels();

  ['countRange', 'hotRange', 'coldRange'].forEach(id => $(id).addEventListener('input', () => {
    updateControlLabels();
    scheduleGeneration();
  }));
  $('sortBalance').addEventListener('change', renderCurrentPortfolio);
  $('generateBtn').addEventListener('click', () => scheduleGeneration(true));
  $('loadHistory').addEventListener('click', loadOfficialHistory);
  $('balanceToggle').addEventListener('click', event => {
    balanced = !balanced;
    event.currentTarget.classList.toggle('on', balanced);
    event.currentTarget.setAttribute('aria-pressed', String(balanced));
    scheduleGeneration(true);
  });
  $('copyAll').addEventListener('click', () => {
    const text = currentPortfolio ? currentPortfolio.picks.map(pick => pick.numbers.join(', ')).join('\n') : '';
    copyText(text, $('copyAll'), '복사 완료');
  });
  $('copyAnalysis').addEventListener('click', () => {
    copyText(JSON.stringify(buildAnalysisPayload(), null, 2), $('copyAnalysis'), 'JSON 복사 완료');
  });

  scheduleGeneration();
  loadOfficialHistory();
}

if (typeof document !== 'undefined') init();
if (typeof module !== 'undefined') module.exports = {
  ENGINE,
  makeStats,
  combinationFeatures,
  patternSignature,
  analyzedScore,
  scoreCandidate,
  candidatePool,
  makePicks,
  makeStrongPick,
  runEnsemble,
  passesBalanceRules,
  createSeededRandom,
  buildAnalysisPayload,
  getModel: () => model,
  setBalanced: value => { balanced = Boolean(value); }
};

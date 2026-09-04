const fs = require('fs');
const assert = require('assert');
const engine = require('./app.js');

const requiredFiles = ['index.html', 'styles.css', 'app.js', 'lotto-history.json', 'render.yaml'];
for (const file of requiredFiles) {
  if (!fs.existsSync(file)) throw new Error(`필수 파일이 없습니다: ${file}`);
}

const history = JSON.parse(fs.readFileSync('lotto-history.json', 'utf8'));
if (!Array.isArray(history) || !history.length) throw new Error('로또 이력이 비어 있습니다.');

history.forEach((draw, index) => {
  if (draw.round !== index + 1) throw new Error(`회차 순서 오류: ${draw.round}회`);
  if (!/^\d{8}$/.test(String(draw.date))) throw new Error(`추첨일 형식 오류: ${draw.round}회`);
  if (!Array.isArray(draw.numbers) || draw.numbers.length !== 6) throw new Error(`당첨번호 개수 오류: ${draw.round}회`);
  if (new Set(draw.numbers).size !== 6 || draw.numbers.some(number => !Number.isInteger(number) || number < 1 || number > 45)) {
    throw new Error(`당첨번호 범위/중복 오류: ${draw.round}회`);
  }
  if (!Number.isInteger(draw.bonus) || draw.bonus < 1 || draw.bonus > 45 || draw.numbers.includes(draw.bonus)) {
    throw new Error(`보너스 번호 오류: ${draw.round}회`);
  }
});

const stats = engine.makeStats(history);
assert.strictEqual(engine.ENGINE.RECENT_WINDOW, 30, '최근 분석 창은 30회여야 합니다.');
assert.strictEqual(engine.ENGINE.OVERDUE_WEEKS, 15, '장기 미출현 기준은 15주여야 합니다.');
assert.ok(engine.ENGINE.MONTE_CARLO_SAMPLES >= 20000, 'Monte Carlo 표본은 20,000개 이상이어야 합니다.');
assert.strictEqual(stats.recentSize, Math.min(30, history.length), '최근 빈도 분석 범위 오류');
assert.strictEqual(stats.recent.slice(1).reduce((sum, value) => sum + value, 0), stats.recentSize * 6, '최근 빈도 합계 오류');
assert.strictEqual(stats.targetRound, history.at(-1).round + 1, '예측 대상 회차 오류');

for (let number = 1; number <= 45; number++) {
  if (stats.lastSeen[number] >= engine.ENGINE.OVERDUE_WEEKS) {
    assert.ok(stats.overdue[number] >= 0.35, `${number}번의 장기 미출현 보간 오류`);
  }
}

assert.strictEqual(engine.passesBalanceRules([1, 2, 3, 4, 5, 6]), false, '극단 연속 조합이 통과했습니다.');
assert.strictEqual(engine.passesBalanceRules([2, 4, 6, 8, 10, 12]), false, '극단 홀짝 조합이 통과했습니다.');

const options = {targetRound: stats.targetRound, seed: `verify|${stats.targetRound}`, generations: 3};
const firstRun = engine.candidatePool(50, 50, 2500, options);
const secondRun = engine.candidatePool(50, 50, 2500, options);
assert.ok(firstRun.length >= 10, '후보 조합이 충분하지 않습니다.');
assert.deepStrictEqual(
  firstRun.slice(0, 10).map(candidate => candidate.numbers),
  secondRun.slice(0, 10).map(candidate => candidate.numbers),
  '동일 회차 시드의 결과가 재현되지 않습니다.'
);
firstRun.forEach(candidate => {
  assert.ok(engine.passesBalanceRules(candidate.numbers), `균형 규칙 위반 조합: ${candidate.numbers.join(',')}`);
  assert.ok(candidate.score >= 0 && candidate.score <= 100, '앙상블 점수 범위 오류');
});

const portfolio = engine.runEnsemble(10, 50, 50, {...options, samples: 3000});
assert.strictEqual(portfolio.picks.length, 10, '요청한 추천 조합 수와 다릅니다.');
assert.ok(portfolio.picks.every(candidate => engine.passesBalanceRules(candidate.numbers)), '추천 조합이 균형 필터를 위반했습니다.');
const payload = engine.buildAnalysisPayload(portfolio);
assert.strictEqual(payload.targetRound, stats.targetRound, '분석 JSON의 예측 회차 오류');
assert.strictEqual(payload.recommendations.length, 11, '분석 JSON의 추천 조합 수 오류');

console.log(`검증 완료: 정적 파일 ${requiredFiles.length}개, 로또 이력 ${history.length}회, 앙상블 후보 ${firstRun.length}개`);

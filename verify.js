const fs = require('fs');

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

console.log(`검증 완료: 정적 파일 ${requiredFiles.length}개, 로또 이력 ${history.length}회`);

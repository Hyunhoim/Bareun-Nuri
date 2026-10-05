// Experimental reading aid only. Keep raw text, DOM evidence and technique signals unchanged.
const { normalizeText } = require('./jamo.cjs');
const JAMO = '\\u1100-\\u1112\\u1161-\\u1175\\u11a8-\\u11c2\\u3131-\\u3163';
const FORMAT = '\\u00ad\\u200b-\\u200d\\u2060\\ufeff';

function transform(text) {
  if (typeof text !== 'string') throw new TypeError('text must be a string');
  const cleaned = text.replace(new RegExp('[' + JAMO + '](?:[' + JAMO + FORMAT + ']*[' + JAMO + '])?', 'gu'), run => {
    const joined = run.replace(new RegExp('[' + FORMAT + ']', 'gu'), '');
    return /^[가-힣]+$/u.test(normalizeText(joined)) ? joined : run;
  });
  // ponytail: a single-space letter run has ambiguous word boundaries; this is an alternative reading, never intent evidence.
  const spaced = cleaned.replace(new RegExp('[' + JAMO + ']+(?: [' + JAMO + ']+)+', 'gu'), run => {
    if (!run.split(' ').every(part => [...part].length === 1)) return run;
    const reading = normalizeText(run.replaceAll(' ', ''));
    return /^[가-힣]{2,}$/u.test(reading) ? reading : run;
  });
  return normalizeText(spaced);
}

module.exports = { transform };

if (require.main === module) {
  const assert = require('node:assert/strict');
  const pairs = [
    ['ㅎ ㅏ ㄱ ㄱ ㅛ  ㅇ ㅏ ㄴ ㄴ ㅐ', '학교  안내'],
    ['ㅎ\u200bㅏ\u200bㄱ\u200bㄱ\u200bㅛ ㅇ\u200dㅏ\u200dㄴ\u200dㄴ\u200dㅐ', '학교 안내'],
    ['ㅎㅏㄱㄱㅛ ㅇㅏㄴㄴㅐ', '학교 안내'],
    ['ᄒ ᅡ ᆨ ᄀ ᅭ', '학교'],
    ['가나다 / 학교 안내 2026 😀', '가나다 / 학교 안내 2026 😀'],
    ['한글 수업: ㄱ + ㅏ = 가.', '한글 수업: ㄱ + ㅏ = 가.'],
    ['ㄱ ㅏ', 'ㄱ ㅏ'], ['ㄱ ㄴ ㄷ', 'ㄱ ㄴ ㄷ'], ['ㅋㅋ ㅎㅎ', 'ㅋㅋ ㅎㅎ'],
    ['ㄱ\u200bㄴ', 'ㄱ\u200bㄴ'], ['ㄱ ㅏ ㄴ\nㄴ ㅏ', 'ㄱ ㅏ ㄴ\nㄴ ㅏ'],
    ['ㅇ ㅏ ㄴ ㄴ ㅐ ㄷ ㄷ', 'ㅇ ㅏ ㄴ ㄴ ㅐ ㄷ ㄷ'],
    ['Latin\u200btext', 'Latin\u200btext'], ['안내\u200b문구', '안내\u200b문구'],
  ];
  for (const [input, expected] of pairs) assert.equal(transform(input), expected, input);
  // All modern NFD syllables remain compatible with the existing normalizer.
  for (let i = 0; i < 11172; i++) {
    const syllable = String.fromCodePoint(0xac00 + i);
    assert.equal(transform([...syllable.normalize('NFD')].join('\u200b')), syllable);
  }
  assert.throws(() => transform(null), TypeError);
  console.log('PASS: 14 preservation/recovery checks and 11172 zero-width NFD syllables');
}

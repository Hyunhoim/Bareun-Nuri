// Reading aid only: keep raw_text as evidence and let the model judge intent.
const L = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const V = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
const T = ' ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ';
const vowels = { 'ㅗㅏ':'ㅘ', 'ㅗㅐ':'ㅙ', 'ㅗㅣ':'ㅚ', 'ㅜㅓ':'ㅝ', 'ㅜㅔ':'ㅞ', 'ㅜㅣ':'ㅟ', 'ㅡㅣ':'ㅢ' };
const finals = { 'ㄱㄱ':'ㄲ', 'ㄱㅅ':'ㄳ', 'ㄴㅈ':'ㄵ', 'ㄴㅎ':'ㄶ', 'ㄹㄱ':'ㄺ', 'ㄹㅁ':'ㄻ',
  'ㄹㅂ':'ㄼ', 'ㄹㅅ':'ㄽ', 'ㄹㅌ':'ㄾ', 'ㄹㅍ':'ㄿ', 'ㄹㅎ':'ㅀ', 'ㅂㅅ':'ㅄ', 'ㅅㅅ':'ㅆ' };
const initials = { 'ㄱㄱ':'ㄲ', 'ㄷㄷ':'ㄸ', 'ㅂㅂ':'ㅃ', 'ㅅㅅ':'ㅆ', 'ㅈㅈ':'ㅉ' };

function token(raw) {
  const cp = raw.codePointAt(0);
  if (cp >= 0x1100 && cp <= 0x1112) return { raw, char: L[cp-0x1100], role: 'L' };
  if (cp >= 0x1161 && cp <= 0x1175) return { raw, char: V[cp-0x1161], role: 'V' };
  if (cp >= 0x11a8 && cp <= 0x11c2) return { raw, char: T[cp-0x11a7], role: 'T' };
  return { raw, char: raw, role: 'compat' };
}
const isL = t => t && t.role !== 'T' && L.includes(t.char);
const isV = t => t && V.includes(t.char);
const isT = t => t && t.role !== 'L' && T.slice(1).includes(t.char);
const pair = (a,b,map) => a?.role === 'compat' && b?.role === 'compat' && map[a.char+b.char];

function composeRun(run) {
  const ts = [...run].map(token);
  let out = '';
  for (let i = 0; i < ts.length;) {
    let lead = ts[i].char, j = i+1;
    if (!isL(ts[i])) { out += ts[i++].raw; continue; }
    const tense = pair(ts[i], ts[j], initials);
    if (tense && isV(ts[j+1])) { lead = tense; j++; }
    if (!isV(ts[j])) { out += ts[i++].raw; continue; }
    let vowel = ts[j++].char;
    const compoundV = pair(ts[j-1], ts[j], vowels);
    if (compoundV) { vowel = compoundV; j++; }
    let tail = ' ';
    // Canonical T is explicit; compatibility C before a vowel starts the next syllable.
    if (isT(ts[j]) && (ts[j].role === 'T' || !isL(ts[j]) || !isV(ts[j+1]))) {
      tail = ts[j++].char;
      const compoundT = pair(ts[j-1], ts[j], finals);
      if (compoundT && !isV(ts[j+1])) { tail = compoundT; j++; }
    }
    out += String.fromCodePoint(0xac00 + (L.indexOf(lead)*21 + V.indexOf(vowel))*28 + T.indexOf(tail));
    i = j;
  }
  return out;
}

function normalizeText(text) {
  // ponytail: local syllable parsing cannot disambiguate intended word boundaries.
  // Preserve separators/incomplete jamo; add alternative readings only if evidence warrants it.
  return text.split(/([\u1100-\u11ff\u3130-\u318f]+)/u).map((part, i) =>
    i % 2 ? composeRun(part) : part.normalize('NFKC').normalize('NFC')).join('');
}

module.exports = { normalizeText };

if (require.main === module) {
  const assert = require('node:assert/strict');
  // All modern syllables, independent of advertising vocabulary or benchmark labels.
  for (let n = 0; n < 11172; n++) {
    const expected = String.fromCodePoint(0xac00+n);
    const compatibility = L[Math.floor(n/588)] + V[Math.floor(n/28)%21] + (n%28 ? T[n%28] : '');
    assert.equal(normalizeText(compatibility), expected);
    assert.equal(normalizeText(expected.normalize('NFD')), expected);
  }
  for (const [input, expected] of [
    ['ㅎㅏㄱㄱㅛ ㅇㅏㄴㄴㅐ', '학교 안내'], ['ㄱㅗㅏㄴㄹㅣ', '관리'], ['ㅇㅣㄹㄱㄱㅣ', '읽기'],
    ['ㄷㅏㄹㄱㅇㅏ', '닭아'], ['ㄱㅏㄱㅏ', '가가'], ['ㄱㄱㅏ', '까'], ['ㅂㅏㄱㄱㅏ', '박가'],
    ['ᄀㅏᆨ', '각'], ['ㄱᅡㄴ', '간'], ['ㄱㅏᄂㅏ', '가나'], ['간ᅡ', '간ᅡ'],
    ['ㅋㅋ ㅎㅎ ㄱ ㄱㅏㄴㄷ', 'ㅋㅋ ㅎㅎ ㄱ 간ㄷ'], ['ㄱ ㅏ\nㄴㅏ', 'ㄱ ㅏ\n나'],
    ['한글 수업: ㄱ + ㅏ = 가.', '한글 수업: ㄱ + ㅏ = 가.'],
    ['ＡＢＣ 123, ㅎㅏㄴㄱㅡㄹ! 😀', 'ABC 123, 한글! 😀'],
    ['ㄱ\u200bㅏ', 'ㄱ\u200bㅏ'], ['ᄔᆞᇹ', 'ᄔᆞᇹ'], ['일반 안내와 ㅋㅋ', '일반 안내와 ㅋㅋ']
  ]) assert.equal(normalizeText(input), expected, input);
  console.log('PASS: 22,344 modern-syllable round trips and 18 boundary/preservation checks');
}

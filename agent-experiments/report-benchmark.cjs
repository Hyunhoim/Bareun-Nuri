const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const mean = values => values.length && values.every(Number.isFinite) ? values.reduce((a, b) => a + b, 0) / values.length : null;
const median = values => { const v = [...values].sort((a, b) => a - b); return v.length ? (v[Math.floor((v.length - 1) / 2)] + v[Math.ceil((v.length - 1) / 2)]) / 2 : null; };
const pct = n => n == null ? 'N/A' : (n * 100).toFixed(1) + '%';
const num = n => n == null ? 'N/A' : n.toFixed(1);

function analyze(folder) {
  const summary = JSON.parse(fs.readFileSync(path.join(folder, 'summary.json'), 'utf8'));
  const expected = summary.protocol;
  const sameSettings = summary.runs.every(({ repeat, run }) => JSON.stringify(run.configuration) === JSON.stringify({ ...expected.settings, seed: expected.seeds[repeat - 1] }));
  assert(sameSettings, 'Settings changed between architectures');
  assert(summary.same_input, 'Input changed between architectures');
  const groups = ['pipeline', 'adaptive', 'specialists'].map(architecture => {
    const rows = summary.runs.filter(r => r.architecture === architecture), scored = rows.filter(r => r.score);
    return { architecture, completed: scored.length, planned: expected.repeats,
      qualified: scored.length === expected.repeats && scored.every(r => r.score.invalid === 0 && r.score.evidence_mismatches === 0),
      mean_f1: mean(scored.map(r => r.score.f1)), mean_precision: mean(scored.map(r => r.score.precision)), mean_recall: mean(scored.map(r => r.score.recall)),
      f1_range: scored.length ? [Math.min(...scored.map(r => r.score.f1)), Math.max(...scored.map(r => r.score.f1))] : null,
      median_elapsed_sec: median(scored.map(r => r.timing.end_to_end_sec)),
      median_api_active_sec: median(scored.map(r => r.timing.api_active_wall_sec)),
      median_non_api_sec: median(scored.map(r => r.timing.non_api_sec)),
      mean_calls: mean(scored.map(r => r.run.llm_calls)), mean_known_tokens: mean(scored.map(r => r.timing.known_tokens)),
      mean_unresolved: mean(scored.map(r => r.run.needs_review)), http_429: rows.reduce((s, r) => s + r.timing.http_429, 0),
      mean_known_negative_fpr: mean(scored.map(r => r.score.known_negative_false_positive_rate)),
      per_technique_recall: Object.fromEntries(['HOMOGLYPH', 'JAMO', 'TRANSPARENT', 'OFFSCREEN'].map(t => [t, mean(scored.map(r => r.score.per_technique[t].recall))])) };
  });
  const baseline = groups.find(g => g.architecture === 'pipeline').median_elapsed_sec;
  for (const g of groups) g.latency_ratio_to_pipeline = g.median_elapsed_sec != null && baseline ? g.median_elapsed_sec / baseline : null;
  const pending = groups.filter(g => g.qualified), ranking = [];
  while (pending.length) {
    const bestF1 = Math.max(...pending.map(g => g.mean_f1));
    const winner = pending.filter(g => bestF1 - g.mean_f1 <= 0.01 + 1e-12).sort((a, b) => a.median_elapsed_sec - b.median_elapsed_sec)[0];
    ranking.push(winner.architecture); pending.splice(pending.indexOf(winner), 1);
  }
  const comparison = { same_settings: sameSettings, same_input: summary.same_input, all_runs_completed: summary.all_runs_completed,
    ranking, groups, total_attempts: summary.runs.reduce((s, r) => s + r.run.llm_calls, 0),
    total_known_tokens: summary.runs.reduce((s, r) => s + r.timing.known_tokens, 0) };
  fs.writeFileSync(path.join(folder, 'comparison.json'), JSON.stringify(comparison, null, 2));
  const lines = ['repeat,architecture,status,tp,fp,fn,precision,recall,f1,elapsed_sec,api_active_wall_sec,non_api_sec,calls,known_tokens,unresolved,http_429'];
  for (const r of summary.runs) lines.push([r.repeat, r.architecture, r.run.status, r.score?.tp, r.score?.fp, r.score?.fn, r.score?.precision,
    r.score?.recall, r.score?.f1, r.timing.end_to_end_sec, r.timing.api_active_wall_sec, r.timing.non_api_sec, r.run.llm_calls,
    r.timing.known_tokens, r.run.needs_review, r.timing.http_429].join(','));
  fs.writeFileSync(path.join(folder, 'comparison.csv'), lines.join('\n') + '\n');
  const report = [
    '# HCX-007 세 구조 정확도·지연 실험', '',
    `평가 입력: eval 전체 ${summary.candidates}개 DOM 후보. 구조별 ${expected.repeats}회. 같은 반복에서 동일 seed·입력·모델·설정을 사용했고 실행 순서를 순환했다. 정답 채점은 모든 모델 예측을 마친 후 수행했다.`, '',
    `정상 완주: ${summary.runs.filter(r => r.score).length}/${summary.runs.length}. 입력 일치: ${summary.same_input}. 설정 일치: ${sameSettings}.`, '',
    '## 구조별 결과', '',
    '| 구조 | 완료 | 정밀도 평균 | 재현율 평균 | F1 평균 (최소~최대) | 전체 시간 중앙값 | Pipeline 대비 | 평균 호출 | 평균 미해결 |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|',
    ...groups.map(g => `| ${g.architecture} | ${g.completed}/${g.planned} | ${pct(g.mean_precision)} | ${pct(g.mean_recall)} | ${pct(g.mean_f1)} (${g.f1_range?.map(pct).join('~') || 'N/A'}) | ${num(g.median_elapsed_sec)}초 | ${num(g.latency_ratio_to_pipeline)}배 | ${num(g.mean_calls)} | ${num(g.mean_unresolved)} |`), '',
    '## 기법별 재현율 평균', '',
    '| 구조 | HOMOGLYPH | JAMO | TRANSPARENT | OFFSCREEN | 지정 정상 요소 오탐률 |', '|---|---:|---:|---:|---:|---:|',
    ...groups.map(g => `| ${g.architecture} | ${Object.values(g.per_technique_recall).map(pct).join(' | ')} | ${pct(g.mean_known_negative_fpr)} |`), '',
    '## 지연과 사용량', '',
    '| 구조 | API 처리 구간 중앙값 | 비 API 구간 중앙값 | 평균 확인 토큰 | HTTP 429 |', '|---|---:|---:|---:|---:|',
    ...groups.map(g => `| ${g.architecture} | ${num(g.median_api_active_sec)}초 | ${num(g.median_non_api_sec)}초 | ${num(g.mean_known_tokens)} | ${g.http_429} |`), '',
    '전체 시간에는 실제 브라우저 수집·API 처리·쿼터 대기·재시도가 포함된다. API 처리 구간은 병렬 요청 구간의 합집합이며 네트워크/서버 대기도 포함한다. 비 API 구간에는 수집·대기·로컬 처리가 포함된다. 두 중앙값을 합쳐 전체 중앙값이 된다고 가정하지 않는다. 비 API 시간을 빼서 무제한 쿼터 환경의 지연이라고 해석할 수 없다.', '',
    `평가 실행 총 시도 ${comparison.total_attempts}회, 확인된 토큰 ${comparison.total_known_tokens.toLocaleString('en-US')}개. 개발 사전 검사와 이전 실패 실험은 제외한다. 429 등 usage가 반환되지 않은 요청의 토큰은 추정하지 않는다.`, '',
    '## 사전 정의한 추천 기준', '',
    `정상 완주·invalid=0·원문 불일치=0인 구조에서 평균 F1을 우선하고, 0.01 이내의 차이는 전체 시간 중앙값으로 비교한다. 이 기준의 순서: ${ranking.join(' → ')}.`, '',
    '## 해석의 한계', '',
    '- 정답은 광고 요소 16개(복합 기법 포함 검출 20건), 혼동 정상 요소 8개다. 그 외 일반 DOM 후보도 검출하면 오탐으로 채점된다. 기법별 정답은 5건이므로 한 건 차이의 영향이 크다.',
    '- 세 번 반복은 같은 사이트를 재평가한 것이며 독립적인 3개 사이트 또는 정답 60건으로 볼 수 없다. 실제 공공 사이트 일반화나 통계적으로 확정된 구조 우열을 입증하지 않는다.',
    '- 미해결 판정은 확정 검출에서 제외하며 정답 광고라면 FN에 포함된다. 실패 실행은 정상 0건으로 대체하지 않는다.',
    '- HCX-007 이름의 고정 API 경로를 사용했다. 서버 내부 가중치 버전을 독립적으로 고정했다는 뜻은 아니다.',
    '- 공식 대회 점수 환산식이 아닌 로컬 F1 및 실행 시간 비교다.', '',
    '원자료: protocol.json, summary.json, comparison.csv, 반복/구조별 score.json·run.json·decisions.json·trace.jsonl.', ''
  ].join('\n');
  fs.writeFileSync(path.join(folder, 'ACCURACY_REPORT.md'), report);
  console.log(JSON.stringify(comparison, null, 2));
}
if (require.main === module) analyze(path.resolve(process.argv[2] || '.'));

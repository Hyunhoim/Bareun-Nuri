// Keep observed messages separate from likely causes; never claim an unverified cause.
export function scanError(raw:string){
 const rules:[RegExp,string,string][]=[
  [/(?:CLOVASTUDIO|OPENAI)_API_KEY missing|API 키.*등록/i,'API 키가 등록되지 않았습니다.','API 키가 제대로 등록되었나요? 왼쪽 API 키 관리에서 GPT-6 Luna 키를 추가해 주세요.'],
  [/HTTP 401|HTTP 403|unauthorized|authentication/i,'API 인증 또는 접근 권한을 확인해 주세요.','키가 유효한지, GPT-6 Luna 사용 권한이 있는지 확인해 주세요.'],
  [/HTTP 429|rate.?limit|TPM|quota/i,'API 사용 한도에 도달했습니다.','잠시 기다린 후 다시 시도해 주세요. 계정의 호출·토큰 한도와 사용량도 확인해 주세요.'],
  [/HTTP 5\d\d|unsuccessful service status/i,'AI 서비스 응답에 문제가 있습니다.','일시적인 제공사 오류일 수 있습니다. 서비스 상태를 확인한 후 다시 시도해 주세요.'],
  [/timeout|timed out|ETIMEDOUT|deadline/i,'응답 대기 시간이 초과되었습니다.','대상 사이트나 AI 응답이 늦어졌습니다. 인터넷 연결을 확인하고 잠시 후 다시 시도해 주세요.'],
  [/fetch failed|Failed to fetch|network|ENOTFOUND|ECONN|ERR_NAME|ERR_CONNECTION|연결.*실패|연결되지/i,'네트워크 연결을 확인해 주세요.','인터넷·대상 URL·방화벽을 확인해 주세요. 로컬 서버 연결 오류라면 실행기가 켜져 있는지도 확인하세요.'],
  [/JSON|decisions|malformed|truncated|quarantin|불완전|invalid.*response/i,'AI 응답 일부를 처리하지 못했습니다.','일부 판정이 미완료일 수 있습니다. 저장 결과와 미처리 내역을 먼저 확인해 주세요.'],
  [/Unconfirmed|미확인|Cannot resume|checksum|signature/i,'저장 상태를 확인해야 합니다.','미확인 요청 또는 실행 버전 변경으로 안전한 재개가 제한됩니다. 기존 기록을 보존한 채 새 검사를 시작할 수 있습니다.'],
  [/antispoof|model|모델/i,'기법 판정 모델을 확인해 주세요.','제출 폴더 전체가 있는지 확인하세요. 모델·Python 파일이 빠졌거나 손상되었을 수 있습니다.'],
  [/Browser|browser|chromium|Executable.*exist|Target.*closed/i,'수집 브라우저를 실행하거나 유지하지 못했습니다.','제출 폴더의 Chromium 파일과 보안 프로그램 차단 여부, 사용 가능한 메모리를 확인하세요.'],
  [/ENOSPC|EACCES|EPERM|persist|storage|저장|쓰기|읽거나/i,'검사 기록을 저장하지 못했습니다.','디스크 여유 공간과 폴더 쓰기 권한을 확인해 주세요. 파일이 다른 프로그램에서 사용 중일 수도 있습니다.'],
  [/HTTP 4\d\d|URL|url|입력값/i,'요청 주소 또는 설정을 확인해 주세요.','HTTP(S) 주소가 올바른지, 대상 페이지에 접근할 수 있는지 확인해 주세요.'],
 ];
 const hit=rules.find(([pattern])=>pattern.test(raw));
 return {title:hit?.[1]??'검사 중 오류가 발생했습니다.',help:hit?.[2]??'아래 기록을 확인해 주세요. 같은 오류가 반복되면 실행 폴더의 logs/backend.log와 해당 검사 기록을 확인하세요.'};
}

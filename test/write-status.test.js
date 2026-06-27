// write-status.js의 순수 함수(키워드 추출 규칙)를 검증한다.
// 의존성 0: Node 내장 node:test + node:assert만 쓴다(번들러/새 npm 패키지 금지 원칙).
// require로 불러오므로 메모지 파일을 쓰는 부작용은 없다(require.main 가드 덕분).
const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  keywordsFromPrompt,
  bashKeyword,
  toolKeyword,
  koreanizeWord,
  isSyntheticPrompt,
  bashFailed,
} = require('../src/write-status');

test('koreanizeWord: 영어 용어를 한국어로, 모르는 단어는 그대로', () => {
  assert.equal(koreanizeWord('install'), '설치');
  assert.equal(koreanizeWord('Install'), '설치');   // 대소문자 무시
  assert.equal(koreanizeWord('rendering'), '렌더링');
  assert.equal(koreanizeWord('npm'), 'npm');        // 도구 고유명은 그대로
});

test('bashKeyword: 프로그램 + 첫 의미있는 인자', () => {
  assert.equal(bashKeyword('npm install'), 'npm 설치');
  assert.equal(bashKeyword('npm run dev'), 'npm dev');   // run은 버리고 스크립트명
  assert.equal(bashKeyword('node --check src/x.js'), 'node x.js'); // 플래그 제외 + 경로는 파일명만
  assert.equal(bashKeyword('GEUMOKI_DEBUG=1 node a.js'), 'node a.js'); // 앞 환경변수 제외
  // 파이프는 첫 명령만('ls -la'), 플래그 -la는 제외되어 인자가 없으니 프로그램만 한국어로
  assert.equal(bashKeyword('ls -la | grep foo'), '목록');
  assert.equal(bashKeyword('git status | cat'), 'git 상태'); // 파이프 뒤 cat은 무시
});

test('toolKeyword: 도구 이벤트 → 작업 키워드', () => {
  assert.equal(
    toolKeyword({ tool_name: 'Read', tool_input: { file_path: '/a/b/renderer.js' } }),
    'renderer.js 읽기',
  );
  assert.equal(
    toolKeyword({ tool_name: 'Bash', tool_input: { command: 'npm install' } }),
    'npm 설치',
  );
  assert.equal(toolKeyword({ tool_name: 'Bash', tool_input: { command: '' } }), '명령 실행');
  assert.equal(toolKeyword(null), '');           // 방어: 빈 이벤트
});

test('isSyntheticPrompt: 시스템 합성 프롬프트 판별', () => {
  assert.equal(isSyntheticPrompt('<task-notification>백그라운드 완료</task-notification>'), true);
  assert.equal(isSyntheticPrompt('system-reminder: 어쩌고'), true);
  assert.equal(isSyntheticPrompt('렌더링 버그 고쳐줘'), false); // 진짜 사용자 요청
});

test('keywordsFromPrompt: 불용어 제거 후 핵심 단어 최대 2개', () => {
  // 조사/명령어미/프로젝트 고유어가 빠지고 핵심 명사만 남는지
  assert.equal(keywordsFromPrompt('금옥이 렌더링 버그를 고쳐줘'), '렌더링 버그');
  assert.equal(keywordsFromPrompt(''), '');
});

test('bashFailed: 종료코드 비0/에러 문자열을 실패로 판정', () => {
  // CC 2.1.x: 실패는 문자열로 온다
  assert.equal(bashFailed({ tool_response: 'Error: Exit code 1\n...' }), true);
  // 성공은 객체(exitCode:0)
  assert.equal(bashFailed({ tool_response: { stdout: 'ok', exitCode: 0, interrupted: false } }), false);
  // 비0 종료코드 객체
  assert.equal(bashFailed({ tool_response: { exitCode: 2 } }), true);
  // 중단도 실패로 취급
  assert.equal(bashFailed({ tool_response: { interrupted: true } }), true);
  // tool_response 없음 → 실패 아님
  assert.equal(bashFailed({}), false);
});

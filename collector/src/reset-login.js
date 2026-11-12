// 자동 로그인 중단 상태 해제: 비밀번호 · ERP 상태를 확인한 뒤 한 번 실행
import {loadConfig} from './run.js';
import {authGuard} from './auth.js';
authGuard(loadConfig().workDir).reset();
console.log('자동 로그인을 다시 켰습니다.');

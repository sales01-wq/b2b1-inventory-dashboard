// 이동 경로 추적 (읽기 전용): http → https 같은 전환이 서버 응답(3xx)인지, 브라우저 내부 전환인지, 페이지 스크립트인지 구분하기 위한 기록.
// 쿼리 문자열 · 쿠키 · 본문 · 계정은 기록하지 않음.
const strip = u => { try { const x = new URL(u); return x.origin + x.pathname; } catch { return String(u).slice(0, 80); } };
const pick = (h = {}, names) => names.map(n => { const k = Object.keys(h).find(x => x.toLowerCase() === n); return k ? `${n}=${String(h[k]).slice(0, 80)}` : null; }).filter(Boolean).join(' ');

export async function attachTrace(ctx, page) {
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  const ev = []; // 메인 문서 이동만 (type === 'Document')
  const doc = new Set();
  cdp.on('Network.requestWillBeSent', e => {
    if (e.type !== 'Document') return;
    doc.add(e.requestId);
    if (e.redirectResponse) {
      const r = e.redirectResponse;
      const kind = r.remoteIPAddress ? '서버 응답' : '브라우저 내부 전환(서버에 가지 않음)';
      ev.push(`  ↳ ${r.status} ${r.statusText || ''} [${kind}] ${pick(r.headers, ['location', 'non-authoritative-reason', 'server'])}`);
    }
    const i = e.initiator || {};
    ev.push(`${e.request.method} ${strip(e.request.url)}  (시작: ${i.type}${i.url ? ' ' + strip(i.url) : ''}${i.stack?.callFrames?.[0]?.url ? ' 스크립트 ' + strip(i.stack.callFrames[0].url) : ''}) ${pick(e.request.headers, ['upgrade-insecure-requests', 'user-agent']).replace(/user-agent=/, 'UA=')}`);
  });
  cdp.on('Network.responseReceived', e => { if (doc.has(e.requestId)) ev.push(`  ← ${e.response.status} ${strip(e.response.url)} IP=${e.response.remoteIPAddress || '-'} ${pick(e.response.headers, ['location', 'server', 'content-type'])}`); });
  cdp.on('Network.loadingFailed', e => { if (doc.has(e.requestId)) ev.push(`  ✗ 실패: ${e.errorText}${e.blockedReason ? ' / 차단 이유(blockedReason)=' + e.blockedReason : ''}${e.corsErrorStatus ? ' / cors=' + e.corsErrorStatus.corsError : ''}`); });
  return {lines: () => ev.slice()};
}

/** chrome://policy 에서 접속 방식과 관련된 정책만 읽음 (값이 있는 것만) */
export async function readPolicies(page) {
  const names = ['HttpsOnlyMode', 'HttpsUpgradesEnabled', 'HttpAllowlist', 'AutomaticHttpsDefault', 'URLBlocklist', 'URLAllowlist', 'RemoteDebuggingAllowed', 'ExtensionInstallForcelist', 'ExtensionSettings', 'ExtensionInstallBlocklist', 'ProxyMode', 'ProxySettings', 'DnsOverHttpsMode', 'SSLErrorOverrideAllowed', 'InsecurePrivateNetworkRequestsAllowed', 'InsecureContentAllowedForUrls', 'SafeBrowsingProtectionLevel'];
  await page.goto('chrome://policy').catch(() => {});
  await page.waitForTimeout(1500);
  return page.evaluate(wanted => {
    const out = [], seen = new Set();
    const text = []; const grab = n => { if (n.shadowRoot) grab(n.shadowRoot); for (const c of n.childNodes || []) { if (c.nodeType === 3) { const t = c.textContent.trim(); if (t) text.push(t); } else grab(c); } };
    grab(document.documentElement);
    for (let i = 0; i < text.length; i++) if (wanted.includes(text[i]) && !seen.has(text[i])) { seen.add(text[i]); out.push(text[i] + ' = ' + text.slice(i + 1, i + 3).join(' | ').slice(0, 160)); }
    return out;
  }, names).catch(() => []);
}

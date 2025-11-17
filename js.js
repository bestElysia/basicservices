addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

// ← 改成你原来的 ACCESS_LOGS
const LOG_KV = ACCESS_LOGS   // ← 就是这一行！确保绑定的是 ACCESS_LOGS

// 你要监控的所有域名（含所有子域）
const TARGET_DOMAINS = [
  'bestxuyi.us',
  'deyingluxury.com',
  'chinafamoustea.com',
  'elysia.bestxuyi.us'
]

const HTML = `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>全站访问监控</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-100 min-h-screen">
  <div class="container mx-auto p-6 max-w-6xl">
    <h1 class="text-4xl font-bold text-center text-indigo-700 mb-8">全站实时访问监控</h1>
    <p class="text-center text-gray-600 mb-6">监控：bestxuyi.us、deyingluxury.com、chinafamoustea.com、elysia.bestxuyi.us 及所有子域</p>
    
    <div class="bg-white rounded-lg shadow p-6">
      <div class="flex justify-between mb-4">
        <input type="text" id="search" placeholder="搜索 IP、国家、域名、路径..." class="w-96 p-3 border rounded" onkeyup="filter()">
        <button onclick="load()" class="px-6 py-3 bg-indigo-600 text-white rounded hover:bg-indigo-700">刷新</button>
      </div>
      
      <div id="list" class="space-y-3 text-sm"></div>
    </div>
  </div>

  <script>
    async function load() {
      const res = await fetch('/api/logs');
      const logs = await res.json();
      document.getElementById('list').innerHTML = logs.map(l => \`
        <div class="bg-gray-50 p-4 rounded border hover:shadow">
          <div class="flex justify-between flex-wrap gap-2">
            <div>
              <strong class="text-indigo-700">\${l.ip}</strong> 
              <span class="text-gray-600">(\${l.country})</span>
              <span class="text-xs bg-purple-100 px-2 py-1 rounded ml-2">\${l.domain}</span>
            </div>
            <div class="text-right text-xs text-gray-500">
              \${l.time}
            </div>
          </div>
          <div class="mt-2 text-gray-700">\${l.path}</div>
          <div class="text-xs text-gray-500 truncate max-w-2xl">\${l.ua}</div>
        </div>
      \`).join('') || '<p class="text-center py-8 text-gray-500">暂无访问记录</p>';
    }

    function filter() {
      const q = document.getElementById('search').value.toLowerCase();
      document.querySelectorAll('#list > div').forEach(d => {
        d.style.display = d.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    }

    load();
    setInterval(load, 8000);
  </script>
</body>
</html>`;

async function handleRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  // 首页
  if (path === '/' || path === '/admin') {
    return new Response(HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }

  // API：返回最近 300 条访问记录
  if (path === '/api/logs') {
    const { keys } = await LOG_KV.list({ limit: 300 });
    const logs = [];
    for (const k of keys) {
      const data = await LOG_KV.get(k.name);
      if (data) logs.push(JSON.parse(data));
    }
    logs.sort((a, b) => b.timestamp - a.timestamp);
    return new Response(JSON.stringify(logs), { headers: { 'Content-Type': 'application/json' } });
  }

  // —— 关键监控逻辑 ——
  const hostname = request.headers.get('host') || '';
  const cfCountry = request.headers.get('cf-ipcountry') || 'XX';
  const userAgent = request.headers.get('user-agent') || '';
  const ip = request.headers.get('cf-connecting-ip') || '未知';

  const isTargetDomain = TARGET_DOMAINS.some(d => 
    hostname === d || hostname.endsWith('.' + d)
  );

  if (isTargetDomain) {
    const logKey = `log:${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const logData = {
      ip,
      country: cfCountry,
      domain: hostname,
      path: url.pathname + url.search,
      ua: userAgent,
      time: new Date().toLocaleString('zh-CN'),
      timestamp: Date.now()
    };
    LOG_KV.put(logKey, JSON.stringify(logData), { expirationTtl: 60*60*24*30 }); // 保留30天
  }

  return fetch(request);
}
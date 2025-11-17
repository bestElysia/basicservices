addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

const KV = ACCESS_LOGS   // ← 改成你之前建的 ACCESS_LOGS（或者新建一个也行）

const HTML = `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>实时访问监控</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    .log { @apply p-3 border-b hover:bg-gray-50 transition; }
  </style>
</head>
<body class="bg-gradient-to-br from-blue-50 to-indigo-100 min-h-screen">
  <div class="container mx-auto p-6 max-w-5xl">
    <div class="text-center mb-8">
      <h1 class="text-4xl font-bold text-indigo-700 mb-2">实时访问监控</h1>
      <p class="text-gray-600">谁在用你的订阅 · 实时更新</p>
    </div>

    <div class="bg-white rounded-xl shadow-lg p-6">
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-xl font-semibold">最近访问记录（自动刷新）</h2>
        <button onclick="load()" class="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">手动刷新</button>
      </div>

      <input type="text" id="search" placeholder="搜索 IP、国家、路径、UA..." 
             class="w-full p-3 border rounded mb-4" onkeyup="filter()">

      <div id="list" class="text-sm space-y-2"></div>
    </div>
  </div>

  <script>
    async function load() {
      const res = await fetch('/api/logs');
      const data = await res.json();
      render(data);
    }

    function render(items) {
      const html = items.map(l => \`
        <div class="log bg-gray-50 rounded">
          <div class="flex justify-between flex-wrap gap-2">
            <div>
              <strong class="text-indigo-700">\${l.ip}</strong>
              <span class="text-gray-600">(\${l.country})</span>
              <span class="text-xs text-gray-500 ml-2">\${l.time}</span>
            </div>
            <div class="text-right text-xs">
              <div>\${l.path}</div>
              <div class="text-gray-500 truncate max-w-xs">\${l.ua}</div>
            </div>
          </div>
        </div>
      \`).join('') || '<p class="text-center text-gray-500 py-8">暂无访问记录</p>';
      document.getElementById('list').innerHTML = html;
    }

    function filter() {
      const q = document.getElementById('search').value.toLowerCase();
      document.querySelectorAll('.log').forEach(div => {
        div.style.display = div.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    }

    load();
    setInterval(load, 8000);  // 8秒自动刷新
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

  // API: 返回最近 200 条访问记录（按时间倒序）
  if (path === '/api/logs') {
    const { keys } = await KV.list({ limit: 200 });
    const logs = [];
    for (const k of keys) {
      const data = await KV.get(k.name);
      if (data) logs.push(JSON.parse(data));
    }
    logs.sort((a, b) => b.time - a.time);
    return new Response(JSON.stringify(logs), { headers: { 'Content-Type': 'application/json' } });
  }

  return new Response('Not Found', { status: 404 });
}
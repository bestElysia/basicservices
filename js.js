addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

const LOG_KV = ACCESS_LOGS   // ← 用你现有的 ACCESS_LOGS

const TARGET_DOMAINS = [
  'bestxuyi.us', 'deyingluxury.com', 'chinafamoustea.com', 'elysia.bestxuyi.us'
]

const HTML = `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>全站访问监控中心</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body class="bg-gray-100 min-h-screen">
  <div class="container mx-auto p-6 max-w-7xl">
    <h1 class="text-4xl font-bold text-center text-indigo-700 mb-2">全站访问监控中心</h1>
    <p class="text-center text-gray-600 mb-8">bestxuyi.us · deyingluxury.com · chinafamoustea.com · elysia.bestxuyi.us 及所有子域</p>

    <!-- 统计卡片 -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
      <div class="bg-blue-600 text-white p-6 rounded-xl text-center"><div id="today" class="text-3xl font-bold">0</div><div>今日访问</div></div>
      <div class="bg-green-600 text-white p-6 rounded-xl text-center"><div id="newUsers" class="text-3xl font-bold">0</div><div>今日新用户</div></div>
      <div class="bg-purple-600 text-white p-6 rounded-xl text-center"><div id="total" class="text-3xl font-bold">0</div><div>历史总访问</div></div>
      <div class="bg-orange-600 text-white p-6 rounded-xl text-center"><div id="online" class="text-3xl font-bold">0</div><div>当前在线</div></div>
    </div>

    <div class="grid md:grid-cols-2 gap-8 mb-8">
      <!-- 国家分布饼图 -->
      <div class="bg-white p-6 rounded-xl shadow">
        <h2 class="text-xl font-bold mb-4">国家/地区分布</h2>
        <canvas id="countryChart"></canvas>
      </div>
      <!-- 24小时趋势 -->
      <div class="bg-white p-6 rounded-xl shadow">
        <h2 class="text-xl font-bold mb-4">24小时访问趋势</h2>
        <canvas id="trendChart"></canvas>
      </div>
    </div>

    <!-- 实时访问记录 -->
    <div class="bg-white rounded-xl shadow p-6">
      <div class="flex justify-between mb-4">
        <input type="text" id="search" placeholder="搜索 IP、域名、路径、UA..." class="w-96 p-3 border rounded" onkeyup="filter()">
        <button onclick="load()" class="px-6 py-3 bg-indigo-600 text-white rounded hover:bg-indigo-700">刷新</button>
      </div>
      <div id="list" class="space-y-3 text-sm"></div>
    </div>
  </div>

  <script>
    let chartCountry, chartTrend;

    async function load() {
      const res = await fetch('/api/all');
      const data = await res.json();
      
      // 统计卡片
      document.getElementById('today').textContent = data.stats.today;
      document.getElementById('newUsers').textContent = data.stats.newUsers;
      document.getElementById('total').textContent = data.stats.total;
      document.getElementById('online').textContent = data.stats.online;

      // 国家分布
      if (chartCountry) chartCountry.destroy();
      chartCountry = new Chart(document.getElementById('countryChart'), {
        type: 'doughnut',
        data: { labels: Object.keys(data.country), datasets: [{ data: Object.values(data.country), backgroundColor: ['#f59e0b','#10b981','#3b82f6','#ef4444','#8b5cf6'] }] },
        options: { responsive: true, plugins: { legend: { position: 'right' } } }
      });

      // 24小时趋势
      if (chartTrend) chartTrend.destroy();
      chartTrend = new Chart(document.getElementById('trendChart'), {
        type: 'line',
        data: { labels: data.trend.hours, datasets: [{ label: '访问次数', data: data.trend.visits, borderColor: '#4f46e5', fill: true }] },
        options: { responsive: true }
      });

      // 访问记录
      document.getElementById('list').innerHTML = data.logs.map(l => \`
        <div class="bg-gray-50 p-4 rounded border hover:shadow">
          <div class="flex justify-between flex-wrap gap-2">
            <div>
              <strong class="text-indigo-700">\${l.ip}</strong> 
              <span class="text-gray-600">(\${l.country})</span>
              <span class="text-xs bg-purple-100 px-2 py-1 rounded ml-2">\${l.domain}</span>
            </div>
            <div class="text-right text-xs text-gray-500">\${l.time}</div>
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

  if (path === '/' || path === '/admin') {
    return new Response(HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }

  if (path === '/api/all') {
    const { keys } = await LOG_KV.list({ limit: 1000 });
    const logs = [];
    const countryMap = {};
    const hourMap = Array(24).fill(0);
    const today = new Date().toISOString().slice(0,10);
    const seenIPs = new Set();
    const todayIPs = new Set();

    for (const k of keys) {
      const data = await LOG_KV.get(k.name);
      if (!data) continue;
      const l = JSON.parse(data);
      logs.push(l);

      // 国家统计
      countryMap[l.country] = (countryMap[l.country] || 0) + 1;

      // 小时统计
      const h = new Date(l.timestamp).getHours();
      hourMap[h]++;

      // 在线用户（最近5分钟）
      if (Date.now() - l.timestamp < 5*60*1000) seenIPs.add(l.ip);

      // 今日新用户
      if (l.time.startsWith(today)) {
        todayIPs.add(l.ip);
      }
    }

    logs.sort((a,b) => b.timestamp - a.timestamp);

    return new Response(JSON.stringify({
      stats: {
        today: logs.filter(l => l.time.startsWith(today)).length,
        newUsers: todayIPs.size,
        total: logs.length,
        online: seenIPs.size
      },
      country: countryMap,
      trend: { hours: Array.from({length:24},(_,i)=>i+'时'), visits: hourMap },
      logs: logs.slice(0, 200)
    }), { headers: { 'Content-Type': 'application/json' } });
  }

  // 记录访问日志
  const hostname = request.headers.get('host') || '';
  const isTarget = TARGET_DOMAINS.some(d => hostname === d || hostname.endsWith('.'+d));
  if (isTarget) {
    const logKey = `log:${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const logData = {
      ip: request.headers.get('cf-connecting-ip') || '未知',
      country: request.headers.get('cf-ipcountry') || 'XX',
      domain: hostname,
      path: url.pathname + url.search,
      ua: request.headers.get('user-agent') || '',
      time: new Date().toLocaleString('zh-CN'),
      timestamp: Date.now()
    };
    LOG_KV.put(logKey, JSON.stringify(logData), { expirationTtl: 60*60*24*30 });
  }

  return fetch(request);
}
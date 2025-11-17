addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

const LOG_KV = ACCESS_LOGS

const HTML = `<!DOCTYPE html>
<html lang="zh" class="scroll-smooth">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>全站监控中心 · Elysia</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <link href="https://cdn.jsdelivr.net/npm/remixicon@4.1.0/fonts/remixicon.css" rel="stylesheet">
  <style>
    :root { --primary: #6366f1; --primary-dark: #4f46e5; }
    .glass { background: rgba(255,255,255,0.25); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,0.18); }
    .card-hover:hover { transform: translateY(-8px); box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04); }
    .gradient-text { background: linear-gradient(to right, #6366f1, #8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
  </style>
</head>
<body class="bg-gradient-to-br from-purple-50 via-pink-50 to-indigo-100 min-h-screen">
  <div class="container mx-auto px-4 py-8 max-w-7xl">

    <!-- 标题 -->
    <div class="text-center mb-12">
      <h1 class="text-5xl md:text-6xl font-bold gradient-text mb-4">全站监控中心</h1>
      <p class="text-xl text-gray-600">elysia.bestxuyi.us 及所有子域</p>
    </div>

    <!-- 统计卡片（玻璃拟态） -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-6 mb-12">
      <div class="glass rounded-2xl p-6 text-center card-hover transition-all">
        <i class="ri-eye-line text-4xl text-indigo-600 mb-3"></i>
        <div class="text-4xl font-bold text-gray-800" id="today">0</div>
        <div class="text-gray-600">今日访问</div>
      </div>
      <div class="glass rounded-2xl p-6 text-center card-hover transition-all">
        <i class="ri-user-add-line text-4xl text-green-600 mb-3"></i>
        <div class="text-4xl font-bold text-gray-800" id="newUsers">0</div>
        <div class="text-gray-600">今日新用户</div>
      </div>
      <div class="glass rounded-2xl p-6 text-center card-hover transition-all">
        <i class="ri-global-line text-4xl text-purple-600 mb-3"></i>
        <div class="text-4xl font-bold text-gray-800" id="total">0</div>
        <div class="text-gray-600">历史总访问</div>
      </div>
      <div class="glass rounded-2xl p-6 text-center card-hover transition-all">
        <i class="ri-user-voice-line text-4xl text-orange-600 mb-3"></i>
        <div class="text-4xl font-bold text-gray-800" id="online">0</div>
        <div class="text-gray-600">当前在线</div>
      </div>
    </div>

    <div class="grid lg:grid-cols-2 gap-8 mb-12">
      <!-- 国家分布 -->
      <div class="bg-white/80 backdrop-blur rounded-3xl shadow-xl p-8 card-hover transition-all">
        <h2 class="text-2xl font-bold mb-6 flex items-center"><i class="ri-earth-line mr-3 text-indigo-600"></i> 全球访客分布</h2>
        <canvas id="countryChart"></canvas>
      </div>
      <!-- 24小时趋势 -->
      <div class="bg-white/80 backdrop-blur rounded-3xl shadow-xl p-8 card-hover transition-all">
        <h2 class="text-2xl font-bold mb-6 flex items-center"><i class="ri-line-chart-line mr-3 text-purple-600"></i> 24小时访问趋势</h2>
        <canvas id="trendChart"></canvas>
      </div>
    </div>

    <!-- 实时日志 -->
    <div class="bg-white/80 backdrop-blur rounded-3xl shadow-xl p-8">
      <div class="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <h2 class="text-2xl font-bold flex items-center"><i class="ri-history-line mr-3 text-green-600"></i> 实时访问记录</h2>
        <div class="flex gap-3">
          <input type="text" id="search" placeholder="搜索任意内容..." class="px-4 py-3 border rounded-xl w-80 focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <button onclick="load()" class="px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:shadow-lg transition"><i class="ri-refresh-line mr-2"></i>刷新</button>
        </div>
      </div>
      <div id="list" class="space-y-4"></div>
    </div>
  </div>

  <script>
    let chartCountry, chartTrend;

    async function load() {
      const res = await fetch('/api/all');
      const data = await res.json();

      // 统计
      document.getElementById('today').textContent = data.stats.today.toLocaleString();
      document.getElementById('newUsers').textContent = data.stats.newUsers.toLocaleString();
      document.getElementById('total').textContent = data.stats.total.toLocaleString();
      document.getElementById('online').textContent = data.stats.online;

      // 国家分布
      if (chartCountry) chartCountry.destroy();
      chartCountry = new Chart(document.getElementById('countryChart'), {
        type: 'doughnut',
        data: {
          labels: Object.keys(data.country),
          datasets: [{ data: Object.values(data.country), backgroundColor: ['#8b5cf6','#3b82f6','#10b981','#f59e0b','#ef4444','#ec4899'] }]
        },
        options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
      });

      // 趋势图
      if (chartTrend) chartTrend.destroy();
      chartTrend = new Chart(document.getElementById('trendChart'), {
        type: 'line',
        data: {
          labels: data.trend.hours,
          datasets: [{ label: '访问量', data: data.trend.visits, borderColor: '#8b5cf6', backgroundColor: 'rgba(139,92,246,0.1)', tension: 0.4, fill: true }]
        },
        options: { responsive: true }
      });

      // 日志
      document.getElementById('list').innerHTML = data.logs.map(l => \`
        <div class="bg-gradient-to-r from-indigo-50 to-purple-50 p-5 rounded-2xl border border-indigo-100 hover:shadow-md transition">
          <div class="flex justify-between items-start flex-wrap gap-3">
            <div>
              <strong class="text-indigo-700 text-lg">\${l.ip}</strong>
              <span class="ml-3 bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full text-sm">\${l.country}</span>
              <span class="ml-2 bg-purple-100 text-purple-800 px-3 py-1 rounded-full text-sm">\${l.domain}</span>
            </div>
            <div class="text-sm text-gray-500">\${l.time}</div>
          </div>
          <div class="mt-2 text-gray-700 font-medium">\${l.path}</div>
          <div class="text-xs text-gray-500 mt-1 truncate max-w-4xl">\${l.ua}</div>
        </div>
      \`).join('') || '<p class="text-center py-12 text-gray-400">暂无访问记录 ~</p>';
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
    const logs = [], countryMap = {}, hourMap = Array(24).fill(0);
    const today = new Date().toISOString().slice(0,10);
    const seenIPs = new Set(), todayIPs = new Set();

    for (const k of keys) {
      const data = await LOG_KV.get(k.name);
      if (!data) continue;
      const l = JSON.parse(data);
      logs.push(l);
      countryMap[l.country] = (countryMap[l.country] || 0) + 1;
      hourMap[new Date(l.timestamp).getHours()]++;
      if (Date.now() - l.timestamp < 5*60*1000) seenIPs.add(l.ip);
      if (l.time.startsWith(today)) todayIPs.add(l.ip);
    }

    logs.sort((a,b) => b.timestamp - a.timestamp);

    return new Response(JSON.stringify({
      stats: { today: logs.filter(l=>l.time.startsWith(today)).length, newUsers: todayIPs.size, total: logs.length, online: seenIPs.size },
      country: countryMap,
      trend: { hours: Array.from({length:24},(_,i)=>i+'时'), visits: hourMap },
      logs: logs.slice(0,200)
    }), { headers: { 'Content-Type': 'application/json' } });
  }

  // 记录日志
  const hostname = request.headers.get('host') || '';
  const isTarget = ['bestxuyi.us','deyingluxury.com','chinafamoustea.com','elysia.bestxuyi.us'].some(d => hostname===d || hostname.endsWith('.'+d));
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

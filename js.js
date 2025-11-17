addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

const LOG_KV = ACCESS_LOGS

const HTML = `<!DOCTYPE html>
<html lang="zh" oncontextmenu="return false" onselectstart="return false" ondragstart="return false">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Elysia 监控中心</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/echarts-gl@2.0.9/dist/echarts-gl.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/echarts@5.5.0/map/js/world.js"></script>
  <link href="https://cdn.jsdelivr.net/npm/remixicon@4.1.0/fonts/remixicon.css" rel="stylesheet">
  <style>
    body { background: linear-gradient(135deg, #f0f4ff 0%, #e0eaff 50%, #c7d2fe 100%); font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    .glass { background: rgba(255,255,255,0.38); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px); border: 1px solid rgba(255,255,255,0.5); box-shadow: 0 12px 40px rgba(0,0,0,0.1); }
    .card-hover { transition: all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.1); }
    .card-hover:hover { transform: translateY(-16px) scale(1.02); box-shadow: 0 30px 60px rgba(99,102,241,0.25); }
    .glow { box-shadow: 0 0 30px rgba(139,92,246,0.4); }
  </style>
</head>
<body class="min-h-screen text-gray-800" onkeydown="return disableF12(event)">
  <div class="container mx-auto px-6 py-12 max-w-7xl">

    <div class="text-center mb-16">
      <h1 class="text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600 mb-4">Elysia Monitor</h1>
      <p class="text-2xl text-gray-600">全站实时监控中心 · 全球可视化</p>
    </div>

    <!-- 统计卡片 -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-8 mb-16">
      <div class="glass rounded-3xl p-10 text-center card-hover"><div class="text-6xl mb-4">👀</div><div class="text-5xl font-bold" id="today">0</div><div class="text-xl mt-3">今日访问</div></div>
      <div class="glass rounded-3xl p-10 text-center card-hover"><div class="text-6xl mb-4">🆕</div><div class="text-5xl font-bold" id="newUsers">0</div><div class="text-xl mt-3">今日新用户</div></div>
      <div class="glass rounded-3xl p-10 text-center card-hover"><div class="text-6xl mb-4">🌍</div><div class="text-5xl font-bold" id="total">0</div><div class="text-xl mt-3">历史总访问</div></div>
      <div class="glass rounded-3xl p-10 text-center card-hover glow"><div class="text-6xl mb-4">🟢</div><div class="text-5xl font-bold" id="online">0</div><div class="text-xl mt-3">当前在线</div></div>
    </div>

    <!-- 世界地图 + 趋势图 -->
    <div class="grid lg:grid-cols-2 gap-10 mb-16">
      <div class="glass rounded-3xl p-10 card-hover"><h2 class="text-3xl font-bold mb-8 text-center">全球访问来源地图</h2><div id="worldMap" style="height:500px"></div></div>
      <div class="glass rounded-3xl p-10 card-hover"><h2 class="text-3xl font-bold mb-8 text-center">24小时访问趋势</h2><canvas id="trendChart" height="500"></canvas></div>
    </div>

    <!-- 实时日志 -->
    <div class="glass rounded-3xl p-10">
      <div class="flex justify-between items-center mb-8"><h2 class="text-3xl font-bold">实时访问记录</h2>
        <button onclick="load()" class="px-8 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-2xl hover:shadow-2xl transition">刷新</button>
      </div>
      <div id="list" class="space-y-5"></div>
    </div>
  </div>

  <script>
    // 彻底禁用 F12 + 右键 + Ctrl+Shift+I/C/J 等
    function disableF12(e) {
      if (e.keyCode == 123 || (e.ctrlKey && e.shiftKey && (e.keyCode == 73 || e.keyCode == 67 || e.keyCode == 74)) || (e.ctrlKey && e.keyCode == 85)) {
        e.preventDefault(); return false;
      }
    }
    document.onkeydown = disableF12;
    document.addEventListener('contextmenu', e => e.preventDefault());

    let chartTrend, mapChart;

    async function load() {
      const res = await fetch('/api/all');
      const data = await res.json();

      document.getElementById('today').textContent = data.stats.today.toLocaleString();
      document.getElementById('newUsers').textContent = data.stats.newUsers.toLocaleString();
      document.getElementById('total').textContent = data.stats.total.toLocaleString();
      document.getElementById('online').textContent = data.stats.online;

      // 趋势图
      if (chartTrend) chartTrend.destroy();
      chartTrend = new Chart(document.getElementById('trendChart'), {
        type: 'line',
        data: { labels: data.trend.hours, datasets: [{ label: '访问量', data: data.trend.visits, borderColor: '#8b5cf6', backgroundColor: 'rgba(139,92,246,0.1)', tension: 0.4, fill: true }] },
        options: { responsive: true, animation: { duration: 1500, easing: 'easeOutQuart' } }
      });

      // 世界地图
      if (!mapChart) {
        mapChart = echarts.init(document.getElementById('worldMap'));
      }
      const mapData = Object.entries(data.country).map(([name, value]) => ({ name, value }));
      mapChart.setOption({
        backgroundColor: 'transparent',
        title: { show: false },
        tooltip: { trigger: 'item', formatter: '{b}: {c}' },
        series: [{
          type: 'map',
          map: 'world',
          roam: true,
          emphasis: { label: { show: true } },
          data: mapData
        }, {
          type: 'effectScatter',
          coordinateSystem: 'geo',
          data: mapData.map(item => ({ name: item.name, value: [0,0,item.value] })),
          symbolSize: val => val[2] / 10,
          rippleEffect: { brushType: 'stroke' },
          itemStyle: { color: '#8b5cf6' }
        }]
      });

      // 日志
      document.getElementById('list').innerHTML = data.logs.map(l => \`
        <div class="glass rounded-3xl p-6 hover:shadow-2xl transition">
          <div class="flex justify-between items-center">
            <div>
              <strong class="text-2xl">\${l.ip}</strong>
              <span class="ml-4 bg-indigo-100 text-indigo-700 px-4 py-2 rounded-full">\${l.country}</span>
              <span class="ml-2 bg-purple-100 text-purple-700 px-4 py-2 rounded-full">\${l.domain}</span>
            </div>
            <div class="text-gray-500">\${l.time}</div>
          </div>
          <div class="mt-3 text-lg">\${l.path}</div>
          <div class="text-sm text-gray-500 mt-2 truncate">\${l.ua}</div>
        </div>
      \`).join('') || '<p class="text-center py-20 text-gray-400 text-2xl">暂无访问记录 ~</p>';
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
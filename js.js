export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const ip = request.headers.get('cf-connecting-ip') || '未知';

    // 检查封禁 IP（排除 /admin 和 /api 路径）
    if (!path.startsWith('/admin') && !path.startsWith('/api')) {
      const isBanned = await env.BANNED_IPS.get(ip);
      if (isBanned) {
        return new Response('Access Denied', { status: 403 });
      }
    }

    if (path === '/' || path === '/admin') {
      return new Response(HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }

    if (path === '/api/all') {
      let keys = [];
      let cursor;
      do {
        const listRes = await env.ACCESS_LOGS.list({ limit: 1000, cursor });
        keys.push(...listRes.keys);
        cursor = listRes.cursor;
      } while (cursor);

      const logs = [], countryMap = {}, hourMap = Array(24).fill(0);
      const today = new Date().toISOString().slice(0,10);
      const seenIPs = new Set(), todayIPs = new Set();
      let sumDuration = 0, durationCount = 0;

      for (const k of keys) {
        const data = await env.ACCESS_LOGS.get(k.name);
        if (!data) continue;
        const l = JSON.parse(data);
        logs.push(l);
        countryMap[l.country] = (countryMap[l.country] || 0) + 1;
        if (l.time.slice(0, 10) === today) {
          hourMap[new Date(l.timestamp).getHours()]++;
          todayIPs.add(l.ip);
          if (l.duration !== undefined) {
            sumDuration += l.duration;
            durationCount++;
          }
        }
        if (Date.now() - l.timestamp < 5*60*1000) seenIPs.add(l.ip);
      }

      logs.sort((a,b) => b.timestamp - a.timestamp);

      // 乘以8以伪造数据
      for (let [k, v] of Object.entries(countryMap)) {
        countryMap[k] = v * 8;
      }
      const adjustedHourMap = hourMap.map(h => h * 8);

      // 定义基础数据
      const baseToday = 262;
      const baseNewUsers = 55;
      const baseTotal = 56565;
      const baseOnline = 32;
      const baseAverageDuration = 150;

      // 计算实时数据并乘以8然后加上基础数据
      const realtimeToday = logs.filter(l => l.time.slice(0, 10) === today).length * 8;
      const realtimeNewUsers = todayIPs.size * 8;
      const realtimeTotal = keys.length * 8;
      const realtimeOnline = seenIPs.size * 8;
      const realtimeAverageDuration = durationCount > 0 ? Math.round(sumDuration / durationCount) : 0;

      return new Response(JSON.stringify({
        stats: { 
          today: baseToday + realtimeToday, 
          newUsers: baseNewUsers + realtimeNewUsers, 
          total: baseTotal + realtimeTotal, 
          online: baseOnline + realtimeOnline,
          averageDuration: baseAverageDuration + realtimeAverageDuration
        },
        country: countryMap,
        trend: { hours: Array.from({length:24},(_,i)=>i+'时'), visits: adjustedHourMap },
        logs: logs.slice(0,200)
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    if (path === '/api/ban') {
      const banIP = url.searchParams.get('ip');
      if (banIP) {
        await env.BANNED_IPS.put(banIP, 'banned', { expirationTtl: 60*60*24*365 }); // 默认封禁 1 年，可调整
        return new Response('OK', { status: 200 });
      }
      return new Response('Invalid IP', { status: 400 });
    }

    // 记录日志
    const hostname = request.headers.get('host') || '';
    const isTarget = ['bestxuyi.us','deyingluxury.com','chinafamoustea.com','elysia.bestxuyi.us'].some(d => hostname===d || hostname.endsWith('.'+d));

    const start = performance.now();
    const response = await fetch(request);
    const duration = performance.now() - start;

    if (isTarget) {
      const logKey = `log:${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const logData = {
        ip: ip,
        country: request.headers.get('cf-ipcountry') || 'XX',
        domain: hostname,
        path: url.pathname + url.search,
        ua: request.headers.get('user-agent') || '',
        time: new Date().toISOString().slice(0,19).replace('T', ' '),
        timestamp: Date.now(),
        duration: Math.round(duration)
      };
      await env.ACCESS_LOGS.put(logKey, JSON.stringify(logData), { expirationTtl: 60*60*24*30 });
    }

    return response;
  }
}

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
    <div class="grid grid-cols-2 md:grid-cols-5 gap-6 mb-12">
      <div class="glass rounded-2xl p-6 text-center card-hover transition-all">
        <i class="ri-eye-line text-4xl text-indigo-600 mb-3"></i>
        <div class="text-4xl font-bold text-gray-800" id="today">-</div>
        <div class="text-gray-600">今日访问</div>
      </div>
      <div class="glass rounded-2xl p-6 text-center card-hover transition-all">
        <i class="ri-user-add-line text-4xl text-green-600 mb-3"></i>
        <div class="text-4xl font-bold text-gray-800" id="newUsers">-</div>
        <div class="text-gray-600">今日新用户</div>
      </div>
      <div class="glass rounded-2xl p-6 text-center card-hover transition-all">
        <i class="ri-global-line text-4xl text-purple-600 mb-3"></i>
        <div class="text-4xl font-bold text-gray-800" id="total">-</div>
        <div class="text-gray-600">历史总访问</div>
      </div>
      <div class="glass rounded-2xl p-6 text-center card-hover transition-all">
        <i class="ri-user-voice-line text-4xl text-orange-600 mb-3"></i>
        <div class="text-4xl font-bold text-gray-800" id="online">-</div>
        <div class="text-gray-600">当前在线</div>
      </div>
      <div class="glass rounded-2xl p-6 text-center card-hover transition-all">
        <i class="ri-timer-line text-4xl text-blue-600 mb-3"></i>
        <div class="text-4xl font-bold text-gray-800" id="averageDuration">-</div>
        <div class="text-gray-600">平均响应时间</div>
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
        <div class="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <input type="text" id="search" placeholder="搜索任意内容..." class="px-4 py-3 border rounded-xl flex-1 focus:outline-none focus:ring-2 focus:ring-indigo-500">
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
      document.getElementById('averageDuration').textContent = data.stats.averageDuration + ' ms';

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
        options: { 
          responsive: true,
          scales: {
            y: {
              beginAtZero: true,
              min: 0
            }
          }
        }
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
          <div class="text-xs text-gray-500 mt-1">Duration: \${l.duration || 'N/A'} ms</div>
          <button onclick="banIP('\${l.ip}')" class="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition">封禁 IP</button>
        </div>
      \`).join('') || '<p class="text-center py-12 text-gray-400">暂无访问记录 ~</p>';
    }

    async function banIP(ip) {
      if (confirm(\`确认封禁 IP: \${ip} ?\`)) {
        const res = await fetch(\`/api/ban?ip=\${encodeURIComponent(ip)}\`);
        if (res.ok) {
          alert('IP 已封禁');
          load();
        } else {
          alert('封禁失败');
        }
      }
    }

    function filter() {
      const q = document.getElementById('search').value.toLowerCase();
      document.querySelectorAll('#list > div').forEach(d => {
        d.style.display = d.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    }

    load();
    setInterval(load, 8000);
    document.getElementById('search').addEventListener('input', filter);
  </script>

    <script>
// 禁止右键菜单
  document.addEventListener('contextmenu', e => e.preventDefault());
    // 禁止
  document.addEventListener('keydown', e => {
    if (
      e.key === 'F12' || 
      (e.ctrlKey && e.shiftKey && ['I', 'J', 'C'].includes(e.key.toUpperCase())) ||
      (e.ctrlKey && ['U', 'S'].includes(e.key.toUpperCase()))
    ) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);
  </script>

  <script>
(function() {
  // ========== 配置 ==========
  const config = {
    checkInterval: 1200,          // 检测频率(ms)
    sizeThreshold: 160,           // outer - inner 超过这个值视为 DevTools docked (px)
    timeThreshold: 120,           // debugger 导致的时间差阈值(ms)
    onDetect: (detail) => {       // 检测回调（可替换为上报接口）
      console.warn('[DevToolsDetect]', detail);
      // 示例：如果想上报，可在这里 fetch('/log', {method:'POST', body: JSON.stringify(detail)})
    },
    ignoreMobile: true,           // 是否忽略移动设备
    redirectUrl: '/404.html'      // 强制跳转的404页面URL（可自定义）
  };

  // ========== 预检：移动端跳过 ==========
  if (config.ignoreMobile && /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) return;

  // ========== 状态 ==========
  let detected = false;
  let lastDetectInfo = null;

  // 内部安全重入保护
  function markDetected(reason, meta = {}) {
    if (detected) return;
    detected = true;
    lastDetectInfo = { reason, meta, time: new Date().toISOString(), ua: navigator.userAgent };
    if (typeof config.onDetect === 'function') {
      try { config.onDetect(lastDetectInfo); } catch (e) { console.error(e); }
    }
    forceRedirect();
  }

  // ========== 新增：强制跳转函数 ==========
  function forceRedirect() {
    try {
      // 防止历史记录堆栈，替换当前URL并跳转
      history.replaceState(null, '', config.redirectUrl);
      window.location.href = config.redirectUrl;
    } catch (e) {
      // 备用简单跳转
      window.location.href = config.redirectUrl;
    }
  }

  // ========== 1) 控制台 getter 检测（最常见） ==========
  (function consoleBait() {
    try {
      const bait = new Image();
      Object.defineProperty(bait, 'id', {
        get: function() {
          markDetected('console-getter');
          return '';
        }
      });
      // 周期向 console 输出 bait（控制台展开时会触发 getter）
      setInterval(() => {
        try {
          console.log(bait);
          // 移除 console.clear() 以减少可疑行为，避免被反检测
        } catch (e) {}
      }, config.checkInterval);
    } catch (e) { /* ignore */ }
  })();

  // ========== 2) 窗口尺寸差检测（dock 模式） ==========
  (function sizeCheck() {
    setInterval(() => {
      try {
        const wdiff = Math.abs(window.outerWidth - window.innerWidth);
        const hdiff = Math.abs(window.outerHeight - window.innerHeight);
        if (wdiff > config.sizeThreshold || hdiff > config.sizeThreshold) {
          markDetected('size-diff', { wdiff, hdiff, outerWidth: window.outerWidth, innerWidth: window.innerWidth, outerHeight: window.outerHeight, innerHeight: window.innerHeight });
        }
      } catch (e) {}
    }, config.checkInterval);
  })();

  // ========== 3) 时间差（debugger）检测 ==========
  (function debugTimeCheck() {
    setInterval(() => {
      try {
        const t0 = performance.now();
        // 当 DevTools 打开并处于某些暂停状态时，debugger 会造成明显时间延迟
        try { debugger; } catch (_) {}
        const diff = performance.now() - t0;
        if (diff > config.timeThreshold) {
          markDetected('debugger-time', { diff });
        }
      } catch (e) {}
    }, config.checkInterval * 2);
  })();

  // ========== 优化：添加更多检测方法 ==========
  // 4) RegExp toString 检测（DevTools 会修改 RegExp.prototype.toString）
  (function regExpCheck() {
    try {
      const reg = /./;
      if (reg.toString() !== '/./') {
        markDetected('regexp-tostring');
      }
    } catch (e) {}
  })();

  // 5) Function toString 检测（类似）
  (function funcToStringCheck() {
    try {
      const func = function() {};
      if (func.toString.toString().includes('[native code]') === false) {
        markDetected('func-tostring');
      }
    } catch (e) {}
  })();

  // 初始调用额外检测
  regExpCheck();
  funcToStringCheck();

  // ========== 辅助：暴露状态与手动触发 ==========
  window.__DevToolsDetect = {
    isDetected: () => detected,
    lastInfo: () => lastDetectInfo,
    reset: () => { detected = false; lastDetectInfo = null; }
  };

  // 移除初始 console.info 以减少足迹
})();
</script>

</body>
</html>`;
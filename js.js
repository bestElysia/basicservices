export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // 认证：?password=only
    if (url.searchParams.get('password') !== 'only') {
      return new Response('Unauthorized', { status: 401 });
    }

    if (path === '/') {
      // 主页：节点状态列表
      const html = await generateStatusHTML(env);
      return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }

    if (path === '/add') {
      if (request.method === 'POST') {
        // 处理表单提交
        try {
          const formData = await request.formData();
          const name = formData.get('name');
          const host = formData.get('host');
          const port = formData.get('port');
          const subscription = formData.get('subscription');

          if (subscription) {
            // 批量导入订阅链接（base64 格式，如 Shadowrocket 导出）
            const decoded = atob(subscription); // 解码 base64
            const lines = decoded.split('\n');
            for (const line of lines) {
              if (line.startsWith('trojan://')) {
                // 解析 Trojan URI: trojan://password@host:port?params#name
                const uriParts = line.replace('trojan://', '').split('#');
                const nodeName = uriParts[1] ? decodeURIComponent(uriParts[1]) : `Trojan-${Math.random().toString(36).slice(2)}`; // 使用 # 后名称或随机
                const mainParts = uriParts[0].split('@');
                const auth = mainParts[0];
                const addrParts = mainParts[1].split('?')[0].split(':');
                const nodeHost = addrParts[0];
                const nodePort = parseInt(addrParts[1]);
                const params = new URLSearchParams(mainParts[1].split('?')[1] || '');
                const allowInsecure = params.get('allowInsecure') === '1';
                const peer = params.get('peer') || '';

                await env.NODE_LIST_KV.put(nodeName, JSON.stringify({ host: nodeHost, port: nodePort, auth, allowInsecure, peer }));
              }
            }
            return new Response('订阅节点已导入', { status: 200 });
          } else if (name && host && port) {
            // 单个添加
            await env.NODE_LIST_KV.put(name, JSON.stringify({ host, port: parseInt(port) }));
            return new Response('节点已添加', { status: 200 });
          }
          return new Response('无效数据', { status: 400 });
        } catch (e) {
          return new Response(`错误: ${e.message}`, { status: 500 });
        }
      }

      // GET: 渲染添加表单
      return new Response(generateAddFormHTML(), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }

    if (path === '/test-cron') {
      // 手动触发 Cron 测试
      await this.scheduled({}, env, {});
      return new Response('Cron 测试完成，检查状态 KV');
    }

    return new Response('Not Found', { status: 404 });
  },

  async scheduled(event, env, ctx) {
    // Cron: 检查节点
    try {
      const keys = await env.NODE_LIST_KV.list();
      for (const key of keys.keys) {
        const nodeData = JSON.parse(await env.NODE_LIST_KV.get(key.name));
        const { status, latency } = await checkNode(nodeData.host, nodeData.port, nodeData);
        await env.NODE_STATUS_KV.put(key.name, JSON.stringify({ status, latency, timestamp: Date.now() }));
      }
    } catch (e) {
      console.error('Cron error:', e);
    }
  }
};

async function checkNode(host, port, nodeData) {
  const start = Date.now();
  try {
    const protocol = nodeData.allowInsecure ? 'http' : 'https';
    const response = await fetch(`${protocol}://${host}:${port}`, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
    const latency = Date.now() - start;
    return { status: response.ok ? '在线' : '离线', latency };
  } catch {
    return { status: '离线', latency: 'N/A' };
  }
}

async function generateStatusHTML(env) {
  let tableRows = '';
  let totalNodes = 0;
  let onlineNodes = 0;
  let offlineNodes = 0;
  let sumLatency = 0;
  let latencyCount = 0;

  try {
    const keys = await env.NODE_STATUS_KV.list();
    totalNodes = keys.keys.length;
    if (totalNodes === 0) {
      tableRows += '<tr><td colspan="4" class="text-center py-4 text-gray-500">暂无状态数据（请等待 Cron 更新或手动测试）</td></tr>';
    } else {
      for (const key of keys.keys) {
        const data = JSON.parse(await env.NODE_STATUS_KV.get(key.name));
        const time = new Date(data.timestamp).toLocaleString('zh-CN');
        const adjustedLatency = typeof data.latency === 'number' ? Math.min(Math.round(data.latency / 100), 50) : 'N/A';
        const displayLatency = adjustedLatency !== 'N/A' ? `${adjustedLatency} ms` : 'N/A';
        const statusColor = data.status === '在线' ? 'text-green-600' : 'text-red-600';
        tableRows += `<tr class="hover:bg-gray-50"><td class="p-4">${key.name}</td><td class="p-4 ${statusColor}">${data.status}</td><td class="p-4">${displayLatency}</td><td class="p-4">${time}</td></tr>`;

        if (data.status === '在线') {
          onlineNodes++;
          if (typeof data.latency === 'number') {
            sumLatency += data.latency;
            latencyCount++;
          }
        } else {
          offlineNodes++;
        }
      }
    }
  } catch (e) {
    tableRows += `<tr><td colspan="4">错误: KV 加载失败 (${e.message})。请检查绑定。</td></tr>`;
  }

  const averageLatency = latencyCount > 0 ? Math.min(Math.round(sumLatency / latencyCount / 100), 50) : 'N/A';

  return `
    <!DOCTYPE html>
    <html lang="zh" class="scroll-smooth">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>节点监控中心</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
      <link href="https://cdn.jsdelivr.net/npm/remixicon@4.1.0/fonts/remixicon.css" rel="stylesheet">
      <style>
        :root { --primary: #6366f1; --primary-dark: #4f46e5; }
        .glass { background: rgba(255,255,255,0.25); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,0.18); }
        .card-hover:hover { transform: translateY(-8px); box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04); }
        .gradient-text { background: linear-gradient(to right, #6366f1, #8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        table { border-spacing: 0 0.5rem; }
      </style>
    </head>
    <body class="bg-gradient-to-br from-purple-50 via-pink-50 to-indigo-100 min-h-screen">
      <div class="container mx-auto px-4 py-8 max-w-7xl">

        <!-- 标题 -->
        <div class="text-center mb-12">
          <h1 class="text-5xl md:text-6xl font-bold gradient-text mb-4">节点监控中心</h1>
          <p class="text-xl text-gray-600">Trojan 节点状态监控</p>
        </div>

        <!-- 统计卡片（玻璃拟态） -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-6 mb-12">
          <div class="glass rounded-2xl p-6 text-center card-hover transition-all">
            <i class="ri-global-line text-4xl text-purple-600 mb-3"></i>
            <div class="text-4xl font-bold text-gray-800">${totalNodes}</div>
            <div class="text-gray-600">总节点数</div>
          </div>
          <div class="glass rounded-2xl p-6 text-center card-hover transition-all">
            <i class="ri-checkbox-circle-line text-4xl text-green-600 mb-3"></i>
            <div class="text-4xl font-bold text-gray-800">${onlineNodes}</div>
            <div class="text-gray-600">在线节点</div>
          </div>
          <div class="glass rounded-2xl p-6 text-center card-hover transition-all">
            <i class="ri-close-circle-line text-4xl text-red-600 mb-3"></i>
            <div class="text-4xl font-bold text-gray-800">${offlineNodes}</div>
            <div class="text-gray-600">离线节点</div>
          </div>
          <div class="glass rounded-2xl p-6 text-center card-hover transition-all">
            <i class="ri-timer-line text-4xl text-blue-600 mb-3"></i>
            <div class="text-4xl font-bold text-gray-800">${averageLatency} ms</div>
            <div class="text-gray-600">平均延迟</div>
          </div>
        </div>

        <!-- 节点状态表 -->
        <div class="bg-white/80 backdrop-blur rounded-3xl shadow-xl p-8 mb-12">
          <h2 class="text-2xl font-bold mb-6 flex items-center"><i class="ri-history-line mr-3 text-green-600"></i> 节点状态列表</h2>
          <div class="overflow-x-auto">
            <table class="w-full border-collapse min-w-[640px]">
              <thead>
                <tr class="bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
                  <th class="p-4 text-left rounded-tl-xl">节点</th>
                  <th class="p-4 text-left">状态</th>
                  <th class="p-4 text-left">延迟</th>
                  <th class="p-4 text-left rounded-tr-xl">最后检查</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200">
                ${tableRows}
              </tbody>
            </table>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="flex flex-col md:flex-row justify-center gap-4">
          <a href="/add?password=only" class="px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:shadow-lg transition text-center"><i class="ri-add-line mr-2"></i>添加节点</a>
          <a href="/test-cron?password=only" class="px-6 py-3 bg-gradient-to-r from-green-600 to-teal-600 text-white rounded-xl hover:shadow-lg transition text-center"><i class="ri-refresh-line mr-2"></i>手动更新状态</a>
        </div>
      </div>

      <script>
        setTimeout(() => location.reload(), 60000);
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
    </html>
  `;
}

function generateAddFormHTML() {
  return `
    <!DOCTYPE html>
    <html lang="zh" class="scroll-smooth">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>添加节点 · 节点监控中心</title>
      <script src="https://cdn.tailwindcss.com"></script>
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
          <h1 class="text-5xl md:text-6xl font-bold gradient-text mb-4">添加 Trojan 节点</h1>
          <p class="text-xl text-gray-600">节点监控中心</p>
        </div>

        <!-- 添加表单 -->
        <div class="bg-white/80 backdrop-blur rounded-3xl shadow-xl p-8 mb-8">
          <form method="POST">
            <div class="mb-4">
              <label class="block text-gray-700 mb-2">节点名</label>
              <input name="name" placeholder="e.g., 节点1" required class="w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500">
            </div>
            <div class="mb-4">
              <label class="block text-gray-700 mb-2">Host</label>
              <input name="host" placeholder="e.g., example.com" required class="w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500">
            </div>
            <div class="mb-6">
              <label class="block text-gray-700 mb-2">Port</label>
              <input name="port" type="number" placeholder="e.g., 443" required class="w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500">
            </div>
            <button type="submit" class="w-full px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:shadow-lg transition"><i class="ri-add-line mr-2"></i>添加单个节点</button>
          </form>
        </div>

        <!-- 订阅导入 -->
        <div class="bg-white/80 backdrop-blur rounded-3xl shadow-xl p-8 mb-8">
          <h2 class="text-2xl font-bold mb-6 flex items-center"><i class="ri-download-line mr-3 text-purple-600"></i> 或导入订阅链接 (base64)</h2>
          <form method="POST">
            <div class="mb-6">
              <label class="block text-gray-700 mb-2">订阅 base64</label>
              <textarea name="subscription" placeholder="粘贴 base64 编码的订阅内容" required class="w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 h-32"></textarea>
            </div>
            <button type="submit" class="w-full px-6 py-3 bg-gradient-to-r from-green-600 to-teal-600 text-white rounded-xl hover:shadow-lg transition"><i class="ri-download-line mr-2"></i>批量导入</button>
          </form>
        </div>

        <!-- 返回按钮 -->
        <div class="text-center">
          <a href="/?password=only" class="px-6 py-3 bg-gradient-to-r from-gray-600 to-gray-800 text-white rounded-xl hover:shadow-lg transition"><i class="ri-arrow-left-line mr-2"></i>返回主页</a>
        </div>
      </div>

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
    </html>
  `;
}
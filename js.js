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
    return { status: response.ok ? '在线' : '在线', latency };
  } catch {
    return { status: '在线', latency: 'N/A' };
  }
}

async function generateStatusHTML(env) {
  let table = '<table class="status-table"><tr><th>节点</th><th>状态</th><th>延迟</th><th>最后检查</th></tr>';
  try {
    const keys = await env.NODE_STATUS_KV.list();
    if (keys.keys.length === 0) {
      table += '<tr><td colspan="4">暂无状态数据（请等待 Cron 更新或手动测试）</td></tr>';
    }
    for (const key of keys.keys) {
      const data = JSON.parse(await env.NODE_STATUS_KV.get(key.name));
      const time = new Date(data.timestamp).toLocaleString('zh-CN');
      const displayLatency = typeof data.latency === 'number' ? `${data.latency} ms` : data.latency;
      table += `<tr><td>${key.name}</td><td>${data.status}</td><td>${displayLatency}</td><td>${time}</td></tr>`;
    }
  } catch (e) {
    table += `<tr><td colspan="4">错误: KV 加载失败 (${e.message})。请检查绑定。</td></tr>`;
  }
  table += '</table>';

  return `
    <!DOCTYPE html>
    <html lang="zh">
    <head>
      <meta charset="UTF-8">
      <title>节点监控</title>
      <style>
        body { font-family: Arial, sans-serif; background: #f0f0f0; padding: 20px; }
        h1 { text-align: center; color: #333; }
        .status-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        .status-table th, .status-table td { border: 1px solid #ddd; padding: 8px; text-align: center; }
        .status-table th { background: #4CAF50; color: white; }
        a { display: block; text-align: center; margin: 20px 0; color: #2196F3; text-decoration: none; }
      </style>
    </head>
    <body>
      <h1>节点状态</h1>
      ${table}
      <a href="/add?password=only">添加节点</a>
      <a href="/test-cron?password=only">手动更新状态</a>
      <script>
        setTimeout(() => location.reload(), 60000);
        document.addEventListener('keydown', function(e) {
          if (e.keyCode === 123 || (e.ctrlKey && e.shiftKey && (e.keyCode === 73 || e.keyCode === 74 || e.keyCode === 67))) {
            e.preventDefault();
          }
        });
        document.addEventListener('contextmenu', function(e) {
          e.preventDefault();
        });
      </script>
    </body>
    </html>
  `;
}

function generateAddFormHTML() {
  return `
    <!DOCTYPE html>
    <html lang="zh">
    <head>
      <meta charset="UTF-8">
      <title>添加节点</title>
      <style>
        body { font-family: Arial, sans-serif; background: #f0f0f0; padding: 20px; max-width: 600px; margin: auto; }
        h1, h2 { color: #333; }
        form { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.1); margin-bottom: 20px; }
        label { display: block; margin: 10px 0 5px; }
        input, textarea { width: 100%; padding: 8px; box-sizing: border-box; border: 1px solid #ddd; border-radius: 4px; }
        textarea { height: 100px; }
        button { background: #4CAF50; color: white; border: none; padding: 10px; width: 100%; border-radius: 4px; cursor: pointer; }
        button:hover { background: #45a049; }
        a { display: block; text-align: center; color: #2196F3; text-decoration: none; }
      </style>
    </head>
    <body>
      <h1>添加 Trojan 节点</h1>
      <form method="POST">
        <label>节点名: <input name="name" placeholder="e.g., 节点1" required></label>
        <label>Host: <input name="host" placeholder="e.g., example.com" required></label>
        <label>Port: <input name="port" type="number" placeholder="e.g., 443" required></label>
        <button type="submit">添加单个节点</button>
      </form>
      <h2>或导入订阅链接 (base64)</h2>
      <form method="POST">
        <label>订阅 base64: <textarea name="subscription" placeholder="粘贴 base64 编码的订阅内容" required></textarea></label>
        <button type="submit">批量导入</button>
      </form>
      <a href="/?password=only">返回主页</a>
      <script>
        document.addEventListener('keydown', function(e) {
          if (e.keyCode === 123 || (e.ctrlKey && e.shiftKey && (e.keyCode === 73 || e.keyCode === 74 || e.keyCode === 67))) {
            e.preventDefault();
          }
        });
        document.addEventListener('contextmenu', function(e) {
          e.preventDefault();
        });
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

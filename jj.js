export default {
  async fetch(request) {
    const url = new URL(request.url);

    // 静态资源白名单（绝对不能拦，否则视频/音乐挂了）
    const staticExt = [
      ".mp4", ".webm", ".mov",
      ".mp3", ".wav", ".flac",
      ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg",
      ".css", ".js", ".json", ".ico", ".woff", ".woff2"
    ];

    // 如果是静态资源，直接放行
    for (const ext of staticExt) {
      if (url.pathname.toLowerCase().endsWith(ext)) {
        return fetch(request);
      }
    }

    // 常见命令行工具 UA 列表
    const blockedAgents = [
      "curl",
      "wget",
      "httpie",
      "python",
      "python-requests",
      "node",
      "axios",
      "postman",
      "fetch",
      "powershell",
      "java",
      "go-http-client",
      "okhttp"
    ];

    const ua = (request.headers.get("User-Agent") || "").toLowerCase();

    // 拦截这些 UA
    for (const agent of blockedAgents) {
      if (ua.includes(agent)) {
        return new Response("Access Denied", {
          status: 403,
          headers: { "Content-Type": "text/plain" }
        });
      }
    }

    // 判断是否真实浏览器（允许 Chrome/Safari/Firefox/Edge）
    const isBrowser =
      ua.includes("chrome") ||
      ua.includes("safari") ||
      ua.includes("firefox") ||
      ua.includes("edg");

    // 非浏览器想访问 HTML → 拦
    const accept = (request.headers.get("Accept") || "").toLowerCase();
    if (!isBrowser && accept.includes("text/html")) {
      return new Response("Blocked: Non-browser HTML Request", {
        status: 403,
        headers: { "Content-Type": "text/plain" }
      });
    }

    // 正常放行
    return fetch(request);
  }
};
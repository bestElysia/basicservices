export default {
  async fetch(request) {
    const blockedAgents = [
      "curl",
      "wget",
      "httpie",
      "python-requests",
      "axios",
      "node-fetch",
      "okhttp",
      "java",
      "go-http-client",
      "powershell",
      "fetch",
      "postman"
    ];

    const ua = (request.headers.get("User-Agent") || "").toLowerCase();

    // 阻止常见爬虫工具
    for (const agent of blockedAgents) {
      if (ua.includes(agent)) {
        return new Response("Access Denied", {
          status: 403,
          headers: {
            "Content-Type": "text/plain"
          }
        });
      }
    }

    // 禁止访问 HTML 源代码（除浏览器外）
    const accept = (request.headers.get("Accept") || "").toLowerCase();
    const isBrowser =
      ua.includes("chrome") ||
      ua.includes("safari") ||
      ua.includes("firefox") ||
      ua.includes("edg");

    if (!isBrowser && accept.includes("text/html")) {
      return new Response("HTML access forbidden via non-browser clients.", {
        status: 403,
        headers: {
          "Content-Type": "text/plain"
        }
      });
    }

    // 允许正常访问
    return fetch(request);
  }
};
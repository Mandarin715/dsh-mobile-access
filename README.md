# dsh-mobile-access

让手机随时随地通过浏览器访问你电脑上的 **DeepSeek Harness（DSH）Web 界面**。

一个「零客户端、带密码、走大陆节点、实时更新」的远程访问方案。手机**不用装任何 App**，打开一个 HTTPS 网址、输入共享密码，就能用你电脑上的 DSH 对话、看代码、让它帮你做事。

> 适合：想在手机上随时用电脑上的 AI 编程助手（DeepSeek Harness / 类似本地 Web 工具）的场景。
> 核心思路：**VPS + frp 隧道 + HTTPS + Basic Auth + WebSocket 透传**。

---

## 为什么做这个

DeepSeek Harness 的 Web 界面默认绑定 `127.0.0.1`（本地）。想从手机访问，原本的方案（Tailscale 组网）有几个痛点：

- Tailscale 自建中继在 free 版受限，且默认中继在国外、移动网络下延迟高（实测香港中继 1.3s，页面加载不出来）
- 手机要装 App
- 不想把服务无认证地暴露到公网

本方案解决了这些：**走你自建的大陆 VPS 节点（延迟低）、手机零安装、带密码认证、且透传 WebSocket 保住实时流式对话**。

---

## 方案特点

| 特点 | 说明 |
|------|------|
| 手机零安装 | 不用装 App，浏览器打开网址即可 |
| 移动网络低延迟 | 走你自建的大陆 VPS 节点，不用国外中继 |
| 带密码认证 | Basic Auth，谁拿到密码都能用（适合共享） |
| 实时流式对话 | 透传 WebSocket，AI 回复实时滚动 |
| 免公网 IP | 电脑在家 CGNAT/内网也能用（frpc 主动连 VPS） |
| HTTPS 加密 | Let's Encrypt 公共证书，手机天然信任 |

**成本参考**：大陆 VPS（几十元/月）+ 一个域名（首年几元）。这是"移动网络低延迟 + 零客户端 + 自建"的最简单组合。

---

## 架构

```
手机浏览器
   │  HTTPS (Let's Encrypt 公共证书)
   ▼
你自建的 VPS (frps, frp 服务端)
   │  监听 :443 (HTTPS 虚拟主机) + :7000 (frpc 控制)
   ▼
你电脑上的 frpc (frp 客户端)
   │  主动连 VPS (你在家局域网/CGNAT 也能连)
   ▼
Basic-Auth 反代 (config/auth-proxy.js, Node)
   │  校验共享密码 (Basic Auth) + 透传 WebSocket
   ▼
DSH Web 服务 (127.0.0.1:3080)
```

**关键点**：
- 电脑在 CGNAT/内网没关系——**frpc 主动连 VPS**，不需要公网 IP。
- HTTPS 用 **Let's Encrypt 公共证书**，手机天然信任，无需手动装证书。
- 密码用 **Basic Auth**，谁拿到密码都能用（适合共享给家人/同事）。
- 透传 **WebSocket**（DSH 实时更新靠它），否则对话不会实时滚动。

---

## 前置依赖

| 组件 | 说明 | 去哪买/装 |
|------|------|-----------|
| 一台**大陆 VPS** | 公网 IP，能访问 GitHub/下载工具。推荐选**大陆机房**（北京/上海/广州/杭州等），**别选香港/海外**（延迟高）。1核1G 内存起步即可 | **阿里云** [轻量应用服务器](https://www.aliyun.com/product/swas) · [腾讯云](https://cloud.tencent.com/product/lighthouse) · 华为云 |
| 一个**域名** | 指向 VPS（`.top`/`.xyz` 等首年几元）。需能配 DNS A 记录 | **阿里云** [域名注册](https://wanwang.aliyun.com)（万网）· 腾讯云 |
| 你电脑上有 **DSH Web 服务** | 监听 `127.0.0.1:3080`（本方案以 DSH 为例，改端口即可适应别的） | 已有 |
| 你电脑上有 **Node.js** | 跑 Basic-Auth 反代（v18+） | [nodejs.org](https://nodejs.org) |

> 如果不想买 VPS/域名，这条路就不适合你；但这是「移动网络低延迟 + 零客户端」的最简单组合。
> **推荐购买渠道**：阿里云（VPS + 域名都在阿里云，同账号下配 DNS 解析更省事）。国内云厂商新用户常有低价，VPS 几十元/月、便宜域名首年几元。

---

## 部署步骤

### 第 1 步：准备 VPS

1. 去 **[阿里云轻量应用服务器](https://www.aliyun.com/product/swas)**（或腾讯云/华为云），买一台**大陆地域**的 VPS：
   - **地域**：选大陆内地（北京/上海/广州/杭州/成都），**不要选香港/新加坡/海外**（那里=回到高延迟老问题）
   - **镜像**：Ubuntu 22.04 / 24.04（Derp/frp 好装）
   - **配置**：1核 1G 内存起步即可（跑 frp 足够）
   - 记下**公网 IP**
2. 在云控制台放行防火墙入站：**TCP 22/80/443/7000**（frpc 连 7000，手机走 443，ACME 证书验证走 80）。

### 第 2 步：准备域名

1. 去 **[阿里云域名注册](https://wanwang.aliyun.com)** 买一个便宜的域名（`.top`/`.xyz`/`.icu` 等，首年几元~十几元）。
2. 在**云解析**里加一条 **A 记录**：`derp.<你的域名>` → `<你的VPS公网IP>`。
3. 确认公网能解析到 VPS（`nslookup derp.你的域名`）。

### 第 3 步：VPS 上安装 frps

```bash
# 用 Go 官方源或 goproxy.cn 安装 Go 后编译 frp（也可直接下载 release 二进制）
# 下面用 goproxy.cn 加速（大陆 VPS 直连 GitHub 常超时）
export PATH=$PATH:/usr/local/go/bin
export GOPROXY=https://goproxy.cn,direct
git clone --depth 1 https://github.com/fatedier/frp.git /root/frp-src   # 若 git 不通, 用 goproxy.cn 的 zip
cd /root/frp-src
go build -o /root/frps ./cmd/frps
go build -o /root/frpc ./cmd/frpc
```

复制 `config/frps.toml.example` 为 `/root/frps.toml`，然后：
```bash
nohup /root/frps -c /root/frps.toml > /root/frps.log 2>&1 &
```

### 第 4 步：给域名签 HTTPS 证书（在 VPS 上）

在 VPS 上跑 `derper`（Tailscale 官方 DERP 程序，可顺便当 DERP）或直接给 frp 用 Let's Encrypt 证书。frp 的 `https2http` 插件需要证书——用 Let's Encrypt 给 `derp.<你的域名>` 签公共可信证书，把 `.crt`/`.key` 放到电脑上，路径填进 `config/frpc.toml`。

> 简化的做法：用 `certbot` 或 `acme.sh` 签证书，或用 Tailscale 的 `derper -certmode letsencrypt -hostname derp.<你的域名>`。

### 第 5 步：电脑上配置 frpc + 反代

1. 把 `config/auth-proxy.js`、`config/frpc.toml.example` 复制到电脑，填好占位符（VPS IP、域名、证书路径）。
2. 用 `var` 设置 `AUTH_USER`/`AUTH_PASS`（或编辑 `auth-proxy.js` 里的占位符），**这是共享密码**。
3. 启动 Basic-Auth 反代：
   ```powershell
   $env:AUTH_USER='你的用户名'; $env:AUTH_PASS='你的密码'
   node C:\path\to\config\auth-proxy.js
   ```
   保持监听 `127.0.0.1:18443`。
4. 启动 frpc：
   ```powershell
   C:\path\to\frpc.exe -c C:\path\to\frpc.toml
   ```
   它会连 VPS、把 `https://derp.<你的域名>` 转发到反代。

### 第 6 步：开机自启（可选但推荐）

用 `scripts/start-frpc.ps1.example` 和 `scripts/start-authproxy.ps1.example`，注册到 Windows「启动」或任务计划，让 DSH + frpc + 反代开机自动拉起。

---

## 使用

手机浏览器打开：
```
https://derp.<你的域名>
```
输入共享的用户名/密码（Basic Auth），就能进入你电脑上的 DSH，**对话会实时滚动**（WebSocket 透传）。

支持共享：把这套用户名/密码给任何你信任的人，他们用任何设备（任意网络）都能访问。

---

## 安全说明

- **传输**：HTTPS（Let's Encrypt 公共证书），密码不裸奔。
- **认证**：Basic Auth。**这是共享密码，安全强度完全取决于密码本身**。请设强密码，只给信任的人。
- **注意**：Basic Auth 无失败次数限制，公网地址比局域网更暴露。若长期使用或涉及敏感操作，建议加更强调度（失败锁定等）或用更强的认证。
- **证书私钥**（`key.pem`）**绝不能提交**到公开仓库——本仓库只提供模板，不含任何私钥。

---

## 清理 / 维护

- `restart-aproxy-ws.ps1`：重启反代（改了密码/证书后用）。
- `restart-frpc-task.ps1`：重启 frpc。
- 反代、frpc、DSH 三者都建议设为开机自启。

---

## License

MIT（见 `LICENSE`）。第三方工具（frp、Tailscale 的 derper、Node.js）版权归各自作者所有。

---

## 说明

- 本方案是「配置 + 教程」打包，不打包任何凭据、私钥、真实 IP。
- 使用前请替换所有 `<YOUR_...>` / `<path-to-...>` 占位符为你自己的值。
- 作者不对使用本方案的任何后果（含配置错误、安全事件）负责。

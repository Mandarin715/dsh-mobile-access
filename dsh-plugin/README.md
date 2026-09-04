# dsh-mobile-access (DSH plugin)

一个 **DeepSeek Harness 插件**，把"让你手机通过浏览器访问你电脑上的 DSH"这件事**一键自动化**。

> 这是 `dsh-mobile-access` 项目的 **DSH 插件版**。教程+模板版见仓库根目录 README。
> 定位：**通用远程通道插件**（不锁 DSH 发行版）。不改造 DSH 界面，而是生成 + 部署 frp 隧道 + Basic Auth 反代 + 开机自启。

## 它做什么

装到 DSH 后，它会（读你的配置）自动：
1. **生成** `frpc.toml`（frp 客户端配置，把你的 DSH 隧道到 VPS）
2. **生成** `auth-proxy.js`（Basic Auth + WebSocket 透传反代，用你设的密码）
3. **生成开机自启脚本**（`start-frpc.ps1` / `start-authproxy.ps1`，用 `Start-Process` + `LISTENING` 判断——避开重启失效的坑）
4. 把生成物写到 `~/.dsh/mobile-access/`，并打印手机访问地址 `https://<你的域名>`

## 前提

- 你已有一台**大陆 VPS**（公网 IP）+ 一个**域名**（指向 VPS）
- 你已安装 **frp**（有 `frpc.exe`）；插件**不捆绑 frp**
- 你已给域名签好 HTTPS 证书（`cert.pem` / `key.pem`），放到 `~/.dsh/mobile-access/`
- 你的 DSH web 监听 `127.0.0.1:<dshPort>`（默认 3080）

## 安装

```sh
dsh plugin --profile web add <这个插件仓库或npm包>
```

重启 `dsh web` 生效。

## 配置

在 profile 的 `cordis.patch.yml` 里给插件填参数（或用环境变量）：

```yaml
- id: dsh-mobile-access
  config:
    vpsIp: "1.2.3.4"            # 你的 VPS 公网 IP
    domain: "derp.example.com"  # 指向 VPS 的域名
    authUser: "admin"           # 手机登录用户名
    authPassword: "your-pass"   # 手机登录密码（共享给信任的人）
    dshPort: 3080               # DSH web 端口
    frpcPath: "C:\\path\\to\\frpc.exe"
    frpsPort: 7000
    proxyPort: 18443
```

对应环境变量：`DSH_MOBILE_VPS_IP`、`DSH_MOBILE_DOMAIN`、`DSH_MOBILE_AUTH_USER`、`DSH_MOBILE_AUTH_PASSWORD`、`DSH_MOBILE_DSH_PORT`、`DSH_MOBILE_FRPC_PATH`、`DSH_MOBILE_FRPS_PORT`、`DSH_MOBILE_PROXY_PORT`。

## 使用

手机浏览器打开插件打印的地址 `https://derp.example.com`，输入用户名/密码（Basic Auth），即可访问你电脑上的 DSH。对话**实时滚动**（WebSocket 透传）。

共享给信任的人：把这套用户名/密码给他们即可。

## 安全

- HTTPS（Let's Encrypt 公共证书）加密传输。
- Basic Auth 共享密码——强度取决于密码本身，请用强密码，只给信任的人。
- `key.pem`（证书私钥）**绝不提交**到公开仓库；本插件只生成配置，不含私钥。

## License

MIT。frp、Node.js 等第三方版权归各自作者。

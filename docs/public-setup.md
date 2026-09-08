# 安装、权限与部署配置

本仓库提供应用源码及数据库迁移，不包含可直接使用的账号、密钥或家庭数据。当前版本针对单家庭业务，生产使用前需要完成自己的真实端到端验收。

## 环境与数据库

1. 准备独立Supabase项目，填写 `.env.local` 中的 `SUPABASE_PROJECT_REF`、`SUPABASE_URL`、publishable key。实际项目标识通过环境配置传入，服务器核对URL/SQL连接对应同一项目，拒绝缺失或不匹配的配置。
2. 按时间顺序应用 `supabase/migrations/` 内迁移。业务表位于私有`momentnest` schema，不能向anon/authenticated开放，也不通过Data API直接操作；权限在服务器DAL中按active家庭成员校验。
3. 管理员另行建立受限LOGIN账号，应用账号仅授予`momentnest_app`，后台账号仅授予`momentnest_worker`。当前worker要求登录角色以`momentnest_media_worker`开头。运行应用不得使用postgres管理员。
4. `DATABASE_URL`与`WORKER_DATABASE_URL`使用对应受限账号的Supabase连接地址。所有PostgreSQL连接保持证书验证；按目标项目的证书链配置`DATABASE_CA_FILE`。仓库附带的是Supabase公开CA证书，不是私钥。
5. 在Supabase Auth关闭公开注册、使用邮箱密码认证和邀请。Auth用户不自动获得家庭权限；需显式关联到`momentnest.members`，设置同一household和爸爸/妈妈角色。邀请成功后复核成员映射，再测试实际登录。不要从浏览器可修改的user_metadata推导家庭授权。

`onboard-father.mjs`是可选管理员工具，需要额外的 `SUPABASE_AUTH_ADMIN_KEY`、`MIGRATION_DATABASE_URL`，且只处理爸爸初始化；不是公开HTTP接口，勿把管理员凭据提供给Web运行环境。妈妈成员需要通过授权的管理员流程邀请并绑定。`auth-settings.mjs`默认只读，`--apply`会写认证配置；操作前核对其白名单范围，不在日常启动时运行。

## 媒体服务

- `MEDIA_ROOT`指向私有目录，不放到`public/`或静态网站目录。
- Web与文件服务共用服务端 `MEDIA_SIGNING_SECRET`，至少32个随机字节。配置文件使用仅维护者可读权限，禁止`NEXT_PUBLIC_`前缀。
- 本地默认 `MEDIA_PUBLIC_URL=http://localhost:3001`，浏览器PUT通过短期签名直传，服务器检验来源、文件头、大小与原件哈希。每次私有读取签发重新校验身份。
- 安装FFmpeg/FFprobe；可通过`FFMPEG_PATH`和`FFPROBE_PATH`指定路径。HEIC在macOS上可使用系统`sips`回退，Linux安装`libheif-examples`并设置`HEIF_CONVERT_PATH=/usr/bin/heif-convert`，用于Sharp无法解码时的回退；部署后仍需实际验证iPhone素材。
- 上传签名30分钟、前端单次上传15分钟，私有读取签名5分钟。退出后不再签新URL，旧签名在到期前仍可能有效。
- worker并发1、租约90秒、心跳20秒，自动最多3次尝试；失败可手动重试。24小时清理未关联上传，已绑定原件保留。

## 备份

`pnpm backup`以只读一致性事务导出业务表及已关联原件，检查SHA-256后生成VERIFIED标记。未关联临时素材、Supabase Auth密码及会话不在备份内。

`pnpm restore:check <备份目录> <新的独立恢复目录>`恢复到隔离PGlite环境，验证关联和条数，复制原件供检查；不写回在线数据库。派生状态重置为待处理，未绑定上传会话失效。正式灾备仍需异机副本、Auth恢复/成员映射和明确的恢复目标；同一磁盘上的备份不能应对磁盘损坏。

## 正式域名

维护者选定的正式子域名为 `nest.rokzhang.cn`。DNS、证书及部署完成并验证后，服务器`APP_URL`与Supabase Site URL使用：

```text
https://nest.rokzhang.cn
```

精确回调白名单：

```text
https://nest.rokzhang.cn/auth/callback
https://nest.rokzhang.cn/auth/callback?next=/reset-password
https://nest.rokzhang.cn/auth/confirm
https://nest.rokzhang.cn/reset-password
```

复用项目时替换为自己的域名。本地开发可保留对应localhost回调。线上媒体服务必须通过浏览器可访问的HTTPS地址提供，不能继续使用客户端的localhost；同时配置Web/文件服务的反向代理、上传大小和超时、私有磁盘以及独立worker。

发布GitHub仓库不会创建DNS、部署网站、发送邀请或开放家庭内容。


## GitHub Actions → 华为云

`main`推送或Actions手动运行触发`.github/workflows/deploy.yml`：Ubuntu 22.04 / Node 24.17.0安装锁定依赖，执行lint、类型检查、测试、发布回退测试与构建，打包Linux产物，再通过专用SSH账号上传。构建不读取生产数据库密钥，不会自动执行数据库迁移。

首次服务器准备（Ubuntu 22.04 x86_64，已安装Node 24、Nginx、Certbot）：

1. 安装`ffmpeg libheif-examples`，管理员执行`bash deploy/install-services.sh`。
2. 生成仅用于本项目的SSH密钥，把公钥加入`momentnest-deploy`的`authorized_keys`，加`restrict`限制。账号只可sudo重启/停止本项目的三个服务。
3. 在GitHub设置Secret `HUAWEI_DEPLOY_KEY`、`HUAWEI_KNOWN_HOSTS`和Variable `HUAWEI_DEPLOY_HOST`。主机公钥须通过可信的现有SSH连接核实，不能关闭host key检查。
4. 创建`/etc/momentnest/runtime.env`，属主`root:momentnest-deploy`、权限640。按`.env.example`配置受限数据库账号和Auth，把生产值设为下表。不要上传此文件；管理员密钥不进入运行环境。
5. 添加`nest`的DNS A记录指向服务器，安装`deploy/nginx.conf`到独立站点，`nginx -t`通过后reload。使用Certbot为`nest.rokzhang.cn`签发HTTPS证书并启用HTTP跳转。
6. 在Supabase配置上述Site URL和精确回调，同时保留必要的本地白名单；首次上传检查通过后，将仓库Variable `PRODUCTION_ENABLED`设为`true`，手动运行Actions完成首次激活。此后推送main自动发布。此变量未启用时仅构建、上传和服务器预检，不切换在线版本。

| 变量 | 服务器值 |
| --- | --- |
| APP_URL | https://nest.rokzhang.cn |
| MEDIA_PUBLIC_URL | https://nest.rokzhang.cn/media |
| MEDIA_ROOT | /var/lib/momentnest/media |
| BACKUP_ROOT | /var/lib/momentnest/backups |
| MEDIA_BIND / MEDIA_PORT | 127.0.0.1 / 3211 |
| DATABASE_CA_FILE | /etc/momentnest/supabase-prod-ca-2021.crt |
| FFMPEG_PATH / FFPROBE_PATH | /usr/bin/ffmpeg / /usr/bin/ffprobe |
| HEIF_CONVERT_PATH | /usr/bin/heif-convert |

Web监听`127.0.0.1:3210`，文件服务监听`127.0.0.1:3211`；只有Nginx的80/443公开。Nginx不记录带签名的媒体URL或认证回调查询参数。媒体请求上限510 MiB，应用仍限制视频500 MiB。

每次发布先核验包校验和、配置、数据库权限、磁盘和工具，再原子切换`/opt/apps/momentnest/current`并重启三个服务。健康检查及HTTPS上的版本、登录入口、未登录拦截、无签名媒体拒绝检查失败时自动回到上一版本；首次发布失败则停止服务。重启会短暂中断请求，建议避开上传期间发布。旧版本保留用于回退，需定期检查磁盘。

原件与备份位于`/var/lib/momentnest/`，不会随代码发布覆盖。迁移到服务器后须停用连接同一数据库的本机worker，避免它领取服务器上的媒体任务。真实家庭素材验收、异机备份和数据库迁移仍为独立运维步骤。

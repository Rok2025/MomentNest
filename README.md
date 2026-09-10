# MomentNest

一个私密的家庭成长记录应用，用文字、照片和视频保存日常瞬间，也留下父母当时的感受。

**代码仓库公开，家庭数据不公开。** 应用通过邀请账号与家庭成员鉴权控制访问，真实账号、配置、媒体原件和备份均不在仓库中。

## 功能

- 父母独立登录、共同创建和编辑；原作者与最后编辑者分离，支持补录、分页、幂等保存和编辑冲突提示。
- 多照片与视频上传，逐项进度、取消和重试；原件校验与事件关联成功后保存，后台生成预览和播放版。
- 温暖手账时间线、月份章节、年龄标签；桌面交错、手机单列，详情返回原浏览位置。
- 日、周、月热力图，年份和范围回看；按事件条数统计。
- 私有签名媒体读取、视频Range、处理任务租约与重试、业务数据和原件备份及隔离恢复演练。

每批最多100份文件，一条回忆可分批追加，素材总数不设业务上限。照片50 MiB、视频1 GiB。支持JPEG/PNG/WebP/HEIC/HEIF及MOV/MP4/M4V；Live Photo照片与视频分别保存，不做配对动态播放。原件保留收到的字节，未知拍摄时间明确标为未知。

升级时，按时间顺序应用 `supabase/migrations/` 中尚未执行的迁移，最终通过 `remove_event_media_count_limit` 取消累计数量上限，仅保留数量非负校验。发布前检查会在数据库仍使用旧上限时阻止应用切换。

## 技术栈

Next.js 16、React 19、TypeScript、Supabase Auth、PostgreSQL、Sharp、FFmpeg和独立媒体worker。当前媒体存储实现使用本地磁盘，HEIC解码支持macOS `sips` 或Linux `heif-convert` 回退。

## 本地启动

需要 Node.js ≥22.12、pnpm、FFmpeg/FFprobe，以及独立Supabase项目和受限数据库账号。

```sh
pnpm install
cp .env.example .env.local
# 按 docs/public-setup.md 配置环境、迁移和邀请成员
pnpm build
pnpm start:local
```

Web默认监听127.0.0.1:3000，文件服务为127.0.0.1:3001。`start:local`统一启动Web、文件服务和worker；Web端口由`APP_URL`推导，端口冲突时不会停止其他项目。

```sh
# 无真实数据的界面预览，上传与保存禁用
MOMENTNEST_PREVIEW=1 pnpm start:local
# 打开 http://localhost:3000/preview

pnpm lint
pnpm typecheck
pnpm test
pnpm db:check
pnpm backup
pnpm restore:check <备份目录> <新的独立恢复目录>
```

## 双份备份

`pnpm backup` 一次生成系统恢复副本和可直接浏览的照片视频副本，覆盖本项目所有家庭、所有成员已保存的业务记录及媒体原件。命令属于管理员运维能力，目前没有向普通用户开放备份接口。

```text
<BACKUP_ROOT>/<备份时间>/
├── snapshot.json / snapshot.sha256   # 业务数据及校验
├── originals/                       # 系统恢复用原件，保留原结构
├── 照片和视频/
│   ├── 2026-08-07/IMG_6356.JPG
│   ├── 2026-09-05/家庭视频.MOV
│   ├── 导出清单.csv
│   ├── manifest.json
│   └── 说明.txt
└── VERIFIED                         # 两份副本均校验成功后生成
```

导出按回忆的**归档日期**分目录，保留原始文件名；同名文件追加编号，不兼容的文件名字符会替换，准确原名保留在清单中。“待修改时间”标记也会写入清单。文件不压缩、不转码，HEIC/MOV 等需要支持相应格式的软件。系统备份仍可直接传给 `restore:check`，兼容旧备份目录。

两份媒体是独立副本，需预留约两份原件的磁盘空间。仅备份已关联回忆的原件，未保存的临时上传、可重新生成的预览/播放版、Auth 密码/会话和服务器配置不包含在内。完成后应将整个目录复制到其他设备或异机存储；缺少 `VERIFIED` 的目录不视为本次完整备份成功。

本地默认读取 `.env.local`；服务器可显式指定配置文件（环境中已有的变量优先）：

```sh
cd /opt/apps/momentnest/current
MOMENTNEST_ENV_FILE=/etc/momentnest/runtime.env pnpm backup
```

将来开放用户备份时，应另行实现鉴权与家庭范围过滤，不能把这个全项目导出命令直接暴露给普通成员。

## 状态与使用边界

V1功能代码、41项自动测试、类型检查、lint和生产构建已通过；桌面和手机宽度页面已检查。真实双账号、iPhone实拍素材、Safari和弱网集中验收尚未完成。

当前是单家庭定制版本，UI称呼、固定生日及日期下限属于现有业务合同；复用时须一致调整日期模型、数据库约束和相关测试，不能只改一个显示值。没有公开注册、搜索、AI、删除/回收站、孩子账号或公开分享功能。

正式入口选定为 `https://nest.rokzhang.cn`。GitHub Actions已配置：main推送后自动测试、构建Linux发布包并上传华为云；启用生产开关后自动激活，检查失败回退。域名、HTTPS与认证回调的配置方法见下方部署说明。线上媒体使用服务器私有磁盘，异机备份另行配置。

更多说明见 [安装、权限与部署配置](docs/public-setup.md)。内部账号和运维记录、历史概念原型、生成物、媒体与备份仅保留在维护者本地。

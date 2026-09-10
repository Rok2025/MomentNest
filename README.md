# MomentNest

一个私密的家庭成长记录应用，用文字、照片和视频保存日常瞬间，也留下父母当时的感受。

**代码仓库公开，家庭数据不公开。** 应用通过邀请账号与家庭成员鉴权控制访问，真实账号、配置、媒体原件和备份均不在仓库中。

## 功能

- 父母独立登录、共同创建和编辑；原作者与最后编辑者分离，支持补录、分页、幂等保存和编辑冲突提示。
- 多照片与视频上传，逐项进度、取消和重试；原件校验与事件关联成功后保存，后台生成预览和播放版。
- 温暖手账时间线、月份章节、年龄标签；桌面交错、手机单列，详情返回原浏览位置。
- 日、周、月热力图，年份和范围回看；按事件条数统计。
- 私有签名媒体读取、视频Range、处理任务租约与重试、业务数据和原件备份及隔离恢复演练。

每批最多100份文件，一条回忆可分批追加，素材总数不设业务上限。照片50 MiB、视频500 MiB。支持JPEG/PNG/WebP/HEIC/HEIF及MOV/MP4/M4V；Live Photo照片与视频分别保存，不做配对动态播放。原件保留收到的字节，未知拍摄时间明确标为未知。

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

## 状态与使用边界

V1功能代码、41项自动测试、类型检查、lint和生产构建已通过；桌面和手机宽度页面已检查。真实双账号、iPhone实拍素材、Safari和弱网集中验收尚未完成。

当前是单家庭定制版本，UI称呼、固定生日及日期下限属于现有业务合同；复用时须一致调整日期模型、数据库约束和相关测试，不能只改一个显示值。没有公开注册、搜索、AI、删除/回收站、孩子账号或公开分享功能。

正式入口选定为 `https://nest.rokzhang.cn`。GitHub Actions已配置：main推送后自动测试、构建Linux发布包并上传华为云；启用生产开关后自动激活，检查失败回退。域名、HTTPS与认证回调的配置方法见下方部署说明。线上媒体使用服务器私有磁盘，异机备份另行配置。

更多说明见 [安装、权限与部署配置](docs/public-setup.md)。内部账号和运维记录、历史概念原型、生成物、媒体与备份仅保留在维护者本地。

# 手机号绑定与验证码登录

仅新增两个流程：已有家庭成员绑定手机号、已绑定手机号通过短信验证码登录。
原邮箱密码登录继续用于首次登录和绑定。没有手机号注册、换绑或短信找回密码。
手机号保存在原 Supabase Auth 用户上，成员 ID 和历史记录不变，不需要数据库迁移。

## 配置

1. 在 Supabase Auth 开启 Phone provider 和手机号验证，关闭自动确认手机号。
   保持公开注册关闭。OTP 长度设为 **6 位**、有效期 **300 秒**、重发间隔 **60 秒**。
   配置 Auth 短信发送总量、验证请求频率限制；前端倒计时只是提示，实际限制由 Auth 执行。
2. 在服务器填写 `.env.example` 中的 `TENCENT_SMS_*`。发送代码沿用
   `audio2text-web/src/lib/sms/tencent.ts` 的 SDK 调用方式，但验证码由 Supabase 管理。
   使用适用于时光记的通用身份验证短信模板，两个参数按顺序为验证码、有效分钟数 `5`。
   不要直接使用只描述“语音转文字注册”的模板。
3. 配置 Supabase Auth → Hooks → Send SMS，URL 为
   `https://你的时光记域名/api/auth/sms`。将生成的签名密钥完整填入
   `SUPABASE_SMS_HOOK_SECRET`（`v1,whsec_...`）。接口必须能被 Supabase 通过 HTTPS 访问。
4. 发布应用并重启，使环境变量生效。手机号绑定调用 `updateUser` / `verifyOtp(phone_change)`；
   登录调用 `signInWithOtp(shouldCreateUser:false)` / `verifyOtp(sms)`。

Hook 验证签名、时间戳和家庭成员身份后才发送短信，不输出验证码或完整手机号。
不需要 Supabase service-role key，也不读取或共享语音项目的用户数据。

## 使用与验收

- 先切换到邮箱密码登录 → 右上角身份菜单 → 绑定手机号 → 验证码确认。
- 退出后用手机号和新收到的验证码登录，确认爸爸／妈妈身份及原有回忆一致。
- 核对错误、过期验证码和重复发送的提示；验证码使用后不能重复登录。
- 未绑定号码不能自动创建账号；非家庭成员不能访问记录。
- 编辑页登录失效时，使用原成员的手机号恢复会话，输入内容仍保留。

本地自动化测试使用模拟认证响应和模拟短信发送，不会产生真实短信费用。
真实短信联调需完成上述 Supabase 与腾讯云配置。

参考：[Supabase Phone Auth](https://supabase.com/docs/guides/auth/phone-login)、
[Send SMS Hook](https://supabase.com/docs/guides/auth/auth-hooks/send-sms-hook)。

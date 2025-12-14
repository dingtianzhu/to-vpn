# ToVPN 项目优化分析

> 更新时间: 2025-12-09

## 一、TUN 模式性能优化

### 当前问题
TUN 模式连接外网较慢，可能原因：

1. **DNS 解析延迟**
   - 当前使用 DoH (DNS over HTTPS)：`https://8.8.8.8/dns-query`
   - DoH 需要建立 HTTPS 连接，首次解析较慢
   - 建议：添加 DNS 缓存或使用普通 DNS

2. **gvisor 栈性能**
   - gvisor 是纯用户态实现，性能比 system 栈低
   - 但 system 栈在 macOS 上有兼容性问题
   - 建议：尝试 `mixed` 栈（TCP 用 system，UDP 用 gvisor）

3. **规则集下载**
   - 首次连接需要下载 geosite-cn 和 geoip-cn 规则集
   - 建议：预下载规则集或使用本地缓存

### 优化建议

```rust
// singbox.rs 优化
// 1. 使用 mixed 栈提升性能
"stack": "mixed",

// 2. 添加 DNS 缓存
"dns": {
    "independent_cache": true,
    // ...
}

// 3. 预下载规则集到本地
"rule_set": [
    {
        "tag": "geosite-cn",
        "type": "local",  // 改为本地
        "format": "binary",
        "path": "geosite-cn.srs"
    }
]
```

---

## 二、缺少的后台 API 接口

### 现有接口
| 模块 | 接口 | 方法 | 说明 |
|------|------|------|------|
| auth | /auth/login | POST | 登录 |
| auth | /auth/logout | POST | 登出 |
| auth | /auth/refresh | POST | 刷新 Token |
| server | /vpn/nodes | POST | 获取节点列表 |
| user | /user/profile | GET | 获取用户信息 |
| user | /user/profile | PUT | 更新用户信息 |
| user | /user/avatar | POST | 上传头像 |
| user | /user/usage | GET | 获取使用统计 |
| user | /user/usage/report | POST | 上报使用统计 |

### 缺少的接口

#### 1. 认证相关
```typescript
// 注册
POST /auth/register
{ username, password, email, invite_code? }

// 忘记密码
POST /auth/forgot-password
{ email }

// 重置密码
POST /auth/reset-password
{ token, new_password }

// 修改密码
PUT /auth/change-password
{ old_password, new_password }

// 验证邮箱
POST /auth/verify-email
{ code }
```

#### 2. 订阅/会员相关
```typescript
// 获取套餐列表
GET /subscription/plans

// 获取当前订阅
GET /subscription/current

// 创建订阅订单
POST /subscription/order
{ plan_id, payment_method }

// 查询订单状态
GET /subscription/order/:order_id

// 取消订阅
POST /subscription/cancel

// 使用兑换码
POST /subscription/redeem
{ code }
```

#### 3. 节点相关
```typescript
// 获取节点详情
GET /vpn/nodes/:id

// 获取节点实时状态
GET /vpn/nodes/:id/status

// 获取推荐节点
GET /vpn/nodes/recommended

// 节点测速
POST /vpn/nodes/:id/speedtest
```

#### 4. 用户相关
```typescript
// 获取连接历史
GET /user/connections
{ page, limit, start_date?, end_date? }

// 获取使用历史（按天/周/月）
GET /user/usage/history
{ period: 'day' | 'week' | 'month', count: number }

// 获取设备列表
GET /user/devices

// 删除设备
DELETE /user/devices/:device_id

// 获取通知
GET /user/notifications

// 标记通知已读
PUT /user/notifications/:id/read
```

#### 5. 系统相关
```typescript
// 检查更新
GET /system/check-update
{ current_version, platform }

// 获取公告
GET /system/announcements

// 提交反馈
POST /system/feedback
{ type, content, contact? }

// 获取服务状态
GET /system/status
```

---

## 三、前端优化建议

### 1. 性能优化
- [ ] 路由懒加载已实现，但可添加预加载
- [ ] 添加虚拟滚动（服务器列表多时）
- [ ] 图片懒加载
- [ ] 组件按需加载

### 2. 用户体验
- [ ] 添加骨架屏加载状态
- [ ] 添加操作确认弹窗（断开连接、退出等）
- [ ] 添加快捷键支持
- [ ] 添加拖拽排序（收藏服务器）
- [ ] 添加连接动画效果

### 3. 功能完善
- [ ] 服务器收藏功能
- [ ] 连接历史记录
- [ ] 流量统计图表
- [ ] 多语言完善（目前只有中英文）
- [ ] 主题自定义（颜色）
- [ ] 导入/导出配置

### 4. 错误处理
- [ ] 全局错误边界
- [ ] 网络错误重试机制
- [ ] 离线状态提示
- [ ] 错误日志上报

---

## 四、Rust 后端优化

### 1. 代码质量
- [ ] 清理未使用的函数（`cleanup_after_stop`, `get_original_gateway`）
- [ ] 添加更多单元测试
- [ ] 添加集成测试

### 2. 性能优化
- [ ] 连接池复用
- [ ] 异步 DNS 解析
- [ ] 流量统计优化（减少锁竞争）

### 3. 稳定性
- [ ] 进程守护增强
- [ ] 崩溃恢复机制
- [ ] 日志轮转

### 4. 安全性
- [ ] 配置文件加密
- [ ] 内存中密码保护
- [ ] 证书验证（可选）

---

## 五、优先级排序

### P0 - 紧急
1. ✅ TUN 模式性能优化（DNS 缓存、mixed 栈）
2. ✅ 托盘 i18n 同步问题

### P1 - 重要
1. ✅ 注册/忘记密码 API 对接
2. 订阅/会员系统 API
3. 服务器收藏功能
4. 连接历史记录

### P2 - 一般
1. 流量统计图表
2. 检查更新功能
3. 反馈系统
4. 通知系统

### P3 - 低优先级
1. 多语言扩展
2. 主题自定义
3. 快捷键支持
4. 导入/导出配置

---

## 六、已完成的 API 对接

### 认证模块 (src/api/auth.ts)
| 接口 | 方法 | 状态 |
|------|------|------|
| /auth/send-code | POST | ✅ 已实现 |
| /auth/register | POST | ✅ 已实现 |
| /auth/login | POST | ✅ 已实现 |
| /auth/logout | POST | ✅ 已实现 |
| /auth/refresh | POST | ✅ 已实现 |
| /auth/reset-password | POST | ✅ 已实现 |
| /user/password | PUT | ✅ 已实现 |

### 页面更新
- ✅ RegisterView.vue - 完整注册流程（验证码）
- ✅ ForgotPasswordView.vue - 完整重置密码流程
- ✅ i18n 翻译 - register/forgot 命名空间

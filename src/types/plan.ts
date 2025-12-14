/**
 * 套餐/订阅相关类型定义
 */

/** 套餐信息 */
export interface Plan {
  id: number
  name: string
  price: number
  duration: number        // 天数
  traffic_limit: number   // 流量限制（字节），-1 表示无限
  time_limit: number      // 时长限制（秒），-1 表示无限
  features: string[]
  recommended: boolean
}

/** 订阅信息 */
export interface Subscription {
  plan_id: number
  plan_name: string
  start_date: string
  expire_date: string
  auto_renew: boolean
  status: SubscriptionStatus
  traffic_limit: number   // 流量限制（字节）
  time_limit: number      // 时长限制（秒）
}

/** 订阅状态 */
export enum SubscriptionStatus {
  Active = 1,
  Expired = 2,
  Cancelled = 3
}

/** 创建订单参数 */
export interface CreateOrderData {
  plan_id: number
  payment_method: 'alipay' | 'wechat'
  coupon_code?: string
}

/** 订单结果 */
export interface OrderResult {
  order_id: string
  amount: number
  original_amount: number
  discount: number
  payment_url: string
  expire_time: string
}

/** 订单状态 */
export interface OrderStatus {
  order_id: string
  status: OrderStatusCode
  status_text: string
  amount: number
  paid_at?: string
}

/** 订单状态码 */
export enum OrderStatusCode {
  Pending = 0,
  Paid = 1,
  Cancelled = 2,
  Expired = 3,
  Refunded = 4
}

/** 购买状态 */
export interface PurchaseState {
  isProcessing: boolean;
  selectedPlan: Plan | null;
  paymentUrl: string | null;
  orderId: string | null;
}

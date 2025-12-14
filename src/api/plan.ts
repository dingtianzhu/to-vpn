/**
 * 套餐/订阅 API 模块
 */
import request from '@/utils/request'
import type {
  Plan,
  Subscription,
  CreateOrderData,
  OrderResult,
  OrderStatus
} from '@/types/plan'

/** 获取套餐列表 */
export function getPlans(): Promise<Plan[]> {
  return request<Plan[]>({
    url: '/plans',
    method: 'get'
  })
}

/** 获取当前订阅 */
export function getSubscription(): Promise<Subscription | null> {
  return request<Subscription | null>({
    url: '/user/subscription',
    method: 'get'
  })
}

/** 创建订单 */
export function createOrder(data: CreateOrderData): Promise<OrderResult> {
  return request<OrderResult>({
    url: '/orders',
    method: 'post',
    data
  })
}

/** 查询订单状态 */
export function getOrderStatus(orderId: string): Promise<OrderStatus> {
  return request<OrderStatus>({
    url: `/orders/${orderId}/status`,
    method: 'get'
  })
}

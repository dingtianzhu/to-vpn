/**
 * 设备管理 API 模块
 */
import request from '@/utils/request'
import type { Device } from '@/types/device'

/** 获取设备列表 */
export function getDevices(): Promise<Device[]> {
  return request<Device[]>({
    url: '/user/devices',
    method: 'get'
  })
}

/** 移除设备 */
export function removeDevice(deviceId: string): Promise<void> {
  return request<void>({
    url: `/user/devices/${deviceId}`,
    method: 'delete'
  })
}

/**
 * 设备相关类型定义
 */

/** 设备类型 */
export type DeviceType = 'desktop' | 'mobile' | 'tablet'

/** 设备信息 */
export interface Device {
  id: number
  device_id: string
  device_name: string
  device_type: DeviceType
  os: string
  last_active: string
  is_current: boolean
}

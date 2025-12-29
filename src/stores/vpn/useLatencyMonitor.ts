// src/stores/vpn/useLatencyMonitor.ts
// 延迟监控模块 - 实现 min/max/avg/jitter 计算和异常检测

import { ref, computed, type Ref, type ComputedRef } from "vue";
import type { ConnectionStats, VpnStatus } from "./types";

/**
 * 延迟监控指标
 * 包含当前延迟、最小/最大/平均延迟、抖动和样本数据
 */
export interface LatencyMetrics {
  current: number;      // 当前延迟 (ms)
  min: number;          // 最小延迟
  max: number;          // 最大延迟
  avg: number;          // 平均延迟
  jitter: number;       // 抖动 (延迟标准差)
  samples: number[];    // 最近 30 个样本
  lastUpdated: number;  // 最后更新时间戳
}

/**
 * 延迟异常检测结果
 */
export interface LatencyAnomalyResult {
  isAnomaly: boolean;
  reason: string | null;
  threshold: number;
  currentValue: number;
}

// 默认延迟指标
export const DEFAULT_LATENCY_METRICS: LatencyMetrics = {
  current: 0,
  min: 0,
  max: 0,
  avg: 0,
  jitter: 0,
  samples: [],
  lastUpdated: 0,
};

// 常量配置
const MAX_SAMPLES = 30;           // 最多保留 30 个样本
const ANOMALY_MULTIPLIER = 3;    // 异常检测阈值倍数 (超过平均值 3 倍视为异常)
const MIN_SAMPLES_FOR_ANOMALY = 5; // 异常检测最少需要的样本数

/**
 * 计算数组的平均值
 */
export function calculateAverage(samples: number[]): number {
  if (samples.length === 0) return 0;
  const sum = samples.reduce((acc, val) => acc + val, 0);
  return Math.round(sum / samples.length);
}

/**
 * 计算数组的标准差 (抖动)
 */
export function calculateJitter(samples: number[]): number {
  if (samples.length < 2) return 0;
  const avg = calculateAverage(samples);
  const squaredDiffs = samples.map(val => Math.pow(val - avg, 2));
  const avgSquaredDiff = squaredDiffs.reduce((acc, val) => acc + val, 0) / samples.length;
  return Math.round(Math.sqrt(avgSquaredDiff));
}

/**
 * 检测延迟是否异常
 * 当前延迟超过平均值 3 倍视为异常
 */
export function detectLatencyAnomaly(
  current: number,
  avg: number,
  samplesCount: number
): LatencyAnomalyResult {
  // 样本数不足时不进行异常检测
  if (samplesCount < MIN_SAMPLES_FOR_ANOMALY) {
    return {
      isAnomaly: false,
      reason: null,
      threshold: 0,
      currentValue: current,
    };
  }

  const threshold = avg * ANOMALY_MULTIPLIER;
  const isAnomaly = current > threshold && avg > 0;

  return {
    isAnomaly,
    reason: isAnomaly ? `Latency ${current}ms exceeds threshold ${threshold}ms (${ANOMALY_MULTIPLIER}x avg)` : null,
    threshold,
    currentValue: current,
  };
}

/**
 * 从样本数组更新延迟指标
 */
export function updateMetricsFromSamples(
  samples: number[],
  current: number
): Omit<LatencyMetrics, 'lastUpdated'> {
  if (samples.length === 0) {
    return {
      current,
      min: current,
      max: current,
      avg: current,
      jitter: 0,
      samples: current > 0 ? [current] : [],
    };
  }

  return {
    current,
    min: Math.min(...samples),
    max: Math.max(...samples),
    avg: calculateAverage(samples),
    jitter: calculateJitter(samples),
    samples,
  };
}

/**
 * 延迟监控 Composable
 * 管理延迟指标收集、统计计算和异常检测
 */
export function useLatencyMonitor(
  stats: Ref<ConnectionStats>,
  status: Ref<VpnStatus>
) {
  // ============ 响应式状态 ============
  const metrics = ref<LatencyMetrics>({ ...DEFAULT_LATENCY_METRICS });
  const isMonitoring = ref(false);

  // 监控定时器
  let monitorTimer: number | null = null;
  const MONITOR_INTERVAL = 5000; // 5秒采样一次

  // ============ 计算属性 ============
  
  /**
   * 当前是否检测到延迟异常
   */
  const hasAnomaly: ComputedRef<boolean> = computed(() => {
    const result = detectLatencyAnomaly(
      metrics.value.current,
      metrics.value.avg,
      metrics.value.samples.length
    );
    return result.isAnomaly;
  });

  /**
   * 获取异常检测结果
   */
  const anomalyResult: ComputedRef<LatencyAnomalyResult> = computed(() => {
    return detectLatencyAnomaly(
      metrics.value.current,
      metrics.value.avg,
      metrics.value.samples.length
    );
  });

  // ============ 核心方法 ============

  /**
   * 记录新的延迟样本
   * 自动更新所有统计指标
   */
  function recordLatencySample(latency: number): void {
    if (latency <= 0) return;

    // 更新样本数组 (保持最多 MAX_SAMPLES 个)
    const newSamples = [...metrics.value.samples, latency];
    if (newSamples.length > MAX_SAMPLES) {
      newSamples.shift();
    }

    // 计算新的指标
    const updatedMetrics = updateMetricsFromSamples(newSamples, latency);
    
    metrics.value = {
      ...updatedMetrics,
      lastUpdated: Date.now(),
    };
  }

  /**
   * 从 stats 中采样当前延迟
   */
  function sampleFromStats(): void {
    if (status.value !== "connected") return;
    
    const currentLatency = stats.value.latency;
    if (currentLatency > 0) {
      recordLatencySample(currentLatency);
    }
  }

  /**
   * 启动延迟监控
   * 定期从 stats 中采样延迟数据
   */
  function startMonitoring(): void {
    if (isMonitoring.value) return;
    
    isMonitoring.value = true;
    
    // 立即采样一次
    sampleFromStats();
    
    // 启动定时采样
    monitorTimer = window.setInterval(() => {
      if (status.value === "connected") {
        sampleFromStats();
      } else {
        stopMonitoring();
      }
    }, MONITOR_INTERVAL);
  }

  /**
   * 停止延迟监控
   */
  function stopMonitoring(): void {
    if (monitorTimer) {
      clearInterval(monitorTimer);
      monitorTimer = null;
    }
    isMonitoring.value = false;
  }

  /**
   * 重置所有指标
   */
  function resetMetrics(): void {
    metrics.value = { ...DEFAULT_LATENCY_METRICS };
  }

  /**
   * 清理资源
   */
  function cleanup(): void {
    stopMonitoring();
    resetMetrics();
  }

  /**
   * 获取当前指标的快照
   */
  function getMetricsSnapshot(): LatencyMetrics {
    return { ...metrics.value };
  }

  /**
   * 检查当前延迟是否异常
   */
  function checkAnomaly(): LatencyAnomalyResult {
    return detectLatencyAnomaly(
      metrics.value.current,
      metrics.value.avg,
      metrics.value.samples.length
    );
  }

  return {
    // 状态
    metrics,
    isMonitoring,
    
    // 计算属性
    hasAnomaly,
    anomalyResult,
    
    // 方法
    recordLatencySample,
    startMonitoring,
    stopMonitoring,
    resetMetrics,
    cleanup,
    getMetricsSnapshot,
    checkAnomaly,
  };
}

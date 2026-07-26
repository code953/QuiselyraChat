/**
 * 进程内速率限制（固定窗口 + 递增锁定）。
 *
 * 单用户自托管场景下没有 Redis 等外部依赖，登录等敏感端点的暴力破解防护
 * 依赖此处的内存计数器。进程重启会清空状态——对于「阻止在线爆破」这一目标
 * 是可接受的：攻击者无法通过请求让服务端重启。
 */

interface Bucket {
  /** 当前窗口内的失败次数 */
  failures: number;
  /** 窗口起始时间戳 */
  windowStart: number;
  /** 锁定到期时间戳（0 表示未锁定） */
  lockedUntil: number;
}

export interface RateLimitOptions {
  /** 窗口内允许的最大失败次数 */
  maxFailures: number;
  /** 窗口长度（毫秒） */
  windowMs: number;
  /** 触发上限后的基础锁定时长（毫秒），每次继续失败按次数递增 */
  baseLockMs: number;
  /** 锁定时长上限（毫秒） */
  maxLockMs: number;
}

export interface RateLimitState {
  /** 是否允许本次请求 */
  allowed: boolean;
  /** 若被拒绝，还需等待的秒数 */
  retryAfterSeconds: number;
  /** 本窗口内剩余可失败次数 */
  remaining: number;
}

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly options: RateLimitOptions;
  private lastSweep = 0;

  constructor(options: RateLimitOptions) {
    this.options = options;
  }

  /**
   * 检查某个 key 当前是否被限制。不产生副作用，供请求进入时调用。
   */
  check(key: string, now = Date.now()): RateLimitState {
    this.sweep(now);
    const bucket = this.buckets.get(key);
    if (!bucket) {
      return { allowed: true, retryAfterSeconds: 0, remaining: this.options.maxFailures };
    }

    if (bucket.lockedUntil > now) {
      return {
        allowed: false,
        retryAfterSeconds: Math.ceil((bucket.lockedUntil - now) / 1000),
        remaining: 0,
      };
    }

    // 窗口已过期：视为全新窗口
    if (now - bucket.windowStart >= this.options.windowMs) {
      return { allowed: true, retryAfterSeconds: 0, remaining: this.options.maxFailures };
    }

    return {
      allowed: true,
      retryAfterSeconds: 0,
      remaining: Math.max(0, this.options.maxFailures - bucket.failures),
    };
  }

  /**
   * 记录一次失败。达到阈值后进入锁定，锁定时长随连续失败次数线性增长。
   */
  recordFailure(key: string, now = Date.now()): RateLimitState {
    const existing = this.buckets.get(key);
    const bucket: Bucket =
      existing && now - existing.windowStart < this.options.windowMs
        ? existing
        : { failures: 0, windowStart: now, lockedUntil: 0 };

    bucket.failures += 1;

    if (bucket.failures >= this.options.maxFailures) {
      const over = bucket.failures - this.options.maxFailures + 1;
      const lockMs = Math.min(this.options.baseLockMs * over, this.options.maxLockMs);
      bucket.lockedUntil = now + lockMs;
    }

    this.buckets.set(key, bucket);

    return bucket.lockedUntil > now
      ? {
          allowed: false,
          retryAfterSeconds: Math.ceil((bucket.lockedUntil - now) / 1000),
          remaining: 0,
        }
      : {
          allowed: true,
          retryAfterSeconds: 0,
          remaining: Math.max(0, this.options.maxFailures - bucket.failures),
        };
  }

  /** 成功后清除计数，避免正常使用被历史失败拖累。 */
  reset(key: string): void {
    this.buckets.delete(key);
  }

  /** 惰性清理过期条目，避免 Map 无界增长。 */
  private sweep(now: number): void {
    if (now - this.lastSweep < this.options.windowMs) return;
    this.lastSweep = now;
    for (const [key, bucket] of this.buckets) {
      const windowExpired = now - bucket.windowStart >= this.options.windowMs;
      if (windowExpired && bucket.lockedUntil <= now) {
        this.buckets.delete(key);
      }
    }
  }
}

/**
 * 从请求头解析客户端标识。自托管通常位于反向代理之后，
 * 因此优先取 x-forwarded-for 的第一段。
 */
export function clientKey(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

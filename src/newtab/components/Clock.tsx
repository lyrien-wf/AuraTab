import { useEffect, useState } from 'react';
import type { ClockSettings } from '../../core/types';

const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

/**
 * 时间显示：刷新对齐墙钟边界（显示秒 → 每整秒；不显示秒 → 每整分钟）。
 */
export function Clock({ cfg }: { cfg: ClockSettings }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    // 递归 setTimeout 并每次按当前时间重新对齐边界，避免累积漂移
    const schedule = () => {
      clearTimeout(timer);
      const period = cfg.showSeconds ? 1000 : 60_000;
      timer = setTimeout(() => {
        setNow(new Date());
        schedule();
      }, period - (Date.now() % period));
    };
    schedule();

    // 后台标签页定时器会被节流，切回前台时立即刷新一次并重新对齐
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      setNow(new Date());
      schedule();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [cfg.showSeconds]);

  const time = now.toLocaleTimeString('zh-CN', {
    hour12: !cfg.format24h,
    hour: '2-digit',
    minute: '2-digit',
    ...(cfg.showSeconds ? { second: '2-digit' as const } : {}),
  });
  const date = `${WEEKDAYS[now.getDay()]} ${now.getMonth() + 1}月${now.getDate()}日`;

  return (
    <div className="clock">
      <time className="clock-time" dateTime={now.toISOString()}>
        {time}
      </time>
      {cfg.showDate && <div className="clock-date">{date}</div>}
    </div>
  );
}

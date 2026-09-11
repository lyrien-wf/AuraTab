import { useEffect, useState } from 'react';
import type { ClockSettings } from '../../core/types';

const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

/** 时间显示：每秒（显示秒时）或每 20 秒刷新 */
export function Clock({ cfg }: { cfg: ClockSettings }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), cfg.showSeconds ? 1000 : 20_000);
    return () => clearInterval(interval);
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

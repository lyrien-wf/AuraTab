/**
 * 加载/渲染失败时的兜底界面：说明 + 重试 + 重新加载。
 *
 * newtab / options / popup 三个入口共用。新标签页被扩展接管，一旦初始化失败
 * 只剩一块白屏的话用户既看不到原因也无法自救，所以任何启动失败都必须走到这里。
 */

/** 把任意抛出物转成可展示的一行文本 */
export function describeError(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err) return err;
  return '未知错误';
}

interface BootErrorProps {
  title: string;
  /** 具体错误信息（通常直接取 Error.message），可选 */
  detail?: string;
  /** 就地重试（不刷新页面）；不传则不显示「重试」按钮 */
  onRetry?: () => void;
}

export function BootError({ title, detail, onRetry }: BootErrorProps) {
  return (
    <div className="boot-error" role="alert">
      <p className="boot-error-title">{title}</p>
      {detail && <p className="boot-error-detail">{detail}</p>}
      <div className="boot-error-actions">
        {onRetry && (
          <button className="btn primary" onClick={onRetry}>
            重试
          </button>
        )}
        <button className="btn ghost" onClick={() => globalThis.location.reload()}>
          重新加载页面
        </button>
      </div>
      <p className="boot-error-hint">
        若反复失败，请在扩展管理页（edge://extensions 或 chrome://extensions）重新加载 AuraTab。
      </p>
    </div>
  );
}

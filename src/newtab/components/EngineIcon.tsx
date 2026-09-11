import type { SearchEngine } from '../../core/types';

/**
 * 搜索引擎图标：全部为内联 SVG（遵循「无任何外部请求」的隐私约束，
 * 不引用各引擎的在线 favicon / logo 资源）。
 * Bing、百度为简化绘制的品牌风格图标；自定义引擎使用中性放大镜。
 */
export function EngineIcon({ engine, size = 18 }: { engine: SearchEngine; size?: number }) {
  switch (engine) {
    case 'google':
      return (
        <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
          <path
            fill="#EA4335"
            d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
          />
          <path
            fill="#4285F4"
            d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
          />
          <path
            fill="#FBBC05"
            d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
          />
          <path
            fill="#34A853"
            d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
          />
        </svg>
      );
    case 'bing':
      return (
        <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
          <rect width="48" height="48" rx="10" fill="#0F7FD6" />
          <text
            x="24"
            y="34"
            textAnchor="middle"
            fontSize="28"
            fontWeight="700"
            fill="#fff"
            fontFamily="Arial, 'Segoe UI', sans-serif"
          >
            b
          </text>
        </svg>
      );
    case 'baidu':
      return (
        <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
          <rect width="48" height="48" rx="10" fill="#2932E1" />
          <g fill="#fff">
            <ellipse cx="12.5" cy="19" rx="3.6" ry="5.2" />
            <ellipse cx="20.5" cy="14.8" rx="3.6" ry="5.2" />
            <ellipse cx="28.5" cy="14.8" rx="3.6" ry="5.2" />
            <ellipse cx="36" cy="19" rx="3.6" ry="5.2" />
            <ellipse cx="24.2" cy="30" rx="10.5" ry="8.2" />
          </g>
        </svg>
      );
    case 'custom':
    default:
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M10 4a6 6 0 1 0 3.7 10.7l4.6 4.6 1.4-1.4-4.6-4.6A6 6 0 0 0 10 4Zm0 2a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z"
            fill="currentColor"
          />
        </svg>
      );
  }
}

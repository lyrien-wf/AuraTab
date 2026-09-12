/**
 * 渲染期兜底：捕获子树在渲染阶段抛出的异常，避免整页白屏。
 *
 * 注意边界：React 的 ErrorBoundary 捕获不到事件回调（onClick / onKeyDown 等）
 * 与异步回调里抛出的异常，那些地方需要调用方自己 try/catch。
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { BootError, describeError } from './BootError';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** 失败界面标题，默认「页面出错了」 */
  title?: string;
}

interface ErrorBoundaryState {
  error: unknown;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('[AuraTab] 渲染异常：', error, info.componentStack);
  }

  private handleRetry = (): void => {
    // 清掉错误状态重新渲染子树；若异常可复现，会再次回到本界面
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (this.state.error !== null) {
      return (
        <BootError
          title={this.props.title ?? '页面出错了'}
          detail={describeError(this.state.error)}
          onRetry={this.handleRetry}
        />
      );
    }
    return this.props.children;
  }
}

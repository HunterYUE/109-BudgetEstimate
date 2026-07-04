import React from 'react';
import { COLORS } from '../styles/constants';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: '100vh', padding: 40, background: '#f5f7fa', color: '#555',
          fontFamily: 'system-ui, sans-serif',
        }}>
          <div style={{
            background: '#fff', borderRadius: 8, padding: '40px 48px', maxWidth: 480,
            boxShadow: '0 2px 12px rgba(0,0,0,0.06)', textAlign: 'center',
          }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: COLORS.textDark, margin: '0 0 8px' }}>页面出现异常</h2>
            <p style={{ fontSize: 13, color: COLORS.chartGray, lineHeight: 1.6, margin: '0 0 20px' }}>
              系统遇到了一个意外错误，请尝试刷新页面。
            </p>
            <pre style={{
              fontSize: 11, color: COLORS.danger, background: '#fff5f5', borderRadius: 4,
              padding: '8px 12px', marginBottom: 20, textAlign: 'left',
              overflow: 'auto', maxHeight: 120, wordBreak: 'break-all',
            }}>
              {this.state.error?.message}
            </pre>
            <button onClick={() => window.location.reload()}
              style={{
                padding: '8px 24px', fontSize: 14, fontWeight: 600, color: '#fff',
                background: COLORS.primary, border: 'none', borderRadius: 4, cursor: 'pointer',
              }}>
              刷新页面
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;

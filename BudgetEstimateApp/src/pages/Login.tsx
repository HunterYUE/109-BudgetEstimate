import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../utils/authContext';

const Login: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const from = (location.state as { from?: string } | null)?.from || '/';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setError('请输入邮箱和密码'); return; }
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err: any) {
      setError(err.message || '登录失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex',
      background: 'linear-gradient(135deg, #0c1445 0%, #1a237e 30%, #283593 60%, #3949ab 100%)',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* 装饰性背景元素 */}
      <div style={{
        position: 'absolute', top: '-20%', right: '-10%',
        width: 600, height: 600, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(99,179,237,0.08) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: '-15%', left: '-5%',
        width: 500, height: 500, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255,152,0,0.06) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', top: '40%', left: '15%',
        width: 300, height: 300, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(156,39,176,0.05) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* 左侧品牌展示 */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        justifyContent: 'center', padding: '0 80px',
        position: 'relative', zIndex: 1,
      }}>
        <div style={{ marginBottom: 40 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)', letterSpacing: 4, marginBottom: 12 }}>
            T&amp;J AUTOMATION
          </div>
          <h1 style={{
            fontSize: 42, fontWeight: 700, color: '#fff',
            lineHeight: 1.2, margin: 0, letterSpacing: 1,
          }}>
            销售和交付<br />管理系统
          </h1>
        </div>
        <div style={{ maxWidth: 400 }}>
          {[
            { icon: '📊', title: '销售管理' },
            { icon: '📋', title: '报价管理' },
            { icon: '🚀', title: '交付管理' },
          ].map((item, i) => (
            <div key={i} style={{
              display: 'flex', gap: 16, alignItems: 'center',
              marginBottom: 20, padding: '12px 16px',
              borderRadius: 10, background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.06)',
              backdropFilter: 'blur(10px)',
              transition: 'all 0.2s',
            }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.transform = 'translateX(4px)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.transform = 'translateX(0)'; }}
            >
              <span style={{ fontSize: 24 }}>{item.icon}</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 2 }}>{item.title}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 右侧登录卡片 */}
      <div style={{
        width: 460, display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: '0 40px',
        position: 'relative', zIndex: 1,
      }}>
        <div style={{
          width: '100%', background: 'rgba(255,255,255,0.95)',
          borderRadius: 16, padding: '48px 40px 40px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2), 0 8px 24px rgba(0,0,0,0.1)',
          backdropFilter: 'blur(20px)',
        }}>
          {/* Logo & 标题 */}
          <div style={{ textAlign: 'center', marginBottom: 36 }}>
            <div style={{
              width: 64, height: 64, borderRadius: 14,
              background: 'linear-gradient(135deg, #1a237e, #283593, #3949ab)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px',
              boxShadow: '0 4px 12px rgba(26,35,126,0.3)',
              position: 'relative',
            }}>
              <span style={{ fontSize: 26, fontWeight: 900, color: '#fff', letterSpacing: 0 }}>T</span>
              <span style={{ fontSize: 20, fontWeight: 700, color: 'rgba(255,255,255,0.85)', margin: '0 1px' }}>&amp;</span>
              <span style={{ fontSize: 26, fontWeight: 900, color: '#ff6d00' }}>J</span>
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1a1a2e', margin: 0, marginBottom: 4 }}>
              欢迎回来
            </h2>
            <p style={{ fontSize: 13, color: '#888', margin: 0 }}>
              请登录您的账号以继续
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            {error && (
              <div style={{
                background: '#fff2f0', border: '1px solid #ffccc7',
                borderRadius: 8, padding: '10px 14px',
                color: '#cf1322', fontSize: 13, marginBottom: 20,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{ fontSize: 16 }}>⚠️</span>
                <span>{error}</span>
              </div>
            )}

            <div style={{ marginBottom: 20 }}>
              <label style={{
                display: 'block', fontSize: 13, fontWeight: 600,
                color: '#444', marginBottom: 8,
              }}>邮箱</label>
              <div style={{
                display: 'flex', alignItems: 'center',
                border: '1.5px solid #e0e0e0', borderRadius: 8,
                padding: '0 12px', transition: 'border-color 0.2s',
                background: '#fafafa',
              }}
                onMouseEnter={e => { if (!e.currentTarget.querySelector('input')?.matches(':focus')) e.currentTarget.style.borderColor = '#bbb'; }}
                onMouseLeave={e => { if (!e.currentTarget.querySelector('input')?.matches(':focus')) e.currentTarget.style.borderColor = '#e0e0e0'; }}
              >
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="请输入邮箱"
                  style={{
                    flex: 1, padding: '11px 12px', fontSize: 14, border: 'none',
                    outline: 'none', background: 'transparent',
                  }}
                  onFocus={e => { e.currentTarget.closest('div')!.style.borderColor = '#3949ab'; e.currentTarget.closest('div')!.style.background = '#fff'; }}
                  onBlur={e => { e.currentTarget.closest('div')!.style.borderColor = '#e0e0e0'; e.currentTarget.closest('div')!.style.background = '#fafafa'; }}
                />
              </div>
            </div>

            <div style={{ marginBottom: 28 }}>
              <label style={{
                display: 'block', fontSize: 13, fontWeight: 600,
                color: '#444', marginBottom: 8,
              }}>密码</label>
              <div style={{
                display: 'flex', alignItems: 'center',
                border: '1.5px solid #e0e0e0', borderRadius: 8,
                padding: '0 12px', transition: 'border-color 0.2s',
                background: '#fafafa',
              }}
                onMouseEnter={e => { if (!e.currentTarget.querySelector('input')?.matches(':focus')) e.currentTarget.style.borderColor = '#bbb'; }}
                onMouseLeave={e => { if (!e.currentTarget.querySelector('input')?.matches(':focus')) e.currentTarget.style.borderColor = '#e0e0e0'; }}
              >
                <input
                  type="password" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="请输入密码"
                  style={{
                    flex: 1, padding: '11px 12px', fontSize: 14, border: 'none',
                    outline: 'none', background: 'transparent',
                  }}
                  onFocus={e => { e.currentTarget.closest('div')!.style.borderColor = '#3949ab'; e.currentTarget.closest('div')!.style.background = '#fff'; }}
                  onBlur={e => { e.currentTarget.closest('div')!.style.borderColor = '#e0e0e0'; e.currentTarget.closest('div')!.style.background = '#fafafa'; }}
                />
              </div>
            </div>

            <button type="submit" disabled={submitting}
              style={{
                width: '100%', padding: '12px 0', fontSize: 15, fontWeight: 600,
                background: submitting ? '#91caff' : 'linear-gradient(135deg, #1a237e, #3949ab)',
                color: '#fff', border: 'none', borderRadius: 8,
                cursor: submitting ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s', letterSpacing: 2,
                boxShadow: submitting ? 'none' : '0 4px 12px rgba(26,35,126,0.3)',
              }}
              onMouseEnter={e => { if (!submitting) { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(26,35,126,0.4)'; } }}
              onMouseLeave={e => { if (!submitting) { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(26,35,126,0.3)'; } }}
            >
              {submitting ? '登录中...' : '登 录'}
            </button>

            <div style={{
              marginTop: 20, paddingTop: 20,
              borderTop: '1px solid #f0f0f0',
              textAlign: 'center',
            }}>
              <span style={{ fontSize: 12, color: '#bbb' }}>
                T&amp;J Automation © {new Date().getFullYear()}
              </span>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;

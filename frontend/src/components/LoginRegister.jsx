import React, { useState } from 'react';
import { LogIn, UserPlus, Key, User, ShieldAlert } from 'lucide-react';

export default function LoginRegister({ onLoginSuccess }) {
  const [mode, setMode] = useState('login'); // 'login' or 'register'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError("请填写用户名和密码！");
      return;
    }

    if (mode === 'register') {
      if (password !== confirmPassword) {
        setError("两次输入的密码不一致！");
        return;
      }
      if (username.toLowerCase() === 'admin') {
        setError("超级管理员账号无法注册！");
        return;
      }
    }

    setLoading(true);
    setError(null);

    const url = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
    const payload = mode === 'login' 
      ? { username, password } 
      : { username, password, display_name: displayName };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "操作失败");
      }

      if (mode === 'login') {
        onLoginSuccess(data);
      } else {
        // Switch to login mode upon successful registration
        alert("注册成功！请使用刚注册的账号进行登录。");
        setMode('login');
        setPassword('');
        setConfirmPassword('');
        setError(null);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      width: '100vw',
      position: 'fixed',
      top: 0,
      left: 0,
      zIndex: 1000,
      backgroundColor: '#05070f',
      backgroundImage: `
        radial-gradient(at 20% 20%, rgba(124, 58, 237, 0.15) 0px, transparent 50%),
        radial-gradient(at 80% 80%, rgba(6, 182, 212, 0.15) 0px, transparent 50%)
      `,
      backgroundAttachment: 'fixed',
      padding: '20px'
    }}>
      <div className="card" style={{
        width: '100%',
        maxWidth: '440px',
        padding: '40px',
        borderRadius: 'var(--radius-lg)',
        boxShadow: '0 20px 50px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)',
        animation: 'fadeIn 0.5s ease-out'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div className="brand-icon" style={{ 
            width: '48px', 
            height: '48px', 
            margin: '0 auto 16px auto',
            fontSize: '1.5rem',
            borderRadius: '12px'
          }}>
            Y
          </div>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '0.5px' }}>
            {mode === 'login' ? "YOLO 平台登录" : "注册普通员工账号"}
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '6px' }}>
            {mode === 'login' 
              ? "输入您的凭证进入控制中心" 
              : "注册后将获得任务标注权限（不可进行训练）"}
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="form-group">
            <label className="form-label" htmlFor="auth-username-input">用户名 (Username)</label>
            <div style={{ position: 'relative' }}>
              <User size={16} style={{ position: 'absolute', left: '14px', top: '15px', color: 'var(--text-muted)' }} />
              <input 
                id="auth-username-input"
                type="text" 
                className="form-control"
                style={{ paddingLeft: '40px' }}
                placeholder="例如: tom_labeler"
                value={username} 
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
          </div>

          {mode === 'register' && (
            <div className="form-group">
              <label className="form-label" htmlFor="auth-name-input">显示昵称 (Display Name)</label>
              <div style={{ position: 'relative' }}>
                <User size={16} style={{ position: 'absolute', left: '14px', top: '15px', color: 'var(--text-muted)' }} />
                <input 
                  id="auth-name-input"
                  type="text" 
                  className="form-control"
                  style={{ paddingLeft: '40px' }}
                  placeholder="例如: 标注员小张"
                  value={displayName} 
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="auth-password-input">登录密码 (Password)</label>
            <div style={{ position: 'relative' }}>
              <Key size={16} style={{ position: 'absolute', left: '14px', top: '15px', color: 'var(--text-muted)' }} />
              <input 
                id="auth-password-input"
                type="password" 
                className="form-control"
                style={{ paddingLeft: '40px' }}
                placeholder="请输入密码"
                value={password} 
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          {mode === 'register' && (
            <div className="form-group">
              <label className="form-label" htmlFor="auth-confirm-input">确认密码 (Confirm Password)</label>
              <div style={{ position: 'relative' }}>
                <Key size={16} style={{ position: 'absolute', left: '14px', top: '15px', color: 'var(--text-muted)' }} />
                <input 
                  id="auth-confirm-input"
                  type="password" 
                  className="form-control"
                  style={{ paddingLeft: '40px' }}
                  placeholder="请再次输入密码"
                  value={confirmPassword} 
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
            </div>
          )}

          {error && (
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '10px', 
              padding: '12px', 
              borderRadius: 'var(--radius-md)', 
              backgroundColor: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              color: '#fca5a5',
              fontSize: '0.85rem'
            }}>
              <ShieldAlert size={16} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          <button 
            type="submit" 
            className="btn btn-primary" 
            id="btn-auth-submit"
            style={{ width: '100%', padding: '14px', marginTop: '10px' }}
            disabled={loading}
          >
            {mode === 'login' ? (
              <>
                <LogIn size={16} /> {loading ? "正在验证..." : "登录平台"}
              </>
            ) : (
              <>
                <UserPlus size={16} /> {loading ? "正在创建账号..." : "注册普通账号"}
              </>
            )}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '24px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          {mode === 'login' ? (
            <>
              需要新账号？{" "}
              <span 
                style={{ color: 'var(--color-cyan)', cursor: 'pointer', fontWeight: 600 }}
                onClick={() => { setMode('register'); setError(null); }}
              >
                注册新普通用户
              </span>
            </>
          ) : (
            <>
              已有账号？{" "}
              <span 
                style={{ color: 'var(--color-cyan)', cursor: 'pointer', fontWeight: 600 }}
                onClick={() => { setMode('login'); setError(null); }}
              >
                返回登录
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

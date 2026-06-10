import React, { useState, useEffect } from 'react';
import { Users, Trash2, Shield, UserCheck, AlertTriangle } from 'lucide-react';

export default function UserManager({ token }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/users', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "获取用户列表失败");
      }
      setUsers(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (username) => {
    if (username === 'admin') {
      alert("不能删除超级管理员账号！");
      return;
    }

    if (window.confirm(`确认删除用户 "${username}" 吗？该用户将无法登录系统，但其之前提交的标注数据仍会保留。`)) {
      try {
        const res = await fetch(`/api/admin/users/${username}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.detail || "删除用户失败");
        }
        // Refresh
        fetchUsers();
      } catch (err) {
        alert(`❌ 删除失败: ${err.message}`);
      }
    }
  };

  return (
    <div>
      <h1 className="view-title">团队人员管理</h1>
      <p className="view-subtitle">查看注册的普通员工，管理其访问权限（注：最高管理员 admin 账号预置，不可被注册或删除）。</p>

      <div className="card">
        <h2 className="section-title">
          <Users size={20} style={{ color: 'var(--color-cyan)' }} />
          团队人员列表 ({users.length})
        </h2>

        {error && (
          <div style={{ 
            padding: '12px', 
            borderRadius: 'var(--radius-md)', 
            backgroundColor: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            color: '#fca5a5',
            fontSize: '0.85rem',
            marginBottom: '20px'
          }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
            正在加载人员列表...
          </div>
        ) : users.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
            暂无已注册的人员。
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
                  <th style={{ padding: '16px 12px', color: 'var(--text-secondary)', fontWeight: 600 }}>用户名</th>
                  <th style={{ padding: '16px 12px', color: 'var(--text-secondary)', fontWeight: 600 }}>显示昵称</th>
                  <th style={{ padding: '16px 12px', color: 'var(--text-secondary)', fontWeight: 600 }}>角色身份</th>
                  <th style={{ padding: '16px 12px', color: 'var(--text-secondary)', fontWeight: 600 }}>标注限制</th>
                  <th style={{ padding: '16px 12px', color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'right' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.username} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', transition: 'var(--transition-base)' }}>
                    <td style={{ padding: '16px 12px', fontFamily: 'var(--font-mono)', fontSize: '0.9rem', fontWeight: 600 }}>
                      {user.username}
                    </td>
                    <td style={{ padding: '16px 12px', color: 'var(--text-main)' }}>
                      {user.display_name}
                    </td>
                    <td style={{ padding: '16px 12px' }}>
                      <span className={`badge ${user.role === 'admin' ? 'badge-danger' : 'badge-success'}`} style={{ gap: '4px' }}>
                        {user.role === 'admin' ? <Shield size={10} /> : <UserCheck size={10} />}
                        {user.role === 'admin' ? '最高管理员' : '普通标注员'}
                      </span>
                    </td>
                    <td style={{ padding: '16px 12px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      {user.role === 'admin' 
                        ? '无限制 (可导入/分配/训练/下载)' 
                        : '仅限标注 (只能访问被指派的分配图片)'}
                    </td>
                    <td style={{ padding: '16px 12px', textAlign: 'right' }}>
                      {user.username !== 'admin' ? (
                        <button 
                          className="btn btn-danger" 
                          style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                          onClick={() => handleDeleteUser(user.username)}
                        >
                          <Trash2 size={12} /> 注销账号
                        </button>
                      ) : (
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic', paddingRight: '8px' }}>
                          不可注销
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card mt-6" style={{ backgroundColor: 'rgba(245, 158, 11, 0.03)', borderColor: 'rgba(245, 158, 11, 0.15)' }}>
        <h3 className="section-title" style={{ color: 'var(--color-warning)' }}>
          <AlertTriangle size={18} />
          协作部署注意事项
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: '1.6' }}>
          1. <strong>局域网共享</strong>: 本应用启动后会绑定在本地端口（如 <code>http://127.0.0.1:5500</code> 和 <code>8000</code>）。如果需要在局域网内供多台电脑访问，请确保在启动时绑定地址为 <code>0.0.0.0</code> 且防火墙放行对应端口。<br />
          2. <strong>数据隔离</strong>: 当员工账号登录后，系统会自动对图片数据集进行 Round-Robin（均匀轮询）拆分分配，员工仅能加载并操作其名下的标注，互不干扰。<br />
          3. <strong>管理员功能</strong>: 普通员工账号登录后，侧边栏会自动隐藏“数据集管理”、“模型权重库”、“模型训练”以及“团队人员管理”等敏感入口，仅保留控制中心和数据标注模块。
        </p>
      </div>
    </div>
  );
}

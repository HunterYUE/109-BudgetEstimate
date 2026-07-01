import React, { useState, useMemo } from 'react';
import { mockClients } from '../mockData';
import { COLORS } from '../styles/constants';

const ClientNameCell: React.FC<{
  value: string;
  onSelect: (name: string) => void;
}> = ({ value, onSelect }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const clientNames = useMemo(() =>
    mockClients.filter(c => c.type === 'enterprise').map(c => c.name), []
  );
  const filtered = search ? clientNames.filter(n => n.includes(search)) : clientNames;
  return (
    <div style={{ position: 'relative' }}>
      <span style={{ cursor: 'pointer', color: COLORS.primary, fontSize: 13, userSelect: 'none' }}
        onClick={() => setOpen(p => !p)}>
        {value || '点击选择'} <span style={{ fontSize: 10 }}>▾</span>
      </span>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, zIndex: 50,
          background: '#fff', border: '1px solid #d9d9d9', borderRadius: 4,
          minWidth: 180, maxHeight: 240, boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        }}>
          <input type="text" value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') { setOpen(false); setSearch(''); }
              if (e.key === 'Enter' && filtered.length > 0) { onSelect(filtered[0]); setOpen(false); setSearch(''); }
            }}
            onBlur={() => setTimeout(() => { setOpen(false); setSearch(''); }, 200)}
            placeholder="搜索客户…"
            style={{ width: '100%', border: 'none', borderBottom: '1px solid #eee', padding: '8px 10px', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
            autoFocus
          />
          <div style={{ maxHeight: 190, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '10px', fontSize: 12, color: '#999', textAlign: 'center' }}>无匹配客户</div>
            ) : filtered.map(name => (
              <div key={name}
                onClick={() => { onSelect(name); setOpen(false); setSearch(''); }}
                style={{
                  padding: '6px 10px', cursor: 'pointer', fontSize: 13,
                  background: name === value ? '#f0f6ff' : '#fff', color: name === value ? COLORS.primary : '#333',
                  borderBottom: '1px solid #f5f5f5',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#f5f8ff'}
                onMouseLeave={e => e.currentTarget.style.background = name === value ? '#f0f6ff' : '#fff'}
              >{name}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientNameCell;

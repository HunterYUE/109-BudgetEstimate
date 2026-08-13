import React from 'react';
import { Drawer, Space, Tag } from 'antd';
import type { Component } from '../../types';
import { COLORS } from '../../styles/colors';
import { formatMoney } from '../../utils/calculations';
import { CATEGORY_OPTIONS, STATUS_CONFIG } from './materialConstants';

// ── 详情抽屉 ──

interface MaterialDrawerProps {
  item: Component | null;
  tagPathMap: { id: string; path: string[] }[];
  onClose: () => void;
}

const sectionHeader = (title: string) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
    <div style={{ width: 3, height: 16, background: COLORS.primary, borderRadius: 1 }} />
    <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.textDark, letterSpacing: 0.3 }}>{title}</span>
  </div>
);

const infoRow = (label: string, value: React.ReactNode) => (
  <div style={{ padding: '8px 0', borderBottom: '1px solid #f0f4fa', display: 'flex', alignItems: 'center' }}>
    <span style={{ color: COLORS.textFormLabel, fontSize: 12, width: 100, flexShrink: 0 }}>{label}</span>
    <span style={{ color: '#1a2234', fontSize: 13, fontWeight: 500 }}>{value}</span>
  </div>
);

const renderDrawerContent = (item: Component, tagPathMap: { id: string; path: string[] }[]) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {item.reviewStatus === 'pending' && item.note && (
        <div style={{
          background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 5,
          padding: '14px 20px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.warning }}>⏳ 待审核</span>
            <Tag color="orange" style={{ borderRadius: 1, margin: 0, fontSize: 11 }}>
              {item.note.startsWith('[新建]') ? '新建' : item.note.startsWith('[编辑]') ? '编辑' : '删除'}
            </Tag>
          </div>
          {item.note.startsWith('[编辑]') && (
            <div style={{ fontSize: 12, color: '#555', lineHeight: 1.7 }}>
              {item.note.replace('[编辑] ', '').split(' | ').map((change, i) => (
                <div key={i} style={{ padding: '2px 0' }}>• {change}</div>
              ))}
            </div>
          )}
          {item.note.startsWith('[新建]') && (
            <div style={{ fontSize: 12, color: '#555' }}>此物料为新注册，等待总监审核通过后生效。</div>
          )}
          {item.note.startsWith('[删除]') && (
            <div style={{ fontSize: 12, color: COLORS.danger }}>此物料提交了删除申请，总监通过后将永久移除。</div>
          )}
        </div>
      )}
      <div style={{ background: COLORS.bgCard, border: `1px solid ${COLORS.borderCard}`, borderRadius: 5, padding: '20px 24px' }}>
        {sectionHeader('基本信息')}
        {infoRow('物料编码', item.code)}
        {infoRow('物料名称', item.nameCn)}
        {infoRow('类型', CATEGORY_OPTIONS[item.category]?.label || item.category)}
        {infoRow('品牌', item.brand || '—')}
        {infoRow('供应商', item.supplier || '—')}
        {infoRow('计量单位', item.unit || '—')}
        {infoRow('型号', item.model || '—')}
        {infoRow('规格', item.specification || '—')}
        {infoRow('来源', item.sourcingType === 'PURCHASED' ? '外购' : '自制')}
        {infoRow('单位成本', <>&yen;{formatMoney(item.unitCost)}</>)}
        {infoRow('设计工时', <>{item.designHours}h</>)}
        {infoRow('装配工时', <>{item.assemblyHours}h</>)}
        {infoRow('质保', item.hasWarranty ? '是' : '否')}
        {infoRow('备注', item.note || '—')}
        {infoRow('版本', item.version)}
        {infoRow('状态', <Tag color={STATUS_CONFIG[item.reviewStatus]?.color || COLORS.textLight} style={{ borderRadius: 1, margin: 0 }}>{STATUS_CONFIG[item.reviewStatus]?.label}</Tag>)}
        {infoRow('标签', item.tags && item.tags.length > 0
          ? item.tags.map(id => { const f = tagPathMap.find(t => t.id === id); return f ? f.path.join(' / ') : id; }).join('; ')
          : '—')}
        {infoRow('创建时间', item.createdAt)}
        {infoRow('更新时间', item.updatedAt)}
      </div>

      <div style={{ background: COLORS.bgCard, border: `1px solid ${COLORS.borderCard}`, borderRadius: 5, padding: '20px 24px' }}>
        {sectionHeader('变更历史')}
        {item.changeLog.length > 0 ? (
          <div style={{ position: 'relative', paddingLeft: 24 }}>
            <div style={{ position: 'absolute', left: 11, top: 4, bottom: 4, width: 2, background: COLORS.border }} />
            {[...item.changeLog].reverse().map((entry, i) => (
              <div key={i} style={{ position: 'relative', paddingBottom: 12 }}>
                <div style={{
                  position: 'absolute', left: -20, top: 4, width: 12, height: 12,
                  borderRadius: '50%', background: COLORS.primary, border: '2px solid #fff',
                }} />
                <div style={{ fontSize: 13, color: COLORS.textDark, fontWeight: 600 }}>{entry.version}</div>
                <div style={{ fontSize: 12, color: COLORS.textLight }}>{entry.date}</div>
                <div style={{ fontSize: 13, color: COLORS.textSecondary, marginTop: 2 }}>{entry.note}</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: 12, textAlign: 'center', color: '#b0b8c4', fontSize: 13 }}>暂无变更记录</div>
        )}
      </div>
    </div>
  );
};

export const MaterialDrawer: React.FC<MaterialDrawerProps> = ({
  item,
  tagPathMap,
  onClose,
}) => {
  return (
    <Drawer
      title={
        item ? (
          <Space>
            <span style={{ fontSize: 16, fontWeight: 700, color: COLORS.textDark }}>{item.nameCn}</span>
            <Tag color={STATUS_CONFIG[item.reviewStatus]?.color || COLORS.textLight} style={{ borderRadius: 1 }}>
              {STATUS_CONFIG[item.reviewStatus]?.label}
            </Tag>
            <span style={{ fontSize: 12, color: COLORS.textLight }}>{item.code}</span>
          </Space>
        ) : ''
      }
      placement="right"
      onClose={onClose}
      open={!!item}
      styles={{ wrapper: { width: 600 } }}
    >
      {item && renderDrawerContent(item, tagPathMap)}
    </Drawer>
  );
};

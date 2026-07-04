import React, { useRef } from 'react';
import { Modal } from 'antd';
import type { Project } from '../types';
import { COLORS } from '../styles/constants';

interface Props {
  project: Project;
  onUpdate?: (field: string, value: string | number) => void;
  versionBump?: 'minor' | 'major';
  onVersionBumpChange?: (v: 'minor' | 'major') => void;
  readOnly?: boolean;
}

const cellStyle: React.CSSProperties = {
  padding: '6px 12px', fontSize: 12, border: `1px solid ${COLORS.border}`, textAlign: 'left',
};

const labelStyle: React.CSSProperties = {
  ...cellStyle,
  fontWeight: 600, fontSize: 12, background: COLORS.bgLight, whiteSpace: 'nowrap',
  color: COLORS.labelDark,
};

const inputStyle: React.CSSProperties = {
  width: '100%', border: 'none', background: 'transparent', outline: 'none',
  fontSize: 12, padding: 0, margin: 0, display: 'block', boxSizing: 'border-box',
};

const WARRANTY_OPTIONS = ['3个月', '6个月', '12个月', '18个月', '24个月'];
const PCT_OPTIONS = Array.from({ length: 13 }, (_, i) => ({ value: i * 5, label: i * 5 + '%' }));
const PAYMENT_LABELS = ['预付', '发货', '验收', '质保'];

function parsePayment(terms: string): number[] {
  const def = [30, 60, 0, 10];
  if (!terms) return def;
  const parts = terms.match(/\d+/g);
  return parts ? parts.map(Number) : def;
}

function formatPayment(vals: number[]): string {
  return PAYMENT_LABELS.map((l, i) => l + vals[i] + '%').join(' ');
}

/** 交货期点击选择组件 */
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
function parseDelivery(val: string): { x: number; y: number } {
  const nums = val.match(/\d+/g);
  return { x: nums ? parseInt(nums[0]) : 5, y: nums && nums[1] ? parseInt(nums[1]) : 3 };
}
function formatDelivery(x: number, y: number): string {
  return `合同生效后${x}个月发货，货到现场后${y}个月安调完毕，具备试生产条件`;
}
const DeliveryPeriodInput: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => {
  const { x, y } = parseDelivery(value);
  const cycle = (v: number, set: number[]) => set[(set.indexOf(v) + 1) % set.length];
  return (
    <span style={{ fontSize: 12, lineHeight: 1.6 }}>
      合同生效后
      <b style={{ cursor: 'pointer', color: COLORS.primary }}
        onClick={() => onChange(formatDelivery(cycle(x, MONTHS), y))}>{x}个月</b>发货，
      货到现场后
      <b style={{ cursor: 'pointer', color: COLORS.primary }}
        onClick={() => onChange(formatDelivery(x, cycle(y, MONTHS)))}>{y}个月</b>安调完毕，
      具备试生产条件
    </span>
  );
};

const ProjectHeader: React.FC<Props> = ({ project, onUpdate, versionBump, onVersionBumpChange, readOnly }) => {
  const v = project.current_version;
  const pct = parsePayment(project.payment_terms);

  const updater = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => onUpdate?.(field, e.target?.value ?? e);

  return (
    <div style={{ marginBottom: 32 }}>

      <table className="proj-header" style={{
        width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed',
        pointerEvents: readOnly ? 'none' as const : undefined,
        opacity: readOnly ? 0.6 : 1, transition: 'opacity 0.2s',
      }}>
        <colgroup>
          <col width="72" /><col width="140" /><col width="80" /><col width="80" /><col width="56" /><col width="80" /><col width="100" /><col width="100" />
        </colgroup>
        <tbody>
          <tr>
            <td style={labelStyle}>客户</td>
            <td style={cellStyle} colSpan={2}>
              <input style={inputStyle} value={project.client_name} onChange={updater('client_name')} />
            </td>
            <td style={labelStyle}>销售编号</td>
            <td style={cellStyle}>
              <input style={inputStyle} value={project.sales_no} onChange={updater('sales_no')} />
            </td>
            <td style={labelStyle}>交货期</td>
            <td style={cellStyle} colSpan={2}>
              <DeliveryPeriodInput value={project.delivery_period}
                onChange={(v) => onUpdate?.('delivery_period', v)} />
            </td>
          </tr>
          <tr>
            <td style={labelStyle}>客户编号</td>
            <td style={cellStyle} colSpan={2}>
              <input style={inputStyle} value={project.client_code} onChange={updater('client_code')} />
            </td>
            <td style={labelStyle}>版本</td>
            <td style={cellStyle}>
              <span style={{ cursor: 'pointer', color: COLORS.success, fontWeight: 600, ...inputStyle, userSelect: 'none' }}
                onClick={() => onVersionBumpChange?.(versionBump === 'major' ? 'minor' : 'major')}
                title={'下次提交: ' + (versionBump === 'major' ? '大版本 +1.0' : '小版本 +0.1')}>
                {v.version_no}
                <span style={{ fontSize: 10, color: COLORS.textMuted, marginLeft: 4 }}>
                  {versionBump === 'major' ? '▲ +1.0' : '▸ +0.1'}
                </span>
              </span>
            </td>
            <td style={labelStyle}>后缀号</td>
            <td style={cellStyle} colSpan={2}>
              <span style={{ cursor: 'pointer', ...inputStyle, fontWeight: 600, color: COLORS.primary }}
                onClick={() => {
                  const cur = parseInt(project.postfix?.replace('EC', '')) || 0;
                  const next = (cur + 1) % 10;
                  onUpdate?.('postfix', 'EC' + next);
                }}
                title="点击切换">{project.postfix || 'EC0'}</span>
            </td>
          </tr>
          <tr>
            <td style={labelStyle}>质保期</td>
            <td style={cellStyle} colSpan={4}>
              <span style={{ cursor: 'pointer', ...inputStyle }}
                onClick={() => {
                  const idx = WARRANTY_OPTIONS.indexOf(project.project_scope);
                  onUpdate?.('project_scope', WARRANTY_OPTIONS[(idx + 1) % WARRANTY_OPTIONS.length]);
                }}
                title="点击切换">{project.project_scope}</span>
            </td>
            <td style={labelStyle}>EUR/CNY</td>
            <td style={cellStyle} colSpan={2}>
              <input style={inputStyle} value={v.eur_rate}
                onChange={(e) => onUpdate?.('eur_rate', parseFloat(e.target.value) || 0)} />
            </td>
          </tr>
          <tr>
            <td style={labelStyle}>付款条件</td>
            <td style={cellStyle} colSpan={5}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {PAYMENT_LABELS.map((label, i) => {
                  const curIdx = PCT_OPTIONS.findIndex(o => o.value === pct[i]);
                  return (
                    <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <span style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{label}</span>
                      <span style={{ cursor: 'pointer', color: COLORS.primary, fontSize: 12, userSelect: 'none', position: 'relative', top: 2 }}
                        onClick={() => {
                          const next = [...pct];
                          const nIdx = (curIdx + 1) % PCT_OPTIONS.length;
                          next[i] = PCT_OPTIONS[nIdx].value;
                          onUpdate?.('payment_terms', formatPayment(next));
                        }}>
                        {PCT_OPTIONS[curIdx]?.label ?? pct[i]} ▾
                      </span>
                    </span>
                  );
                })}
              </div>
            </td>
            <td style={labelStyle}>增值税率</td>
            <td style={cellStyle}>
              <span style={{ cursor: 'pointer', color: COLORS.primary, fontWeight: 600 }}
                onClick={() => {
                  const rates = [0, 1, 3, 6, 9, 13];
                  const cur = Math.round(v.tax_rate * 100);
                  const idx = rates.indexOf(cur);
                  onUpdate?.('tax_rate', rates[(idx + 1) % rates.length] / 100);
                }}
                title="点击切换">{(v.tax_rate * 100).toFixed(0)}%</span>
            </td>
          </tr>
          <tr>
            <td style={labelStyle}>预计定标</td>
            <td style={cellStyle} colSpan={3}>
              <input style={inputStyle} value={project.expected_award_date} onChange={updater('expected_award_date')} />
            </td>
            <td style={labelStyle}>项目方案</td>
            <td style={cellStyle} colSpan={3}>
              <ProjectLayoutUpload value={project.project_layout} 
                onChange={(v) => onUpdate?.('project_layout', v)} />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};


const ProjectLayoutUpload: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    inputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // 仅接受 PDF/PNG
    if (!['application/pdf', 'image/png'].includes(file.type)) {
      Modal.warning({
        title: '文件格式不支持',
        content: '仅支持 PDF 或 PNG 格式',
        okText: '知道了',
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      onChange(ev.target?.result as string || '');
    };
    reader.readAsDataURL(file);
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
  };

  if (value) {
    const isPdf = value.startsWith('data:application/pdf');
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <a href={value} target="_blank" rel="noopener noreferrer"
          style={{ color: COLORS.primary, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
          {isPdf ? '📄 布置图.pdf' : '🖼️ 布置图.png'}
        </a>
        <span onClick={handleRemove} style={{ color: '#f5222d', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</span>
      </span>
    );
  }

  return (
    <>
      <input ref={inputRef} type="file" accept=".pdf,.png,application/pdf,image/png"
        style={{ display: 'none' }} onChange={handleFileChange} />
      <span onClick={handleClick} style={{
        color: COLORS.primary, cursor: 'pointer', fontWeight: 600, fontSize: 13,
        border: `1px dashed ${COLORS.borderInput}`, borderRadius: 4, padding: '2px 12px', display: 'inline-block'
      }}>
        + 上传布置图
      </span>
    </>
  );
};


export default ProjectHeader;
